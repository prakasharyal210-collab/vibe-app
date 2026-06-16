-- Vibe Rooms migration
-- Run this in the Supabase SQL dashboard (not local Drizzle DB).
-- Room IDs are TEXT slugs ("r1"…"r8") to match the hardcoded frontend array.

-- ─── Drop any partial tables from previous failed runs ───────────────────────
-- CASCADE removes dependent FKs automatically so order doesn't matter.
DROP TABLE IF EXISTS vibe_room_messages CASCADE;
DROP TABLE IF EXISTS vibe_room_members  CASCADE;
DROP TABLE IF EXISTS vibe_rooms         CASCADE;

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vibe_rooms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT,
  emoji       TEXT,
  description TEXT,
  is_live     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If the table already existed from a previous partial run, add any missing columns.
ALTER TABLE vibe_rooms ADD COLUMN IF NOT EXISTS category    TEXT;
ALTER TABLE vibe_rooms ADD COLUMN IF NOT EXISTS emoji       TEXT;
ALTER TABLE vibe_rooms ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE vibe_rooms ADD COLUMN IF NOT EXISTS is_live     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vibe_rooms ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS vibe_room_members (
  id        UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  room_id   TEXT NOT NULL REFERENCES vibe_rooms(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, room_id)
);

CREATE TABLE IF NOT EXISTS vibe_room_messages (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES vibe_rooms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Seed the 8 rooms ────────────────────────────────────────────────────────

INSERT INTO vibe_rooms (id, name, category, emoji, description, is_live) VALUES
  ('r1', 'Music Lovers',   'Music',    '🎵', 'Share your music taste, discover new artists, and vibe to the rhythm',          true),
  ('r2', 'Gamers Hub',     'Gaming',   '🎮', 'All genres welcome. Find your gaming crew and squads',                           true),
  ('r3', 'Travel Buddies', 'Travel',   '✈️', 'Plan trips, share destinations, find travel companions worldwide',               true),
  ('r4', 'Foodies',        'Food',     '🍕', 'Recipes, restaurants, food culture — eat your way through the world',            false),
  ('r5', 'Fitness Tribe',  'Fitness',  '💪', 'Workouts, nutrition, motivation — crush goals together',                         true),
  ('r6', 'Bookworms',      'Books',    '📚', 'Book clubs, recommendations, literary discussions',                               false),
  ('r7', 'Artists Corner', 'Art',      '🎨', 'Share your creations, get feedback, collab with other creators',                 false),
  ('r8', 'Entrepreneurs',  'Business', '💼', 'Founders, freelancers, side-hustlers — build and grow together',                 false)
ON CONFLICT (id) DO NOTHING;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE vibe_rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vibe_room_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vibe_room_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read rooms and messages (needed for realtime too).
-- Wrapped in DO blocks so re-running the migration doesn't error on duplicate policy names.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vibe_rooms_read' AND tablename = 'vibe_rooms') THEN
    CREATE POLICY "vibe_rooms_read" ON vibe_rooms FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vibe_room_messages_read' AND tablename = 'vibe_room_messages') THEN
    CREATE POLICY "vibe_room_messages_read" ON vibe_room_messages FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vibe_room_members_read' AND tablename = 'vibe_room_members') THEN
    CREATE POLICY "vibe_room_members_read" ON vibe_room_members FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- All writes go through the API server (service role key bypasses RLS).
-- No additional INSERT/UPDATE/DELETE policies needed for anon/authenticated roles.

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS vibe_room_members_user_id  ON vibe_room_members(user_id);
CREATE INDEX IF NOT EXISTS vibe_room_members_room_id  ON vibe_room_members(room_id);
CREATE INDEX IF NOT EXISTS vibe_room_messages_room_id ON vibe_room_messages(room_id);
CREATE INDEX IF NOT EXISTS vibe_room_messages_created ON vibe_room_messages(room_id, created_at);
