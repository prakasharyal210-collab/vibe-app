import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { Buffer } from "buffer";

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

const router = Router();

// ── helpers ───────────────────────────────────────────────────────────────────

async function enrichPost(sb: ReturnType<typeof makeSupabase>, post: any, coupleId?: string) {
  const isAnon = post.is_anonymous !== false; // default true

  let authorData: { name: string; avatar: string | null } | null = null;
  let partnerData: { name: string; avatar: string | null } | null = null;
  let coupleName = "Anonymous 💕";

  if (!isAnon) {
    const { data: author } = await sb
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .eq("id", post.author_id)
      .maybeSingle();

    if (author) {
      authorData = {
        name: (author as any).full_name || (author as any).username,
        avatar: (author as any).avatar_url ?? null,
      };
      coupleName = (author as any).full_name || (author as any).username || "Unknown";
    }

    // couple_id may be null if the couple unlinked (ON DELETE SET NULL).
    // Gracefully skip partner lookup rather than crashing.
    if (post.couple_id) {
      const { data: couple } = await sb
        .from("couple_links")
        .select("requester_id, receiver_id")
        .eq("id", post.couple_id)
        .maybeSingle();

      if (couple) {
        const partnerId =
          post.author_id === (couple as any).requester_id
            ? (couple as any).receiver_id
            : (couple as any).requester_id;
        const { data: partner } = await sb
          .from("profiles")
          .select("id, full_name, username, avatar_url")
          .eq("id", partnerId)
          .maybeSingle();

        if (partner) {
          partnerData = {
            name: (partner as any).full_name || (partner as any).username,
            avatar: (partner as any).avatar_url ?? null,
          };
          const authorFirst = ((author as any)?.full_name || (author as any)?.username || "?").split(" ")[0];
          const partnerFirst = ((partner as any)?.full_name || (partner as any)?.username || "?").split(" ")[0];
          coupleName = `${authorFirst} & ${partnerFirst}`;
        }
      }
    }
  }

  let myReaction: string | null = null;
  if (coupleId) {
    const { data: like } = await sb
      .from("couple_feed_likes")
      .select("reaction")
      .eq("post_id", post.id)
      .eq("couple_id", coupleId)
      .maybeSingle();
    myReaction = (like as any)?.reaction ?? null;
  }

  const reactions = {
    support:  post.reaction_support  ?? 0,
    relate:   post.reaction_relate   ?? 0,
    strength: post.reaction_strength ?? 0,
    love:     post.reaction_love     ?? 0,
  };

  return {
    ...post,
    isAnonymous: isAnon,
    postNumber: post.post_number ?? null,
    author: isAnon ? null : authorData,
    partner: isAnon ? null : partnerData,
    coupleName: isAnon ? "Anonymous 💕" : coupleName,
    likedByMe: myReaction !== null,
    myReaction,
    reactions,
    totalReactions: (reactions.support + reactions.relate + reactions.strength + reactions.love),
  };
}

// ── POST /upload-photo ─────────────────────────────────────────────────────────
// Accepts { base64, mimeType, ext, userId } — uploads to the public `posts`
// Supabase storage bucket using the service-role key and returns the public URL.
// Called by feed-create.tsx before submitting a confession post.

router.post("/upload-photo", async (req, res) => {
  const { base64, mimeType, ext, userId } = req.body as {
    base64?: string;
    mimeType?: string;
    ext?: string;
    userId?: string;
  };
  if (!base64 || !userId) {
    res.status(400).json({ error: "base64 and userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const fileExt = (ext ?? "jpg").replace(/^\./, "");
    const mime = mimeType ?? "image/jpeg";
    const path = `confessions/${userId}/${Date.now()}.${fileExt}`;
    const bytes = Buffer.from(base64, "base64");

    const { error: uploadErr } = await sb.storage
      .from("posts")
      .upload(path, bytes, { contentType: mime, upsert: false });

    if (uploadErr) {
      req.log.error({ err: uploadErr.message }, "couple-feed/upload-photo: storage upload failed");
      res.status(500).json({ error: uploadErr.message });
      return;
    }

    const { data: urlData } = sb.storage.from("posts").getPublicUrl(path);
    req.log.info({ path, url: urlData.publicUrl }, "couple-feed/upload-photo: uploaded OK");
    res.json({ url: urlData.publicUrl });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/upload-photo error");
    res.status(500).json({ error: "Failed to upload photo" });
  }
});

// ── GET /posts ─────────────────────────────────────────────────────────────────
// Returns ALL confessions from ALL couples — this is a permanent public community
// feed. coupleId is only used to determine likedByMe; it is never used to filter.

router.get("/posts", async (req, res) => {
  const coupleId = req.query["coupleId"] as string | undefined;
  const limit = Math.min(Number(req.query["limit"] ?? 20), 50);
  const offset = Number(req.query["offset"] ?? 0);
  const category = req.query["category"] as string | undefined;
  const sb = makeSupabase();
  try {
    let query = sb
      .from("couple_feed_posts")
      .select("*")
      // newest post_number first; fall back to created_at for posts without one
      .order("post_number", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (category && category !== "All") {
      query = query.eq("category", category);
    }

    const { data: posts, error } = await query;
    if (error) throw error;

    const enriched = await Promise.all(((posts ?? []) as any[]).map((p) => enrichPost(sb, p, coupleId)));
    res.json({ posts: enriched });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/posts GET error");
    res.status(500).json({ error: "Failed to fetch couple feed" });
  }
});

// ── POST /posts ────────────────────────────────────────────────────────────────

router.post("/posts", async (req, res) => {
  const { coupleId, authorId, content, photoUrl, category, isAnonymous, age, location } = req.body as {
    coupleId?: string;
    authorId?: string;
    content?: string;
    photoUrl?: string;
    category?: string;
    isAnonymous?: boolean;
    age?: number;
    location?: string;
  };

  if (!coupleId || !authorId || !content) {
    res.status(400).json({ error: "coupleId, authorId, and content are required" });
    return;
  }

  const validCategories = ["Confession", "Story", "Advice", "Milestone", "Venting"];
  const cat = category && validCategories.includes(category) ? category : "Confession";

  const sb = makeSupabase();
  try {
    const { data: couple, error: coupleErr } = await sb
      .from("couple_links")
      .select("id, requester_id, receiver_id, status")
      .eq("id", coupleId)
      .eq("status", "accepted")
      .maybeSingle();

    if (coupleErr || !couple) {
      res.status(403).json({ error: "Couple not found or not accepted" });
      return;
    }

    const c = couple as any;
    if (authorId !== c.requester_id && authorId !== c.receiver_id) {
      res.status(403).json({ error: "Author is not part of this couple" });
      return;
    }

    const { data: post, error } = await sb
      .from("couple_feed_posts")
      .insert({
        couple_id: coupleId,
        author_id: authorId,
        content,
        photo_url: photoUrl ?? null,
        category: cat,
        is_anonymous: isAnonymous !== false,
        age: age ?? null,
        location: location?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;

    const enriched = await enrichPost(sb, post, coupleId);
    res.json({ success: true, post: enriched });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/posts POST error");
    res.status(500).json({ error: "Failed to create post" });
  }
});

// ── DELETE /posts/:postId ──────────────────────────────────────────────────────

router.delete("/posts/:postId", async (req, res) => {
  const { postId } = req.params;
  const { coupleId } = req.body as { coupleId?: string };
  if (!coupleId) {
    res.status(400).json({ error: "coupleId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb
      .from("couple_feed_posts")
      .delete()
      .eq("id", postId)
      .eq("couple_id", coupleId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/posts DELETE error");
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// ── helpers ────────────────────────────────────────────────────────────────────

const VALID_REACTIONS = ["support", "relate", "strength", "love"] as const;
type Reaction = (typeof VALID_REACTIONS)[number];

function reactionCol(r: Reaction) {
  return `reaction_${r}` as const;
}

function makeCountsResponse(post: any, myReaction: string | null) {
  const reactions = {
    support:  post?.reaction_support  ?? 0,
    relate:   post?.reaction_relate   ?? 0,
    strength: post?.reaction_strength ?? 0,
    love:     post?.reaction_love     ?? 0,
  };
  return {
    success: true,
    reactions,
    totalReactions: (reactions.support + reactions.relate + reactions.strength + reactions.love),
    like_count: post?.like_count ?? 0,
    myReaction,
  };
}

// ── POST /posts/:postId/react ──────────────────────────────────────────────────

router.post("/posts/:postId/react", async (req, res) => {
  const { postId } = req.params;
  const { coupleId, likerId, reaction } = req.body as { coupleId?: string; likerId?: string; reaction?: string };
  if (!coupleId || !likerId || !reaction || !(VALID_REACTIONS as readonly string[]).includes(reaction)) {
    res.status(400).json({ error: "coupleId, likerId, and valid reaction required" });
    return;
  }
  const r = reaction as Reaction;
  const col = reactionCol(r);
  const sb = makeSupabase();

  try {
    const { data: existing } = await sb
      .from("couple_feed_likes")
      .select("id, reaction")
      .eq("post_id", postId)
      .eq("couple_id", coupleId)
      .maybeSingle();

    if (existing) {
      const oldR = (existing as any).reaction as Reaction;
      if (oldR === r) {
        // Same reaction tapped again — idempotent, just return current state
        const { data: p } = await sb.from("couple_feed_posts").select("*").eq("id", postId).maybeSingle();
        res.json(makeCountsResponse(p, r));
        return;
      }
      // Switch reaction: decrement old column, increment new column
      const oldCol = reactionCol(oldR);
      const { data: p } = await sb.from("couple_feed_posts").select("*").eq("id", postId).maybeSingle();
      await sb.from("couple_feed_posts").update({
        [oldCol]: Math.max(0, ((p as any)?.[oldCol] ?? 1) - 1),
        [col]: ((p as any)?.[col] ?? 0) + 1,
      }).eq("id", postId);
      await sb.from("couple_feed_likes").update({ reaction: r }).eq("id", (existing as any).id);
      const { data: updated } = await sb.from("couple_feed_posts").select("*").eq("id", postId).maybeSingle();
      res.json(makeCountsResponse(updated, r));
      return;
    }

    // New reaction — insert row, increment reaction col + like_count
    await sb.from("couple_feed_likes").insert({ post_id: postId, couple_id: coupleId, liker_id: likerId, reaction: r });
    const { data: p } = await sb.from("couple_feed_posts").select("*").eq("id", postId).maybeSingle();
    await sb.from("couple_feed_posts").update({
      [col]: ((p as any)?.[col] ?? 0) + 1,
      like_count: ((p as any)?.like_count ?? 0) + 1,
    }).eq("id", postId);
    const { data: updated } = await sb.from("couple_feed_posts").select("*").eq("id", postId).maybeSingle();
    res.json(makeCountsResponse(updated, r));
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/react POST error");
    res.status(500).json({ error: "Failed to react" });
  }
});

// ── DELETE /posts/:postId/react ────────────────────────────────────────────────

router.delete("/posts/:postId/react", async (req, res) => {
  const { postId } = req.params;
  const { coupleId } = req.body as { coupleId?: string };
  if (!coupleId) {
    res.status(400).json({ error: "coupleId required" });
    return;
  }
  const sb = makeSupabase();

  try {
    const { data: existing } = await sb
      .from("couple_feed_likes")
      .select("id, reaction")
      .eq("post_id", postId)
      .eq("couple_id", coupleId)
      .maybeSingle();

    if (!existing) {
      const { data: p } = await sb.from("couple_feed_posts").select("*").eq("id", postId).maybeSingle();
      res.json(makeCountsResponse(p, null));
      return;
    }

    const oldR = (existing as any).reaction as Reaction;
    const col = reactionCol(oldR);
    await sb.from("couple_feed_likes").delete().eq("id", (existing as any).id);
    const { data: p } = await sb.from("couple_feed_posts").select("*").eq("id", postId).maybeSingle();
    await sb.from("couple_feed_posts").update({
      [col]: Math.max(0, ((p as any)?.[col] ?? 1) - 1),
      like_count: Math.max(0, ((p as any)?.like_count ?? 1) - 1),
    }).eq("id", postId);
    const { data: updated } = await sb.from("couple_feed_posts").select("*").eq("id", postId).maybeSingle();
    res.json(makeCountsResponse(updated, null));
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/react DELETE error");
    res.status(500).json({ error: "Failed to remove reaction" });
  }
});

// ── GET /posts/:postId/comments ────────────────────────────────────────────────

router.get("/posts/:postId/comments", async (req, res) => {
  const { postId } = req.params;
  const sb = makeSupabase();
  try {
    const { data: comments, error } = await sb
      .from("couple_feed_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const authorIds = [...new Set(((comments ?? []) as any[]).map((c) => c.author_id))];
    const { data: profiles } = authorIds.length
      ? await sb.from("profiles").select("id, full_name, username, avatar_url").in("id", authorIds)
      : { data: [] };

    const profileMap = Object.fromEntries(((profiles ?? []) as any[]).map((p: any) => [p.id, p]));

    const enriched = ((comments ?? []) as any[]).map((c) => {
      const isAnon = c.is_anonymous === true;
      const p = profileMap[c.author_id];
      return {
        ...c,
        isAnonymous: isAnon,
        author: isAnon
          ? null
          : p
          ? { name: p.full_name || p.username, avatar: p.avatar_url ?? null }
          : null,
      };
    });

    res.json({ comments: enriched });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/comments GET error");
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// ── POST /posts/:postId/comments ───────────────────────────────────────────────

router.post("/posts/:postId/comments", async (req, res) => {
  const { postId } = req.params;
  const { coupleId, authorId, content, isAnonymous } = req.body as {
    coupleId?: string;
    authorId?: string;
    content?: string;
    isAnonymous?: boolean;
  };
  if (!coupleId || !authorId || !content) {
    res.status(400).json({ error: "coupleId, authorId, and content required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: comment, error } = await sb
      .from("couple_feed_comments")
      .insert({
        post_id: postId,
        couple_id: coupleId,
        author_id: authorId,
        content,
        is_anonymous: isAnonymous === true,
      })
      .select()
      .single();

    if (error) throw error;

    const { data: current } = await sb.from("couple_feed_posts").select("comment_count").eq("id", postId).maybeSingle();
    const newCount = ((current as any)?.comment_count ?? 0) + 1;
    await sb.from("couple_feed_posts").update({ comment_count: newCount }).eq("id", postId);

    const isAnon = isAnonymous === true;
    let authorInfo: { name: string; avatar: string | null } | null = null;
    if (!isAnon) {
      const { data: author } = await sb
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .eq("id", authorId)
        .maybeSingle();
      if (author) {
        authorInfo = { name: (author as any).full_name || (author as any).username, avatar: (author as any).avatar_url ?? null };
      }
    }

    res.json({
      success: true,
      comment: {
        ...(comment as any),
        isAnonymous: isAnon,
        author: isAnon ? null : authorInfo,
      },
      comment_count: newCount,
    });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/comments POST error");
    res.status(500).json({ error: "Failed to add comment" });
  }
});

export default router;
