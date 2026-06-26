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

// ─── POST /api/moderation/report ──────────────────────────────────────────────
// body: { reporterId, targetType: "post"|"reel"|"comment"|"user", targetId, reason, details? }
router.post("/report", async (req, res) => {
  const { reporterId, targetType, targetId, reason, details } = req.body as {
    reporterId?: string;
    targetType?: string;
    targetId?: string;
    reason?: string;
    details?: string;
  };
  if (!reporterId || !targetType || !targetId || !reason) {
    res.status(400).json({ error: "reporterId, targetType, targetId, reason required" });
    return;
  }
  const validTypes = ["post", "reel", "comment", "user"];
  if (!validTypes.includes(targetType)) {
    res.status(400).json({ error: "targetType must be one of: " + validTypes.join(", ") });
    return;
  }
  const sb = makeSupabase();
  try {
    // Insert into content_reports (already exists) and also try the newer reports table
    const { error } = await sb.from("reports").insert({
      reporter_id: reporterId,
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details ?? null,
      status: "pending",
    });
    if (error) {
      // Fallback to the older content_reports table name
      await sb.from("content_reports").insert({
        reporter_id: reporterId,
        content_id: targetId,
        content_type: targetType,
        reason,
      });
    }
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "report insert error");
    res.status(500).json({ error: "Failed to submit report" });
  }
});

// ─── POST /api/moderation/block ───────────────────────────────────────────────
// body: { blockerId, blockedId }
router.post("/block", async (req, res) => {
  const { blockerId, blockedId } = req.body as {
    blockerId?: string;
    blockedId?: string;
  };
  if (!blockerId || !blockedId) {
    res.status(400).json({ error: "blockerId and blockedId required" });
    return;
  }
  if (blockerId === blockedId) {
    res.status(400).json({ error: "Cannot block yourself" });
    return;
  }
  const sb = makeSupabase();
  try {
    await Promise.all([
      // Insert block record
      sb.from("blocks").upsert(
        { blocker_id: blockerId, blocked_id: blockedId },
        { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true }
      ),
      // Remove all follow relationships between the two users
      sb.from("follows").delete().or(
        `and(follower_id.eq.${blockerId},following_id.eq.${blockedId}),and(follower_id.eq.${blockedId},following_id.eq.${blockerId})`
      ),
      // Remove vibe matches
      sb.from("vibe_matches").delete().or(
        `and(user_id.eq.${blockerId},matched_user_id.eq.${blockedId}),and(user_id.eq.${blockedId},matched_user_id.eq.${blockerId})`
      ),
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "block error");
    res.status(500).json({ error: "Failed to block user" });
  }
});

// ─── DELETE /api/moderation/block ─────────────────────────────────────────────
// body: { blockerId, blockedId }
router.delete("/block", async (req, res) => {
  const { blockerId, blockedId } = req.body as {
    blockerId?: string;
    blockedId?: string;
  };
  if (!blockerId || !blockedId) {
    res.status(400).json({ error: "blockerId and blockedId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    await sb.from("blocks").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "unblock error");
    res.status(500).json({ error: "Failed to unblock user" });
  }
});

// ─── GET /api/moderation/reports ──────────────────────────────────────────────
// Admin-only: returns pending reports. Protected by a secret header.
router.get("/reports", async (req, res) => {
  const adminSecret = req.headers["x-admin-secret"];
  const expected = process.env["ADMIN_SECRET"] ?? "gundruk-admin-2024";
  if (adminSecret !== expected) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      // Try legacy table
      const { data: legacy } = await sb
        .from("content_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      res.json({ reports: legacy ?? [] });
      return;
    }
    res.json({ reports: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "admin reports error");
    res.json({ reports: [] });
  }
});

// ─── PATCH /api/moderation/reports/:id ────────────────────────────────────────
// Admin: update report status (reviewed, dismissed, actioned)
router.patch("/reports/:id", async (req, res) => {
  const adminSecret = req.headers["x-admin-secret"];
  const expected = process.env["ADMIN_SECRET"] ?? "gundruk-admin-2024";
  if (adminSecret !== expected) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { id } = req.params;
  const { status } = req.body as { status?: string };
  if (!status) { res.status(400).json({ error: "status required" }); return; }
  const sb = makeSupabase();
  try {
    await sb.from("reports").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "report update error");
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/moderation/restrict
// body: { myId, theirId }
router.post("/restrict", async (req, res) => {
  const { myId, theirId } = req.body as { myId?: string; theirId?: string };
  if (!myId || !theirId) { res.status(400).json({ error: "myId and theirId required" }); return; }
  const sb = makeSupabase();
  try {
    await sb.from("restricted_users").upsert(
      { restrictor_id: myId, restricted_id: theirId },
      { onConflict: "restrictor_id,restricted_id" }
    );
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "moderation/restrict error");
    res.status(500).json({ error: "Failed to restrict user" });
  }
});

// DELETE /api/moderation/restrict
// body: { myId, theirId }
router.delete("/restrict", async (req, res) => {
  const { myId, theirId } = req.body as { myId?: string; theirId?: string };
  if (!myId || !theirId) { res.status(400).json({ error: "myId and theirId required" }); return; }
  const sb = makeSupabase();
  try {
    await sb.from("restricted_users").delete().eq("restrictor_id", myId).eq("restricted_id", theirId);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "moderation/unrestrict error");
    res.status(500).json({ error: "Failed to unrestrict user" });
  }
});

export default router;
