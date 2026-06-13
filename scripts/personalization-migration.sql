-- ============================================================
-- Personalization / Recommendation System Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. user_interests — per-user affinity to creators (and future: categories)
--    interest_key format: "creator:{uuid}"
--    weight: positive = boost, negative = reduce/hide
CREATE TABLE IF NOT EXISTS public.user_interests (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interest_key TEXT NOT NULL,
  weight       FLOAT NOT NULL DEFAULT 1.0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, interest_key)
);

CREATE INDEX IF NOT EXISTS user_interests_user_idx ON public.user_interests (user_id);
CREATE INDEX IF NOT EXISTS user_interests_key_idx  ON public.user_interests (user_id, interest_key);

-- Enable RLS (API server uses service role key, which bypasses RLS)
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own interests" ON public.user_interests;
CREATE POLICY "Users read own interests"
  ON public.user_interests FOR SELECT USING (auth.uid() = user_id);

-- 2. record_engagement — upsert a delta into user_interests, clamped
CREATE OR REPLACE FUNCTION public.record_engagement(
  p_user_id    UUID,
  p_target_key TEXT,
  p_delta      FLOAT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_interests (user_id, interest_key, weight, updated_at)
  VALUES (p_user_id, p_target_key, LEAST(10.0, GREATEST(-5.0, p_delta)), NOW())
  ON CONFLICT (user_id, interest_key) DO UPDATE
    SET weight     = LEAST(10.0, GREATEST(-5.0, public.user_interests.weight + EXCLUDED.weight)),
        updated_at = NOW();
END;
$$;

-- 3. get_for_you_feed_v2 — personalized post feed
--    • Boosts posts from creators the user frequently engages with
--    • Filters out creators the user has actively hidden (weight < -1.5)
--    • Falls through to existing `score` as the base ranking signal
CREATE OR REPLACE FUNCTION public.get_for_you_feed_v2(
  p_user_id UUID,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS SETOF public.posts
LANGUAGE sql STABLE
AS $$
  SELECT p.*
  FROM public.posts p
  WHERE
    -- Visibility filter
    (p.visibility = 'public' OR p.visibility IS NULL)

    -- Exclude creators the user has hidden / disliked
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_interests ui
      WHERE ui.user_id   = p_user_id
        AND ui.interest_key = 'creator:' || p.user_id::TEXT
        AND ui.weight    < -1.5
    )

  ORDER BY
    -- Personalized score = base score × (1 + affinity_boost × 0.4)
    -- affinity_boost is clamped [0, 2] — only positive weights boost
    p.score * (
      1.0 + COALESCE(
        (
          SELECT LEAST(2.0, GREATEST(0.0, ui.weight))
          FROM public.user_interests ui
          WHERE ui.user_id     = p_user_id
            AND ui.interest_key = 'creator:' || p.user_id::TEXT
        ),
        0.0
      ) * 0.4
    ) DESC,
    p.created_at DESC

  LIMIT  p_limit
  OFFSET p_offset;
$$;

-- 4. get_for_you_reels_v2 — personalized reel feed (same logic)
CREATE OR REPLACE FUNCTION public.get_for_you_reels_v2(
  p_user_id UUID,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS SETOF public.reels
LANGUAGE sql STABLE
AS $$
  SELECT r.*
  FROM public.reels r
  WHERE
    NOT EXISTS (
      SELECT 1
      FROM public.user_interests ui
      WHERE ui.user_id    = p_user_id
        AND ui.interest_key = 'creator:' || r.user_id::TEXT
        AND ui.weight     < -1.5
    )
  ORDER BY
    r.score * (
      1.0 + COALESCE(
        (
          SELECT LEAST(2.0, GREATEST(0.0, ui.weight))
          FROM public.user_interests ui
          WHERE ui.user_id     = p_user_id
            AND ui.interest_key = 'creator:' || r.user_id::TEXT
        ),
        0.0
      ) * 0.4
    ) DESC,
    r.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;

-- 5. Seed initial affinity from existing follows
--    (followed creators start with weight = 1.0 social graph signal)
INSERT INTO public.user_interests (user_id, interest_key, weight, updated_at)
SELECT
  f.follower_id,
  'creator:' || f.following_id::TEXT,
  1.0,
  NOW()
FROM public.follows f
ON CONFLICT (user_id, interest_key) DO NOTHING;
