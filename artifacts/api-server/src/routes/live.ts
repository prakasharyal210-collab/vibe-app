import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// POST /api/live/stream
// body: { userId, title }
// Creates a new live_streams row and returns the stream id.
router.post("/stream", async (req, res) => {
  const { userId, title = "Live Stream" } = req.body as { userId?: string; title?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("live_streams")
      .insert({
        user_id: userId,
        title,
        status: "live",
        started_at: new Date().toISOString(),
        viewer_count: 0,
        coins_earned: 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    res.json({ streamId: (data as any).id });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "live/stream create error");
    res.status(500).json({ error: "Failed to create live stream" });
  }
});

// PATCH /api/live/stream/:id/end
// body: { viewerCount, coinsEarned }
router.patch("/stream/:id/end", async (req, res) => {
  const { id } = req.params;
  const { viewerCount = 0, coinsEarned = 0 } = req.body as { viewerCount?: number; coinsEarned?: number };
  const sb = makeSupabase();
  try {
    const { error } = await sb
      .from("live_streams")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        viewer_count: viewerCount,
        coins_earned: coinsEarned,
      })
      .eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "live/stream end error");
    res.status(500).json({ error: "Failed to end live stream" });
  }
});

export default router;
