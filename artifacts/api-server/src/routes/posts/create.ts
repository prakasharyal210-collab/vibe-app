import { Router } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "../../lib/sendPush";

const router = Router();

// Remembered per-process once the RPC availability is confirmed/denied.
// Avoids adding a failed round-trip before the 3-hop fallback on every request.
let hashtagRpcAvailable = true;

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w]+/g);
  return matches ? [...new Set(matches.map((h) => h.slice(1).toLowerCase()))] : [];
}

// Upsert a hashtag name → returns its UUID.
// Inserts into `hashtags(name)` if new (posts_count = 1), or increments posts_count for existing.
// All failures are swallowed — hashtag persistence is non-critical.
async function upsertHashtag(
  sb: SupabaseClient<any>,
  name: string
): Promise<string | null> {
  // Try to insert first (most common path for new hashtags)
  const { data: inserted } = await sb
    .from("hashtags")
    .insert({ name, posts_count: 1 })
    .select("id")
    .single();
  if (inserted) return (inserted as { id: string }).id;

  // Already exists — read, increment, return id
  const { data: existing } = await sb
    .from("hashtags")
    .select("id, posts_count")
    .eq("name", name)
    .single();
  if (!existing) return null;

  const row = existing as { id: string; posts_count: number };
  await sb
    .from("hashtags")
    .update({ posts_count: (row.posts_count ?? 0) + 1 })
    .eq("id", row.id);

  return row.id;
}

// Persist hashtags extracted from caption into post_hashtags join table (fire-and-forget).
async function savePostHashtags(
  sb: SupabaseClient<any>,
  postId: string,
  caption: string
): Promise<void> {
  const tags = extractHashtags(caption);
  if (!tags.length) return;

  const ids = await Promise.all(tags.map((t) => upsertHashtag(sb, t)));
  const rows = ids
    .filter((id): id is string => id !== null)
    .map((hashtag_id) => ({ post_id: postId, hashtag_id }));

  if (rows.length) {
    await sb.from("post_hashtags").upsert(rows, { onConflict: "post_id,hashtag_id" });
  }
}

function makeSupabase() {
  const url =
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
    "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// GET /api/posts/hashtag/:tag
// Returns posts tagged with :tag via the indexed post_hashtags join table,
// sorted by likes_count (score proxy). Falls back to caption ILIKE if needed.
router.get("/hashtag/:tag", async (req, res) => {
  const tag = (req.params["tag"] ?? "").toLowerCase().trim();
  if (!tag) { res.status(400).json({ error: "tag required" }); return; }
  const sb = makeSupabase();

  try {
    // ── Fast path: single-round-trip JOIN via get_hashtag_posts RPC ──────────
    // Skipped once we learn the RPC isn't deployed (avoids wasted round trip).
    if (hashtagRpcAvailable) {
      const { data: rpcData, error: rpcErr } = await sb
        .rpc("get_hashtag_posts", { p_tag: tag, p_limit: 60 });

      if (!rpcErr && rpcData && (rpcData as any[]).length > 0) {
        const rows = rpcData as { id: string; media_url: string; likes_count: number; is_reel: boolean; posts_count: number }[];
        const count = rows[0]?.posts_count ?? rows.length;
        res.json({ posts: rows.map(({ posts_count: _pc, ...rest }) => rest), count });
        return;
      }

      if (rpcErr) {
        hashtagRpcAvailable = false;
        req.log.info({ err: rpcErr.message }, "get_hashtag_posts RPC unavailable — run performance-indexes.sql in Supabase to activate 1-query path");
      }
    }

    // ── Fallback: 3-query sequential path (used until RPC is deployed) ───────
    const { data: hashtagRow } = await sb
      .from("hashtags")
      .select("id, posts_count")
      .eq("name", tag)
      .maybeSingle();

    if (!hashtagRow) {
      // Not in index yet — caption scan (only public posts visible on hashtag pages)
      const { data: fallback, count: fbCount } = await sb
        .from("posts")
        .select("id, media_url, likes_count, is_reel", { count: "exact" })
        .ilike("caption", `%#${tag}%`)
        .or("visibility.eq.public,visibility.is.null")
        .order("likes_count", { ascending: false })
        .limit(60);
      res.json({ posts: fallback ?? [], count: fbCount ?? 0 });
      return;
    }

    const { data: joins } = await sb
      .from("post_hashtags")
      .select("post_id")
      .eq("hashtag_id", hashtagRow.id)
      .limit(200);

    const postIds = (joins ?? []).map((r: any) => r.post_id as string);
    if (!postIds.length) { res.json({ posts: [], count: hashtagRow.posts_count ?? 0 }); return; }

    const { data: posts } = await sb
      .from("posts")
      .select("id, media_url, likes_count, is_reel")
      .in("id", postIds)
      .or("visibility.eq.public,visibility.is.null")
      .order("likes_count", { ascending: false })
      .limit(60);

    res.json({ posts: posts ?? [], count: hashtagRow.posts_count ?? 0 });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "hashtag posts error");
    res.status(500).json({ error: "Failed to load hashtag posts" });
  }
});

// GET /api/posts/user/:userId — fetch profile posts + reels bypassing RLS
// Visibility rules applied when viewerId != userId:
//   - owner (viewerId === userId):          all posts including private
//   - follower (viewerId follows userId):   public + friends (not private)
//   - stranger:                             public only
// Old posts with NULL visibility are treated as public.
// Falls back to unfiltered if visibility column not yet added via migration.
router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  const { viewerId } = req.query as { viewerId?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();

  const isOwner = !!viewerId && viewerId === userId;

  // Check if viewer follows the post owner (determines "friends" visibility)
  let viewerFollows = false;
  if (!isOwner && viewerId) {
    try {
      const { data: follow } = await sb
        .from("follows")
        .select("id")
        .eq("follower_id", viewerId)
        .eq("following_id", userId)
        .maybeSingle();
      viewerFollows = !!follow;
    } catch {}
  }

  // Build the visibility OR clause (null = no filter needed for owner)
  const visFilter = isOwner
    ? null
    : viewerFollows
      ? "visibility.eq.public,visibility.eq.friends,visibility.is.null"
      : "visibility.eq.public,visibility.is.null";

  // Apply filter with graceful fallback if the visibility column doesn't exist yet
  async function queryTable(table: "posts" | "reels") {
    const base = sb.from(table).select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (visFilter) {
      const { data, error } = await base.or(visFilter);
      if (!error) return data ?? [];
      // Column missing (migration not run yet) — fall back to returning all
    }
    const { data } = await sb.from(table).select("*").eq("user_id", userId).order("created_at", { ascending: false });
    return data ?? [];
  }

  const [posts, reels] = await Promise.all([queryTable("posts"), queryTable("reels")]);
  res.json({ posts, reels });
});

router.post("/create", async (req, res) => {
  const {
    userId,
    imageBase64,
    mimeType = "image/jpeg",
    ext = "jpg",
    caption = "",
    options = {},
  } = req.body as {
    userId: string;
    imageBase64?: string;
    mimeType?: string;
    ext?: string;
    caption?: string;
    options?: {
      location?: string;
      taggedUsers?: string[];
      filterId?: string;
      commentsEnabled?: boolean;
      downloadsEnabled?: boolean;
      visibility?: string;
    };
  };

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const supabaseUrl =
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
    "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceKey) {
    res.status(500).json({ error: "Server not configured" });
    return;
  }
  const sb = createClient(supabaseUrl, serviceKey);

  let mediaUrl: string | null = null;

  // Upload image to storage if base64 provided
  if (imageBase64) {
    try {
      const filename = `${userId}/${Date.now()}.${ext}`;
      const buffer = Buffer.from(imageBase64, "base64");
      const { error: upErr } = await sb.storage
        .from("posts")
        .upload(filename, buffer, { contentType: mimeType, upsert: true });
      if (!upErr) {
        const { data: urlData } = sb.storage.from("posts").getPublicUrl(filename);
        mediaUrl = urlData.publicUrl;
      } else {
        req.log.warn({ err: upErr.message }, "Storage upload error");
      }
    } catch (err) {
      req.log.warn({ err }, "Storage upload failed");
    }
  }

  // Insert post record (service role bypasses RLS)
  const VALID_VISIBILITIES = ["public", "friends", "private"] as const;
  const safeVisibility: string = VALID_VISIBILITIES.includes(options.visibility as any)
    ? (options.visibility as string)
    : "public";

  const isVideoMime = mimeType.startsWith("video/");

  const payload: Record<string, unknown> = {
    user_id: userId,
    media_url: mediaUrl ?? "",
    caption,
    visibility: safeVisibility,
    likes_count: 0,
    comments_count: 0,
    views_count: 0,
    created_at: new Date().toISOString(),
    ...(isVideoMime ? { is_video: true } : {}),
    ...(options.filterId ? { filter_id: options.filterId } : {}),
    ...(options.location ? { location: options.location } : {}),
  };

  const r1 = await sb.from("posts").insert(payload).select("id").single();
  // Graceful fallback: if visibility column not yet created, retry without it
  let insertData = r1.data as { id: string } | null;
  let insertErr = r1.error;
  if (insertErr?.message?.includes("visibility")) {
    const payloadNoVis = { ...payload };
    delete payloadNoVis.visibility;
    const r2 = await sb.from("posts").insert(payloadNoVis).select("id").single();
    insertData = r2.data as { id: string } | null;
    insertErr = r2.error;
  }
  if (insertErr) {
    req.log.error({ err: insertErr.message }, "Post insert failed");
    res.status(500).json({ error: insertErr.message });
    return;
  }

  const postId = (insertData as { id: string }).id;

  // ── Fire-and-forget side-effects ─────────────────────────────────────────────

  // 1. Tag users — filtered by each tagged user's mention_permission setting
  if (options.taggedUsers?.length) {
    void (async () => {
      // Batch-fetch mention_permission for all tagged users
      const { data: settingsRows } = await sb
        .from("user_settings")
        .select("user_id, mention_permission")
        .in("user_id", options.taggedUsers!);
      const permMap = new Map<string, string>(
        (settingsRows ?? []).map((r: any) => [r.user_id as string, r.mention_permission as string])
      );

      // For "followers" permission: tagger must follow the tagged user (be one of their followers)
      const followersOnlyUids = options.taggedUsers!.filter(
        (uid) => (permMap.get(uid) ?? "everyone") === "followers"
      );
      const followerAllowSet = new Set<string>();
      if (followersOnlyUids.length > 0) {
        const { data: followRows } = await sb
          .from("follows")
          .select("following_id")
          .eq("follower_id", userId)
          .in("following_id", followersOnlyUids);
        for (const r of followRows ?? []) followerAllowSet.add((r as any).following_id as string);
      }

      // Only tag users whose permission allows it
      const allowedUids = options.taggedUsers!.filter((uid) => {
        const perm = permMap.get(uid) ?? "everyone";
        if (perm === "nobody") return false;
        if (perm === "followers") return followerAllowSet.has(uid);
        return true;
      });

      if (allowedUids.length === 0) return;

      try {
        await sb.from("post_tags").insert(
          allowedUids.map((uid) => ({ post_id: postId, tagged_user_id: uid, tagged_by: userId }))
        );
      } catch {}

      try {
        await sb.from("notifications").insert(
          allowedUids.map((uid) => ({
            recipient_id: uid, sender_id: userId, type: "tag",
            message: "tagged you in a post", post_id: postId, is_read: false,
          }))
        );
      } catch {}

      const { data: actor } = await sb.from("profiles").select("username").eq("id", userId).maybeSingle();
      const name = (actor as any)?.username ?? "Someone";
      for (const uid of allowedUids) {
        void sendPushToUser(sb, uid, {
          title: "You were tagged",
          body: `@${name} tagged you in a post`,
          data: { type: "tag", actorId: userId, postId },
        }, "notif_tags");
      }
    })();
  }

  // 2. Persist hashtags to join table (upserts into hashtags + post_hashtags)
  if (caption) {
    void savePostHashtags(sb, postId, caption).catch(() => {});
  }

  // 3. Seed score immediately — pg_cron runs every 15 min so new posts start at 0 without this
  void Promise.resolve(sb.rpc("calculate_post_score", { p_post_id: postId }))
    .then(({ data: score }) => {
      if (typeof score === "number") {
        return Promise.resolve(sb.from("posts").update({ score }).eq("id", postId));
      }
      return undefined;
    })
    .catch(() => {}); // non-fatal if RPC not deployed yet

  res.json({ id: postId, mediaUrl: mediaUrl ?? "" });
});

// GET /api/posts/saved?userId=
// Returns a user's saved (favourited) posts
router.get("/saved", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("favourites")
      .select("post_id, created_at, posts(id, media_url, caption, likes_count, comments_count, user_id, profiles:user_id(username, avatar_url))")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) { res.status(500).json({ error: error.message }); return; }
    const posts = (data ?? [])
      .map((r: any) => r.posts)
      .filter(Boolean)
      .map((p: any) => ({
        id: p.id,
        image_url: p.media_url,
        caption: p.caption ?? "",
        likes: p.likes_count ?? 0,
        comments: p.comments_count ?? 0,
        user_id: p.user_id,
        username: p.profiles?.username,
        avatar_url: p.profiles?.avatar_url,
        isReel: false,
      }));
    res.json({ posts });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "saved posts exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/posts/like-status — ?postId=&userId= — { liked, saved }
router.get("/like-status", async (req, res) => {
  const { postId, userId } = req.query as { postId?: string; userId?: string };
  if (!postId || !userId) { res.status(400).json({ error: "postId and userId required" }); return; }
  const sb = makeSupabase();
  try {
    const [likeRes, saveRes] = await Promise.all([
      sb.from("post_likes").select("id").eq("post_id", postId).eq("user_id", userId).maybeSingle(),
      sb.from("favourites").select("id").eq("post_id", postId).eq("user_id", userId).maybeSingle(),
    ]);
    res.json({ liked: !!likeRes.data, saved: !!saveRes.data });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "like-status exception");
    res.json({ liked: false, saved: false });
  }
});

// POST /api/posts/like — body: { postId, userId } — toggles like, returns { liked, likesCount }
router.post("/like", async (req, res) => {
  const { postId, userId } = req.body as { postId?: string; userId?: string };
  if (!postId || !userId) { res.status(400).json({ error: "postId and userId required" }); return; }
  const sb = makeSupabase();
  try {
    // Try Supabase RPC first (handles count + toggle atomically)
    const { data: rpcData, error: rpcErr } = await sb.rpc("toggle_post_like", {
      p_post_id: postId,
      p_user_id: userId,
    });
    if (!rpcErr && rpcData != null) {
      const d = rpcData as any;
      res.json({ liked: !!d.liked, likesCount: d.likes_count ?? 0 });
      return;
    }
    // Fallback: manual toggle via post_likes table (DB trigger maintains likes_count)
    const { data: existing } = await sb
      .from("post_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();
    let liked: boolean;
    if (existing) {
      await sb.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
      liked = false;
    } else {
      await sb.from("post_likes").upsert(
        { post_id: postId, user_id: userId },
        { onConflict: "post_id,user_id", ignoreDuplicates: true },
      );
      liked = true;
    }
    const { data: post } = await sb.from("posts").select("likes_count").eq("id", postId).single();
    res.json({ liked, likesCount: post?.likes_count ?? 0 });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "post like toggle exception");
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/posts/save — body: { postId, userId } — toggles bookmark, returns { saved }
router.post("/save", async (req, res) => {
  const { postId, userId } = req.body as { postId?: string; userId?: string };
  if (!postId || !userId) { res.status(400).json({ error: "postId and userId required" }); return; }
  const sb = makeSupabase();
  try {
    const { data: existing } = await sb
      .from("favourites")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      await sb.from("favourites").delete().eq("post_id", postId).eq("user_id", userId);
      res.json({ saved: false });
    } else {
      await sb.from("favourites").insert({ post_id: postId, user_id: userId });
      res.json({ saved: true });
    }
  } catch (err: any) {
    req.log.error({ err: err?.message }, "post save toggle exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/posts/:postId — fetch a single post by ID, bypassing RLS.
// Maps media_url → image_url so clients that read image_url always get the URL.
router.get("/:postId", async (req, res) => {
  const { postId } = req.params;
  if (!postId) { res.status(400).json({ error: "postId required" }); return; }

  const sb = makeSupabase();
  const { data, error } = await sb
    .from("posts")
    .select("*, profiles!user_id(id, username, avatar_url, full_name, is_verified)")
    .eq("id", postId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: error?.message ?? "Post not found" });
    return;
  }

  // Bridge media_url → image_url so PostCard/PostDetailScreen always finds the URL.
  const post = data as any;
  if (!post.image_url && post.media_url) {
    post.image_url = post.media_url;
  }

  res.json({ data: post });
});

export default router;
