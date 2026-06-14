import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "../lib/sendPush";

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

  // Send push to receiver (non-blocking)
  void (async () => {
    const { data: sender } = await sb.from("profiles").select("username").eq("id", senderId).maybeSingle();
    const senderName = sender?.username ?? "Someone";
    const preview = text.length > 60 ? text.slice(0, 57) + "…" : text;
    void sendPushToUser(sb, receiverId, {
      title: `@${senderName}`,
      body: preview,
      data: { type: "message", senderId },
    }, "notif_messages");
  })();

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

// PATCH /api/messages/read
// Mark all messages from sender to receiver as read (sets read_at = now)
// body: { myId, otherId }
router.patch("/read", async (req, res) => {
  const { myId, otherId } = req.body as { myId?: string; otherId?: string };
  if (!myId || !otherId) {
    res.status(400).json({ error: "myId and otherId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    await sb
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", otherId)
      .eq("receiver_id", myId)
      .is("read_at", null);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "mark-read exception");
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/messages/react
// Toggle an emoji reaction on a message.
// body: { messageId, userId, emoji }
router.post("/react", async (req, res) => {
  const { messageId, userId, emoji } = req.body as {
    messageId?: string;
    userId?: string;
    emoji?: string;
  };
  if (!messageId || !userId || !emoji) {
    res.status(400).json({ error: "messageId, userId, emoji required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: existing } = await sb
      .from("message_reactions")
      .select("id, emoji")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      if ((existing as any).emoji === emoji) {
        await sb.from("message_reactions").delete().eq("id", (existing as any).id);
        res.json({ reacted: false, emoji });
      } else {
        await sb.from("message_reactions").update({ emoji }).eq("id", (existing as any).id);
        res.json({ reacted: true, emoji });
      }
    } else {
      await sb.from("message_reactions").insert({ message_id: messageId, user_id: userId, emoji });
      res.json({ reacted: true, emoji });
    }
  } catch (err: any) {
    req.log.error({ err: err?.message }, "message-react exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/messages/reactions?messageIds=id1,id2
// Returns reactions grouped by message ID
router.get("/reactions", async (req, res) => {
  const { messageIds } = req.query as { messageIds?: string };
  if (!messageIds) { res.json({ reactions: {} }); return; }
  const ids = messageIds.split(",").filter(Boolean);
  if (ids.length === 0) { res.json({ reactions: {} }); return; }
  const sb = makeSupabase();
  try {
    const { data } = await sb
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", ids);
    const grouped: Record<string, Array<{ userId: string; emoji: string }>> = {};
    (data ?? []).forEach((r: any) => {
      if (!grouped[r.message_id]) grouped[r.message_id] = [];
      grouped[r.message_id].push({ userId: r.user_id, emoji: r.emoji });
    });
    res.json({ reactions: grouped });
  } catch {
    res.json({ reactions: {} });
  }
});

// POST /api/messages/activity  body: { userId }
// Update last_active_at for a user
router.post("/activity", async (req, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  try {
    await sb.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", userId);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "activity exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/messages/activity?userId=
router.get("/activity", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.json({ lastActiveAt: null }); return; }
  const sb = makeSupabase();
  try {
    const { data } = await sb.from("profiles").select("last_active_at").eq("id", userId).maybeSingle();
    res.json({ lastActiveAt: (data as any)?.last_active_at ?? null });
  } catch {
    res.json({ lastActiveAt: null });
  }
});

export default router;
