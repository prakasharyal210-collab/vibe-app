import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

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

      if (author) {
        authorData = {
          name: (author as any).full_name || (author as any).username,
          avatar: (author as any).avatar_url ?? null,
        };
      }
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
    isAnonymous: isAnon,
    postNumber: post.post_number ?? null,
    author: isAnon ? null : authorData,
    partner: isAnon ? null : partnerData,
    coupleName: isAnon ? "Anonymous 💕" : coupleName,
    likedByMe,
  };
}

// ── GET /posts ─────────────────────────────────────────────────────────────────

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

// ── POST /posts/:postId/like ───────────────────────────────────────────────────

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
        const { data: p } = await sb.from("couple_feed_posts").select("like_count").eq("id", postId).maybeSingle();
        res.json({ success: true, like_count: (p as any)?.like_count ?? 0 });
        return;
      }
      throw insertErr;
    }

    const { data: current } = await sb.from("couple_feed_posts").select("like_count").eq("id", postId).maybeSingle();
    const newCount = ((current as any)?.like_count ?? 0) + 1;
    await sb.from("couple_feed_posts").update({ like_count: newCount }).eq("id", postId);

    res.json({ success: true, like_count: newCount });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-feed/like POST error");
    res.status(500).json({ error: "Failed to like post" });
  }
});

// ── DELETE /posts/:postId/like ─────────────────────────────────────────────────

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
