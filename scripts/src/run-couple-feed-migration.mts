import pg from "pg";

const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!serviceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

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

const steps: [string, string][] = [
  [
    "create couple_feed_posts",
    `CREATE TABLE IF NOT EXISTS couple_feed_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
      author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      photo_url TEXT,
      category TEXT NOT NULL DEFAULT 'Story' CHECK (category IN ('Story', 'Advice', 'Milestone', 'Venting')),
      like_count INT DEFAULT 0,
      comment_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ],
  [
    "create couple_feed_likes",
    `CREATE TABLE IF NOT EXISTS couple_feed_likes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id UUID REFERENCES couple_feed_posts(id) ON DELETE CASCADE,
      couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
      liker_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(post_id, couple_id)
    )`,
  ],
  [
    "create couple_feed_comments",
    `CREATE TABLE IF NOT EXISTS couple_feed_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id UUID REFERENCES couple_feed_posts(id) ON DELETE CASCADE,
      couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
      author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ],
  ["index couple_feed_posts(created_at)", `CREATE INDEX IF NOT EXISTS idx_couple_feed_posts_created ON couple_feed_posts(created_at DESC)`],
  ["index couple_feed_comments(post_id)", `CREATE INDEX IF NOT EXISTS idx_couple_feed_comments_post ON couple_feed_comments(post_id)`],
  ["disable RLS couple_feed_posts",    `ALTER TABLE couple_feed_posts    DISABLE ROW LEVEL SECURITY`],
  ["disable RLS couple_feed_likes",    `ALTER TABLE couple_feed_likes    DISABLE ROW LEVEL SECURITY`],
  ["disable RLS couple_feed_comments", `ALTER TABLE couple_feed_comments DISABLE ROW LEVEL SECURITY`],
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
