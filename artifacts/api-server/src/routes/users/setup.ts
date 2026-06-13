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

// POST /api/users/setup
// Idempotent: creates profile + wallet + user_settings + vibe_scores rows
// for a newly registered user. Uses service-role key so it works even before
// the client's auth session is fully propagated.
router.post("/setup", async (req, res) => {
  const { userId, username, email } = req.body as {
    userId?: string;
    username?: string;
    email?: string;
  };
  if (!userId || !username) {
    res.status(400).json({ error: "userId and username required" });
    return;
  }
  const sb = makeSupabase();

  // Run all upserts in parallel — each is idempotent (only inserts if missing)
  const results = await Promise.allSettled([
    sb
      .from("profiles")
      .upsert({ id: userId, username, email }, { onConflict: "id", ignoreDuplicates: true }),
    sb
      .from("wallet")
      .upsert(
        { user_id: userId, coins: 100, total_earnings: 0 },
        { onConflict: "user_id", ignoreDuplicates: true }
      ),
    sb
      .from("user_settings")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true }),
    sb
      .from("vibe_scores")
      .upsert(
        { user_id: userId, score: 100, level: 1 },
        { onConflict: "user_id", ignoreDuplicates: true }
      ),
  ]);

  const errors = results
    .filter((r) => r.status === "rejected")
    .map((r) => (r as PromiseRejectedResult).reason?.message ?? "unknown");

  if (errors.length) {
    req.log.warn({ errors }, "some setup upserts failed (non-fatal)");
  }

  res.json({ ok: true });
});

export default router;
