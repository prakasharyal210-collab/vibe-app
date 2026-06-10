import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

router.get("/env-check", (_req, res) => {
  const keys = Object.keys(process.env).filter(k =>
    k.toLowerCase().includes("supa") || k.toLowerCase().includes("service") || k.toLowerCase().includes("secret")
  );
  res.json({ availableKeys: keys });
});

router.post("/setup", async (req, res) => {
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceKey) {
    res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" });
    return;
  }

  const url = "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const sb = createClient(url, serviceKey);

  const results: Record<string, string> = {};

  // Create storage buckets
  for (const bucket of ["posts", "reels", "media", "avatars"]) {
    const { error } = await sb.storage.createBucket(bucket, { public: true });
    if (!error) {
      results[`bucket_${bucket}`] = "created";
    } else if (error.message.includes("already exists")) {
      results[`bucket_${bucket}`] = "already exists";
    } else {
      results[`bucket_${bucket}`] = `error: ${error.message}`;
    }
  }

  // Add image_url column to posts (alias for media_url)
  const migration = `
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT;
    UPDATE posts SET image_url = media_url WHERE image_url IS NULL AND media_url IS NOT NULL;
    CREATE OR REPLACE FUNCTION sync_posts_image_url()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.media_url IS NOT NULL THEN
        NEW.image_url := NEW.media_url;
      END IF;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS trg_sync_posts_image_url ON posts;
    CREATE TRIGGER trg_sync_posts_image_url
      BEFORE INSERT OR UPDATE ON posts
      FOR EACH ROW EXECUTE FUNCTION sync_posts_image_url();
  `;

  const { error: sqlError } = await sb.rpc("exec_sql" as any, { sql: migration });
  if (sqlError) {
    // Try raw query via pg endpoint
    results["sql_migration"] = `rpc unavailable: ${sqlError.message} — run scripts/supabase-storage-migration.sql manually`;
  } else {
    results["sql_migration"] = "applied";
  }

  res.json({ ok: true, results });
});

export default router;
