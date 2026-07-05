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

// POST /api/snaps
// Send a snap. Writes to real snaps table columns (media_url, media_type, etc.).
// body: { senderId, receiverId, mediaUrl, mediaType, duration? }
router.post("/", async (req, res) => {
  const { senderId, receiverId, mediaUrl, mediaType, duration } = req.body as {
    senderId?: string;
    receiverId?: string;
    mediaUrl?: string;
    mediaType?: string;
    duration?: number;
  };
  if (!senderId || !receiverId || !mediaUrl || !mediaType) {
    res.status(400).json({ error: "senderId, receiverId, mediaUrl, mediaType required" });
    return;
  }
  const sb = makeSupabase();
  // Snaps expire after 24 hours
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await sb
      .from("snaps")
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        media_url: mediaUrl,
        media_type: mediaType,
        duration: duration ?? null,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (error) {
      req.log.error({ err: error.message }, "snap-send DB error");
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ snap: data });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "snap-send exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/snaps?userId=
// Returns snap conversations. Avoids Supabase join syntax (no FK declared in schema cache).
// Maps real columns → client SnapConversation shape using __SNAP__ encoding for compatibility.
router.get("/", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    // Step 1: fetch snaps for this user
    const { data: snaps, error: snapsErr } = await sb
      .from("snaps")
      .select("id, sender_id, receiver_id, media_url, media_type, viewed_at, created_at, expires_at")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (snapsErr) {
      req.log.warn({ err: snapsErr.message }, "snaps table read failed (may not exist yet)");
      res.json({ snapConvos: [] });
      return;
    }

    const rows = (snaps ?? []) as any[];

    // Step 2: collect unique partner IDs for profile lookup
    const partnerIds = new Set<string>();
    for (const s of rows) {
      const pid = s.sender_id === userId ? s.receiver_id : s.sender_id;
      partnerIds.add(pid);
    }

    let profileMap = new Map<string, { id: string; username: string; avatar_url: string | null }>();
    if (partnerIds.size > 0) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", [...partnerIds]);
      for (const p of profiles ?? []) profileMap.set(p.id, p);
    }

    // Step 3: build one entry per conversation partner (most recent snap wins)
    const seen = new Map<string, object>();
    for (const msg of rows) {
      const isIncoming = msg.receiver_id === userId;
      const otherId: string = isIncoming ? msg.sender_id : msg.receiver_id;
      const otherUser = profileMap.get(otherId);
      if (seen.has(otherId)) continue; // already have most-recent for this partner

      // Build message_text in __SNAP__ format so client parseSnap() works unchanged
      const snapData = {
        url: msg.media_url ?? "",
        type: (msg.media_type ?? "photo") as "photo" | "video",
        viewed: !!msg.viewed_at,
        viewed_at: msg.viewed_at ?? undefined,
      };
      const messageText = `__SNAP__:${JSON.stringify(snapData)}`;

      seen.set(otherId, {
        other_user: {
          id: otherId,
          username: otherUser?.username ?? "user",
          avatar_url: otherUser?.avatar_url ?? null,
        },
        message_id: msg.id,
        message_text: messageText,
        is_incoming: isIncoming,
        created_at: msg.created_at,
      });
    }

    res.json({ snapConvos: Array.from(seen.values()) });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "snaps-get exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/snaps/:id/view?requesterId=<userId>
// Sign-on-view: generates a fresh 1-hour signed URL for snap media, marks viewed_at,
// returns { signedUrl, mediaType }. Only the intended recipient may call this.
// Backwards-compatible: if media_url is a full URL (old/broken rows), extracts the
// relative path so existing snaps sign correctly with no data migration.
router.get("/:id/view", async (req, res) => {
  const { id } = req.params;
  const { requesterId } = req.query as { requesterId?: string };
  if (!id || !requesterId) {
    res.status(400).json({ error: "id and requesterId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: snap, error } = await sb
      .from("snaps")
      .select("id, receiver_id, media_url, media_type, viewed_at")
      .eq("id", id)
      .single();

    req.log.info({ snapId: id, requesterId, found: !!snap, dbErr: error?.message ?? null }, "[snap-view] lookup");

    if (error || !snap) {
      res.status(404).json({ error: "snap not found" });
      return;
    }
    if ((snap as any).receiver_id !== requesterId) {
      req.log.warn({ snapId: id, receiver_id: (snap as any).receiver_id, requesterId }, "[snap-view] 403 recipient mismatch");
      res.status(403).json({ error: "not authorised" });
      return;
    }

    // Normalise media_url → bare storage path (relative to "snaps" bucket):
    //   New rows:    "userId/timestamp.jpg"           → used as-is
    //   Old public:  ".../object/public/snaps/..."    → strip prefix
    //   Old signed:  ".../object/sign/snaps/...?..."  → strip prefix + query
    const raw: string = (snap as any).media_url ?? "";
    let storagePath = raw;
    const pubMatch = raw.match(/\/object\/public\/snaps\/(.+)/);
    if (pubMatch) {
      storagePath = pubMatch[1].split("?")[0];
    } else {
      const sigMatch = raw.match(/\/object\/sign\/snaps\/(.+?)(?:\?|$)/);
      if (sigMatch) storagePath = sigMatch[1];
    }

    req.log.info({ rawMediaUrl: raw, storagePath }, "[snap-view] path normalised");

    const { data: signed, error: signErr } = await sb.storage
      .from("snaps")
      .createSignedUrl(storagePath, 3600); // 1 hour — plenty for a single viewing session

    req.log.info({ signedUrlPresent: !!signed?.signedUrl, signErr: signErr?.message ?? null }, "[snap-view] sign result");

    if (signErr || !signed?.signedUrl) {
      req.log.warn({ err: signErr?.message, storagePath }, "[snap-view] sign failed");
      res.status(500).json({ error: signErr?.message ?? "Failed to sign URL" });
      return;
    }

    // Mark viewed_at if not already set — fire-and-forget, don't block the response
    if (!(snap as any).viewed_at) {
      sb.from("snaps").update({ viewed_at: new Date().toISOString() }).eq("id", id).then(() => {});
    }

    res.json({ signedUrl: signed.signedUrl, mediaType: (snap as any).media_type ?? "photo" });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "[snap-view] exception");
    res.status(500).json({ error: err?.message ?? "Failed" });
  }
});

// PATCH /api/snaps/:id
// Mark a snap as viewed — sets viewed_at = NOW() on the real column.
// Returns 404 if the id doesn't exist in the snaps table so the client
// can fall back to the legacy messages-table path.
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "id required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("snaps")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data || (data as unknown[]).length === 0) {
      // Zero rows updated — this ID belongs to the legacy messages table.
      // Return 404 so the caller can fall back to PATCH /api/messages/:id.
      res.status(404).json({ error: "snap not found in snaps table" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed" });
  }
});

// GET /api/snaps/streaks?userId=
// Returns a map of { partnerId: streakCount } for all snap streaks of the user.
router.get("/streaks", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.json({ streaks: {} }); return; }
  const sb = makeSupabase();
  try {
    const { data } = await sb
      .from("snap_streaks")
      .select("user1_id, user2_id, streak_count")
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
    const streaks: Record<string, number> = {};
    (data ?? []).forEach((row: any) => {
      const otherId = row.user1_id === userId ? row.user2_id : row.user1_id;
      streaks[otherId] = row.streak_count ?? 0;
    });
    res.json({ streaks });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "snaps/streaks error");
    res.json({ streaks: {} });
  }
});

export default router;
