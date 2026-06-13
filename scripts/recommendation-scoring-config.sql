-- ============================================================
-- Enhancement #3: A/B-testable scoring_config table
-- Run FIRST in Supabase SQL Editor
-- ============================================================

-- 1. scoring_config table
CREATE TABLE IF NOT EXISTS public.scoring_config (
  key   TEXT  PRIMARY KEY,
  value FLOAT NOT NULL
);

-- Seed default values; existing rows are left unchanged (ON CONFLICT DO NOTHING)
INSERT INTO public.scoring_config (key, value) VALUES
  ('new_creator_multiplier',   1.5),
  ('exploration_boost',        2.0),
  ('exploration_window_hours', 2.0),
  ('like_weight',              1.0),
  ('comment_weight',           3.0),
  ('share_weight',             5.0),
  ('save_weight',              4.0),
  ('watch_time_weight',        10.0),
  ('affinity_boost_factor',    0.4),
  ('affinity_cap',             2.0)
ON CONFLICT (key) DO NOTHING;

-- 2. get_config() helper — fast STABLE lookup with default fallback
CREATE OR REPLACE FUNCTION public.get_config(p_key TEXT, p_default FLOAT DEFAULT 0.0)
RETURNS FLOAT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE((SELECT value FROM public.scoring_config WHERE key = p_key), p_default);
$$;

-- 3. calculate_post_score — reads weights from scoring_config
CREATE OR REPLACE FUNCTION public.calculate_post_score(p_post_id UUID)
RETURNS FLOAT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_likes         INT;
  v_comments      INT;
  v_shares        INT;
  v_saves         INT;
  v_created_at    TIMESTAMPTZ;
  v_user_id       UUID;
  v_hours_since   FLOAT;
  v_base_score    FLOAT;
  v_creator_mult  FLOAT;
  v_explore_boost FLOAT;
  -- Config
  v_like_w        FLOAT := get_config('like_weight',              1.0);
  v_comment_w     FLOAT := get_config('comment_weight',           3.0);
  v_share_w       FLOAT := get_config('share_weight',             5.0);
  v_save_w        FLOAT := get_config('save_weight',              4.0);
  v_new_mult      FLOAT := get_config('new_creator_multiplier',   1.5);
  v_exp_boost     FLOAT := get_config('exploration_boost',        2.0);
  v_exp_window    FLOAT := get_config('exploration_window_hours', 2.0);
BEGIN
  SELECT
    COALESCE(likes_count,    0),
    COALESCE(comments_count, 0),
    COALESCE(shares_count,   0),
    COALESCE(saves_count,    0),
    created_at, user_id
  INTO v_likes, v_comments, v_shares, v_saves, v_created_at, v_user_id
  FROM public.posts WHERE id = p_post_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  v_hours_since := EXTRACT(EPOCH FROM (NOW() - v_created_at)) / 3600.0;

  v_base_score :=
    (v_likes    * v_like_w) +
    (v_comments * v_comment_w) +
    (v_shares   * v_share_w) +
    (v_saves    * v_save_w) -
    (v_hours_since * 0.5);

  v_creator_mult  := CASE WHEN is_new_creator(v_user_id) THEN v_new_mult  ELSE 1.0 END;
  v_explore_boost := CASE WHEN v_hours_since < v_exp_window THEN v_exp_boost ELSE 1.0 END;

  RETURN GREATEST(0, v_base_score * v_creator_mult * v_explore_boost);
END;
$$;

-- 4. calculate_reel_score — reads weights from scoring_config
CREATE OR REPLACE FUNCTION public.calculate_reel_score(p_reel_id UUID)
RETURNS FLOAT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_likes         INT;
  v_comments      INT;
  v_shares        INT;
  v_saves         INT;
  v_created_at    TIMESTAMPTZ;
  v_user_id       UUID;
  v_hours_since   FLOAT;
  v_watch_ratio   FLOAT;
  v_base_score    FLOAT;
  v_creator_mult  FLOAT;
  v_explore_boost FLOAT;
  -- Config
  v_like_w        FLOAT := get_config('like_weight',              1.0);
  v_comment_w     FLOAT := get_config('comment_weight',           3.0);
  v_share_w       FLOAT := get_config('share_weight',             5.0);
  v_save_w        FLOAT := get_config('save_weight',              4.0);
  v_watch_w       FLOAT := get_config('watch_time_weight',        10.0);
  v_new_mult      FLOAT := get_config('new_creator_multiplier',   1.5);
  v_exp_boost     FLOAT := get_config('exploration_boost',        2.0);
  v_exp_window    FLOAT := get_config('exploration_window_hours', 2.0);
BEGIN
  SELECT
    COALESCE(likes_count,    0),
    COALESCE(comments_count, 0),
    COALESCE(shares_count,   0),
    COALESCE(saves_count,    0),
    created_at, user_id
  INTO v_likes, v_comments, v_shares, v_saves, v_created_at, v_user_id
  FROM public.reels WHERE id = p_reel_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT COALESCE(
    AVG(LEAST(1.0, watch_duration / NULLIF(video_duration, 0))),
    0
  )
  INTO v_watch_ratio
  FROM public.watch_events
  WHERE reel_id = p_reel_id AND video_duration > 0;

  v_hours_since := EXTRACT(EPOCH FROM (NOW() - v_created_at)) / 3600.0;

  v_base_score :=
    (v_likes       * v_like_w) +
    (v_comments    * v_comment_w) +
    (v_shares      * v_share_w) +
    (v_saves       * v_save_w) +
    (v_watch_ratio * v_watch_w) -
    (v_hours_since * 0.5);

  v_creator_mult  := CASE WHEN is_new_creator(v_user_id) THEN v_new_mult  ELSE 1.0 END;
  v_explore_boost := CASE WHEN v_hours_since < v_exp_window THEN v_exp_boost ELSE 1.0 END;

  RETURN GREATEST(0, v_base_score * v_creator_mult * v_explore_boost);
END;
$$;

-- 5. get_for_you_feed_v2 — reads affinity params from scoring_config
CREATE OR REPLACE FUNCTION public.get_for_you_feed_v2(
  p_user_id UUID,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS SETOF public.posts
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_affinity_boost FLOAT := get_config('affinity_boost_factor', 0.4);
  v_affinity_cap   FLOAT := get_config('affinity_cap',          2.0);
  v_hide_threshold FLOAT := -1.5;
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM public.posts p
  WHERE
    NOT EXISTS (
      SELECT 1 FROM public.user_interests ui
      WHERE ui.user_id     = p_user_id
        AND ui.interest_key = 'creator:' || p.user_id::TEXT
        AND ui.weight       < v_hide_threshold
    )
  ORDER BY
    p.score * (
      1.0 + COALESCE(
        (
          SELECT LEAST(v_affinity_cap, GREATEST(0.0, ui.weight))
          FROM public.user_interests ui
          WHERE ui.user_id     = p_user_id
            AND ui.interest_key = 'creator:' || p.user_id::TEXT
        ),
        0.0
      ) * v_affinity_boost
    ) DESC,
    p.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- 6. get_for_you_reels_v2 — reads affinity params from scoring_config
CREATE OR REPLACE FUNCTION public.get_for_you_reels_v2(
  p_user_id UUID,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS SETOF public.reels
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_affinity_boost FLOAT := get_config('affinity_boost_factor', 0.4);
  v_affinity_cap   FLOAT := get_config('affinity_cap',          2.0);
  v_hide_threshold FLOAT := -1.5;
BEGIN
  RETURN QUERY
  SELECT r.*
  FROM public.reels r
  WHERE
    NOT EXISTS (
      SELECT 1 FROM public.user_interests ui
      WHERE ui.user_id     = p_user_id
        AND ui.interest_key = 'creator:' || r.user_id::TEXT
        AND ui.weight       < v_hide_threshold
    )
  ORDER BY
    r.score * (
      1.0 + COALESCE(
        (
          SELECT LEAST(v_affinity_cap, GREATEST(0.0, ui.weight))
          FROM public.user_interests ui
          WHERE ui.user_id     = p_user_id
            AND ui.interest_key = 'creator:' || r.user_id::TEXT
        ),
        0.0
      ) * v_affinity_boost
    ) DESC,
    r.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ── Done ─────────────────────────────────────────────────────────────────────
-- Tune via: UPDATE public.scoring_config SET value = X WHERE key = 'Y';
-- Example:  UPDATE public.scoring_config SET value = 0.6 WHERE key = 'affinity_boost_factor';
