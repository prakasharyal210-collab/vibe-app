-- Vibe core mechanics: ensure proper indexes and constraints
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)

-- 1. vibe_swipes: ensure unique constraint for upsert conflict target
ALTER TABLE vibe_swipes
  DROP CONSTRAINT IF EXISTS vibe_swipes_user_id_target_id_key;
ALTER TABLE vibe_swipes
  ADD CONSTRAINT vibe_swipes_user_id_target_id_key UNIQUE (user_id, target_id);

-- 2. vibe_swipes: index for fast "has target already right-swiped me?" lookup
CREATE INDEX IF NOT EXISTS vibe_swipes_target_swiper_idx
  ON vibe_swipes(user_id, target_id, direction);

-- 3. vibe_swipes: index for fast "what have I already swiped?" lookup
CREATE INDEX IF NOT EXISTS vibe_swipes_user_all_idx
  ON vibe_swipes(user_id);

-- 4. vibe_matches: ensure both (A→B) and (B→A) rows can coexist for symmetric lookup
ALTER TABLE vibe_matches
  DROP CONSTRAINT IF EXISTS vibe_matches_sender_id_receiver_id_key;
ALTER TABLE vibe_matches
  ADD CONSTRAINT vibe_matches_sender_id_receiver_id_key UNIQUE (sender_id, receiver_id);

-- 5. Add created_at to vibe_matches if missing
ALTER TABLE vibe_matches
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 6. vibe_requests: ensure unique constraint for upsert
ALTER TABLE vibe_requests
  DROP CONSTRAINT IF EXISTS vibe_requests_sender_id_receiver_id_key;
ALTER TABLE vibe_requests
  ADD CONSTRAINT vibe_requests_sender_id_receiver_id_key UNIQUE (sender_id, receiver_id);
