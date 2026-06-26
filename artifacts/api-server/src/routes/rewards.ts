import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  return createClient(
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co",
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  );
}

// ─── POST /api/rewards/claim-daily ───────────────────────────────────────────
// Body: { userId: string }
// Calls claim_daily_reward RPC with service-role key (bypasses RLS).
router.post("/claim-daily", async (req, res) => {
  const { userId } = req.body ?? {};
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb.rpc("claim_daily_reward", { p_user_id: userId });
    if (!error && data) {
      res.json({ data });
      return;
    }
    // RPC missing or errored — manual fallback
    const { data: rows } = await sb
      .from("daily_rewards")
      .select("claimed_at")
      .eq("user_id", userId)
      .order("claimed_at", { ascending: false })
      .limit(30);

    const today = new Date();
    const alreadyClaimed =
      rows && rows.length > 0 &&
      new Date(rows[0].claimed_at).toDateString() === today.toDateString();

    if (alreadyClaimed) {
      res.json({ data: { claimed: false, coins_awarded: 0, new_balance: 0, message: "Already claimed today!", streak: rows.length } });
      return;
    }

    await sb.from("daily_rewards").insert({ user_id: userId, coins_awarded: 50 });
    await sb.from("wallet").upsert({ user_id: userId, coins: 50 }, { onConflict: "user_id" });

    res.json({ data: { claimed: true, coins_awarded: 50, new_balance: 50, message: "🎉 +50 coins claimed!", streak: (rows?.length ?? 0) + 1 } });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "claim-daily error");
    res.status(500).json({ error: "claim failed" });
  }
});

// ─── GET /api/rewards/achievements ───────────────────────────────────────────
// ?userId=...
// Calls check_achievements RPC with service-role key.
router.get("/achievements", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb.rpc("check_achievements", { p_user_id: userId });
    if (!error && Array.isArray(data)) {
      res.json({ achievements: data });
      return;
    }
    req.log.warn({ error: error?.message }, "check_achievements RPC unavailable");
    res.json({ achievements: [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "achievements error");
    res.json({ achievements: [] });
  }
});

// GET /api/leaderboard?period=weekly|monthly|alltime
router.get("/leaderboard", async (req, res) => {
  const { period = "weekly" } = req.query as { period?: string };
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("leaderboard")
      .select("*, profiles!user_id(username, avatar_url)")
      .eq("period", period)
      .order("rank", { ascending: true })
      .limit(10);
    if (error) throw error;
    res.json({ entries: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "leaderboard get error");
    res.json({ entries: [] });
  }
});

export default router;
