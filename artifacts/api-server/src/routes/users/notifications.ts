import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

// GET /api/users/notifications/:userId
// Actual schema: recipient_id, sender_id, is_read, type, message, post_id, created_at
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      req.log.warn({ error: error.message }, "notifications fetch error");
      res.json({ notifications: [] });
      return;
    }
    const rows = data ?? [];

    // Resolve sender usernames in one batch query
    const senderIds = [...new Set(rows.map((n: any) => n.sender_id).filter(Boolean))];
    let profileMap = new Map<string, { username: string; avatar_url: string | null }>();
    if (senderIds.length > 0) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", senderIds);
      for (const p of profiles ?? []) {
        profileMap.set(p.id, { username: p.username ?? "user", avatar_url: p.avatar_url });
      }
    }

    const notifications = rows.map((n: any) => {
      const sender = profileMap.get(n.sender_id) ?? { username: "user", avatar_url: null };
      return {
        id: n.id,
        type: n.type,
        username: sender.username,
        avatar_url: sender.avatar_url,
        text: n.message ?? "",
        time: timeAgoShort(n.created_at),
        read: n.is_read ?? false,
        post_image: n.thumbnail_url ?? null,
      };
    });
    res.json({ notifications });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "notifications exception");
    res.json({ notifications: [] });
  }
});

// PATCH /api/users/notifications/:notifId/read
router.patch("/:notifId/read", async (req, res) => {
  const { notifId } = req.params;
  const sb = makeSupabase();
  try {
    await sb.from("notifications").update({ is_read: true }).eq("id", notifId);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "mark-read exception");
    res.json({ ok: false });
  }
});

// PATCH /api/users/notifications/read-all/:userId
router.patch("/read-all/:userId", async (req, res) => {
  const { userId } = req.params;
  const sb = makeSupabase();
  try {
    await sb
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_id", userId)
      .eq("is_read", false);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "mark-all-read exception");
    res.json({ ok: false });
  }
});

export default router;
