import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "../lib/sendPush";

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

  // Profanity gate
  const pf = checkProfanity(text);
  if (!pf.ok) {
    res.status(422).json({ error: pf.reason });
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
    }

    const trimmed = text.trim();

    if (contentType === "reel") {
      // Try the RPC first (handles comment-count increment atomically)
      const { data: rpcData } = await sb.rpc("add_reel_comment", {
        p_user_id: userId,
        p_reel_id: reelId,
        p_content: trimmed,
      });
      if (rpcData) {
        const c = rpcData as Record<string, any>;
        res.status(201).json({ comment: { ...c, text: c.content ?? c.text ?? trimmed } });
        return;
      }

      // RPC unavailable — direct insert fallback (with optional reply threading)
      const reelRow: Record<string, unknown> = { reel_id: reelId, user_id: userId, content: trimmed };
      if (parentCommentId) reelRow["parent_comment_id"] = parentCommentId;
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

    // Notify post owner (non-blocking, skip if commenting on own post)
    if (userId !== ownerId) {
      void (async () => {
        try {
          await sb.from("notifications").insert({
            recipient_id: ownerId,
            sender_id: userId,
            type: "comment",
            message: "commented on your post",
            post_id: postId,
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
