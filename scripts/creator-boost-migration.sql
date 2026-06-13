-- Creator Boost Ranking Migration (idempotent)
-- Adds: score column, watch_events table, scoring functions, pg_cron setup

-- 1. Score column on posts and reels
ALTER TABLE posts ADD COLUMN IF NOT EXISTS score FLOAT DEFAULT 0;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS score FLOAT DEFAULT 0;

-- 2. Engagement columns (in case they don't exist yet)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shares_count INT DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS saves_count INT DEFAULT 0;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS shares_count INT DEFAULT 0;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS saves_count INT DEFAULT 0;

-- 3. Watch events table (tracks per-user reel view durations)
CREATE TABLE IF NOT EXISTS watch_events (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  reel_id     UUID        REFERENCES reels(id)    ON DELETE CASCADE,
  watch_duration FLOAT    NOT NULL,          -- seconds actually watched
  video_duration FLOAT    NOT NULL DEFAULT 14, -- total reel length
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_watch_events_reel_id  ON watch_events (reel_id);
CREATE INDEX IF NOT EXISTS idx_watch_events_user_reel ON watch_events (user_id, reel_id);
CREATE INDEX IF NOT EXISTS idx_posts_score            ON posts (score DESC);
CREATE INDEX IF NOT EXISTS idx_reels_score            ON reels (score DESC);

-- 4. Helper: is this user a "new creator"?
--    Returns true if account < 30 days old OR has fewer than 10 posts
CREATE OR REPLACE FUNCTION is_new_creator(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_post_count  INT;
  v_age_days    FLOAT;
BEGIN
  SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0
    INTO v_age_days
    FROM profiles WHERE id = p_user_id;

  SELECT COUNT(*)
    INTO v_post_count
    FROM posts WHERE user_id = p_user_id;

  RETURN (v_age_days < 30) OR (v_post_count < 10);
END;
$$;

-- 5. Score a single post
--    formula: base = likes + comments*3 + shares*5 + saves*4 - hours*0.5
--             final = base × new_creator_mult × exploration_boost
CREATE OR REPLACE FUNCTION calculate_post_score(p_post_id UUID)
RETURNS FLOAT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_likes          INT;
  v_comments       INT;
  v_shares         INT;
  v_saves          INT;
  v_created_at     TIMESTAMPTZ;
  v_user_id        UUID;
  v_hours_since    FLOAT;
  v_base_score     FLOAT;
  v_creator_mult   FLOAT;
  v_explore_boost  FLOAT;
BEGIN
  SELECT
    COALESCE(likes_count, 0),
    COALESCE(comments_count, 0),
    COALESCE(shares_count, 0),
    COALESCE(saves_count, 0),
    created_at,
    user_id
  INTO v_likes, v_comments, v_shares, v_saves, v_created_at, v_user_id
  FROM posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  v_hours_since := EXTRACT(EPOCH FROM (NOW() - v_created_at)) / 3600.0;

  v_base_score :=
    (v_likes    * 1.0) +
    (v_comments * 3.0) +
    (v_shares   * 5.0) +
    (v_saves    * 4.0) -
    (v_hours_since * 0.5);

  v_creator_mult  := CASE WHEN is_new_creator(v_user_id) THEN 1.5 ELSE 1.0 END;
  v_explore_boost := CASE WHEN v_hours_since < 2.0        THEN 2.0 ELSE 1.0 END;

  RETURN GREATEST(0, v_base_score * v_creator_mult * v_explore_boost);
END;
$$;

-- 6. Score a single reel (same formula + watch_time_ratio × 10)
CREATE OR REPLACE FUNCTION calculate_reel_score(p_reel_id UUID)
RETURNS FLOAT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_likes          INT;
  v_comments       INT;
  v_shares         INT;
  v_saves          INT;
  v_created_at     TIMESTAMPTZ;
  v_user_id        UUID;
  v_hours_since    FLOAT;
  v_watch_ratio    FLOAT;
  v_base_score     FLOAT;
  v_creator_mult   FLOAT;
  v_explore_boost  FLOAT;
BEGIN
  SELECT
    COALESCE(likes_count, 0),
    COALESCE(comments_count, 0),
    COALESCE(shares_count, 0),
    COALESCE(saves_count, 0),
    created_at,
    user_id
  INTO v_likes, v_comments, v_shares, v_saves, v_created_at, v_user_id
  FROM reels
  WHERE id = p_reel_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  -- Average completion ratio across all watch events for this reel
  SELECT COALESCE(
    AVG(LEAST(1.0, watch_duration / NULLIF(video_duration, 0))),
    0
  )
  INTO v_watch_ratio
  FROM watch_events
  WHERE reel_id = p_reel_id AND video_duration > 0;

  v_hours_since := EXTRACT(EPOCH FROM (NOW() - v_created_at)) / 3600.0;

  v_base_score :=
    (v_likes       * 1.0) +
    (v_comments    * 3.0) +
    (v_shares      * 5.0) +
    (v_saves       * 4.0) +
    (v_watch_ratio * 10.0) -   -- watch time is the primary reel signal
    (v_hours_since * 0.5);

  v_creator_mult  := CASE WHEN is_new_creator(v_user_id) THEN 1.5 ELSE 1.0 END;
  v_explore_boost := CASE WHEN v_hours_since < 2.0        THEN 2.0 ELSE 1.0 END;

  RETURN GREATEST(0, v_base_score * v_creator_mult * v_explore_boost);
END;
$$;

-- 7. Batch refresh scores for the last 48 hours (called by the cron job)
CREATE OR REPLACE FUNCTION refresh_recent_scores()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE posts
  SET score = calculate_post_score(id)
  WHERE created_at > NOW() - INTERVAL '48 hours';

  UPDATE reels
  SET score = calculate_reel_score(id)
  WHERE created_at > NOW() - INTERVAL '48 hours';
END;
$$;

-- 8. pg_cron — run every 15 minutes (requires pg_cron extension)
--    Enable in: Supabase Dashboard → Database → Extensions → pg_cron
--    Then run these two lines manually once:
--
--    SELECT cron.schedule('refresh-creator-scores', '*/15 * * * *', 'SELECT refresh_recent_scores()');
--
--    To view:   SELECT * FROM cron.job;
--    To remove: SELECT cron.unschedule('refresh-creator-scores');

-- 9. Seed initial scores for all existing recent content
SELECT refresh_recent_scores();
