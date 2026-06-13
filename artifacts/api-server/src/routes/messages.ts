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

// GET /api/messages?myId=&otherId=&limit=100
// Fetch messages between two users (service-role bypasses RLS)
router.get("/", async (req, res) => {
  const { myId, otherId, limit = "100" } = req.query as {
    myId?: string;
    otherId?: string;
    limit?: string;
  };
  if (!myId || !otherId) {
    res.status(400).json({ error: "myId and otherId required" });
    return;
  }
  const sb = makeSupabase();
  const { data, error } = await sb
    .from("messages")
    .select("*")
    .or(
      `and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`
    )
    .order("created_at", { ascending: true })
    .limit(parseInt(limit, 10));
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ messages: data ?? [] });
});

// POST /api/messages
// Send a message — { senderId, receiverId, text }
router.post("/", async (req, res) => {
  const { senderId, receiverId, text } = req.body as {
    senderId?: string;
    receiverId?: string;
    text?: string;
  };
  if (!senderId || !receiverId || !text) {
    res.status(400).json({ error: "senderId, receiverId, and text required" });
    return;
  }
  const sb = makeSupabase();
  const { data, error } = await sb
    .from("messages")
    .insert({ sender_id: senderId, receiver_id: receiverId, text })
    .select()
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ message: data });
});

// GET /api/messages/conversations?userId=
// Returns a de-duplicated list of conversations for the given user,
// each decorated with the other party's profile (username, avatar_url).
router.get("/conversations", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  const { data, error } = await sb
    .from("messages")
    .select(
      "*, sender:sender_id(id, username, avatar_url), receiver:receiver_id(id, username, avatar_url)"
    )
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const seen = new Set<string>();
  const convos: object[] = [];
  for (const msg of (data ?? []) as any[]) {
    const otherId =
      msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
    const otherUser =
      msg.sender_id === userId ? msg.receiver : msg.sender;
    if (!seen.has(otherId) && otherUser) {
      seen.add(otherId);
      convos.push({
        id: `conv_${otherId}`,
        other_user: {
          id: otherId,
          username: otherUser.username,
          avatar_url: otherUser.avatar_url,
        },
        last_message: msg.text,
        last_message_at: msg.created_at,
        unread_count: 0,
      });
    }
  }
  res.json({ conversations: convos });
});

export default router;
