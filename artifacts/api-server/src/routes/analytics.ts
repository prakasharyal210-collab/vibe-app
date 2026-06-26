import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  return createClient(
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co",
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  );
}

// ─── POST /api/analytics/track-interest ──────────────────────────────────────
// Body: { userId, hashtag, interactionType }
router.post("/track-interest", async (req, res) => {
  const { userId, hashtag, interactionType } = req.body ?? {};
  if (!userId || !hashtag || !interactionType) {
    res.status(400).json({ error: "userId, hashtag, interactionType required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb.rpc("track_user_interest", {
      p_user_id: userId,
      p_hashtag: hashtag,
      p_interaction_type: interactionType,
    });
    if (error) req.log.warn({ error: error.message }, "track_user_interest RPC warn");
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "track-interest error");
    res.json({ ok: false });
  }
});

// ─── POST /api/analytics/vibe-score ──────────────────────────────────────────
// Body: { userId, points, reason }
router.post("/vibe-score", async (req, res) => {
  const { userId, points, reason } = req.body ?? {};
  if (!userId || points === undefined || !reason) {
    res.status(400).json({ error: "userId, points, reason required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb.rpc("update_vibe_score", {
      p_user_id: userId,
      p_points: points,
      p_reason: reason,
    });
    if (error) req.log.warn({ error: error.message }, "update_vibe_score RPC warn");
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe-score error");
    res.json({ ok: false });
  }
});

// ─── GET /api/analytics/spam-check ───────────────────────────────────────────
// ?userId=...
router.get("/spam-check", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb.rpc("detect_spam", { p_user_id: userId });
    if (error) req.log.warn({ error: error.message }, "detect_spam RPC warn");
    res.json({ isSpam: !error ? !!data : false });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "spam-check error");
    res.json({ isSpam: false });
  }
});

// ─── POST /api/analytics/creator ─────────────────────────────────────────────
// Body: { userId }
router.post("/creator", async (req, res) => {
  const { userId } = req.body ?? {};
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb.rpc("update_creator_analytics", { p_user_id: userId });
    if (error) req.log.warn({ error: error.message }, "update_creator_analytics RPC warn");
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "creator analytics error");
    res.json({ ok: false });
  }
});

// ─── GET /api/analytics/user ─────────────────────────────────────────────────
// ?userId=...&days=7|30|90
// Returns real stats for the creator analytics dashboard.
// Uses the service-role key so it bypasses RLS — never call these tables
// from the mobile anon client directly (they hang forever under RLS).
router.get("/user", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const days = Math.min(Math.max(parseInt((req.query["days"] as string) || "7", 10) || 7, 1), 90);

  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const sb = makeSupabase();
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    // Step 1: get user's post IDs + new-follower count + top posts (parallel)
    const [postsRes, followersRes, topPostsRes] = await Promise.all([
      sb.from("posts").select("id").eq("user_id", userId),
      sb.from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_id", userId)
        .gte("created_at", cutoff),
      sb.from("posts")
        .select("id, caption, likes_count, comments_count, media_url")
        .eq("user_id", userId)
        .order("likes_count", { ascending: false })
        .limit(5),
    ]);

    const postIds: string[] = (postsRes.data ?? []).map((p: any) => p.id).slice(0, 100);

    // Step 2: count likes + comments received on user's posts, and raw follower-growth rows
    const [likesRes, commentsRes, growthRes] = await Promise.all([
      postIds.length > 0
        ? sb.from("likes")
            .select("id", { count: "exact", head: true })
            .in("post_id", postIds)
            .gte("created_at", cutoff)
        : Promise.resolve({ count: 0, error: null }),
      postIds.length > 0
        ? sb.from("comments")
            .select("id", { count: "exact", head: true })
            .in("post_id", postIds)
            .gte("created_at", cutoff)
        : Promise.resolve({ count: 0, error: null }),
      sb.from("follows")
        .select("created_at")
        .eq("following_id", userId)
        .gte("created_at", cutoff),
    ]);

    // Build bucketed bar chart data for follower growth
    const numBars = days <= 7 ? 7 : days <= 30 ? 14 : 12;
    const bucketMs = (days * 86_400_000) / numBars;
    const rangeStart = Date.now() - days * 86_400_000;
    const followerGrowthBars = Array.from({ length: numBars }, (_, i) => {
      const from = rangeStart + i * bucketMs;
      const to = from + bucketMs;
      return (growthRes.data ?? []).filter((f: any) => {
        const t = new Date(f.created_at).getTime();
        return t >= from && t < to;
      }).length;
    });

    res.json({
      likes: likesRes.count ?? 0,
      comments: commentsRes.count ?? 0,
      newFollowers: followersRes.count ?? 0,
      topPosts: (topPostsRes.data ?? []).map((p: any) => ({
        id: p.id,
        caption: p.caption ?? "",
        media_url: p.media_url ?? "",
        likes: p.likes_count ?? 0,
        comments: p.comments_count ?? 0,
      })),
      followerGrowthBars,
    });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "analytics/user error");
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

export default router;
