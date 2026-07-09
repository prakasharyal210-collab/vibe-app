-- ============================================================
-- For You Feed v3 — explicit follow-graph boost + category affinity
-- Run in Supabase SQL Editor (idempotent, safe to re-run)
--
-- Builds on top of the existing personalization system
-- (scoring_config, posts.score, user_interests, get_for_you_feed_v2)
-- from personalization-migration.sql / recommendation-scoring-config.sql.
-- It does NOT touch those functions — v2 remains untouched as a fallback.
--
-- Why a new v3 instead of extending v2:
--   get_for_you_feed_v2's category-affinity branch reads posts.categories
--   (a TEXT[] column) and calls extract_categories(), neither of which has
--   ever been deployed to this project's Supabase instance (confirmed via
--   direct query: posts.categories is NULL on every row, extract_categories
--   does not exist in the schema cache). v2 has therefore only ever been
--   running its creator-affinity term in production; the category term is
--   silently a no-op. v3 instead uses the `category` (singular TEXT) column,
--   which IS populated on every post and already used for feed filtering.
-- ============================================================

-- 1. New tunable weights (idempotent — leaves existing rows untouched)
INSERT INTO public.scoring_config (key, value) VALUES
  ('follow_boost_multiplier',   3.0),
  ('category_boost_multiplier', 1.5)
ON CONFLICT (key) DO NOTHING;

-- 2. get_for_you_feed_v3
--    final_order_score = p.score
--                         × (follow_boost_multiplier   if author is followed, else 1)
--                         × (category_boost_multiplier if p.category is one of the
--                            requesting user's top-3 most-liked categories, else 1)
--
--    p.score already encodes engagement (likes/comments/shares/saves) and
--    recency decay (see calculate_post_score in creator-boost-migration.sql /
--    recommendation-scoring-config.sql) — v3 does not recompute decay, it only
--    re-weights that existing score by social-graph + interest signals so we
--    never double-penalize recency.
--
--    Top-3 liked categories are computed live from the `likes` table joined
--    to `posts.category` — no ML, just a COUNT/GROUP BY/LIMIT 3, matching the
--    "simple count, not ML" instruction.
CREATE OR REPLACE FUNCTION public.get_for_you_feed_v3(
  p_user_id UUID,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS SETOF public.posts
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_follow_boost   FLOAT := get_config('follow_boost_multiplier',   3.0);
  v_category_boost FLOAT := get_config('category_boost_multiplier', 1.5);
BEGIN
  RETURN QUERY
  WITH my_follows AS (
    SELECT following_id
    FROM public.follows
    WHERE follower_id = p_user_id
  ),
  top_categories AS (
    SELECT p2.category
    FROM public.likes l
    JOIN public.posts p2 ON p2.id = l.post_id
    WHERE l.user_id = p_user_id
      AND p2.category IS NOT NULL
    GROUP BY p2.category
    ORDER BY COUNT(*) DESC
    LIMIT 3
  )
  SELECT p.*
  FROM public.posts p
  WHERE
    -- Same hide/mute rule as v2: creators the user has actively disliked
    NOT EXISTS (
      SELECT 1 FROM public.user_interests ui
      WHERE ui.user_id     = p_user_id
        AND ui.interest_key = 'creator:' || p.user_id::TEXT
        AND ui.weight       < -1.5
    )
    AND (p.is_archived IS NOT TRUE)

  ORDER BY
    p.score
      * (CASE WHEN p.user_id IN (SELECT following_id FROM my_follows)
              THEN v_follow_boost ELSE 1.0 END)
      * (CASE WHEN p.category IN (SELECT category FROM top_categories)
              THEN v_category_boost ELSE 1.0 END)
    DESC,
    p.created_at DESC

  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- 3. Score freshness note (not automated by this script — informational only)
--    Only a handful of posts currently have a non-zero `score` because the
--    refresh_recent_scores() cron documented in creator-boost-migration.sql
--    does not appear to be scheduled. v3's ranking is only as good as
--    posts.score is fresh. To activate recurring refresh (needs pg_cron
--    extension enabled in Supabase Dashboard → Database → Extensions):
--
--    SELECT cron.schedule('refresh-creator-scores', '*/15 * * * *', 'SELECT refresh_recent_scores()');
--
--    Until that's scheduled, you can manually refresh at any time with:
--    SELECT refresh_recent_scores();

-- ── Done ─────────────────────────────────────────────────────────────────────
-- Tune via: UPDATE public.scoring_config SET value = X WHERE key = 'follow_boost_multiplier';
--       or: UPDATE public.scoring_config SET value = X WHERE key = 'category_boost_multiplier';
