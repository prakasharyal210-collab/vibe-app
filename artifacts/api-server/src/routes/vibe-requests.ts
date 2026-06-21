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

    // Mark their existing request as matched
    await sb
      .from("vibe_requests")
      .update({ status: "matched", updated_at: now })
      .eq("id", (mutual as any).id);

    // Upsert vibe_matches in both directions (same pattern as POST /api/vibe/swipe)
    await sb.from("vibe_matches").upsert(
      [
        { sender_id: senderId, receiver_id: receiverId, status: "matched", created_at: now },
        { sender_id: receiverId, receiver_id: senderId, status: "matched", created_at: now },
      ],
      { onConflict: "sender_id,receiver_id" },
    );

    // Fetch sender username for notification text
    const { data: senderProfile } = await sb
      .from("profiles")
      .select("username")
      .eq("id", senderId)
      .maybeSingle();
    const senderName = (senderProfile as any)?.username ?? "Someone";
    const receiverName = receiver?.username ?? "Someone";

    await sb.from("notifications").insert([
      {
        recipient_id: senderId,
        sender_id: receiverId,
        type: "vibe_match",
        message: `It's a match! You and ${receiverName} can now message each other 💜`,
        is_read: false,
        created_at: now,
      },
      {
        recipient_id: receiverId,
        sender_id: senderId,
        type: "vibe_match",
        message: `It's a match! You and ${senderName} can now message each other 💜`,
        is_read: false,
        created_at: now,
      },
    ]);

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
    const { data: updated, error } = await sb
      .from("vibe_requests")
      .update({ status: "pending", updated_at: new Date().toISOString() })
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
  const senderName = sender?.username ?? "someone";

  await sb.from("notifications").insert({
    recipient_id: receiverId,
    sender_id: senderId,
    type: "vibe_request",
    message: `@${senderName} wants to vibe with you ✨`,
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

  const newStatus = action === "accept" ? "accepted" : "declined";
  const { error } = await sb
    .from("vibe_requests")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) { res.status(500).json({ error: error.message }); return; }

  if (action === "accept") {
    const { data: receiverProfile } = await sb
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    const receiverName = receiverProfile?.username ?? "someone";

    await sb.from("notifications").insert({
      recipient_id: request.sender_id,
      sender_id: userId,
      type: "vibe_accepted",
      message: `@${receiverName} accepted your vibe request 💜`,
      reference_id: requestId,
      is_read: false,
      created_at: new Date().toISOString(),
    });
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
      .select("id, username, full_name, avatar_url, relationship_status")
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
      },
    };
  });

  res.json({ requests });
});

export default router;
