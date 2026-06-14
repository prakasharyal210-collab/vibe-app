-- Step 2 Migration FIX — Run this in Supabase SQL Editor
-- Only creates the 3 tables that are still missing.
-- post_hashtags / post_shares / reel_shares already exist — do NOT touch them.

-- ─── 1. scoring_config ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scoring_config (
  key         TEXT    PRIMARY KEY,
  value       FLOAT   NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

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

-- ─── 2. snap_streaks ─────────────────────────────────────────────────────────
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

-- ─── 3. push_notification_log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_notification_log (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT        NOT NULL,
  title             TEXT,
  body              TEXT,
  data              JSONB,
  sent_at           TIMESTAMPTZ DEFAULT NOW(),
  delivered_at      TIMESTAMPTZ,
  opened_at         TIMESTAMPTZ,
  error             TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_log_user_id ON push_notification_log (user_id);
CREATE INDEX IF NOT EXISTS idx_push_log_sent_at ON push_notification_log (sent_at DESC);

-- ─── 4. Ensure shares_count columns exist on posts and reels ─────────────────
ALTER TABLE posts  ADD COLUMN IF NOT EXISTS shares_count INT DEFAULT 0;
ALTER TABLE reels  ADD COLUMN IF NOT EXISTS shares_count INT DEFAULT 0;

-- ─── 5. Trigger: increment posts.shares_count on insert into post_shares ──────
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

-- ─── 6. Trigger: increment reels.shares_count on insert into reel_shares ──────
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
