import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// GET /api/ads/feed?userId=&adType=feed_post|reel
// Returns active ad campaigns for the feed, filtered per user via RPC.
router.get("/feed", async (req, res) => {
  const { userId, adType = "feed_post" } = req.query as { userId?: string; adType?: string };
  if (!userId) { res.json({ ads: [] }); return; }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb.rpc("get_feed_ads", {
      p_user_id: userId,
      p_ad_type: adType,
      p_limit: 5,
    });
    if (error) throw error;
    res.json({ ads: Array.isArray(data) ? data : [] });
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "ads/feed rpc failed — returning empty");
    res.json({ ads: [] });
  }
});

// POST /api/ads/impression
// body: { adId, userId }
router.post("/impression", async (req, res) => {
  const { adId, userId } = req.body as { adId?: string; userId?: string };
  if (!adId || !userId || adId.startsWith("house-")) { res.json({ ok: true }); return; }
  const sb = makeSupabase();
  try {
    await sb.rpc("track_ad_impression", {
      p_ad_id: adId,
      p_user_id: userId,
      p_impression_type: "view",
      p_watch_duration: 0,
    });
    res.json({ ok: true });
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "ads/impression rpc failed");
    res.json({ ok: true });
  }
});

// POST /api/ads/click
// body: { adId, userId }
router.post("/click", async (req, res) => {
  const { adId, userId } = req.body as { adId?: string; userId?: string };
  if (!adId || !userId || adId.startsWith("house-")) { res.json({ ok: true }); return; }
  const sb = makeSupabase();
  try {
    await sb.rpc("track_ad_click", { p_ad_id: adId, p_user_id: userId });
    res.json({ ok: true });
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "ads/click rpc failed");
    res.json({ ok: true });
  }
});

// POST /api/ads/campaign
// body: ad campaign fields
router.post("/campaign", async (req, res) => {
  const {
    userId, advertiserName, title, description, ctaText, ctaUrl,
    adType, dailyBudget, durationDays, targetGender,
  } = req.body as {
    userId?: string; advertiserName?: string; title?: string; description?: string;
    ctaText?: string; ctaUrl?: string; adType?: string; dailyBudget?: number;
    durationDays?: number; targetGender?: string;
  };
  if (!userId || !title || !ctaUrl) {
    res.status(400).json({ error: "userId, title and ctaUrl required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb.from("ad_campaigns").insert({
      user_id: userId,
      advertiser_name: advertiserName ?? "",
      title,
      description: description ?? "",
      cta_text: ctaText ?? "Learn More",
      cta_url: ctaUrl,
      ad_type: adType ?? "feed_post",
      daily_budget: dailyBudget ?? 0,
      duration_days: durationDays ?? 7,
      target_gender: targetGender ?? "all",
      status: "pending_review",
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "ads/campaign insert failed");
    res.status(500).json({ error: "Failed to submit campaign" });
  }
});

// POST /api/ads/hide
// body: { adId, userId }
router.post("/hide", async (req, res) => {
  const { adId, userId } = req.body as { adId?: string; userId?: string };
  if (!adId || !userId || adId.startsWith("house-")) { res.json({ ok: true }); return; }
  const sb = makeSupabase();
  try {
    await sb.from("hidden_ads").upsert({ user_id: userId, ad_id: adId });
    res.json({ ok: true });
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "ads/hide failed");
    res.json({ ok: true });
  }
});

export default router;
