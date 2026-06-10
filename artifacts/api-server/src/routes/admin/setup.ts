import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();
const SUPABASE_URL = "https://tatroqgcyebuqqkhmvpa.supabase.co";

// One-time setup: ensure storage buckets exist
router.post("/setup", async (req, res) => {
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceKey) {
    res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" });
    return;
  }

  const sb = createClient(SUPABASE_URL, serviceKey);
  const results: Record<string, string> = {};

  for (const bucket of ["posts", "reels", "media", "avatars"]) {
    const { error } = await sb.storage.createBucket(bucket, { public: true });
    if (!error) results[bucket] = "created";
    else if (error.message.includes("already exists")) results[bucket] = "ok";
    else results[bucket] = `error: ${error.message}`;
  }

  res.json({ ok: true, buckets: results });
});

export default router;
