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
    const { error: rpcDecErr } = await sb.rpc("decrement_reel_likes", { p_reel_id: reelId });
    if (rpcDecErr) {
      const { data: reel } = await sb.from("reels").select("likes_count").eq("id", reelId).maybeSingle();
      const current = (reel as any)?.likes_count ?? 0;
      await sb.from("reels").update({ likes_count: Math.max(0, current - 1) }).eq("id", reelId);
    }
  } else {
    // Like: insert — ignore duplicate errors (race condition / UNIQUE constraint)
    await sb.from("reel_likes").insert({ user_id: userId, reel_id: reelId });
    // Increment count
    const { error: rpcIncErr } = await sb.rpc("increment_reel_likes", { p_reel_id: reelId });
    if (rpcIncErr) {
      const { data: reel } = await sb.from("reels").select("likes_count").eq("id", reelId).maybeSingle();
      const current = (reel as any)?.likes_count ?? 0;
      await sb.from("reels").update({ likes_count: current + 1 }).eq("id", reelId);
    }

    // Notify reel owner — non-blocking, skip self, dedup per user+reel
    void (async () => {
      try {
        const { data: reelRow } = await sb
          .from("reels")
          .select("user_id, thumbnail_url")
          .eq("id", reelId!)
          .maybeSingle();
        const ownerId: string | null = (reelRow as any)?.user_id ?? null;
        if (!ownerId || ownerId === userId) return;

        // Dedup: one notification per liker+reel
        const { data: existing } = await sb
          .from("notifications")
          .select("id")
          .eq("recipient_id", ownerId)
          .eq("sender_id", userId!)
          .eq("type", "like")
          .eq("reference_id", reelId)
          .maybeSingle();
        if (existing) return;

        await sb.from("notifications").insert({
          recipient_id: ownerId,
          sender_id: userId,
          type: "like",
          message: "liked your reel",
          reference_id: reelId,
          thumbnail_url: (reelRow as any)?.thumbnail_url ?? null,
          is_read: false,
        });
      } catch {}
    })();
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

// ─── POST /api/reels/like-only ─────────────────────────────────────────────────
// Idempotent like-only: never unlikes, never double-counts.
// Used by double-tap. Returns { liked: true, likes: number }.
router.post("/like-only", async (req, res) => {
  const { userId, reelId } = req.body as { userId?: string; reelId?: string };
  if (!userId || !reelId) {
    res.status(400).json({ error: "userId and reelId required" });
    return;
  }
  const sb = makeSupabase();

  // Check if already liked — early-out without touching the count
  const { data: existing } = await sb
    .from("reel_likes")
    .select("id")
    .eq("user_id", userId)
    .eq("reel_id", reelId)
    .maybeSingle();

  if (existing) {
    const { data: reel } = await sb.from("reels").select("likes_count").eq("id", reelId).maybeSingle();
    res.json({ liked: true, likes: (reel as any)?.likes_count ?? 0 });
    return;
  }

  // Insert new like row; catch duplicate (race condition / no UNIQUE constraint yet)
  const { error: insertError } = await sb
    .from("reel_likes")
    .insert({ user_id: userId, reel_id: reelId });

  if (insertError) {
    // Concurrent duplicate — return current count without incrementing
    const { data: reel } = await sb.from("reels").select("likes_count").eq("id", reelId).maybeSingle();
    res.json({ liked: true, likes: (reel as any)?.likes_count ?? 0 });
    return;
  }

  // Only increment when a genuinely new row was inserted
  const { error: rpcError } = await sb.rpc("increment_reel_likes", { p_reel_id: reelId });
  if (rpcError) {
    const { data: reel } = await sb.from("reels").select("likes_count").eq("id", reelId).maybeSingle();
    const current = (reel as any)?.likes_count ?? 0;
    await sb.from("reels").update({ likes_count: current + 1 }).eq("id", reelId);
  }

  const { data: updated } = await sb.from("reels").select("likes_count").eq("id", reelId).maybeSingle();
  res.json({ liked: true, likes: (updated as any)?.likes_count ?? 0 });
});

// GET /api/reels/:reelId — fetch a single reel by ID, bypassing RLS.
router.get("/:reelId", async (req, res) => {
  const { reelId } = req.params;
  if (!reelId) { res.status(400).json({ error: "reelId required" }); return; }

  const sb = makeSupabase();
  const { data, error } = await sb
    .from("reels")
    .select("*, profiles!user_id(id, username, avatar_url, full_name, is_verified)")
    .eq("id", reelId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: error?.message ?? "Reel not found" });
    return;
  }

  res.json({ data });
});

export default router;
