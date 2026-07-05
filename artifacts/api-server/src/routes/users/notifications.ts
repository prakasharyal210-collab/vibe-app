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

// Dating/vibe notification types — must NEVER appear in the main social feed.
// These live exclusively inside the Find Vibe ⚡ Activity surface.
const VIBE_TYPES = ["vibe_request", "vibe_match", "vibe_accepted", "vibe"];

// GET /api/users/notifications/:userId?scope=social|vibe
// scope=social (default) — excludes all vibe types (for the main bell feed)
// scope=vibe            — returns only vibe types (for the ⚡ Activity screen)
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const scope = (req.query["scope"] as string | undefined) ?? "social";
  const sb = makeSupabase();
  try {
    let q = sb
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (scope === "vibe") {
      q = q.in("type", VIBE_TYPES);
    } else {
      // social: exclude ALL vibe types so dating activity never leaks into the main bell feed
      q = q.not("type", "in", `(${VIBE_TYPES.join(",")})`);
    }

    const { data, error } = await q;
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
        post_id: n.post_id ?? null,
        reference_id: n.reference_id ?? null,
        sender_id: n.sender_id ?? null,
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

// PATCH /api/users/notifications/read-all/:userId?scope=social|vibe
// scope=social (default) — only marks SOCIAL notifications as read (never touches vibe types)
// scope=vibe            — only marks VIBE notifications as read (for ⚡ Activity "mark all read")
router.patch("/read-all/:userId", async (req, res) => {
  const { userId } = req.params;
  const scope = (req.query["scope"] as string | undefined) ?? "social";
  const sb = makeSupabase();
  try {
    let q = sb
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_id", userId)
      .eq("is_read", false);

    if (scope === "vibe") {
      q = q.in("type", VIBE_TYPES);
    } else {
      // social: only mark non-vibe notifications as read
      q = q.not("type", "in", `(${VIBE_TYPES.join(",")})`);
    }

    await q;
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "mark-all-read exception");
    res.json({ ok: false });
  }
});

export default router;
