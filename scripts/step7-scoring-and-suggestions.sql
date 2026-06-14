-- ─────────────────────────────────────────────────────────────────────────────
-- Step 7: Discovery / Scoring polish
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. get_suggested_accounts ─────────────────────────────────────────────────
-- Ranks people the viewer doesn't yet follow by:
--   1) mutual followers count  (people both parties follow)
--   2) candidate followers_count (popularity tie-breaker)
--   3) recent activity          (has posted in the last 30 days)
-- Excludes: self, already-followed, and blocked users.

CREATE OR REPLACE FUNCTION public.get_suggested_accounts(
  p_user_id uuid,
  p_limit   int DEFAULT 10
)
RETURNS TABLE (
  id              uuid,
  username        text,
  full_name       text,
  avatar_url      text,
  followers_count int,
  is_verified     bool,
  mutual_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH
    my_following AS (
      SELECT following_id FROM follows WHERE follower_id = p_user_id
    ),
    blocked AS (
      SELECT blocked_id AS uid FROM blocks WHERE blocker_id = p_user_id
      UNION ALL
      SELECT blocker_id AS uid FROM blocks WHERE blocked_id = p_user_id
    ),
    -- People followed by someone I follow who I don't yet follow
    mutual_candidates AS (
      SELECT
        f.following_id                  AS candidate_id,
        COUNT(*)                        AS mutual_count
      FROM follows f
      WHERE f.follower_id IN (SELECT following_id FROM my_following)
        AND f.following_id <> p_user_id
        AND f.following_id NOT IN (SELECT following_id FROM my_following)
        AND f.following_id NOT IN (SELECT uid FROM blocked)
      GROUP BY f.following_id
    ),
    recent_posters AS (
      SELECT DISTINCT user_id FROM posts WHERE created_at > now() - interval '30 days'
      UNION
      SELECT DISTINCT user_id FROM reels WHERE created_at > now() - interval '30 days'
    )
  SELECT
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    COALESCE(p.followers_count, 0)::int   AS followers_count,
    COALESCE(p.is_verified, false)         AS is_verified,
    COALESCE(mc.mutual_count, 0)           AS mutual_count
  FROM profiles p
  LEFT JOIN mutual_candidates mc  ON mc.candidate_id = p.id
  LEFT JOIN recent_posters    rp  ON rp.user_id      = p.id
  WHERE p.id <> p_user_id
    AND p.id NOT IN (SELECT following_id FROM my_following)
    AND p.id NOT IN (SELECT uid FROM blocked)
  ORDER BY
    COALESCE(mc.mutual_count, 0) DESC,
    COALESCE(p.followers_count,  0) DESC,
    (rp.user_id IS NOT NULL) DESC
  LIMIT p_limit;
$$;

-- ── 2. search_accounts_ranked ─────────────────────────────────────────────────
-- Keyword search with mutual-followers as tie-breaker (used when viewer types
-- in the search box on Find screen).

CREATE OR REPLACE FUNCTION public.search_accounts_ranked(
  p_user_id uuid,
  p_query   text,
  p_limit   int DEFAULT 20
)
RETURNS TABLE (
  id              uuid,
  username        text,
  full_name       text,
  avatar_url      text,
  followers_count int,
  is_verified     bool,
  mutual_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH
    my_following AS (
      SELECT following_id FROM follows WHERE follower_id = p_user_id
    ),
    blocked AS (
      SELECT blocked_id AS uid FROM blocks WHERE blocker_id = p_user_id
      UNION ALL
      SELECT blocker_id AS uid FROM blocks WHERE blocked_id = p_user_id
    ),
    mutual_counts AS (
      SELECT
        f2.following_id                 AS candidate_id,
        COUNT(*)                        AS mutual_count
      FROM follows f2
      WHERE f2.follower_id IN (SELECT following_id FROM my_following)
      GROUP BY f2.following_id
    )
  SELECT
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    COALESCE(p.followers_count, 0)::int AS followers_count,
    COALESCE(p.is_verified, false)       AS is_verified,
    COALESCE(mc.mutual_count, 0)         AS mutual_count
  FROM profiles p
  LEFT JOIN mutual_counts mc ON mc.candidate_id = p.id
  WHERE p.id <> p_user_id
    AND p.id NOT IN (SELECT uid FROM blocked)
    AND (
      p.username  ILIKE '%' || p_query || '%'
      OR p.full_name ILIKE '%' || p_query || '%'
    )
  ORDER BY
    COALESCE(mc.mutual_count, 0) DESC,
    COALESCE(p.followers_count, 0) DESC
  LIMIT p_limit;
$$;

-- ── 3. scoring_config sanity check ────────────────────────────────────────────
-- This no-op UPDATE verifies:
--   a) scoring_config table exists and is writable
--   b) RPCs (get_for_you_feed_v2, etc.) will pick up the row on next call
--      because they do a live SELECT — no caching.
-- Expected: "UPDATE 1" if the recommendation-scoring-config.sql was already run.

UPDATE public.scoring_config
  SET value = value
  WHERE key = 'weight_like';

-- If the table doesn't exist yet, run scripts/recommendation-scoring-config.sql first.
-- To tune a weight: UPDATE public.scoring_config SET value = 0.8 WHERE key = 'weight_like';
