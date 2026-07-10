import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "../lib/sendPush";
import { checkCaptionText, logRejection } from "../utils/contentModeration";

const router = Router();

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// ─── Inline profanity filter (mirrors mobile/lib/profanityFilter.ts) ──────────
const BLOCKED_WORDS = [
  "fuck", "shit", "cunt", "nigger", "nigga", "faggot", "kike", "spic",
  "chink", "wetback", "retard", "whore", "slut", "bitch", "asshole",
  "bastard", "cock", "pussy", "dick", "penis", "vagina", "dildo", "cum",
  "jizz", "motherfucker", "fucker", "bullshit", "jackass", "dipshit",
];

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
    .replace(/4/g, "a").replace(/5/g, "s").replace(/8/g, "b")
    .replace(/@/g, "a").replace(/\$/g, "s").replace(/!/g, "i");
}

function checkProfanity(text: string): { ok: boolean; reason?: string } {
  if (!text?.trim()) return { ok: true };
  const n = normalise(text);
  for (const word of BLOCKED_WORDS) {
    if (n.includes(word)) {
      return {
        ok: false,
        reason: "Your message contains content that violates our community guidelines. Please revise before posting.",
      };
    }
  }
  return { ok: true };
}

// ─── GET /api/comments ────────────────────────────────────────────────────────
// Fetch comments for a post or reel via service-role key (bypasses RLS).
// Query params:
//   postId OR reelId (required)
//   limit  (optional, default 50, max 50)
//   before (optional cursor — an ISO created_at string; returns comments
//           strictly older than this timestamp, i.e. the next page)
// Returns: { comments: Comment[], cursor: string | null }
//   cursor is the created_at of the oldest returned comment, to pass as
//   `before` on the next request; null means there are no more comments.
// Backward compatible: callers that don't send `before`/`limit` and only
// read `comments` (ignoring the new `cursor` field) behave exactly as before.
router.get("/", async (req, res) => {
  const { postId, reelId, before } = req.query as { postId?: string; reelId?: string; before?: string };
  if (!postId && !reelId) {
    res.status(400).json({ error: "postId or reelId required" });
    return;
  }
  const rawLimit = parseInt(String((req.query as any).limit ?? "50"), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 50;
  const sb = makeSupabase();

  // Given a page of comments (already sliced to `limit`), compute the cursor
  // to hand back: the created_at of the oldest (last) item, or null if the
  // page wasn't full (meaning there's nothing older left).
  function nextCursor(page: any[], gotExtra: boolean): string | null {
    if (!gotExtra || page.length === 0) return null;
    const last = page[page.length - 1];
    return last?.created_at ?? null;
  }

  try {
    if (reelId) {
      // First page (no cursor): try the RPC first (richer data, handles
      // content normalisations). Paginated requests (cursor present) always
      // go through the direct select below, since the RPC doesn't support cursors.
      if (!before) {
        const { data: rpcData, error: rpcErr } = await sb.rpc("get_reel_comments", {
          p_reel_id: reelId,
          p_user_id: null,
        });
        if (!rpcErr && rpcData && (rpcData as any[]).length > 0) {
          // RPC may already normalise content→text; ensure text field is always set
          const normalised = (rpcData as any[]).map((c: any) => ({
            ...c,
            text: c.text ?? c.content ?? "",
          }));
          // RPC has no built-in limit, so slice to `limit` here for consistency
          // with the paginated fallback path below.
          const gotExtra = normalised.length > limit;
          const page = normalised.slice(0, limit);
          res.json({ comments: page, cursor: nextCursor(page, gotExtra) });
          return;
        }
      }
      // Fallback / paginated path: direct select (safe — service-role key)
      let query = sb
        .from("reel_comments")
        .select("*, profiles:user_id(id, username, avatar_url)")
        .eq("reel_id", reelId)
        .order("created_at", { ascending: false })
        .limit(limit + 1);
      if (before) query = query.lt("created_at", before);
      const { data, error } = await query;
      if (error) {
        req.log.warn({ error: error.message }, "reel_comments fetch error");
        res.json({ comments: [], cursor: null });
        return;
      }
      const rows = data ?? [];
      const gotExtra = rows.length > limit;
      const page = rows.slice(0, limit);
      // DB column is `content`; mobile CommentsSheet reads `.text` — map here
      const mapped = page.map((c: any) => ({
        ...c,
        text: c.text ?? c.content ?? "",
        parent_comment_id: c.parent_comment_id ?? c.reply_to ?? null,
      }));
      res.json({ comments: mapped, cursor: nextCursor(page, gotExtra) });
      return;
    }

    // Post comments — DB column is `content`; CommentsSheet reads `.text`
    let query = sb
      .from("comments")
      .select("*, profiles:user_id(id, username, avatar_url)")
      .eq("post_id", postId!)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) {
      req.log.warn({ error: error.message }, "comments fetch error");
      res.json({ comments: [], cursor: null });
      return;
    }
    const rows = data ?? [];
    const gotExtra = rows.length > limit;
    const page = rows.slice(0, limit);
    const mapped = page.map((c: any) => ({
      ...c,
      text: c.text ?? c.content ?? "",
    }));
    res.json({ comments: mapped, cursor: nextCursor(page, gotExtra) });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "comments GET exception");
    res.json({ comments: [], cursor: null });
  }
});

// ─── POST /api/comments ───────────────────────────────────────────────────────
// body: { userId, postId?, reelId?, text, contentType: "post" | "reel", parentCommentId? }
// Enforces: profanity filter + block check vs content owner → 403 if blocked.
router.post("/", async (req, res) => {
  const { userId, postId, reelId, text, contentType, parentCommentId } = req.body as {
    userId?: string;
    postId?: string;
    reelId?: string;
    text?: string;
    contentType?: "post" | "reel";
    parentCommentId?: string;
  };

  if (!userId || !text?.trim() || !contentType) {
    res.status(400).json({ error: "userId, text, and contentType required" });
    return;
  }
  if (contentType === "post" && !postId) {
    res.status(400).json({ error: "postId required for post comments" });
    return;
  }
  if (contentType === "reel" && !reelId) {
    res.status(400).json({ error: "reelId required for reel comments" });
    return;
  }

  // Profanity gate (local blocklist)
  const pf = checkProfanity(text);
  if (!pf.ok) {
    res.status(422).json({ error: pf.reason });
    return;
  }

  // Extended text moderation (keyword blocklist + Perspective API toxicity)
  const textScan = await checkCaptionText(text);
  if (!textScan.safe) {
    void logRejection(userId, null, "comment", textScan.reason);
    res.status(400).json({ error: "Your comment violates our community guidelines" });
    return;
  }

  const sb = makeSupabase();
  const contentId = contentType === "post" ? postId! : reelId!;
  const ownerTable = contentType === "post" ? "posts" : "reels";

  try {
    // Look up content owner
    const { data: content, error: contentErr } = await sb
      .from(ownerTable)
      .select("user_id")
      .eq("id", contentId)
      .maybeSingle();

    if (contentErr || !content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }

    const ownerId: string = content.user_id;

    // Block check — skip if commenting on own content
    if (userId !== ownerId) {
      const [b1, b2] = await Promise.all([
        sb.from("blocks").select("id").eq("blocker_id", userId).eq("blocked_id", ownerId).maybeSingle(),
        sb.from("blocks").select("id").eq("blocker_id", ownerId).eq("blocked_id", userId).maybeSingle(),
      ]);
      if (b1.data || b2.data) {
        res.status(403).json({ error: "Cannot comment on this content" });
        return;
      }

      // Comment permission gate — honour owner's privacy setting
      // Real column is who_can_comment (not comment_permission)
      const { data: ownerSettings } = await sb
        .from("user_settings")
        .select("who_can_comment")
        .eq("user_id", ownerId)
        .maybeSingle();
      const perm: string = (ownerSettings as any)?.who_can_comment ?? "everyone";

      if (perm === "nobody") {
        res.status(403).json({ error: "Comments are disabled on this content" });
        return;
      }
      if (perm === "followers") {
        // Commenter must follow the content owner
        const { data: followRow } = await sb
          .from("follows")
          .select("follower_id")
          .eq("follower_id", userId)
          .eq("following_id", ownerId)
          .maybeSingle();
        if (!followRow) {
          res.status(403).json({ error: "Only followers can comment on this content" });
          return;
        }
      }
      if (perm === "following") {
        // Content owner must follow the commenter
        const { data: followRow } = await sb
          .from("follows")
          .select("follower_id")
          .eq("follower_id", ownerId)
          .eq("following_id", userId)
          .maybeSingle();
        if (!followRow) {
          res.status(403).json({ error: "Only people they follow can comment on this content" });
          return;
        }
      }
      if (perm === "friends") {
        // Legacy "friends" value — require mutual follow
        const [f1, f2] = await Promise.all([
          sb.from("follows").select("follower_id").eq("follower_id", userId).eq("following_id", ownerId).maybeSingle(),
          sb.from("follows").select("follower_id").eq("follower_id", ownerId).eq("following_id", userId).maybeSingle(),
        ]);
        if (!f1.data || !f2.data) {
          res.status(403).json({ error: "Only mutual followers can comment on this content" });
          return;
        }
      }
    }

    const trimmed = text.trim();

    if (contentType === "reel") {
      const preview = trimmed.slice(0, 60) + (trimmed.length > 60 ? "…" : "");

      // Try the RPC first (handles comment-count increment atomically)
      const { data: rpcData } = await sb.rpc("add_reel_comment", {
        p_user_id: userId,
        p_reel_id: reelId,
        p_content: trimmed,
      });
      if (rpcData) {
        const c = rpcData as Record<string, any>;
        // Notify reel owner (non-blocking)
        if (userId !== ownerId) {
          void (async () => {
            try {
              await sb.from("notifications").insert({
                recipient_id: ownerId,
                sender_id: userId,
                type: "comment",
                message: `commented on your reel: "${preview}"`,
                reference_id: reelId,
                is_read: false,
              });
            } catch {}
          })();
        }
        res.status(201).json({ comment: { ...c, text: c.content ?? c.text ?? trimmed } });
        return;
      }

      // RPC unavailable — direct insert fallback (with optional reply threading)
      const reelRow: Record<string, unknown> = { reel_id: reelId, user_id: userId, content: trimmed };
      if (parentCommentId) reelRow["reply_to"] = parentCommentId;
      const { data: inserted, error: insertErr } = await sb
        .from("reel_comments")
        .insert(reelRow)
        .select("*, profiles:user_id(id, username, avatar_url, is_verified)")
        .single();

      if (insertErr) {
        req.log.warn({ error: insertErr.message }, "reel_comments insert error");
        res.status(500).json({ error: "Failed to save comment" });
        return;
      }

      // Notify reel owner (non-blocking)
      if (userId !== ownerId) {
        void (async () => {
          try {
            await sb.from("notifications").insert({
              recipient_id: ownerId,
              sender_id: userId,
              type: "comment",
              message: `commented on your reel: "${preview}"`,
              reference_id: reelId,
              is_read: false,
            });
          } catch {}
        })();
      }

      const c = inserted as Record<string, any>;
      res.status(201).json({ comment: { ...c, text: c.content ?? c.text ?? trimmed } });
      return;
    }

    // Post comment (with optional reply threading via parent_comment_id)
    const postRow: Record<string, unknown> = { post_id: postId, user_id: userId, content: trimmed };
    if (parentCommentId) postRow["parent_comment_id"] = parentCommentId;
    const { data: inserted, error: insertErr } = await sb
      .from("comments")
      .insert(postRow)
      .select("*, profiles:user_id(id, username, avatar_url, is_verified)")
      .single();

    if (insertErr) {
      req.log.warn({ error: insertErr.message }, "comments insert error");
      res.status(500).json({ error: "Failed to save comment" });
      return;
    }

    const c = inserted as Record<string, any>;

    // Keep posts.comments_count accurate — live COUNT so this works even if the
    // DB trigger on comments hasn't been deployed yet. The UPDATE also fires the
    // Supabase realtime event so PostCard.usePostRealtime updates live.
    void (async () => {
      try {
        const { count } = await sb
          .from("comments")
          .select("*", { count: "exact", head: true })
          .eq("post_id", postId);
        await sb.from("posts").update({ comments_count: count ?? 0 }).eq("id", postId as string);
      } catch {}
    })();

    // Notify post owner (non-blocking, skip if commenting on own post)
    if (userId !== ownerId) {
      const preview = trimmed.slice(0, 60) + (trimmed.length > 60 ? "…" : "");
      void (async () => {
        try {
          await sb.from("notifications").insert({
            recipient_id: ownerId,
            sender_id: userId,
            type: "comment",
            message: `commented: "${preview}"`,
            post_id: postId,
            thumbnail_url: (c as any)?.thumbnail_url ?? null,
            is_read: false,
          });
        } catch {}
        // Push notification gated by notif_comments preference
        const { data: actor } = await sb.from("profiles").select("username").eq("id", userId).maybeSingle();
        const name = actor?.username ?? "Someone";
        void sendPushToUser(sb, ownerId, {
          title: "New Comment",
          body: `@${name} commented on your post`,
          data: { type: "comment", actorId: userId, postId },
        }, "notif_comments");
      })();
    }

    res.status(201).json({ comment: { ...c, text: c.content ?? c.text ?? trimmed } });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "comment post exception");
    res.status(500).json({ error: "Failed" });
  }
});

// ─── POST /api/comments/like ──────────────────────────────────────────────────
// Toggle a comment like. Returns { liked: boolean, likes_count: number }
// contentType "reel" uses reel_comment_likes + reel_comments tables.
router.post("/like", async (req, res) => {
  const { userId, commentId, contentType } = req.body as {
    userId?: string;
    commentId?: string;
    contentType?: "post" | "reel";
  };
  if (!userId || !commentId) {
    res.status(400).json({ error: "userId and commentId required" });
    return;
  }
  const sb = makeSupabase();
  const isReel = contentType === "reel";
  const likesTable = isReel ? "reel_comment_likes" : "comment_likes";
  const commentsTable = isReel ? "reel_comments" : "comments";
  try {
    const { data: existing } = await sb
      .from(likesTable)
      .select("id")
      .eq("user_id", userId)
      .eq("comment_id", commentId)
      .maybeSingle();

    if (existing) {
      await sb.from(likesTable).delete().eq("user_id", userId).eq("comment_id", commentId);
      const { data: c } = await sb.from(commentsTable).select("likes_count").eq("id", commentId).maybeSingle();
      res.json({ liked: false, likes_count: c?.likes_count ?? 0 });
    } else {
      await sb.from(likesTable).insert({ user_id: userId, comment_id: commentId });
      const { data: c } = await sb.from(commentsTable).select("likes_count").eq("id", commentId).maybeSingle();
      res.json({ liked: true, likes_count: c?.likes_count ?? 0 });
    }
  } catch (err: any) {
    req.log.error({ err: err?.message }, "comment-like exception");
    res.status(500).json({ error: "Failed" });
  }
});

// ─── GET /api/comments/liked ──────────────────────────────────────────────────
// Returns set of comment IDs the user has liked.
// contentType "reel" queries reel_comment_likes; default is comment_likes.
router.get("/liked", async (req, res) => {
  const { userId, commentIds, contentType } = req.query as {
    userId?: string;
    commentIds?: string;
    contentType?: string;
  };
  if (!userId || !commentIds) {
    res.json({ likedIds: [] });
    return;
  }
  const ids = commentIds.split(",").filter(Boolean);
  if (ids.length === 0) { res.json({ likedIds: [] }); return; }
  const sb = makeSupabase();
  const table = contentType === "reel" ? "reel_comment_likes" : "comment_likes";
  try {
    const { data } = await sb
      .from(table)
      .select("comment_id")
      .eq("user_id", userId)
      .in("comment_id", ids);
    res.json({ likedIds: (data ?? []).map((r: any) => r.comment_id) });
  } catch {
    res.json({ likedIds: [] });
  }
});

export default router;
