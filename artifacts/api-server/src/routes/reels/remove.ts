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

// DELETE /api/reels/:reelId
// Body: { userId: string }
//
// Ownership check: rejects 403 if userId !== reel.user_id.
// Cleans up child rows (reel_likes, reel_views/watches) before deleting the reel.
router.delete("/:reelId", async (req, res) => {
  const { reelId } = req.params as { reelId: string };
  const { userId } = req.body as { userId?: string };

  if (!reelId || !userId) {
    res.status(400).json({ error: "reelId and userId are required" });
    return;
  }

  const sb = makeSupabase();

  // ── 1. Fetch reel and verify ownership ────────────────────────────────────
  const { data: reel, error: fetchErr } = await sb
    .from("reels")
    .select("id, user_id")
    .eq("id", reelId)
    .single();

  if (fetchErr || !reel) {
    res.status(404).json({ error: "Reel not found" });
    return;
  }

  if (reel.user_id !== userId) {
    res.status(403).json({ error: "Not authorized to delete this reel" });
    return;
  }

  // ── 2. Child-row cleanup ──────────────────────────────────────────────────
  const dependents = ["reel_likes", "reel_watches"] as const;
  for (const table of dependents) {
    try {
      await (sb as any).from(table).delete().eq("reel_id", reelId);
    } catch {}
  }

  // ── 3. Delete the reel ────────────────────────────────────────────────────
  const { error: deleteErr } = await sb.from("reels").delete().eq("id", reelId);

  if (deleteErr) {
    req.log.error({ err: deleteErr.message }, "Failed to delete reel");
    res.status(500).json({ error: "Failed to delete reel", detail: deleteErr.message });
    return;
  }

  res.json({ success: true });
});

export default router;
