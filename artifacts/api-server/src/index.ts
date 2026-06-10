import app from "./app";
import { logger } from "./lib/logger";
import { createClient } from "@supabase/supabase-js";

async function ensureStorageBuckets() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceKey) return;
  const sb = createClient(url, serviceKey);
  for (const bucket of ["posts", "reels", "media", "avatars"]) {
    const { error } = await sb.storage.createBucket(bucket, { public: true });
    if (error && !error.message.includes("already exists")) {
      logger.warn({ bucket, err: error.message }, "Could not create storage bucket");
    } else if (!error) {
      logger.info({ bucket }, "Created storage bucket");
    }
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
  ensureStorageBuckets().catch((e) =>
    logger.warn({ err: e }, "ensureStorageBuckets failed")
  );
});
