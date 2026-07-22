import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  return createClient(
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co",
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  );
}

// ─── GET /api/referral/my-code?userId=<uuid> ─────────────────────────────────
// Returns the user's referral_code, generating and persisting one if missing.
router.get("/my-code", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const sb = makeSupabase();
  try {
    const { data: profile, error: fetchErr } = await sb
      .from("profiles")
      .select("referral_code")
      .eq("id", userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (profile?.referral_code) {
      res.json({ referralCode: profile.referral_code });
      return;
    }

    // Generate one — 8-char uppercase MD5 prefix (same as migration backfill)
    const code = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
    const { data: updated, error: updateErr } = await sb
      .from("profiles")
      .update({ referral_code: code })
      .eq("id", userId)
      .select("referral_code")
      .single();

    if (updateErr) throw updateErr;
    res.json({ referralCode: updated.referral_code });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "referral/my-code error");
    res.status(500).json({ error: "Failed to fetch referral code" });
  }
});

// ─── POST /api/referral/apply ─────────────────────────────────────────────────
// Body: { userId: string, referralCode: string }
// Called right after signup to record who referred the new user.
// Silently no-ops if code is invalid or already applied.
router.post("/apply", async (req, res) => {
  const { userId, referralCode } = req.body ?? {};
  if (!userId || !referralCode) {
    res.json({ ok: false, reason: "missing_params" });
    return;
  }

  const code = String(referralCode).trim().toUpperCase();
  const sb = makeSupabase();
  try {
    // Look up the referrer by code
    const { data: referrer } = await sb
      .from("profiles")
      .select("id")
      .eq("referral_code", code)
      .maybeSingle();

    if (!referrer) { res.json({ ok: false, reason: "invalid_code" }); return; }
    if (referrer.id === userId) { res.json({ ok: false, reason: "self_referral" }); return; }

    // Check if already applied
    const { data: existing } = await sb
      .from("profiles")
      .select("referred_by")
      .eq("id", userId)
      .maybeSingle();

    if (existing?.referred_by) { res.json({ ok: false, reason: "already_applied" }); return; }

    // Set referred_by on the new user's profile
    await sb.from("profiles").update({ referred_by: referrer.id }).eq("id", userId);

    req.log.info({ userId, referrerId: referrer.id }, "referral/apply: referred_by set");
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "referral/apply error");
    res.json({ ok: false, reason: "server_error" });
  }
});

export default router;
