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

export default router;
