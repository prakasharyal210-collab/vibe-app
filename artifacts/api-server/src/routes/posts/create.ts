import { Router } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const router = Router();

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
    // 1 — Look up hashtag row (gives us posts_count for the header)
    const { data: hashtagRow } = await sb
      .from("hashtags")
      .select("id, posts_count")
      .eq("name", tag)
      .maybeSingle();

    if (!hashtagRow) {
      // Hashtag not in index yet — fall back to caption scan
      const { data: fallback, count: fbCount } = await sb
        .from("posts")
        .select("id, media_url, likes_count, is_reel", { count: "exact" })
        .ilike("caption", `%#${tag}%`)
        .order("likes_count", { ascending: false })
        .limit(60);
      res.json({ posts: fallback ?? [], count: fbCount ?? 0 });
      return;
    }

    // 2 — Get post IDs from indexed join table
    const { data: joins } = await sb
      .from("post_hashtags")
      .select("post_id")
      .eq("hashtag_id", hashtagRow.id)
      .limit(200);

    const postIds = (joins ?? []).map((r: any) => r.post_id as string);

    if (!postIds.length) {
      res.json({ posts: [], count: hashtagRow.posts_count ?? 0 });
      return;
    }

    // 3 — Fetch posts sorted by score (likes_count desc)
    const { data: posts } = await sb
      .from("posts")
      .select("id, media_url, likes_count, is_reel")
      .in("id", postIds)
      .order("likes_count", { ascending: false })
      .limit(60);

    res.json({ posts: posts ?? [], count: hashtagRow.posts_count ?? 0 });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "hashtag posts error");
    res.status(500).json({ error: "Failed to load hashtag posts" });
  }
});

// GET /api/posts/user/:userId — fetch profile posts + reels bypassing RLS
router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  const [postsRes, reelsRes] = await Promise.allSettled([
    sb.from("posts").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    sb.from("reels").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  res.json({
    posts: postsRes.status === "fulfilled" ? (postsRes.value.data ?? []) : [],
    reels: reelsRes.status === "fulfilled" ? (reelsRes.value.data ?? []) : [],
  });
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
  const safeVisibility = (["public", "friends", "private"] as const).includes(
    options.visibility as "public" | "friends" | "private"
  ) ? options.visibility : "public";

  const payload: Record<string, unknown> = {
    user_id: userId,
    media_url: mediaUrl ?? "",
    caption,
    likes_count: 0,
    comments_count: 0,
    views_count: 0,
    visibility: safeVisibility,
    created_at: new Date().toISOString(),
    ...(options.filterId ? { filter_id: options.filterId } : {}),
    ...(options.location ? { location: options.location } : {}),
  };

  const { data, error } = await sb
    .from("posts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    req.log.error({ err: error.message }, "Post insert failed");
    res.status(500).json({ error: error.message });
    return;
  }

  const postId = (data as { id: string }).id;

  // ── Fire-and-forget side-effects ─────────────────────────────────────────────

  // 1. Tag users
  if (options.taggedUsers?.length) {
    void Promise.resolve(
      sb.from("post_tags").insert(
        options.taggedUsers.map((uid) => ({
          post_id: postId,
          tagged_user_id: uid,
          tagged_by: userId,
        }))
      )
    ).catch(() => {});
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

export default router;
