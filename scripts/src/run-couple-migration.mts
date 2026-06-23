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
    "create couple_links",
    `CREATE TABLE IF NOT EXISTS couple_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
      anniversary_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      accepted_at TIMESTAMPTZ,
      UNIQUE(requester_id, receiver_id)
    )`,
  ],
  [
    "create couple_photos",
    `CREATE TABLE IF NOT EXISTS couple_photos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
      uploaded_by UUID REFERENCES auth.users(id),
      url TEXT NOT NULL,
      caption TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ],
  [
    "create couple_bucketlist",
    `CREATE TABLE IF NOT EXISTS couple_bucketlist (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      created_by UUID REFERENCES auth.users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ],
  [
    "create couple_notes",
    `CREATE TABLE IF NOT EXISTS couple_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
      author_id UUID REFERENCES auth.users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ],
  [
    "create couple_nudges",
    `CREATE TABLE IF NOT EXISTS couple_nudges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id UUID REFERENCES auth.users(id),
      receiver_id UUID REFERENCES auth.users(id),
      sent_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ],
  ["disable RLS couple_links",    `ALTER TABLE couple_links    DISABLE ROW LEVEL SECURITY`],
  ["disable RLS couple_photos",   `ALTER TABLE couple_photos   DISABLE ROW LEVEL SECURITY`],
  ["disable RLS couple_bucketlist", `ALTER TABLE couple_bucketlist DISABLE ROW LEVEL SECURITY`],
  ["disable RLS couple_notes",    `ALTER TABLE couple_notes    DISABLE ROW LEVEL SECURITY`],
  ["disable RLS couple_nudges",   `ALTER TABLE couple_nudges   DISABLE ROW LEVEL SECURITY`],
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
