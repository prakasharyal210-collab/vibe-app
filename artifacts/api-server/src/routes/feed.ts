import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url =
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
    "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// ─── GET /api/feed/foryou ─────────────────────────────────────────────────────
// ?userId=...&limit=20&offset=0
// Calls get_for_you_feed_v2 (falls back to get_for_you_feed) via service role
// key so Supabase RLS never blocks and the RPC returns in <1 s from server.
router.get("/foryou", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const offset = parseInt((req.query["offset"] as string) ?? "0", 10);

  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const supabase = makeSupabase();

  // Try v2 first (personalised + ranked)
  const { data: v2Data, error: v2Err } = await supabase.rpc(
    "get_for_you_feed_v2",
    { p_user_id: userId, p_limit: limit, p_offset: offset },
  );
  if (!v2Err && Array.isArray(v2Data) && v2Data.length > 0) {
    res.json({ data: v2Data, source: "v2" });
    return;
  }

  // Fallback to v1
  const { data: v1Data, error: v1Err } = await supabase.rpc(
    "get_for_you_feed",
    { p_user_id: userId, p_limit: limit, p_offset: offset },
  );
  if (!v1Err && Array.isArray(v1Data) && v1Data.length > 0) {
    res.json({ data: v1Data, source: "v1" });
    return;
  }

  // Final fallback: plain posts query (no RLS hang — service role bypasses it)
  const { data: freshData } = await supabase
    .from("posts")
    .select("*, profiles!user_id(*)")
    .or("visibility.eq.public,visibility.is.null")
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);

  res.json({ data: freshData ?? [], source: "fresh", v2Error: v2Err?.message, v1Error: v1Err?.message });
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
    res.json({ data, source: "rpc" });
    return;
  }

  // Fallback: recent posts from people the user follows
  res.json({ data: [], source: "empty", error: error?.message });
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

  // Try personalised v2
  const { data: v2Data, error: v2Err } = await supabase.rpc(
    "get_for_you_reels_v2",
    { p_user_id: userId, p_limit: limit },
  );
  if (!v2Err && Array.isArray(v2Data) && v2Data.length > 0) {
    res.json({ data: v2Data, source: "v2" });
    return;
  }

  // Fallback: plain reels query
  const { data: freshReels } = await supabase
    .from("reels")
    .select("*, profiles!user_id(username, avatar_url, is_verified)")
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
    res.json({ data, source: "rpc" });
    return;
  }

  res.json({ data: [], source: "empty", error: error?.message });
});

export default router;
