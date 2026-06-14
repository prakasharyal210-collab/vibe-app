-- Step 2 Media Handling — Missing Tables Migration
-- Run this in: Supabase Dashboard → SQL Editor
-- All statements are idempotent (IF NOT EXISTS / OR REPLACE).

-- ─── 1. scoring_config ────────────────────────────────────────────────────────
-- Stores A/B-tunable algorithm weights so they can be changed without a deploy.
-- The application reads these at query time and falls back to hardcoded defaults
-- if the table is empty.
CREATE TABLE IF NOT EXISTS scoring_config (
  key         TEXT    PRIMARY KEY,       -- e.g. 'weight_like', 'decay_per_hour'
  value       FLOAT   NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default weights (match the hardcoded values in calculate_post_score /
-- calculate_reel_score so a live migration produces no change in ranking).
INSERT INTO scoring_config (key, value, description) VALUES
  ('weight_like',          1.0,  'Points per like'),
  ('weight_comment',       3.0,  'Points per comment'),
  ('weight_share',         5.0,  'Points per share'),
  ('weight_save',          4.0,  'Points per save'),
  ('weight_watch_ratio',  10.0,  'Points per unit watch-completion ratio (reels only)'),
  ('decay_per_hour',       0.5,  'Score decay per hour of age'),
  ('new_creator_mult',     1.5,  'Score multiplier for new-creator posts (< 30 days or < 10 posts)'),
  ('explore_boost',        2.0,  'Score multiplier for posts under 2 hours old')
ON CONFLICT (key) DO NOTHING;

-- ─── 2. post_hashtags ─────────────────────────────────────────────────────────
-- Join table for indexed hashtag lookup on posts.
-- Replaces ILIKE '%#tag%' scans with an indexed FK join.
CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id    UUID REFERENCES posts(id)    ON DELETE CASCADE,
  hashtag    TEXT NOT NULL,
  PRIMARY KEY (post_id, hashtag)
);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag ON post_hashtags (hashtag);

-- ─── 3. post_shares ───────────────────────────────────────────────────────────
-- Persists the share signal so it can feed the ranking algorithm.
CREATE TABLE IF NOT EXISTS post_shares (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     UUID        REFERENCES posts(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  shared_to   TEXT,                        -- 'direct', 'story', 'external', etc.
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_shares_post_id ON post_shares (post_id);
CREATE INDEX IF NOT EXISTS idx_post_shares_user_id ON post_shares (user_id);

-- ─── 4. reel_shares ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reel_shares (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id     UUID        REFERENCES reels(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  shared_to   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reel_shares_reel_id ON reel_shares (reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_shares_user_id ON reel_shares (user_id);

-- ─── 5. snap_streaks ─────────────────────────────────────────────────────────
-- Tracks consecutive-day snap exchanges between two users.
CREATE TABLE IF NOT EXISTS snap_streaks (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a          UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  user_b          UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  streak_count    INT         NOT NULL DEFAULT 1,
  last_snap_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours'),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_a, user_b)
);
CREATE INDEX IF NOT EXISTS idx_snap_streaks_user_a ON snap_streaks (user_a);
CREATE INDEX IF NOT EXISTS idx_snap_streaks_user_b ON snap_streaks (user_b);

-- ─── 6. push_notification_log ────────────────────────────────────────────────
-- Delivery + open tracking for push notifications.
CREATE TABLE IF NOT EXISTS push_notification_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT      NOT NULL,    -- 'like', 'comment', 'follow', 'snap', etc.
  title           TEXT,
  body            TEXT,
  data            JSONB,
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_log_user_id  ON push_notification_log (user_id);
CREATE INDEX IF NOT EXISTS idx_push_log_sent_at  ON push_notification_log (sent_at DESC);

-- ─── 7. posts.shares_count / reels.shares_count ──────────────────────────────
-- Ensure denormalised counter columns exist (creator-boost migration adds them
-- IF NOT EXISTS already, but guard again for safety).
ALTER TABLE posts  ADD COLUMN IF NOT EXISTS shares_count INT DEFAULT 0;
ALTER TABLE reels  ADD COLUMN IF NOT EXISTS shares_count INT DEFAULT 0;

-- ─── 8. Trigger: increment posts.shares_count on insert into post_shares ──────
CREATE OR REPLACE FUNCTION increment_post_shares_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE posts SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_post_shares ON post_shares;
CREATE TRIGGER trg_increment_post_shares
  AFTER INSERT ON post_shares
  FOR EACH ROW EXECUTE FUNCTION increment_post_shares_count();

-- ─── 9. Trigger: increment reels.shares_count on insert into reel_shares ──────
CREATE OR REPLACE FUNCTION increment_reel_shares_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE reels SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = NEW.reel_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_reel_shares ON reel_shares;
CREATE TRIGGER trg_increment_reel_shares
  AFTER INSERT ON reel_shares
  FOR EACH ROW EXECUTE FUNCTION increment_reel_shares_count();
