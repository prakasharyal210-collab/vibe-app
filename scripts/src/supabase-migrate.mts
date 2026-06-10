import pg from "pg";

const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!serviceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

// Supabase direct DB connection (non-pooled, port 5432)
const client = new pg.Client({
  host: "db.tatroqgcyebuqqkhmvpa.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: serviceKey,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("Connected to Supabase postgres");

const steps = [
  ["add image_url column", `ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT`],
  ["backfill image_url",   `UPDATE posts SET image_url = media_url WHERE image_url IS NULL AND media_url IS NOT NULL`],
  ["create sync function", `
    CREATE OR REPLACE FUNCTION sync_posts_image_url()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.media_url IS NOT NULL THEN
        NEW.image_url := NEW.media_url;
      END IF;
      RETURN NEW;
    END;
    $$
  `],
  ["drop old trigger",  `DROP TRIGGER IF EXISTS trg_sync_posts_image_url ON posts`],
  ["create trigger",    `
    CREATE TRIGGER trg_sync_posts_image_url
      BEFORE INSERT OR UPDATE ON posts
      FOR EACH ROW EXECUTE FUNCTION sync_posts_image_url()
  `],
];

for (const [name, sql] of steps) {
  try {
    await client.query(sql);
    console.log(`✓ ${name}`);
  } catch (err: any) {
    console.error(`✗ ${name}: ${err.message}`);
  }
}

await client.end();
console.log("Done.");
