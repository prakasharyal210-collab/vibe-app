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

// ─── GET /api/feed/foryou ─────────────────────────────────────────────────────
// ?userId=...&limit=20&offset=0
router.get("/foryou", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const offset = parseInt((req.query["offset"] as string) ?? "0", 10);

  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const supabase = makeSupabase();

  // Try v2 first (personalised + ranked). RPC returns no profile info, so we
  // enrich with a secondary profiles batch lookup.
  const { data: v2Data, error: v2Err } = await supabase.rpc(
    "get_for_you_feed_v2",
    { p_user_id: userId, p_limit: limit, p_offset: offset },
  );
  if (!v2Err && Array.isArray(v2Data) && v2Data.length > 0) {
    const enriched = await enrichWithProfiles(supabase, v2Data);
    res.json({ data: enriched, source: "v2" });
    return;
  }

  // Fallback to v1
  const { data: v1Data, error: v1Err } = await supabase.rpc(
    "get_for_you_feed",
    { p_user_id: userId, p_limit: limit, p_offset: offset },
  );
  if (!v1Err && Array.isArray(v1Data) && v1Data.length > 0) {
    const enriched = await enrichWithProfiles(supabase, v1Data);
    res.json({ data: enriched, source: "v1" });
    return;
  }

  // Final fallback: direct posts query — service role bypasses RLS, profile
  // join uses explicit FK hint to avoid "multiple relationships" ambiguity.
  const { data: freshData } = await supabase
    .from("posts")
    .select("*, profiles!user_id(id, username, avatar_url, is_verified, full_name)")
    .or("visibility.eq.public,visibility.is.null")
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);

  res.json({
    data: freshData ?? [],
    source: "fresh",
    v2Error: v2Err?.message,
    v1Error: v1Err?.message,
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
// Returns top posts by likes_count for the trending grid.
// Uses service-role key so RLS never blocks the read.
router.get("/trending", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 9), 50);
  const supabase = makeSupabase();
  try {
    const { data, error } = await supabase
      .from("posts")
      .select("id, media_url, likes_count, thumbnail_url")
      .order("likes_count", { ascending: false })
      .limit(limit);
    if (error) {
      req.log.warn({ error: error.message }, "trending fetch error");
      res.json({ posts: [] });
      return;
    }
    res.json({ posts: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "trending exception");
    res.json({ posts: [] });
  }
});

export default router;
