import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// ─── GET /api/reels/liked?userId=&reelId= ─────────────────────────────────────
// Returns { liked: boolean }
router.get("/liked", async (req, res) => {
  const { userId, reelId } = req.query as { userId?: string; reelId?: string };
  if (!userId || !reelId) {
    res.status(400).json({ error: "userId and reelId required" });
    return;
  }
  const sb = makeSupabase();
  const { data, error } = await sb
    .from("reel_likes")
    .select("id")
    .eq("user_id", userId)
    .eq("reel_id", reelId)
    .maybeSingle();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ liked: !!data });
});

// ─── POST /api/reels/like ─────────────────────────────────────────────────────
// body: { userId, reelId }
// Toggles the like: inserts if not liked, deletes if already liked.
// Updates reels.likes_count atomically via RPC or manual increment.
// Returns { liked: boolean, likes: number }
router.post("/like", async (req, res) => {
  const { userId, reelId } = req.body as { userId?: string; reelId?: string };
  if (!userId || !reelId) {
    res.status(400).json({ error: "userId and reelId required" });
    return;
  }
  const sb = makeSupabase();

  // Check current state
  const { data: existing } = await sb
    .from("reel_likes")
    .select("id")
    .eq("user_id", userId)
    .eq("reel_id", reelId)
    .maybeSingle();

  const alreadyLiked = !!existing;

  if (alreadyLiked) {
    // Unlike: remove the row
    await sb.from("reel_likes").delete().eq("user_id", userId).eq("reel_id", reelId);
    // Decrement count (floor at 0)
    await sb.rpc("decrement_reel_likes", { p_reel_id: reelId }).catch(async () => {
      // Fallback if RPC doesn't exist: manual read-modify-write
      const { data: reel } = await sb.from("reels").select("likes_count").eq("id", reelId).maybeSingle();
      const current = (reel as any)?.likes_count ?? 0;
      await sb.from("reels").update({ likes_count: Math.max(0, current - 1) }).eq("id", reelId);
    });
  } else {
    // Like: insert (UNIQUE constraint prevents duplicates at DB level)
    await sb.from("reel_likes").insert({ user_id: userId, reel_id: reelId }).catch(() => {
      // Duplicate insert — already liked, no-op
    });
    // Increment count
    await sb.rpc("increment_reel_likes", { p_reel_id: reelId }).catch(async () => {
      // Fallback: manual read-modify-write
      const { data: reel } = await sb.from("reels").select("likes_count").eq("id", reelId).maybeSingle();
      const current = (reel as any)?.likes_count ?? 0;
      await sb.from("reels").update({ likes_count: current + 1 }).eq("id", reelId);
    });
  }

  // Return updated count
  const { data: updated } = await sb
    .from("reels")
    .select("likes_count")
    .eq("id", reelId)
    .maybeSingle();

  res.json({
    liked: !alreadyLiked,
    likes: (updated as any)?.likes_count ?? 0,
  });
});

export default router;
