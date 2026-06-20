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
// Send a snap — writes ONLY to the snaps table, never to messages.
// body: { senderId, receiverId, content }  where content = "__SNAP__:{...}"
router.post("/", async (req, res) => {
  const { senderId, receiverId, content } = req.body as {
    senderId?: string;
    receiverId?: string;
    content?: string;
  };
  if (!senderId || !receiverId || !content) {
    res.status(400).json({ error: "senderId, receiverId, content required" });
    return;
  }
  if (!content.startsWith("__SNAP__:")) {
    res.status(400).json({ error: "content must be a snap-encoded string" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("snaps")
      .insert({ sender_id: senderId, receiver_id: receiverId, content })
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
// Returns snap conversations from the dedicated snaps table,
// one row per conversation partner (most-recent snap first).
router.get("/", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("snaps")
      .select(
        "*, sender:sender_id(id, username, avatar_url), receiver:receiver_id(id, username, avatar_url)"
      )
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      req.log.warn({ err: error.message }, "snaps table read failed (may not exist yet)");
      res.json({ snapConvos: [] });
      return;
    }

    const seen = new Map<string, object>();
    for (const msg of (data ?? []) as any[]) {
      const isIncoming = msg.receiver_id === userId;
      const otherId = isIncoming ? msg.sender_id : msg.receiver_id;
      const otherUser = isIncoming ? msg.sender : msg.receiver;
      if (!otherUser || seen.has(otherId)) continue;
      seen.set(otherId, {
        other_user: {
          id: otherId,
          username: otherUser.username,
          avatar_url: otherUser.avatar_url,
        },
        message_id: msg.id,
        message_text: msg.content,
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

// PATCH /api/snaps/:id
// Mark a snap as viewed — updates the encoded content in the snaps table.
// body: { content }  (re-encoded snap with viewed:true)
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { content } = req.body as { content?: string };
  if (!id || !content) {
    res.status(400).json({ error: "id and content required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb.from("snaps").update({ content }).eq("id", id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed" });
  }
});

export default router;
