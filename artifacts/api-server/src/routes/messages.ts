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

// ── Shared-content preview enrichment ────────────────────────────────────────

interface SharedPreview {
  thumbnail_url: string | null;
  caption: string | null;
  author_username: string | null;
  author_avatar_url: string | null;
  has_poll?: boolean;
  content_unavailable: boolean;
}

const UNAVAILABLE_PREVIEW: SharedPreview = {
  thumbnail_url: null,
  caption: null,
  author_username: null,
  author_avatar_url: null,
  content_unavailable: true,
};

async function getBlockedIds(
  sb: ReturnType<typeof makeSupabase>,
  viewerId: string,
  authorIds: string[],
): Promise<Set<string>> {
  if (!authorIds.length) return new Set();
  const [{ data: b1 }, { data: b2 }] = await Promise.all([
    sb.from("blocks").select("blocked_id").eq("blocker_id", viewerId).in("blocked_id", authorIds),
    sb.from("blocks").select("blocker_id").eq("blocked_id", viewerId).in("blocker_id", authorIds),
  ]);
  return new Set([
    ...(b1 ?? []).map((b: any) => b.blocked_id as string),
    ...(b2 ?? []).map((b: any) => b.blocker_id as string),
  ]);
}

async function getFollowedIds(
  sb: ReturnType<typeof makeSupabase>,
  viewerId: string,
  authorIds: string[],
): Promise<Set<string>> {
  if (!authorIds.length) return new Set();
  const { data } = await sb
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerId)
    .in("following_id", authorIds);
  return new Set((data ?? []).map((f: any) => f.following_id as string));
}

// Enrich messages that carry shared_content_type/shared_content_id with a
// preview payload. Privacy-gated: private-account content shows as unavailable
// to viewers who don't follow the author; blocked users also gate.
async function enrichSharedMessages(
  messages: any[],
  viewerId: string,
  sb: ReturnType<typeof makeSupabase>,
): Promise<any[]> {
  const sharedMsgs = messages.filter((m) => m.shared_content_type && m.shared_content_id);
  if (!sharedMsgs.length) return messages;

  const byType = (t: string) =>
    sharedMsgs
      .filter((m) => m.shared_content_type === t)
      .map((m) => m.shared_content_id as string);
  const postIds = byType("post");
  const reelIds = byType("reel");
  const confessionIds = byType("confession");
  const previewMap = new Map<string, SharedPreview>();

  await Promise.all([
    // ── Posts ─────────────────────────────────────────────────────────────
    (async () => {
      if (!postIds.length) return;
      const { data: posts } = await sb
        .from("posts")
        .select("id, user_id, media_url, caption, profiles!user_id(username, avatar_url, is_private)")
        .in("id", postIds);
      if (!posts?.length) return;
      const authorIds = [...new Set((posts as any[]).map((p) => p.user_id as string))];
      const [blocked, followed] = await Promise.all([
        getBlockedIds(sb, viewerId, authorIds),
        getFollowedIds(sb, viewerId, authorIds.filter((id) => id !== viewerId)),
      ]);
      for (const p of posts as any[]) {
        const prof = p.profiles as any;
        const hidden =
          blocked.has(p.user_id) ||
          (prof?.is_private && p.user_id !== viewerId && !followed.has(p.user_id));
        previewMap.set(
          p.id,
          hidden
            ? UNAVAILABLE_PREVIEW
            : {
                thumbnail_url: p.media_url ?? null,
                caption: p.caption ?? null,
                author_username: prof?.username ?? null,
                author_avatar_url: prof?.avatar_url ?? null,
                content_unavailable: false,
              },
        );
      }
    })(),

    // ── Reels ─────────────────────────────────────────────────────────────
    (async () => {
      if (!reelIds.length) return;
      const { data: reels } = await sb
        .from("reels")
        .select("id, user_id, thumbnail_url, caption, profiles!user_id(username, avatar_url, is_private)")
        .in("id", reelIds);
      if (!reels?.length) return;
      const authorIds = [...new Set((reels as any[]).map((r) => r.user_id as string))];
      const [blocked, followed] = await Promise.all([
        getBlockedIds(sb, viewerId, authorIds),
        getFollowedIds(sb, viewerId, authorIds.filter((id) => id !== viewerId)),
      ]);
      for (const r of reels as any[]) {
        const prof = r.profiles as any;
        const hidden =
          blocked.has(r.user_id) ||
          (prof?.is_private && r.user_id !== viewerId && !followed.has(r.user_id));
        previewMap.set(
          r.id,
          hidden
            ? UNAVAILABLE_PREVIEW
            : {
                thumbnail_url: r.thumbnail_url ?? null,
                caption: r.caption ?? null,
                author_username: prof?.username ?? null,
                author_avatar_url: prof?.avatar_url ?? null,
                content_unavailable: false,
              },
        );
      }
    })(),

    // ── Confessions (couple_feed_posts — always public) ────────────────────
    (async () => {
      if (!confessionIds.length) return;
      const [{ data: confessions }, { data: polls }] = await Promise.all([
        sb
          .from("couple_feed_posts")
          .select("id, author_id, content, photo_url, profiles!author_id(username, avatar_url)")
          .in("id", confessionIds),
        sb
          .from("confession_polls")
          .select("confession_post_id")
          .in("confession_post_id", confessionIds),
      ]);
      const pollSet = new Set(
        (polls ?? []).map((p: any) => p.confession_post_id as string),
      );
      for (const c of (confessions ?? []) as any[]) {
        const prof = c.profiles as any;
        previewMap.set(c.id, {
          thumbnail_url: c.photo_url ?? null,
          caption: c.content ?? null,
          author_username: prof?.username ?? null,
          author_avatar_url: prof?.avatar_url ?? null,
          has_poll: pollSet.has(c.id),
          content_unavailable: false,
        });
      }
    })(),
  ]);

  return messages.map((m) => {
    if (!m.shared_content_type || !m.shared_content_id) return m;
    return {
      ...m,
      shared_preview: previewMap.get(m.shared_content_id) ?? UNAVAILABLE_PREVIEW,
    };
  });
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
  const normalised = (data ?? []).map(normalise);
  res.json({ messages: await enrichSharedMessages(normalised, myId, sb) });
});

// POST /api/messages
// Send a message — { senderId, receiverId, text, shared_content_type?, shared_content_id? }
// Either text OR shared_content_type+shared_content_id must be present.
router.post("/", async (req, res) => {
  const { senderId, receiverId, text, shared_content_type, shared_content_id } = req.body as {
    senderId?: string;
    receiverId?: string;
    text?: string;
    shared_content_type?: "post" | "reel" | "confession";
    shared_content_id?: string;
  };
  const isShareMsg = !!(shared_content_type && shared_content_id);
  if (!senderId || !receiverId || (!text && !isShareMsg)) {
    res.status(400).json({ error: "senderId, receiverId, and (text or shared content) required" });
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
  const isSnap = (text ?? "").startsWith("__SNAP__:");
  const insertRow: Record<string, unknown> = {
    sender_id: senderId,
    receiver_id: receiverId,
    content: text ?? "",
  };
  if (isSnap) {
    insertRow["message_type"] = "snap";
  } else if (isShareMsg) {
    insertRow["message_type"] = "share";
    insertRow["shared_content_type"] = shared_content_type;
    insertRow["shared_content_id"] = shared_content_id;
  }

  const { data, error } = await sb
    .from("messages")
    .insert(insertRow)
    .select()
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // ── Upsert conversation row with directional request flag ─────────────────
  // The DB trigger may have created/updated the conversations row during the
  // messages INSERT above, but without requested_by. We upsert here to set
  // it correctly. user1_id/user2_id use lexicographic ordering for stable keys.
  const now = new Date().toISOString();
  const [u1Id, u2Id] = [senderId, receiverId].sort();

  // Check whether a conversation already exists (and whether it was accepted)
  let notifyAsRequest = false;
  void (async () => {
    try {
      const { data: existingConv } = await sb
        .from("conversations")
        .select("id, is_request, requested_by")
        .eq("user1_id", u1Id)
        .eq("user2_id", u2Id)
        .maybeSingle();

      const wasAccepted = existingConv && !(existingConv as any).is_request;

      if (!wasAccepted) {
        // Determine request status: is the recipient following the sender?
        const { data: followRow } = await sb
          .from("follows")
          .select("follower_id")
          .eq("follower_id", receiverId)
          .eq("following_id", senderId)
          .maybeSingle();
        const isRequest = !followRow;
        // Only fire the "request" push once — on the very first message
        notifyAsRequest = isRequest && !existingConv;

        await sb.from("conversations").upsert(
          {
            user1_id: u1Id,
            user2_id: u2Id,
            is_request: isRequest,
            requested_by: senderId,
            last_message: isSnap ? "📷 Photo" : isShareMsg ? `📎 Shared a ${shared_content_type}` : (text ?? ""),
            last_message_at: now,
          },
          { onConflict: "user1_id,user2_id" }
        );
      } else {
        // Accepted conversation — just update the preview
        await sb.from("conversations").update({
          last_message: isSnap ? "📷 Photo" : isShareMsg ? `📎 Shared a ${shared_content_type}` : (text ?? ""),
          last_message_at: now,
        }).eq("id", (existingConv as any).id);
      }
    } catch {}
  })();

  // Send push to receiver (non-blocking)
  void (async () => {
    const { data: sender } = await sb.from("profiles").select("username").eq("id", senderId).maybeSingle();
    const senderName = (sender as any)?.username ?? "Someone";
    const msgText = isShareMsg
      ? `Shared a ${shared_content_type}`
      : (text ?? "");
    const preview = msgText.length > 60 ? msgText.slice(0, 57) + "…" : msgText;
    void sendPushToUser(
      sb,
      receiverId,
      notifyAsRequest
        ? {
            title: "New Message Request",
            body: `@${senderName} wants to send you a message`,
            data: { type: "message_request", senderId },
          }
        : {
            title: `@${senderName}`,
            body: preview,
            data: { type: "message", senderId },
          },
      "notif_messages"
    );
  })();

  res.json({ message: normalise(data) });
});

// PATCH /api/messages/read
// Mark all messages from sender to receiver as read (sets read_at = now).
// Registered BEFORE /:id so the literal path wins over the param route.
// body: { myId, otherId }
// Read receipts are withheld while the conversation is a pending request
// (otherId sent myId a request that hasn't been accepted yet) — Instagram rule.
router.patch("/read", async (req, res) => {
  const { myId, otherId } = req.body as { myId?: string; otherId?: string };
  if (!myId || !otherId) {
    res.status(400).json({ error: "myId and otherId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    // Check if the conversation is a pending request FROM otherId TO myId.
    // If so, withhold read receipts — the sender should not know the recipient
    // has seen the messages until they explicitly Accept the request.
    const [u1, u2] = [myId, otherId].sort();
    const { data: conv } = await sb
      .from("conversations")
      .select("is_request, requested_by")
      .eq("user1_id", u1)
      .eq("user2_id", u2)
      .maybeSingle();

    const isPendingRequestFromOther =
      conv &&
      (conv as any).is_request === true &&
      (conv as any).requested_by === otherId;

    if (isPendingRequestFromOther) {
      // Silently succeed but do NOT update read_at — sender stays unaware
      res.json({ ok: true });
      return;
    }

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

  // Fetch messages + unread counts + request state in parallel.
  const [msgRes, unreadRes, pendingToMeRes, myPendingRes] = await Promise.all([
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
    // Conversations where someone sent ME a pending request → hide from inbox (shown in /requests)
    sb
      .from("conversations")
      .select("requested_by")
      .eq("is_request", true)
      .not("requested_by", "is", null)
      .neq("requested_by", userId)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
    // Conversations where I sent a pending request → show in inbox as "Request sent"
    sb
      .from("conversations")
      .select("user1_id, user2_id")
      .eq("is_request", true)
      .eq("requested_by", userId),
  ]);

  if (msgRes.error) {
    res.status(500).json({ error: msgRes.error.message });
    return;
  }

  // Build unread counts map: senderId → count of unread messages they sent me.
  const unreadByOther = new Map<string, number>();
  for (const row of (unreadRes.data ?? []) as any[]) {
    if (String((row as any).content ?? "").startsWith("__SNAP__")) continue;
    const sid = row.sender_id as string;
    unreadByOther.set(sid, (unreadByOther.get(sid) ?? 0) + 1);
  }

  // Senders who have a pending request TO me — hide their messages from inbox.
  const pendingToMeIds = new Set(
    (pendingToMeRes.data ?? []).map((c: any) => c.requested_by as string)
  );

  // Other-user IDs in conversations where I am the requester (show as "Request sent").
  const myPendingOtherIds = new Set(
    (myPendingRes.data ?? []).map((c: any) =>
      (c.user1_id as string) === userId ? (c.user2_id as string) : (c.user1_id as string)
    )
  );

  const seen = new Set<string>();
  const convos: object[] = [];
  for (const msg of (msgRes.data ?? []) as any[]) {
    if (String(msg.content ?? "").startsWith("__SNAP__")) continue;
    const otherId =
      msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
    const otherUser =
      msg.sender_id === userId ? msg.receiver : msg.sender;
    if (seen.has(otherId) || !otherUser) continue;

    // Hide from inbox — this sender has a pending request TO me; it belongs in /requests
    if (pendingToMeIds.has(otherId)) continue;

    seen.add(otherId);
    const lastMsg = msg.content ?? msg.text ?? "";
    const isPendingRequest = myPendingOtherIds.has(otherId);
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
      ...(isPendingRequest ? { is_pending_request: true } : {}),
    });
  }
  res.json({ conversations: convos });
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

// GET /api/messages/requests?userId=
// Returns conversations where is_request=true AND requested_by != userId
// (i.e. only requests TO the viewer, never requests the viewer sent).
router.get("/requests", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.json({ conversations: [] }); return; }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("conversations")
      .select(
        "id, last_message, last_message_at, created_at, unread_count_1, unread_count_2, user1_id, user2_id, is_request, requested_by," +
        " user1:profiles!conversations_user1_id_fkey(id, username, avatar_url)," +
        " user2:profiles!conversations_user2_id_fkey(id, username, avatar_url)"
      )
      .eq("is_request", true)
      .not("requested_by", "is", null)   // exclude legacy rows with unknown direction
      .neq("requested_by", userId)        // exclude requests I sent — only show requests TO me
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order("last_message_at", { ascending: false });
    if (error) throw error;
    res.json({ conversations: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "messages/requests error");
    res.json({ conversations: [] });
  }
});

// PATCH /api/messages/conversations/:id/accept
// Accept a message request — sets is_request=false on the conversation.
router.patch("/conversations/:id/accept", async (req, res) => {
  const { id } = req.params;
  const sb = makeSupabase();
  try {
    const { error } = await sb.from("conversations").update({ is_request: false }).eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "messages/conversations accept error");
    res.status(500).json({ error: "Failed to accept request" });
  }
});

// DELETE /api/messages/conversations/:id
router.delete("/conversations/:id", async (req, res) => {
  const { id } = req.params;
  const sb = makeSupabase();
  try {
    const { error } = await sb.from("conversations").delete().eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "messages/conversations delete error");
    res.status(500).json({ error: "Failed to delete conversation" });
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
