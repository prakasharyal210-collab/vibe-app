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
  const { identityToken, fullName } = req.body as {
    identityToken?: string;
    fullName?: string;
  };

  if (!identityToken) {
    res.status(400).json({ error: "identityToken is required" });
    return;
  }

  const sb = makeSupabase();
  const { data, error } = await sb.auth.signInWithIdToken({
    provider: "apple",
    token: identityToken,
  });

  if (error) {
    req.log.warn({ err: error.message }, "Apple sign-in failed");
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ user: data.user, session: data.session });
});

export default router;
