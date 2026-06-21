import { Router } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase(): SupabaseClient {
  const url =
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
    "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// Batch-fetch profiles for a list of user_ids and merge them into each row as
// a nested `profiles` object.  RPCs like get_for_you_feed_v2 return post rows
// with only a `user_id` column — no joined profile data.
async function enrichWithProfiles(
  supabase: SupabaseClient,
  rows: any[],
): Promise<any[]> {
  if (!rows.length) return rows;

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  if (!userIds.length) return rows;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, is_verified, full_name")
    .in("id", userIds);

  const profileMap = new Map<string, any>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, p);
  }

  return rows.map((row) => ({
    ...row,
    profiles: profileMap.get(row.user_id) ?? null,
  }));
}

// get_friends_feed returns flat top-level username/avatar_url/is_verified plus
// `post_id` instead of `id`.  Normalise to the standard Post shape so PostCard
// can consume it identically to other feed sources.
function normaliseFriendsRow(row: any): any {
  const { post_id, username, avatar_url, is_verified, is_liked, is_saved, ...rest } = row;
  return {
    ...rest,
    id: post_id ?? rest.id,
    // PostCard reads post.image_url; the get_friends_feed RPC returns media_url only.
    // Bridge the gap so the image never renders as a black square.
    image_url: rest.image_url ?? rest.media_url ?? null,
    profiles: {
      id: rest.user_id ?? null,
      username: username ?? null,
      avatar_url: avatar_url ?? null,
      is_verified: is_verified ?? false,
    },
    is_liked,
    is_saved,
  };
}

const VALID_FEED_CATEGORIES = new Set([
  "music","dance","comedy","travel","food","fitness",
  "gaming","photography","art","fashion","pets","sports",
  "tech","education","nature",
]);

// ─── GET /api/feed/foryou ─────────────────────────────────────────────────────
// ?userId=...&limit=20&offset=0&content_type=photo|video&sort=newest|most_liked|most_viewed&category=music|...
router.get("/foryou", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const offset = parseInt((req.query["offset"] as string) ?? "0", 10);
  const contentType = req.query["content_type"] as "photo" | "video" | undefined;
  const sort = (req.query["sort"] as string) ?? "newest";
  const rawCategory = req.query["category"] as string | undefined;
  const category = rawCategory && VALID_FEED_CATEGORIES.has(rawCategory) ? rawCategory : undefined;

  // Column to order by in the direct fallback query
  const sortCol = sort === "most_liked" ? "likes_count" : sort === "most_viewed" ? "views_count" : "created_at";

  // Post-filter RPC results by content type and category (RPCs don't accept these params)
  function filterByContentType(rows: any[]): any[] {
    if (!contentType || contentType === ("all" as any)) return rows;
    return rows.filter((r) =>
      contentType === "video" ? r.is_video === true : r.is_video !== true,
    );
  }

  function filterByCategory(rows: any[]): any[] {
    if (!category) return rows;
    return rows.filter((r) => r.category === category);
  }

  // Re-sort RPC results when caller requests non-default ordering
  function sortRows(rows: any[]): any[] {
    if (sort === "most_liked") return [...rows].sort((a, b) => ((b.likes_count ?? 0) - (a.likes_count ?? 0)));
    if (sort === "most_viewed") return [...rows].sort((a, b) => ((b.views_count ?? 0) - (a.views_count ?? 0)));
    return rows; // "newest" — personalised RPC order is already recency-weighted
  }

  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const supabase = makeSupabase();

  // When a content-type filter is active the personalised RPCs don't support it
  // at the DB level.  We would have to post-filter a fixed-size page and could
  // end up with far fewer results than requested (or zero), making the filter
  // appear broken to the user.  Jump straight to the direct query which applies
  // the is_video predicate at the database level.
  if (!contentType) {
    // Try v2 first (personalised + ranked). RPC returns no profile info, so we
    // enrich with a secondary profiles batch lookup.
    const { data: v2Data, error: v2Err } = await supabase.rpc(
      "get_for_you_feed_v2",
      { p_user_id: userId, p_limit: limit, p_offset: offset },
    );
    if (!v2Err && Array.isArray(v2Data) && v2Data.length > 0) {
      const enriched = await enrichWithProfiles(supabase, v2Data);
      const out = sortRows(filterByCategory(filterByContentType(enriched.filter((p: any) => p.is_archived !== true))));
      res.json({ data: out, source: "v2" });
      return;
    }

    // Fallback to v1
    const { data: v1Data, error: v1Err } = await supabase.rpc(
      "get_for_you_feed",
      { p_user_id: userId, p_limit: limit, p_offset: offset },
    );
    if (!v1Err && Array.isArray(v1Data) && v1Data.length > 0) {
      const enriched = await enrichWithProfiles(supabase, v1Data);
      const out = sortRows(filterByCategory(filterByContentType(enriched.filter((p: any) => p.is_archived !== true))));
      res.json({ data: out, source: "v1" });
      return;
    }
  }

  // Direct posts query — service role bypasses RLS, profile join uses explicit
  // FK hint to avoid "multiple relationships" ambiguity.  When contentType is
  // set this is the primary path; otherwise it is the final RPC fallback.
  // content_type, category and sort are applied directly to this query.
  let freshQuery = supabase
    .from("posts")
    .select("*, profiles!user_id(id, username, avatar_url, is_verified, full_name)")
    .or("visibility.eq.public,visibility.is.null")
    .or("is_archived.eq.false,is_archived.is.null");

  if (contentType === "photo") {
    freshQuery = freshQuery.or("is_video.eq.false,is_video.is.null") as typeof freshQuery;
  } else if (contentType === "video") {
    freshQuery = freshQuery.eq("is_video", true) as typeof freshQuery;
  }
  if (category) {
    freshQuery = freshQuery.eq("category", category) as typeof freshQuery;
  }

  const { data: freshData } = await freshQuery
    .order(sortCol, { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);

  res.json({
    data: freshData ?? [],
    source: "fresh",
  });
});

// ─── GET /api/feed/friends ─────────────────────────────────────────────────────
// ?userId=...&limit=20&offset=0
router.get("/friends", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const offset = parseInt((req.query["offset"] as string) ?? "0", 10);

  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const supabase = makeSupabase();

  const { data, error } = await supabase.rpc("get_friends_feed", {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    // Normalise flat RPC shape → nested profiles object + canonical `id` field.
    const normalised = data.map(normaliseFriendsRow);
    res.json({ data: normalised, source: "rpc" });
    return;
  }

  // Fallback: direct posts query with explicit FK hint profile join.
  const { data: freshData } = await supabase
    .from("posts")
    .select("*, profiles!user_id(id, username, avatar_url, is_verified, full_name)")
    .or("visibility.eq.public,visibility.is.null")
    .or("is_archived.eq.false,is_archived.is.null")
    .order("created_at", { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);

  res.json({
    data: freshData ?? [],
    source: "fresh",
    error: error?.message,
  });
});

// ─── GET /api/feed/reels ───────────────────────────────────────────────────────
// ?userId=...&limit=20
router.get("/reels", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);

  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const supabase = makeSupabase();

  // v2 RPC returns no profile info — enrich after.
  const { data: v2Data, error: v2Err } = await supabase.rpc(
    "get_for_you_reels_v2",
    { p_user_id: userId, p_limit: limit },
  );
  if (!v2Err && Array.isArray(v2Data) && v2Data.length > 0) {
    const enriched = await enrichWithProfiles(supabase, v2Data);
    res.json({ data: enriched, source: "v2" });
    return;
  }

  // Fallback: direct reels query with explicit FK profile join.
  const { data: freshReels } = await supabase
    .from("reels")
    .select("*, profiles!user_id(id, username, avatar_url, is_verified, full_name)")
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  res.json({ data: freshReels ?? [], source: "fresh", v2Error: v2Err?.message });
});

// ─── GET /api/feed/following-reels ────────────────────────────────────────────
// ?userId=...&limit=20
router.get("/following-reels", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);

  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const supabase = makeSupabase();

  const { data, error } = await supabase.rpc("get_following_reels", {
    p_user_id: userId,
    p_limit: limit,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    // Enrich with profiles (RPC may or may not include them — be safe).
    const needsEnrich = data.length > 0 && !data[0].username && !data[0].profiles;
    const enriched = needsEnrich ? await enrichWithProfiles(supabase, data) : data;
    res.json({ data: enriched, source: "rpc" });
    return;
  }

  res.json({ data: [], source: "empty", error: error?.message });
});

// ─── GET /api/feed/trending ───────────────────────────────────────────────────
// Returns top posts ranked by combined score: views_count + likes_count.
// ?limit=9  ?content_type=photo|video
// Uses service-role key so RLS never blocks the read.
router.get("/trending", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 9), 50);
  const contentType = req.query["content_type"] as "photo" | "video" | undefined;
  const supabase = makeSupabase();
  try {
    // PostgREST can't ORDER BY a computed expression (views_count + likes_count),
    // so fetch a larger pool ordered by views_count (the higher-magnitude signal),
    // compute the combined score in Node, sort, then slice to the requested limit.
    const pool = Math.min(limit * 5, 200);
    let query = supabase
      .from("posts")
      .select("id, media_url, thumbnail_url, likes_count, views_count, is_video")
      .or("is_archived.eq.false,is_archived.is.null")
      .order("views_count", { ascending: false })
      .limit(pool);

    // Apply content-type filter at DB level when requested
    if (contentType === "video") {
      query = query.eq("is_video", true) as typeof query;
    } else if (contentType === "photo") {
      query = query.or("is_video.eq.false,is_video.is.null") as typeof query;
    }

    const { data, error } = await query;
    if (error) {
      req.log.warn({ error: error.message }, "trending fetch error");
      res.json({ posts: [] });
      return;
    }

    // Rank by combined score: views_count + likes_count, highest first
    const ranked = (data ?? [])
      .map((p: any) => ({
        ...p,
        trending_score: (p.views_count ?? 0) + (p.likes_count ?? 0),
      }))
      .sort((a: any, b: any) => b.trending_score - a.trending_score)
      .slice(0, limit);

    res.json({ posts: ranked });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "trending exception");
    res.json({ posts: [] });
  }
});

// ─── GET /api/feed/following ──────────────────────────────────────────────────
// ?userId=...&limit=20&offset=0
// Calls get_following_feed RPC via service-role key (bypasses RLS).
router.get("/following", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const offset = parseInt((req.query["offset"] as string) ?? "0", 10);

  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const supabase = makeSupabase();

  const { data, error } = await supabase.rpc("get_following_feed", {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    const needsEnrich = !data[0].username && !data[0].profiles;
    const enriched = needsEnrich ? await enrichWithProfiles(supabase, data) : data;
    res.json({ data: enriched.filter((p: any) => p.is_archived !== true), source: "rpc" });
    return;
  }

  const { data: freshData } = await supabase
    .from("posts")
    .select("*, profiles!user_id(id, username, avatar_url, is_verified, full_name)")
    .or("visibility.eq.public,visibility.is.null")
    .or("is_archived.eq.false,is_archived.is.null")
    .order("created_at", { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);

  res.json({ data: freshData ?? [], source: "fresh", error: error?.message });
});

// ─── GET /api/feed/nearby ─────────────────────────────────────────────────────
// ?userId=...&lat=...&lng=...&limit=20&offset=0
// Calls get_nearby_feed RPC via service-role key, falls back to recency sort.
router.get("/nearby", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const lat = parseFloat((req.query["lat"] as string) || "0");
  const lng = parseFloat((req.query["lng"] as string) || "0");
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const offset = parseInt((req.query["offset"] as string) ?? "0", 10);

  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const supabase = makeSupabase();

  const { data, error } = await supabase.rpc("get_nearby_feed", {
    p_lat: lat,
    p_lng: lng,
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    const needsEnrich = !data[0].username && !data[0].profiles;
    const enriched = needsEnrich ? await enrichWithProfiles(supabase, data) : data;
    res.json({ data: enriched.filter((p: any) => p.is_archived !== true), source: "rpc" });
    return;
  }

  const { data: freshData } = await supabase
    .from("posts")
    .select("*, profiles!user_id(id, username, avatar_url, is_verified, full_name)")
    .or("visibility.eq.public,visibility.is.null")
    .or("is_archived.eq.false,is_archived.is.null")
    .order("created_at", { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);

  res.json({ data: freshData ?? [], source: "fresh", error: error?.message });
});

// ─── GET /api/feed/vibes ──────────────────────────────────────────────────────
// ?userId=...&limit=20&offset=0
// Calls get_vibes_feed RPC (trending/liked content), falls back to top likes_count.
router.get("/vibes", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const offset = parseInt((req.query["offset"] as string) ?? "0", 10);

  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const supabase = makeSupabase();

  const { data, error } = await supabase.rpc("get_vibes_feed", {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    const needsEnrich = !data[0].username && !data[0].profiles;
    const enriched = needsEnrich ? await enrichWithProfiles(supabase, data) : data;
    res.json({ data: enriched.filter((p: any) => p.is_archived !== true), source: "rpc" });
    return;
  }

  const { data: freshData } = await supabase
    .from("posts")
    .select("*, profiles!user_id(id, username, avatar_url, is_verified, full_name)")
    .or("visibility.eq.public,visibility.is.null")
    .or("is_archived.eq.false,is_archived.is.null")
    .order("likes_count", { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);

  res.json({ data: freshData ?? [], source: "fresh", error: error?.message });
});

// ─── GET /api/feed/personalized ──────────────────────────────────────────────
// ?userId=...&limit=20&offset=0
// Calls get_personalized_feed RPC with service-role key (bypasses RLS).
router.get("/personalized", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const offset = parseInt((req.query["offset"] as string) ?? "0", 10);
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const supabase = makeSupabase();
  try {
    const { data, error } = await supabase.rpc("get_personalized_feed", {
      p_user_id: userId,
      p_limit: limit,
      p_offset: offset,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      res.json({ data, source: "rpc" });
      return;
    }
    if (error) req.log.warn({ error: error.message }, "get_personalized_feed RPC warn");
    const { data: fallback } = await supabase
      .from("posts")
      .select("*, profiles!user_id(id, username, avatar_url, is_verified, full_name)")
      .or("visibility.eq.public,visibility.is.null")
      .or("is_archived.eq.false,is_archived.is.null")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    res.json({ data: fallback ?? [], source: "fresh" });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "personalized feed error");
    res.json({ data: [], source: "error" });
  }
});

// ─── POST /api/feed/seen ──────────────────────────────────────────────────────
// Body: { userId, postId }
// Fire-and-forget seen tracking so the anon-key RPC never blocks the UI thread.
router.post("/seen", async (req, res) => {
  const { userId, postId } = req.body as { userId?: string; postId?: string };
  if (!userId || !postId) {
    res.status(204).end();
    return;
  }
  const supabase = makeSupabase();
  try {
    await supabase.rpc("mark_post_seen", { p_user_id: userId, p_post_id: postId });
  } catch {}
  res.status(204).end();
});

export default router;

