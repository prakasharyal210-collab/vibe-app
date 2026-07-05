import { Router } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { enrichWithPolls } from "./polls";

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

// For rows with is_couple_post=true, look up both partner profiles and attach a
// `couple: { partner1, partner2, coupleName }` object so PostCard can render them.
async function enrichWithCoupleData(
  supabase: SupabaseClient,
  rows: any[],
): Promise<any[]> {
  const coupleRows = rows.filter((r) => r.is_couple_post && r.couple_id);
  if (!coupleRows.length) return rows;

  const coupleIds = [...new Set(coupleRows.map((r) => r.couple_id as string))];

  const { data: links } = await supabase
    .from("couple_links")
    .select("id, requester_id, receiver_id")
    .in("id", coupleIds);

  if (!links?.length) return rows;

  const allUserIds = new Set<string>();
  for (const l of links) {
    if (l.requester_id) allUserIds.add(l.requester_id as string);
    if (l.receiver_id) allUserIds.add(l.receiver_id as string);
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .in("id", [...allUserIds]);

  const profileMap = new Map<string, any>();
  for (const p of profiles ?? []) profileMap.set(p.id as string, p);

  const linkMap = new Map<string, any>();
  for (const l of links) linkMap.set(l.id as string, l);

  return rows.map((row) => {
    if (!row.is_couple_post || !row.couple_id) return row;
    const link = linkMap.get(row.couple_id as string);
    if (!link) return row;
    const p1 = profileMap.get(link.requester_id as string) ?? null;
    const p2 = profileMap.get(link.receiver_id as string) ?? null;
    const name1 = (p1?.full_name as string | null)?.split(" ")[0] || (p1?.username as string | null) || "Partner";
    const name2 = (p2?.full_name as string | null)?.split(" ")[0] || (p2?.username as string | null) || "Partner";
    return {
      ...row,
      couple: { partner1: p1, partner2: p2, coupleName: `${name1} & ${name2}` },
    };
  });
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

// ─── Poll cap for Explore/For You ─────────────────────────────────────────────
// Limits the For You feed to at most 5 poll posts, chosen by engagement score
// with freshness decay.
//
// Formula:
//   raw   = (totalVotes × 1.5) + (comments_count × 2) + (likes_count × 1)
//   score = raw / Math.pow(hoursSincePosted + 2, 1.5)
//
// Sort order: active polls (ends_at in the future) above ended polls, then
// by score descending within each tier.  The surviving 5 are merged back into
// the feed at their original positions — poll posts are never clustered.
//
// Timestamp parsing: Supabase ISO strings lack a timezone suffix.  Appending
// 'Z' forces UTC interpretation; Date.parse() is used (not `new Date(str) raw`)
// to avoid the browser-local-time pitfall in V8 / Node.
//
// Fallback: if the scoring step throws for any reason, the 5 most-recent poll
// posts (by created_at) are shown instead of erroring the whole feed.
//
// No-op when ≤ 5 poll posts are already in the page.

/** Parse a Supabase timestamp string to milliseconds since epoch, UTC-safe. */
function parseUTCMs(ts: string | null | undefined): number {
  if (!ts) return 0;
  // Supabase omits the timezone suffix.  Append 'Z' if no offset is present.
  const normalized = /[Z+\-]\d*$/.test(ts) ? ts : `${ts}Z`;
  const ms = Date.parse(normalized);
  return isNaN(ms) ? 0 : ms;
}

function limitPollsToTop5(posts: any[]): any[] {
  const pollPosts: any[] = [];
  for (const post of posts) {
    if (post.poll) pollPosts.push(post);
  }

  if (pollPosts.length <= 5) return posts;

  try {
    const nowMs = Date.now();

    const scored = pollPosts.map((post) => {
      const totalVotes: number = (post.poll?.totalVotes as number | undefined) ?? 0;
      const likes: number = (post.likes_count as number | undefined) ?? 0;
      const comments: number = (post.comments_count as number | undefined) ?? 0;
      const createdMs = parseUTCMs(post.created_at as string | undefined);
      const hoursSincePosted = Math.max(0, (nowMs - createdMs) / 3_600_000);
      const raw = totalVotes * 1.5 + likes + comments * 2;
      const score = raw / Math.pow(hoursSincePosted + 2, 1.5);
      const endsAtMs = parseUTCMs(post.poll?.ends_at as string | undefined);
      const isActive = endsAtMs > nowMs;
      return { id: post.id as string, score, isActive };
    });

    // Active polls first, then highest score within each tier.
    scored.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.score - a.score;
    });

    const top5Ids = new Set(scored.slice(0, 5).map((s) => s.id));
    return posts.filter((post: any) => !post.poll || top5Ids.has(post.id as string));
  } catch {
    // Fallback: keep the 5 most-recent poll posts by created_at.
    const byRecency = [...pollPosts].sort(
      (a, b) => parseUTCMs(b.created_at as string) - parseUTCMs(a.created_at as string),
    );
    const top5Ids = new Set(byRecency.slice(0, 5).map((p) => p.id as string));
    return posts.filter((post: any) => !post.poll || top5Ids.has(post.id as string));
  }
}

// ─── GET /api/feed/foryou ─────────────────────────────────────────────────────
// ?userId=...&limit=20&offset=0&content_type=photo|video&sort=newest|most_liked|most_viewed&category=music|...&type=polls
router.get("/foryou", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const offset = parseInt((req.query["offset"] as string) ?? "0", 10);
  const contentType = req.query["content_type"] as "photo" | "video" | undefined;
  const sort = (req.query["sort"] as string) ?? "newest";
  const rawCategory = req.query["category"] as string | undefined;
  const category = rawCategory && VALID_FEED_CATEGORIES.has(rawCategory) ? rawCategory : undefined;
  const feedType = req.query["type"] as string | undefined;

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

  // ── Polls filter (?type=polls) ─────────────────────────────────────────────
  // Returns only posts that have an associated poll row, ordered:
  //   active polls first (ends_at in the future, desc) then recently-ended.
  // Sorting by ends_at desc naturally puts future timestamps before past ones.
  if (feedType === "polls") {
    const { data: pollRows } = await supabase
      .from("polls")
      .select("post_id, ends_at")
      .not("post_id", "is", null)
      .order("ends_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const postIds = (pollRows ?? [])
      .map((r: any) => r.post_id as string)
      .filter(Boolean);

    if (!postIds.length) {
      res.json({ data: [], source: "polls" });
      return;
    }

    const { data: pollPosts } = await supabase
      .from("posts")
      .select("*, profiles!user_id(id, username, avatar_url, is_verified, full_name)")
      .in("id", postIds)
      .or("visibility.eq.public,visibility.is.null")
      .or("is_archived.eq.false,is_archived.is.null");

    // Preserve the ends_at ordering returned from the polls table.
    const idOrder = new Map(postIds.map((id: string, i: number) => [id, i]));
    const sorted = [...(pollPosts ?? [])].sort(
      (a: any, b: any) => (idOrder.get(a.id as string) ?? 999) - (idOrder.get(b.id as string) ?? 999),
    );

    const enrichedCouple = await enrichWithCoupleData(supabase, sorted);
    const enrichedPolls = await enrichWithPolls(supabase, enrichedCouple, userId);
    res.json({ data: enrichedPolls, source: "polls" });
    return;
  }

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
      const enrichedCouple = await enrichWithCoupleData(supabase, enriched);
      const enrichedPolls = await enrichWithPolls(supabase, enrichedCouple, userId);
      const filtered = sortRows(filterByCategory(filterByContentType(enrichedPolls.filter((p: any) => p.is_archived !== true))));
      const out = limitPollsToTop5(filtered);
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
      const enrichedCouple = await enrichWithCoupleData(supabase, enriched);
      const enrichedPolls = await enrichWithPolls(supabase, enrichedCouple, userId);
      const filtered = sortRows(filterByCategory(filterByContentType(enrichedPolls.filter((p: any) => p.is_archived !== true))));
      const out = limitPollsToTop5(filtered);
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

  const freshEnriched = await enrichWithCoupleData(supabase, freshData ?? []);
  const freshPolls = await enrichWithPolls(supabase, freshEnriched, userId);
  res.json({
    data: limitPollsToTop5(freshPolls),
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
    const enrichedCouple = await enrichWithCoupleData(supabase, normalised);
    const friendsWithPolls = await enrichWithPolls(supabase, enrichedCouple, userId);
    res.json({ data: friendsWithPolls, source: "rpc" });
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

  const freshEnriched = await enrichWithCoupleData(supabase, freshData ?? []);
  const freshWithPolls = await enrichWithPolls(supabase, freshEnriched, userId);
  res.json({
    data: freshWithPolls,
    source: "fresh",
    error: error?.message,
  });
});

// ─── GET /api/feed/reels ───────────────────────────────────────────────────────
// ?userId=...&limit=20  (userId is optional — omit for guest/unauthenticated)
router.get("/reels", async (req, res) => {
  const t0 = Date.now();
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);

  req.log.info({ userId: userId?.slice(0, 8) ?? "guest" }, "reels: request start");

  const supabase = makeSupabase();

  // When userId is present, try the personalised v2 RPC first.
  // Hard-capped at 4 s: if the RPC is slow or returns empty we fall through
  // immediately rather than making the client wait before the fallback fires.
  if (userId) {
    try {
      const rpcTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("rpc_timeout")), 4000),
      );
      const rpcCall = supabase.rpc("get_for_you_reels_v2", {
        p_user_id: userId,
        p_limit: limit,
      });
      const { data: v2Data, error: v2Err } = await Promise.race([rpcCall, rpcTimeout]);
      req.log.info(
        { ms: Date.now() - t0, rows: Array.isArray(v2Data) ? v2Data.length : 0, err: v2Err?.message ?? null },
        "reels: v2 RPC done",
      );
      if (!v2Err && Array.isArray(v2Data) && v2Data.length > 0) {
        const enriched = await enrichWithProfiles(supabase, v2Data);
        const enrichedCouple = await enrichWithCoupleData(supabase, enriched);
        req.log.info({ ms: Date.now() - t0, rows: enrichedCouple.length }, "reels: v2 response sent");
        res.json({ data: enrichedCouple, source: "v2" });
        return;
      }
    } catch (err: any) {
      req.log.warn(
        { err: err?.message, ms: Date.now() - t0 },
        "reels: v2 RPC threw/timed out — falling back to fresh query",
      );
    }
  }

  // Fallback (also used for guests): direct reels query ordered by score.
  req.log.info({ ms: Date.now() - t0 }, "reels: running fallback query");
  const { data: freshReels } = await supabase
    .from("reels")
    .select("*, profiles!user_id(id, username, avatar_url, is_verified, full_name)")
    .or("is_archived.eq.false,is_archived.is.null")
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  req.log.info({ ms: Date.now() - t0, rows: freshReels?.length ?? 0 }, "reels: fallback response sent");
  res.json({ data: freshReels ?? [], source: "fresh" });
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
    const enrichedCouple = await enrichWithCoupleData(supabase, enriched);
    res.json({ data: enrichedCouple, source: "rpc" });
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

    // Rank by combined score: views_count + likes_count, highest first.
    // Also drop video posts with no thumbnail — they can't be shown as image cards.
    const ranked = (data ?? [])
      .filter((p: any) => !(p.is_video && !p.thumbnail_url))
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
    const enrichedCouple = await enrichWithCoupleData(supabase, enriched);
    const followingWithPolls = await enrichWithPolls(supabase, enrichedCouple.filter((p: any) => p.is_archived !== true), userId);
    res.json({ data: followingWithPolls, source: "rpc" });
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

  const followingFresh = await enrichWithCoupleData(supabase, freshData ?? []);
  const followingFreshWithPolls = await enrichWithPolls(supabase, followingFresh, userId);
  res.json({ data: followingFreshWithPolls, source: "fresh", error: error?.message });
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
    const enrichedCouple = await enrichWithCoupleData(supabase, enriched);
    const nearbyWithPolls = await enrichWithPolls(supabase, enrichedCouple.filter((p: any) => p.is_archived !== true), userId);
    res.json({ data: nearbyWithPolls, source: "rpc" });
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

  const nearbyFresh = await enrichWithCoupleData(supabase, freshData ?? []);
  const nearbyFreshWithPolls = await enrichWithPolls(supabase, nearbyFresh, userId);
  res.json({ data: nearbyFreshWithPolls, source: "fresh", error: error?.message });
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
    const enrichedCouple = await enrichWithCoupleData(supabase, enriched);
    const vibesWithPolls = await enrichWithPolls(supabase, enrichedCouple.filter((p: any) => p.is_archived !== true), userId);
    res.json({ data: vibesWithPolls, source: "rpc" });
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

  const vibesFresh = await enrichWithCoupleData(supabase, freshData ?? []);
  const vibesFreshWithPolls = await enrichWithPolls(supabase, vibesFresh, userId);
  res.json({ data: vibesFreshWithPolls, source: "fresh", error: error?.message });
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
      const enrichedCouple = await enrichWithCoupleData(supabase, data);
      const personalizedWithPolls = await enrichWithPolls(supabase, enrichedCouple, userId);
      res.json({ data: personalizedWithPolls, source: "rpc" });
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
    const personalizedFresh = await enrichWithCoupleData(supabase, fallback ?? []);
    const personalizedFreshWithPolls = await enrichWithPolls(supabase, personalizedFresh, userId);
    res.json({ data: personalizedFreshWithPolls, source: "fresh" });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "personalized feed error");
    res.json({ data: [], source: "error" });
  }
});

// ─── GET /api/feed/fresh-faces ───────────────────────────────────────────────
// Returns first posts from new users in the last 24 h, newest first.
// ?userId=<requesting user UUID>&limit=10
// Requires is_first_post column (scripts/first-post-migration.sql).
// Falls back to posts from users who joined in the last 24 h if column missing.
router.get("/fresh-faces", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "10", 10), 20);
  const supabase = makeSupabase();

  try {
    // Compute the 24-hour cutoff in UTC milliseconds and as a UTC ISO string.
    // Using sinceMs for the JS-level safety filter below avoids any local-time
    // misparse of `created_at` strings that Supabase may return without a Z suffix.
    const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
    const since = new Date(sinceMs).toISOString(); // always "...Z"

    let query = supabase
      .from("posts")
      .select("*, profiles!user_id(id, username, avatar_url, is_verified, full_name)")
      .eq("is_first_post", true)
      .gte("created_at", since)
      .or("visibility.eq.public,visibility.is.null")
      .or("is_archived.eq.false,is_archived.is.null")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.neq("user_id", userId) as typeof query;
    }

    const { data, error } = await query;

    if (error) {
      req.log.warn({ error: error.message, since }, "fresh-faces fetch error");
      res.json({ posts: [] });
      return;
    }

    // Defense-in-depth: re-filter in JS after the DB query.
    // Supabase can return `created_at` without a Z suffix (bare timestamp); parsing
    // such a string with `new Date()` treats it as LOCAL time on the JS runtime.
    // Appending Z when no offset is present forces UTC interpretation — the same
    // pattern used by parseUTCMs in the mobile client.
    const rows = (data ?? []).filter((p: any) => {
      const ts = (p.created_at ?? "") as string;
      const hasOffset = ts.endsWith("Z") || ts.includes("+") || (ts.length > 19 && ts[19] === "-");
      const ms = new Date(hasOffset ? ts : ts + "Z").getTime();
      return Number.isFinite(ms) && ms >= sinceMs;
    });

    req.log.info({ since, rowsFromDb: (data ?? []).length, rowsAfterFilter: rows.length }, "fresh-faces result");
    const posts = rows.map((p: any) => ({ ...p, is_first_post: true }));
    res.json({ posts });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "fresh-faces exception");
    res.json({ posts: [] });
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

