import { Router } from "express";
import { makeSupabase } from "../lib/supabase";

const router = Router();

router.post("/google", async (req, res) => {
  const { idToken } = req.body as { idToken?: string };

  if (!idToken) {
    res.status(400).json({ error: "idToken is required" });
    return;
  }

  const sb = makeSupabase();
  const { data, error } = await sb.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });

  if (error) {
    req.log.warn({ err: error.message }, "Google sign-in failed");
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ user: data.user, session: data.session });
});

router.post("/apple", async (req, res) => {
  const { identityToken, fullName, nonce } = req.body as {
    identityToken?: string;
    fullName?: string;
    nonce?: string;
  };

  if (!identityToken) {
    res.status(400).json({ error: "identityToken is required" });
    return;
  }

  const sb = makeSupabase();
  const { data, error } = await sb.auth.signInWithIdToken({
    provider: "apple",
    token: identityToken,
    // nonce must be the raw (un-hashed) value; Supabase hashes it internally
    // and compares it against the SHA-256 hash Apple embedded in the JWT.
    ...(nonce ? { nonce } : {}),
  });

  if (error) {
    req.log.warn({ err: error.message }, "Apple sign-in failed");
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ user: data.user, session: data.session });
});

// ── Apple App Review bypass ───────────────────────────────────────────────────
// Allows a single pre-created review account to sign in without OTP/email
// verification, so Apple reviewers can access the app during review.
//
// Security properties:
//   • Exact string match against APPLE_REVIEW_EMAIL env var — any other address
//     gets a 403 immediately before any Supabase call is made.
//   • env var is server-only; the email address is never sent to the client.
//   • Does not weaken any other account — signInWithPassword still validates
//     the password; we only skip the email-confirmation gate for this one user.
//   • Every use is logged server-side so you can confirm Apple's reviewer hit it.
router.post("/review-login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  const reviewEmail = process.env["APPLE_REVIEW_EMAIL"];

  // Reject immediately if env var is not set or the email doesn't match exactly.
  if (!reviewEmail || !email || email.trim() !== reviewEmail) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!password) {
    res.status(400).json({ error: "password is required" });
    return;
  }

  const sb = makeSupabase(); // service-role client — required for auth.admin.*

  const SUPABASE_URL =
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
    "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

  // Try a regular sign-in first — if the email was already confirmed on a
  // previous bypass call this will succeed without any admin API round-trips.
  const firstTry = await sb.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (firstTry.data.session) {
    req.log.info(
      { userId: firstTry.data.user?.id, email: reviewEmail },
      "[ReviewLogin] Apple review account bypass used — sign-in successful (email already confirmed)",
    );
    res.json({ user: firstTry.data.user, session: firstTry.data.session });
    return;
  }

  const firstErrMsg = firstTry.error?.message?.toLowerCase() ?? "";
  const isUnconfirmed =
    firstErrMsg.includes("email not confirmed") ||
    firstErrMsg.includes("email_not_confirmed");

  if (!isUnconfirmed) {
    // Wrong password or some other auth error — don't leak details.
    req.log.warn(
      { err: firstTry.error?.message },
      "[ReviewLogin] Sign-in failed — invalid credentials for review account",
    );
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Email is unconfirmed — look up the user via the Supabase Admin REST API
  // (auth.admin.getUserByEmail is not available in this supabase-js version).
  const lookupRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email.trim())}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );

  if (!lookupRes.ok) {
    req.log.error(
      { status: lookupRes.status },
      "[ReviewLogin] Admin user lookup request failed",
    );
    res.status(500).json({ error: "Internal error" });
    return;
  }

  const lookupBody = (await lookupRes.json()) as {
    users?: Array<{ id: string; email_confirmed_at: string | null }>;
  };
  const reviewUser = lookupBody.users?.[0];

  if (!reviewUser) {
    req.log.error(
      {},
      "[ReviewLogin] Review account not found in Supabase — create it first",
    );
    res.status(404).json({
      error: "Review account not found — create it in Supabase Auth first",
    });
    return;
  }

  // Confirm the email so signInWithPassword succeeds.
  const { error: confirmErr } = await sb.auth.admin.updateUserById(
    reviewUser.id,
    { email_confirm: true },
  );
  if (confirmErr) {
    req.log.error(
      { err: confirmErr.message, userId: reviewUser.id },
      "[ReviewLogin] Failed to confirm review account email",
    );
    res.status(500).json({ error: "Internal error" });
    return;
  }
  req.log.info(
    { userId: reviewUser.id },
    "[ReviewLogin] Email confirmed for review account (first use)",
  );

  // Retry sign-in — email is now confirmed.
  const { data: signInData, error: signInErr } =
    await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

  if (signInErr || !signInData.session) {
    req.log.warn(
      { err: signInErr?.message },
      "[ReviewLogin] Sign-in failed after email confirmation — wrong password?",
    );
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Audit log — visible in Railway logs so you can confirm Apple hit this path.
  req.log.info(
    { userId: signInData.user?.id, email: reviewEmail },
    "[ReviewLogin] Apple review account bypass used — sign-in successful",
  );

  res.json({ user: signInData.user, session: signInData.session });
});

export default router;
