-- ============================================================
-- Enhancement #2: Search / discovery ranking
-- Run in Supabase SQL Editor (independent — no prerequisites)
-- ============================================================

-- 1. get_suggested_accounts — personalized discovery when search query is empty
--    Ranked by:
--      1. Mutual followers count (followed-by-people-you-follow)
--      2. Follower count (popularity)
--      3. Most recently posted (recently active)
CREATE OR REPLACE FUNCTION public.get_suggested_accounts(
  p_user_id UUID,
  p_limit   INT DEFAULT 20
)
RETURNS SETOF public.profiles
LANGUAGE sql STABLE
AS $$
  SELECT p.*
  FROM public.profiles p
  WHERE
    -- Exclude the viewer themselves
    p.id != p_user_id
    -- Exclude accounts the viewer already follows
    AND NOT EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.follower_id  = p_user_id
        AND f.following_id = p.id
    )
  ORDER BY
    -- 1. Mutual followers: count of (people viewer follows) who also follow this profile
    (
      SELECT COUNT(*)
      FROM public.follows f1
      JOIN public.follows f2 ON f1.following_id = f2.follower_id
      WHERE f1.follower_id  = p_user_id
        AND f2.following_id = p.id
    ) DESC,
    -- 2. Follower count (popularity)
    COALESCE(p.followers_count, 0) DESC,
    -- 3. Most recently active (has recent posts)
    (
      SELECT MAX(created_at)
      FROM public.posts
      WHERE user_id = p.id
    ) DESC NULLS LAST
  LIMIT p_limit;
$$;

-- 2. search_accounts_ranked — keyword search with mutual-followers tiebreaker
--    Used when the search query is non-empty and a viewer_id is provided.
CREATE OR REPLACE FUNCTION public.search_accounts_ranked(
  p_user_id UUID,
  p_query   TEXT,
  p_limit   INT DEFAULT 20
)
RETURNS SETOF public.profiles
LANGUAGE sql STABLE
AS $$
  SELECT p.*
  FROM public.profiles p
  WHERE
    p.id != p_user_id
    AND (
      p.username  ILIKE '%' || p_query || '%'
      OR p.full_name ILIKE '%' || p_query || '%'
    )
  ORDER BY
    -- Exact match floats to top
    CASE WHEN lower(p.username) = lower(p_query) THEN 0 ELSE 1 END,
    -- Mutual followers tiebreaker
    (
      SELECT COUNT(*)
      FROM public.follows f1
      JOIN public.follows f2 ON f1.following_id = f2.follower_id
      WHERE f1.follower_id  = p_user_id
        AND f2.following_id = p.id
    ) DESC,
    -- Popularity fallback
    COALESCE(p.followers_count, 0) DESC
  LIMIT p_limit;
$$;

-- ── Done ─────────────────────────────────────────────────────────────────────
-- The API server calls these RPCs:
--   Empty query + viewer_id  → get_suggested_accounts(viewer_id, limit)
--   Non-empty + viewer_id    → search_accounts_ranked(viewer_id, query, limit)
--   Non-empty + no viewer_id → fallback to ilike on profiles table (existing)
