import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

const DELTAS: Record<string, number> = {
  like:           0.3,
  unlike:        -0.1,
  comment:        0.5,
  save:           0.7,
  share:          0.4,
  watch_complete: 0.4,  // reel watched to >80% completion
  skip:          -0.2,
  hide:          -1.5,
};

// POST /api/engage
// Records affinity signals for the personalization engine.
// body: { userId, creatorId, action, contentId?, contentType? }
//   contentId   — optional post/reel UUID; enables category affinity tracking
//   contentType — "post" | "reel" (required when contentId is provided)
router.post("/", async (req, res) => {
  const { userId, creatorId, action, contentId, contentType } = req.body as {
    userId?:      string;
    creatorId?:   string;
    action?:      string;
    contentId?:   string;
    contentType?: "post" | "reel";
  };

  if (!userId || !creatorId || !action) {
    res.status(400).json({ error: "userId, creatorId, action required" });
    return;
  }
  if (userId === creatorId) { res.json({ ok: true }); return; }

  const delta = DELTAS[action];
  if (delta === undefined) {
    res.status(400).json({ error: `Unknown action: ${action}` });
    return;
  }

  const sb = makeSupabase();

  // ── Helper: read-modify-write a single affinity key (clamped [-5, 10]) ────
  async function upsertAffinity(key: string, d: number) {
    const { data: row } = await sb
      .from("user_interests")
      .select("weight")
      .eq("user_id", userId)
      .eq("interest_key", key)
      .maybeSingle();

    const current = (row?.weight as number | null) ?? 0;
    const next    = Math.min(10, Math.max(-5, current + d));

    await sb.from("user_interests").upsert(
      { user_id: userId!, interest_key: key, weight: next, updated_at: new Date().toISOString() },
      { onConflict: "user_id,interest_key" }
    );
  }

  try {
    // 1. Creator affinity (always)
    await upsertAffinity(`creator:${creatorId}`, delta);

    // 2. Category affinity — positive signals only, requires contentId
    if (contentId && contentType && delta > 0) {
      const table = contentType === "reel" ? "reels" : "posts";
      const { data: content } = await sb
        .from(table)
        .select("categories")
        .eq("id", contentId)
        .maybeSingle();

      const categories: string[] = (content as any)?.categories ?? [];
      if (categories.length > 0) {
        await Promise.all(
          categories.map((cat) => upsertAffinity(`category:${cat}`, delta))
        );
        req.log.debug({ categories, action, contentId }, "recorded category affinities");
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    // Non-fatal — migration may not have run yet
    req.log.warn({ err: err?.message }, "engage upsert failed (migration needed?)");
    res.json({ ok: true });
  }
});

export default router;
