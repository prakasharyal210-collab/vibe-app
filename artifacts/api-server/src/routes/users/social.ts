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

// GET /api/users/social/follow-status?followerId=X&followingId=Y
router.get("/follow-status", async (req, res) => {
  const { followerId, followingId } = req.query as { followerId?: string; followingId?: string };
  if (!followerId || !followingId) {
    res.status(400).json({ error: "followerId and followingId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("follows")
      .select("follower_id")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ following: !!data });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "follow-status exception");
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/users/social/follow  body: { followerId, followingId }
router.post("/follow", async (req, res) => {
  const { followerId, followingId } = req.body as { followerId?: string; followingId?: string };
  if (!followerId || !followingId) {
    res.status(400).json({ error: "followerId and followingId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb
      .from("follows")
      .upsert({ follower_id: followerId, following_id: followingId }, { onConflict: "follower_id,following_id" });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "follow exception");
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/users/social/follow  body: { followerId, followingId }
router.delete("/follow", async (req, res) => {
  const { followerId, followingId } = req.body as { followerId?: string; followingId?: string };
  if (!followerId || !followingId) {
    res.status(400).json({ error: "followerId and followingId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "unfollow exception");
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/users/social/conversation  body: { userId, otherId }
// Get or create a conversation between two users
router.post("/conversation", async (req, res) => {
  const { userId, otherId } = req.body as { userId?: string; otherId?: string };
  if (!userId || !otherId) {
    res.status(400).json({ error: "userId and otherId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    // Check existing conversation in either direction
    const { data: existing } = await sb
      .from("conversations")
      .select("id")
      .or(
        `and(user_id.eq.${userId},other_user_id.eq.${otherId}),and(user_id.eq.${otherId},other_user_id.eq.${userId})`
      )
      .maybeSingle();

    if (existing?.id) {
      res.json({ conversationId: existing.id });
      return;
    }

    // Create new conversation
    const { data: created, error } = await sb
      .from("conversations")
      .insert({
        user_id: userId,
        other_user_id: otherId,
        is_request: true,
        last_message: "",
        last_message_at: new Date().toISOString(),
        unread_count: 0,
      })
      .select("id")
      .single();

    if (error) {
      req.log.warn({ error: error.message }, "conversation create error — falling back to otherId");
      res.json({ conversationId: otherId });
      return;
    }

    res.json({ conversationId: created.id });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "conversation exception");
    res.json({ conversationId: otherId });
  }
});

export default router;
