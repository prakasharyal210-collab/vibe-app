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

// POST /api/reels/watch — log a watch event and immediately refresh reel score
router.post("/watch", async (req, res) => {
  const { userId, reelId, watchDuration, videoDuration } = req.body as {
    userId?: string;
    reelId: string;
    watchDuration: number;
    videoDuration: number;
  };

  if (!reelId || typeof watchDuration !== "number" || watchDuration <= 0) {
    res.status(400).json({ error: "reelId and watchDuration required" });
    return;
  }

  const sb = makeSupabase();

  // Insert watch event (fire-and-forget style — we always return 200)
  const insertPromise = sb.from("watch_events").insert({
    user_id: userId ?? null,
    reel_id: reelId,
    watch_duration: Math.round(watchDuration * 10) / 10,
    video_duration: videoDuration > 0 ? videoDuration : 14,
  });

  // Recalculate reel score immediately so it's reflected on the next feed load
  const scorePromise = sb.rpc("calculate_reel_score", { p_reel_id: reelId }).then(
    async ({ data: newScore }) => {
      if (typeof newScore === "number") {
        await sb.from("reels").update({ score: newScore }).eq("id", reelId);
      }
    }
  );

  // Record creator affinity when user watches >80% of a reel
  const affinityPromise = (async () => {
    if (!userId) return;
    const ratio = videoDuration > 0 ? watchDuration / videoDuration : 0;
    if (ratio < 0.8) return;
    try {
      const { data: reel } = await sb.from("reels").select("user_id").eq("id", reelId).maybeSingle();
      const creatorId = reel?.user_id;
      if (!creatorId || creatorId === userId) return;
      const key = `creator:${creatorId}`;
      const { data: row } = await sb.from("user_interests").select("weight").eq("user_id", userId).eq("interest_key", key).maybeSingle();
      const newW = Math.min(10, Math.max(-5, ((row?.weight as number | null) ?? 0) + 0.4));
      await sb.from("user_interests").upsert(
        { user_id: userId, interest_key: key, weight: newW, updated_at: new Date().toISOString() },
        { onConflict: "user_id,interest_key" }
      );
    } catch {}
  })();

  await Promise.allSettled([insertPromise, scorePromise, affinityPromise]);

  res.json({ ok: true });
});

export default router;
