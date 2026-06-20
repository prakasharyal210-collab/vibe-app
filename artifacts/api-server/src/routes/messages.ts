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

// Normalise a DB row: the messages table uses "content" but the mobile
// Message interface expects "text". Map content → text on every outgoing row.
function normalise(row: any): any {
  if (!row) return row;
  const out = { ...row };
  if ("content" in out && !("text" in out)) {
    out.text = out.content;
    delete out.content;
  }
  return out;
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
  res.json({ messages: (data ?? []).map(normalise) });
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

  // Block check — refuse send if either party has blocked the other
  const [b1, b2] = await Promise.all([
    sb.from("blocks").select("id").eq("blocker_id", senderId).eq("blocked_id", receiverId).maybeSingle(),
    sb.from("blocks").select("id").eq("blocker_id", receiverId).eq("blocked_id", senderId).maybeSingle(),
  ]);
  if (b1.data || b2.data) {
    res.status(403).json({ error: "Cannot send message to this user" });
    return;
  }

  // DM permission gate — honour receiver's privacy setting
  const { data: receiverSettings } = await sb
    .from("user_settings")
    .select("who_can_message")
    .eq("user_id", receiverId)
    .maybeSingle();
  const msgPerm: string = (receiverSettings as any)?.who_can_message ?? "everyone";

  if (msgPerm === "nobody") {
    res.status(403).json({ error: "This user has disabled direct messages" });
    return;
  }
  if (msgPerm === "followers") {
    // Sender must follow the receiver
    const { data: followRow } = await sb
      .from("follows")
      .select("follower_id")
      .eq("follower_id", senderId)
      .eq("following_id", receiverId)
      .maybeSingle();
    if (!followRow) {
      res.status(403).json({ error: "This user only accepts messages from their followers" });
      return;
    }
  }
  if (msgPerm === "friends") {
    // Legacy mutual follow check
    const [f1, f2] = await Promise.all([
      sb.from("follows").select("follower_id").eq("follower_id", senderId).eq("following_id", receiverId).maybeSingle(),
      sb.from("follows").select("follower_id").eq("follower_id", receiverId).eq("following_id", senderId).maybeSingle(),
    ]);
    if (!f1.data || !f2.data) {
      res.status(403).json({ error: "This user only accepts messages from mutual followers" });
      return;
    }
  }

  // DB column is "content", not "text".
  // Auto-detect snap messages so Snaps tab can filter by message_type='snap'.
  const isSnap = text.startsWith("__SNAP__:");
  const insertRow: Record<string, unknown> = {
    sender_id: senderId,
    receiver_id: receiverId,
    content: text,
  };
  if (isSnap) insertRow["message_type"] = "snap";

  const { data, error } = await sb
    .from("messages")
    .insert(insertRow)
    .select()
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Send push to receiver (non-blocking)
  void (async () => {
    const { data: sender } = await sb.from("profiles").select("username").eq("id", senderId).maybeSingle();
    const senderName = (sender as any)?.username ?? "Someone";
    const preview = text.length > 60 ? text.slice(0, 57) + "…" : text;
    void sendPushToUser(sb, receiverId, {
      title: `@${senderName}`,
      body: preview,
      data: { type: "message", senderId },
    }, "notif_messages");
  })();

  res.json({ message: normalise(data) });
});

// PATCH /api/messages/:id
// Update a message's content (used by snap-viewed flow).
// body: { content }
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { content } = req.body as { content?: string };
  if (!id || !content) {
    res.status(400).json({ error: "id and content required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb
      .from("messages")
      .update({ content })
      .eq("id", id);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed" });
  }
});

// GET /api/messages/snaps?userId=
// Returns snap conversations (messages whose content starts with __SNAP__:)
// grouped by conversation partner, most-recent first.
router.get("/snaps", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("messages")
      .select("*, sender:sender_id(id, username, avatar_url), receiver:receiver_id(id, username, avatar_url)")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .like("content", "__SNAP__%")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const seen = new Map<string, object>();
    for (const msg of (data ?? []) as any[]) {
      const isIncoming = msg.receiver_id === userId;
      const otherId = isIncoming ? msg.sender_id : msg.receiver_id;
      const otherUser = isIncoming ? msg.sender : msg.receiver;
      if (!otherUser || seen.has(otherId)) continue;
      seen.set(otherId, {
        other_user: { id: otherId, username: otherUser.username, avatar_url: otherUser.avatar_url },
        message_id: msg.id,
        message_text: msg.content,
        is_incoming: isIncoming,
        created_at: msg.created_at,
      });
    }
    res.json({ snapConvos: Array.from(seen.values()) });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "snaps exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/messages/conversations?userId=
// Returns a de-duplicated list of conversations for the given user,
// each decorated with the other party's profile (username, avatar_url)
// and a real unread_count from messages.read_at IS NULL.
router.get("/conversations", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();

  // Fetch last 100 non-snap messages + real unread counts in parallel.
  // Snaps are identified by content starting with "__SNAP__:" — they belong
  // exclusively in the Snaps tab and must not bleed into the Messages list.
  const [msgRes, unreadRes] = await Promise.all([
    sb
      .from("messages")
      .select(
        "*, sender:sender_id(id, username, avatar_url), receiver:receiver_id(id, username, avatar_url)"
      )
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .not("content", "like", "__SNAP__%")
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from("messages")
      .select("sender_id, content")
      .eq("receiver_id", userId)
      .is("read_at", null)
      .not("content", "like", "__SNAP__%"),
  ]);

  if (msgRes.error) {
    res.status(500).json({ error: msgRes.error.message });
    return;
  }

  // Build unread counts map: senderId → count of unread messages they sent me.
  // JS-level guard: skip any snap row that slipped past the SQL filter
  // (SQL LIKE uses _ as a wildcard which can behave unexpectedly in PostgREST).
  const unreadByOther = new Map<string, number>();
  for (const row of (unreadRes.data ?? []) as any[]) {
    if (String((row as any).content ?? "").startsWith("__SNAP__")) continue;
    const sid = row.sender_id as string;
    unreadByOther.set(sid, (unreadByOther.get(sid) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const convos: object[] = [];
  for (const msg of (msgRes.data ?? []) as any[]) {
    // JS-level snap guard — belt-and-suspenders on top of the SQL NOT LIKE filter
    if (String(msg.content ?? "").startsWith("__SNAP__")) continue;
    const otherId =
      msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
    const otherUser =
      msg.sender_id === userId ? msg.receiver : msg.sender;
    if (!seen.has(otherId) && otherUser) {
      seen.add(otherId);
      // Use content (DB column name) with fallback to text for normalisation
      const lastMsg = msg.content ?? msg.text ?? "";
      convos.push({
        id: `conv_${otherId}`,
        other_user: {
          id: otherId,
          username: otherUser.username,
          avatar_url: otherUser.avatar_url,
        },
        last_message: lastMsg,
        last_message_at: msg.created_at,
        unread_count: unreadByOther.get(otherId) ?? 0,
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
