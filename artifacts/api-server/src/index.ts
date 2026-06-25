import app from "./app";
import { logger } from "./lib/logger";
import { createClient } from "@supabase/supabase-js";

async function ensureSupabaseSetup() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceKey) return;
  const sb = createClient(url, serviceKey);

  // Ensure storage buckets exist
  for (const bucket of ["posts", "reels", "media", "avatars", "snaps"]) {
    const { error } = await sb.storage.createBucket(bucket, { public: true });
    if (error && !error.message.includes("already exists")) {
      logger.warn({ bucket, err: error.message }, "Could not create storage bucket");
    } else if (!error) {
      logger.info({ bucket }, "Created storage bucket");
    }
  }

  // Ensure couple post columns exist on posts table
  await sb.rpc("exec_ddl" as any, {
    ddl: "ALTER TABLE posts ADD COLUMN IF NOT EXISTS couple_id UUID REFERENCES couple_links(id) ON DELETE SET NULL",
  });
  await sb.rpc("exec_ddl" as any, {
    ddl: "ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_couple_post BOOLEAN NOT NULL DEFAULT FALSE",
  });
  logger.info("posts couple columns ensured");

  // Ensure is_couple_post column exists on reels table
  await sb.rpc("exec_ddl" as any, {
    ddl: "ALTER TABLE reels ADD COLUMN IF NOT EXISTS couple_id UUID REFERENCES couple_links(id) ON DELETE SET NULL",
  });
  await sb.rpc("exec_ddl" as any, {
    ddl: "ALTER TABLE reels ADD COLUMN IF NOT EXISTS is_couple_post BOOLEAN NOT NULL DEFAULT FALSE",
  });
  logger.info("reels couple columns ensured");

  // Ensure image_url column exists on posts (alias for media_url)
  const { error: colErr } = await sb.rpc("exec_ddl" as any, {
    ddl: "ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT",
  });
  if (!colErr) {
    // backfill and add sync trigger
    await sb.rpc("exec_ddl" as any, {
      ddl: "UPDATE posts SET image_url = media_url WHERE image_url IS NULL AND media_url IS NOT NULL",
    });
    await sb.rpc("exec_ddl" as any, {
      ddl: `CREATE OR REPLACE FUNCTION sync_posts_image_url()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN IF NEW.media_url IS NOT NULL THEN NEW.image_url := NEW.media_url; END IF; RETURN NEW; END; $$`,
    });
    await sb.rpc("exec_ddl" as any, {
      ddl: "DROP TRIGGER IF EXISTS trg_sync_posts_image_url ON posts",
    });
    await sb.rpc("exec_ddl" as any, {
      ddl: `CREATE TRIGGER trg_sync_posts_image_url BEFORE INSERT OR UPDATE ON posts
        FOR EACH ROW EXECUTE FUNCTION sync_posts_image_url()`,
    });
    logger.info("posts.image_url column and trigger applied");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  ensureSupabaseSetup().catch((e) =>
    logger.warn({ err: e }, "ensureSupabaseSetup failed")
  );
});
