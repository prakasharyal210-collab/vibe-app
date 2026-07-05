import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

const BLOCKED_STATUSES = ["Married", "Engaged", "Widowed"];

// POST /api/vibe-requests/send
// Body: { senderId, receiverId }
// Returns: { success: true, result: 'matched' | 'pending', requestId? }
// Handles mutual-match detection: if the receiver already has a pending request
// to the sender, this call creates vibe_matches in both directions and returns
// result='matched'. All writes go through the service-role key.
router.post("/send", async (req, res) => {
  const { senderId, receiverId } = req.body as { senderId?: string; receiverId?: string };
  if (!senderId || !receiverId) {
    res.status(400).json({ error: "senderId and receiverId required" });
    return;
  }
  if (senderId === receiverId) {
    res.status(400).json({ error: "Cannot send vibe request to yourself" });
    return;
  }

  const sb = makeSupabase();

  const { data: receiver } = await sb
    .from("profiles")
    .select("relationship_status, username")
    .eq("id", receiverId)
    .maybeSingle();

  if (receiver && BLOCKED_STATUSES.includes(receiver.relationship_status ?? "")) {
    res.status(403).json({ error: "This user is not accepting vibe requests" });
    return;
  }

  // Check for mutual request: has the receiver already sent one to the sender?
  const { data: mutual } = await sb
    .from("vibe_requests")
    .select("id")
    .eq("sender_id", receiverId)
    .eq("receiver_id", senderId)
    .eq("status", "pending")
    .maybeSingle();

  if (mutual) {
    const now = new Date().toISOString();

    // Mark their existing request as matched — vibe_requests has no updated_at column
    await sb
      .from("vibe_requests")
      .update({ status: "matched" })
      .eq("id", (mutual as any).id);

    // Upsert vibe_matches in both directions (same pattern as POST /api/vibe/swipe)
    await sb.from("vibe_matches").upsert(
      [
        { sender_id: senderId, receiver_id: receiverId, status: "matched", created_at: now },
        { sender_id: receiverId, receiver_id: senderId, status: "matched", created_at: now },
      ],
      { onConflict: "sender_id,receiver_id" },
    );

    await sb.from("notifications").insert([
      {
        recipient_id: senderId,
        sender_id: receiverId,
        type: "vibe_match",
        // Do NOT include the other person's name — the notification UI auto-prepends
        // sender username, so adding it here would produce "name It's a match! You and name…"
        message: "It's a match! You can now message each other 💜",
        is_read: false,
        created_at: now,
      },
      {
        recipient_id: receiverId,
        sender_id: senderId,
        type: "vibe_match",
        message: "It's a match! You can now message each other 💜",
        is_read: false,
        created_at: now,
      },
    ]);

    // Create a conversation between the matched users.
    // Lexicographic UUID ordering ensures the same pair always maps to the same row,
    // preventing duplicate conversations if the endpoint is called more than once.
    const [user1Id, user2Id] = [senderId, receiverId].sort();
    await sb.from("conversations").upsert(
      { user1_id: user1Id, user2_id: user2Id, is_request: false, unread_count_1: 0, unread_count_2: 0 },
      { onConflict: "user1_id,user2_id" },
    );

    res.json({ success: true, result: "matched" });
    return;
  }

  // Check for existing forward-direction request
  const { data: existing } = await sb
    .from("vibe_requests")
    .select("id, status")
    .eq("sender_id", senderId)
    .eq("receiver_id", receiverId)
    .maybeSingle();

  if (existing && (existing.status === "pending" || existing.status === "accepted")) {
    res.status(409).json({ error: "Request already exists", status: existing.status, requestId: existing.id });
    return;
  }

  let requestId: string;
  if (existing) {
    // Re-activate a rejected request — vibe_requests has no updated_at column
    const { data: updated, error } = await sb
      .from("vibe_requests")
      .update({ status: "pending" })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error || !updated) { res.status(500).json({ error: "Update failed" }); return; }
    requestId = updated.id;
  } else {
    const { data: inserted, error } = await sb
      .from("vibe_requests")
      .insert({ sender_id: senderId, receiver_id: receiverId, status: "pending" })
      .select("id")
      .single();
    if (error || !inserted) { res.status(500).json({ error: "Insert failed" }); return; }
    requestId = inserted.id;
  }

  const { data: sender } = await sb
    .from("profiles")
    .select("username")
    .eq("id", senderId)
    .maybeSingle();
  await sb.from("notifications").insert({
    recipient_id: receiverId,
    sender_id: senderId,
    type: "vibe_request",
    // Do NOT include sender name — the notification UI always prepends
    // the sender's username automatically, so adding it here doubles it.
    message: "wants to vibe with you 💜",
    reference_id: requestId,
    is_read: false,
    created_at: new Date().toISOString(),
  });

  res.json({ success: true, result: "pending", requestId });
});

// POST /api/vibe-requests/respond
// Body: { requestId, userId, action: 'accept' | 'decline' }
router.post("/respond", async (req, res) => {
  const { requestId, userId, action } = req.body as {
    requestId?: string;
    userId?: string;
    action?: "accept" | "decline";
  };
  if (!requestId || !userId || !action) {
    res.status(400).json({ error: "requestId, userId, action required" });
    return;
  }
  if (!["accept", "decline"].includes(action)) {
    res.status(400).json({ error: "action must be 'accept' or 'decline'" });
    return;
  }

  const sb = makeSupabase();

  const { data: request } = await sb
    .from("vibe_requests")
    .select("id, sender_id, receiver_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  if (request.receiver_id !== userId) { res.status(403).json({ error: "Not authorized" }); return; }

  // Constraint: vibe_requests.status IN ('pending','matched','rejected') — no 'accepted'/'declined'
  const newStatus = action === "accept" ? "matched" : "rejected";
  // vibe_requests has no updated_at column — only update status
  const { error } = await sb
    .from("vibe_requests")
    .update({ status: newStatus })
    .eq("id", requestId);

  if (error) { res.status(500).json({ error: error.message }); return; }

  if (action === "accept") {
    const now = new Date().toISOString();
    const senderId = request.sender_id;
    const receiverId = userId;

    // Create match rows in both directions so either user can query their matches
    await sb.from("vibe_matches").upsert(
      [
        { sender_id: senderId, receiver_id: receiverId, status: "matched", created_at: now },
        { sender_id: receiverId, receiver_id: senderId, status: "matched", created_at: now },
      ],
      { onConflict: "sender_id,receiver_id" },
    );

    // CRITICAL: create the conversations row immediately on accept.
    // The grandfather check in messages.ts looks for a conversations row with
    // is_request=false to allow messaging after a Start Over deck reset.
    // If we only write vibe_matches and not conversations, the first message after
    // a reset returns 403 "You can only message your matches" even though they matched.
    const [convU1, convU2] = [senderId, receiverId].sort();
    await sb.from("conversations").upsert(
      { user1_id: convU1, user2_id: convU2, is_request: false, unread_count_1: 0, unread_count_2: 0 },
      { onConflict: "user1_id,user2_id" },
    );

    const { data: receiverProfile } = await sb
      .from("profiles")
      .select("username")
      .eq("id", receiverId)
      .maybeSingle();
    const receiverName = receiverProfile?.username ?? "someone";

    await sb.from("notifications").insert({
      recipient_id: senderId,
      sender_id: receiverId,
      type: "vibe_accepted",
      // Do NOT include the accepter's name — the notification UI auto-prepends
      // sender username, so adding it here doubles it: "name accepted your vibe request"
      message: "accepted your vibe request 💜",
      reference_id: requestId,
      is_read: false,
      created_at: now,
    });
  } else {
    // DENY — write a left-swipe for the denier so the requester doesn't reappear
    // in their deck. The deck RPC excludes entries in vibe_swipes for the viewer,
    // so without this the denied user would show up again on the next deck load.
    const senderId = request.sender_id;
    const receiverId = userId;
    await sb.from("vibe_swipes").upsert(
      { user_id: receiverId, target_id: senderId, direction: "left", created_at: new Date().toISOString() },
      { onConflict: "user_id,target_id" },
    );
  }

  res.json({ success: true });
});

// GET /api/vibe-requests/status?senderId=X&receiverId=Y
router.get("/status", async (req, res) => {
  const { senderId, receiverId } = req.query as { senderId?: string; receiverId?: string };
  if (!senderId || !receiverId) { res.json({ status: "none" }); return; }

  const sb = makeSupabase();
  const { data } = await sb
    .from("vibe_requests")
    .select("id, status")
    .eq("sender_id", senderId)
    .eq("receiver_id", receiverId)
    .maybeSingle();

  if (!data) { res.json({ status: "none" }); return; }
  res.json({ status: data.status, requestId: data.id });
});

// GET /api/vibe-requests/inbox?userId=X
router.get("/inbox", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.json({ requests: [] }); return; }

  const sb = makeSupabase();

  const { data, error } = await sb
    .from("vibe_requests")
    .select("id, sender_id, created_at")
    .eq("receiver_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    req.log.warn({ error: error.message }, "vibe-requests inbox error");
    res.json({ requests: [] });
    return;
  }

  const rows = data ?? [];

  const senderIds = [...new Set(rows.map((r: any) => r.sender_id as string))];
  const profileMap: Record<string, any> = {};
  if (senderIds.length > 0) {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, username, full_name, avatar_url, relationship_status, age, relationship_goal")
      .in("id", senderIds);
    (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });
  }

  const requests = rows.map((r: any) => {
    const p = profileMap[r.sender_id] ?? {};
    return {
      id: r.id,
      senderId: r.sender_id,
      createdAt: r.created_at,
      sender: {
        id: p.id ?? r.sender_id,
        username: p.username ?? "unknown",
        displayName: p.full_name ?? null,
        avatarUrl: p.avatar_url ?? null,
        relationshipStatus: p.relationship_status ?? null,
        age: p.age ?? null,
        goal: p.relationship_goal ?? null,
      },
    };
  });

  res.json({ requests });
});

export default router;
