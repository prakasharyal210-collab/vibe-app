-- Reel likes migration
-- Run this in the Supabase SQL dashboard (not local Drizzle DB).
-- Adds reel_likes table with UNIQUE(user_id, reel_id) to prevent duplicate likes at DB level.

CREATE TABLE IF NOT EXISTS reel_likes (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reel_id    UUID NOT NULL REFERENCES reels(id)    ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, reel_id)
);

-- RLS
ALTER TABLE reel_likes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'reel_likes_read' AND tablename = 'reel_likes') THEN
    CREATE POLICY "reel_likes_read" ON reel_likes FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Index for fast per-reel count queries
CREATE INDEX IF NOT EXISTS reel_likes_reel_id ON reel_likes(reel_id);
CREATE INDEX IF NOT EXISTS reel_likes_user_id ON reel_likes(user_id);

-- Ensure reels table has likes_count (safe — no-op if already present)
ALTER TABLE reels ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;
