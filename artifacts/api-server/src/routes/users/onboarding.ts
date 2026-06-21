import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  return createClient(
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co",
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  );
}

// ─── GET /api/users/needs-onboarding ─────────────────────────────────────────
// ?userId=...
// Calls needs_onboarding RPC with service-role key (bypasses RLS).
router.get("/needs-onboarding", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb.rpc("needs_onboarding", { p_user_id: userId });
    if (error) req.log.warn({ error: error.message }, "needs_onboarding RPC warn");
    res.json({ needsOnboarding: !error ? !!data : false });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "needs-onboarding error");
    res.json({ needsOnboarding: false });
  }
});

// ─── POST /api/users/onboarding-interests ────────────────────────────────────
// Body: { userId, interests: string[] }
// Calls save_onboarding_interests RPC with service-role key.
router.post("/onboarding-interests", async (req, res) => {
  const { userId, interests } = req.body ?? {};
  if (!userId || !Array.isArray(interests)) {
    res.status(400).json({ error: "userId and interests[] required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb.rpc("save_onboarding_interests", {
      p_user_id: userId,
      p_interests: interests,
    });
    if (error) {
      req.log.warn({ error: error.message }, "save_onboarding_interests RPC warn — falling back to profile upsert");
      // Fallback: store as user_interests array on the profile row
      await sb
        .from("profiles")
        .update({ interests })
        .eq("id", userId);
    }
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "onboarding-interests error");
    res.json({ ok: false });
  }
});

export default router;
