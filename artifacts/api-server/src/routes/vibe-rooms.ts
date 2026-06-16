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

// ─── GET /api/vibe-rooms/joined?userId=&roomId= ───────────────────────────────
// Returns { joined: boolean }
router.get("/joined", async (req, res) => {
  const { userId, roomId } = req.query as { userId?: string; roomId?: string };
  if (!userId || !roomId) {
    res.status(400).json({ error: "userId and roomId required" });
    return;
  }
  const sb = makeSupabase();
  const { data, error } = await sb
    .from("vibe_room_members")
    .select("id")
    .eq("user_id", userId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (error) {
    req.log?.warn({ error }, "vibe-rooms joined check failed");
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ joined: !!data });
});

// ─── POST /api/vibe-rooms/join ────────────────────────────────────────────────
// body: { userId, roomId }  →  { ok: true, memberCount: number }
router.post("/join", async (req, res) => {
  const { userId, roomId } = req.body as { userId?: string; roomId?: string };
  if (!userId || !roomId) {
    res.status(400).json({ error: "userId and roomId required" });
    return;
  }
  const sb = makeSupabase();

  const { error: upsertError } = await sb
    .from("vibe_room_members")
    .upsert({ user_id: userId, room_id: roomId }, { onConflict: "user_id,room_id" });
  if (upsertError) {
    req.log?.warn({ error: upsertError }, "vibe-rooms join failed");
    res.status(500).json({ error: upsertError.message });
    return;
  }

  const { count } = await sb
    .from("vibe_room_members")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);

  res.json({ ok: true, memberCount: count ?? 0 });
});

// ─── GET /api/vibe-rooms/:roomId/members/count ────────────────────────────────
// Returns { count: number }
router.get("/:roomId/members/count", async (req, res) => {
  const { roomId } = req.params;
  const sb = makeSupabase();
  const { count, error } = await sb
    .from("vibe_room_members")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ count: count ?? 0 });
});

// ─── GET /api/vibe-rooms/:roomId/messages ────────────────────────────────────
// Returns { messages: VibeRoomMessage[] }
router.get("/:roomId/messages", async (req, res) => {
  const { roomId } = req.params;
  const sb = makeSupabase();
  // profiles!user_id works because vibe_room_messages.user_id → profiles(id) FK
  const { data, error } = await sb
    .from("vibe_room_messages")
    .select("id, room_id, user_id, text, created_at, profiles!user_id(display_name, username, avatar_url)")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    req.log?.warn({ error }, "vibe-rooms get messages failed");
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ messages: data ?? [] });
});

// ─── POST /api/vibe-rooms/:roomId/messages ───────────────────────────────────
// body: { userId, text }  →  { ok: true, message: { id, ... } }
router.post("/:roomId/messages", async (req, res) => {
  const { roomId } = req.params;
  const { userId, text } = req.body as { userId?: string; text?: string };
  if (!userId || !text?.trim()) {
    res.status(400).json({ error: "userId and text required" });
    return;
  }
  const sb = makeSupabase();

  // Verify the user is a member first
  const { data: membership } = await sb
    .from("vibe_room_members")
    .select("id")
    .eq("user_id", userId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (!membership) {
    res.status(403).json({ error: "Not a member of this room" });
    return;
  }

  const { data, error } = await sb
    .from("vibe_room_messages")
    .insert({ user_id: userId, room_id: roomId, text: text.trim() })
    .select("id, room_id, user_id, text, created_at")
    .single();
  if (error) {
    req.log?.warn({ error }, "vibe-rooms send message failed");
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, message: data });
});

export default router;
