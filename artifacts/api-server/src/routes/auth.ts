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

export default router;
