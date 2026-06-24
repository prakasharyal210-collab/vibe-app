import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function enrichPost(sb: ReturnType<typeof makeSupabase>, post: any, coupleId?: string) {
  // Fetch author profile
  const { data: author } = await sb
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .eq("id", post.author_id)
    .maybeSingle();

  // Fetch both members of the couple to build "X & Y" name
  const { data: couple } = await sb
    .from("couple_links")
    .select("requester_id, receiver_id")
    .eq("id", post.couple_id)
    .maybeSingle();

  let partnerProfile: any = null;
  let coupleName = "";
  if (couple) {
    const partnerId = post.author_id === (couple as any).requester_id
      ? (couple as any).receiver_id
      : (couple as any).requester_id;
    const { data: partner } = await sb
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .eq("id", partnerId)
      .maybeSingle();
    partnerProfile = partner;
    const authorFirst = ((author as any)?.full_name || (author as any)?.username || "?").split(" ")[0];
    const partnerFirst = ((partner as any)?.full_name || (partner as any)?.username || "?").split(" ")[0];
    coupleName = `${authorFirst} & ${partnerFirst}`;
  }

  // Check if requesting couple has liked this post
  let likedByMe = false;
  if (coupleId) {
    const { data: like } = await sb
      .from("couple_feed_likes")
      .select("id")
      .eq("post_id", post.id)
      .eq("couple_id", coupleId)
      .maybeSingle();
    likedByMe = !!like;
  }

  return {
    ...post,
    author: author ? {
      name: (author as any).full_name || (author as any).username,
      avatar: (author as any).avatar_url ?? null,
    } : null,
    partner: partnerProfile ? {
      name: (partnerProfile as any).full_name || (partnerProfile as any).username,
      avatar: (partnerProfile as any).avatar_url ?? null,
    } : null,
    coupleName,
    likedByMe,
  };
}

// ── GET /posts ────────────────────────────────────────────────────────────────

router.get("/posts", async (req, res) => {
  const coupleId = req.query["coupleId"] as string | undefined;
  const limit = Math.min(Number(req.query["limit"] ?? 20), 50);
  const offset = Number(req.query["offset"] ?? 0);
  const sb = makeSupabase();
  try {
    const { data: posts, error } = await sb
      .from("couple_feed_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const enriched = await Promise.all(((posts ?? []) as any[]).map((p) => enrichPost(sb, p, coupleId)));
    res.json({ posts: enriched });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/posts GET error");
    res.status(500).json({ error: "Failed to fetch couple feed" });
  }
});

// ── POST /posts ───────────────────────────────────────────────────────────────

router.post("/posts", async (req, res) => {
  const { coupleId, authorId, content, photoUrl, category } = req.body as {
    coupleId?: string;
    authorId?: string;
    content?: string;
    photoUrl?: string;
    category?: string;
  };

  if (!coupleId || !authorId || !content) {
    res.status(400).json({ error: "coupleId, authorId, and content are required" });
    return;
  }

  const validCategories = ["Story", "Advice", "Milestone", "Venting"];
  const cat = category && validCategories.includes(category) ? category : "Story";

  const sb = makeSupabase();
  try {
    // Validate couple exists and is accepted
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

    // Validate authorId is part of the couple
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

// ── DELETE /posts/:postId ─────────────────────────────────────────────────────

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

// ── POST /posts/:postId/like ──────────────────────────────────────────────────

router.post("/posts/:postId/like", async (req, res) => {
  const { postId } = req.params;
  const { coupleId, likerId } = req.body as { coupleId?: string; likerId?: string };
  if (!coupleId || !likerId) {
    res.status(400).json({ error: "coupleId and likerId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error: insertErr } = await sb
      .from("couple_feed_likes")
      .insert({ post_id: postId, couple_id: coupleId, liker_id: likerId });

    if (insertErr) {
      if (insertErr.code === "23505") {
        // Already liked — return current count
        const { data: p } = await sb.from("couple_feed_posts").select("like_count").eq("id", postId).maybeSingle();
        res.json({ success: true, like_count: (p as any)?.like_count ?? 0 });
        return;
      }
      throw insertErr;
    }

    // Increment like_count
    const { data: current } = await sb.from("couple_feed_posts").select("like_count").eq("id", postId).maybeSingle();
    const newCount = ((current as any)?.like_count ?? 0) + 1;
    await sb.from("couple_feed_posts").update({ like_count: newCount }).eq("id", postId);

    res.json({ success: true, like_count: newCount });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/like POST error");
    res.status(500).json({ error: "Failed to like post" });
  }
});

// ── DELETE /posts/:postId/like ────────────────────────────────────────────────

router.delete("/posts/:postId/like", async (req, res) => {
  const { postId } = req.params;
  const { coupleId } = req.body as { coupleId?: string };
  if (!coupleId) {
    res.status(400).json({ error: "coupleId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    await sb
      .from("couple_feed_likes")
      .delete()
      .eq("post_id", postId)
      .eq("couple_id", coupleId);

    const { data: current } = await sb.from("couple_feed_posts").select("like_count").eq("id", postId).maybeSingle();
    const newCount = Math.max(0, ((current as any)?.like_count ?? 1) - 1);
    await sb.from("couple_feed_posts").update({ like_count: newCount }).eq("id", postId);

    res.json({ success: true, like_count: newCount });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/like DELETE error");
    res.status(500).json({ error: "Failed to unlike post" });
  }
});

// ── GET /posts/:postId/comments ───────────────────────────────────────────────

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
      const p = profileMap[c.author_id];
      return {
        ...c,
        author: p ? { name: p.full_name || p.username, avatar: p.avatar_url ?? null } : null,
      };
    });

    res.json({ comments: enriched });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/comments GET error");
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// ── POST /posts/:postId/comments ──────────────────────────────────────────────

router.post("/posts/:postId/comments", async (req, res) => {
  const { postId } = req.params;
  const { coupleId, authorId, content } = req.body as {
    coupleId?: string;
    authorId?: string;
    content?: string;
  };
  if (!coupleId || !authorId || !content) {
    res.status(400).json({ error: "coupleId, authorId, and content required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: comment, error } = await sb
      .from("couple_feed_comments")
      .insert({ post_id: postId, couple_id: coupleId, author_id: authorId, content })
      .select()
      .single();

    if (error) throw error;

    // Increment comment_count
    const { data: current } = await sb.from("couple_feed_posts").select("comment_count").eq("id", postId).maybeSingle();
    const newCount = ((current as any)?.comment_count ?? 0) + 1;
    await sb.from("couple_feed_posts").update({ comment_count: newCount }).eq("id", postId);

    // Fetch author profile for response
    const { data: author } = await sb
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .eq("id", authorId)
      .maybeSingle();

    res.json({
      success: true,
      comment: {
        ...(comment as any),
        author: author ? { name: (author as any).full_name || (author as any).username, avatar: (author as any).avatar_url ?? null } : null,
      },
      comment_count: newCount,
    });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/comments POST error");
    res.status(500).json({ error: "Failed to add comment" });
  }
});

export default router;
