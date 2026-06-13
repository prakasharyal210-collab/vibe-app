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

  await Promise.allSettled([insertPromise, scorePromise]);

  res.json({ ok: true });
});

export default router;
