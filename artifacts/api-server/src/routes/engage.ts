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
// Records a social-graph affinity delta for the personalization engine.
// body: { userId, creatorId, action }
router.post("/", async (req, res) => {
  const { userId, creatorId, action } = req.body as {
    userId?: string;
    creatorId?: string;
    action?: string;
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
  const key = `creator:${creatorId}`;

  try {
    // Read current weight, then write clamped result (Supabase JS has no expression UPDATE)
    const { data: row } = await sb
      .from("user_interests")
      .select("weight")
      .eq("user_id", userId)
      .eq("interest_key", key)
      .maybeSingle();

    const currentWeight = (row?.weight as number | null) ?? 0;
    const newWeight = Math.min(10, Math.max(-5, currentWeight + delta));

    const { error } = await sb.from("user_interests").upsert(
      { user_id: userId, interest_key: key, weight: newWeight, updated_at: new Date().toISOString() },
      { onConflict: "user_id,interest_key" }
    );

    if (error) {
      // Table may not exist if SQL migration hasn't been run — non-fatal
      req.log.warn({ error: error.message }, "engage upsert failed (table missing?)");
    }

    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "engage exception");
    res.json({ ok: true });
  }
});

export default router;
