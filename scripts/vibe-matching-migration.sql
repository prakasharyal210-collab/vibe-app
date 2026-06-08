-- ===========================================================================
-- Vibe Smart Matching: Migration
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/tatroqgcyebuqqkhmvpa/sql/new
-- ===========================================================================

-- 1. vibe_swipes — tracks every directional swipe (left / right / super)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vibe_swipes (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL,
  target_id   uuid        NOT NULL,
  direction   text        NOT NULL CHECK (direction IN ('left', 'right', 'super')),
  created_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, target_id)
);

ALTER TABLE vibe_swipes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vibe_swipes' AND policyname = 'users_own_swipes_insert'
  ) THEN
    CREATE POLICY users_own_swipes_insert ON vibe_swipes
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vibe_swipes' AND policyname = 'users_own_swipes_select'
  ) THEN
    CREATE POLICY users_own_swipes_select ON vibe_swipes
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vibe_swipes' AND policyname = 'users_own_swipes_update'
  ) THEN
    CREATE POLICY users_own_swipes_update ON vibe_swipes
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS vibe_swipes_user_idx ON vibe_swipes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vibe_swipes_target_idx ON vibe_swipes (target_id);

-- 2. vibe_scores — cached computed compatibility scores
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vibe_scores (
  user_id     uuid        NOT NULL,
  target_id   uuid        NOT NULL,
  score       integer     NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  computed_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, target_id)
);

ALTER TABLE vibe_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vibe_scores' AND policyname = 'users_own_scores_all'
  ) THEN
    CREATE POLICY users_own_scores_all ON vibe_scores
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. get_vibe_matches — smart 100-pt scoring algorithm
-- ─────────────────────────────────────────────────────────────────────────
-- Score breakdown:
--   Interests match   30 pts  (shared / max(mine, theirs) × 30)
--   Goal match        25 pts  (same looking_for)
--   Age compatibility 15 pts  (15 − |age_diff|, min 0)
--   Location          15 pts  (fixed 7 until GPS added; 15 if online)
--   Activity          10 pts  (10 if is_online, 4 otherwise)
--   Profile complete   5 pts  (avatar 2, bio 2, interests 1)
--
-- Ordering boosts (additive, capped to 100 total):
--   New-user boost    +15 pts (profiles created in last 48h)
--   Avatar boost      +10 pts (visibility)
--   Bio boost          +5 pts (visibility)
--   Online now         +5 pts (visibility)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_vibe_matches(
  p_user_id        uuid,
  p_interested_in  text[]  DEFAULT '{}',
  p_looking_for    text    DEFAULT NULL,
  p_age_min        integer DEFAULT 18,
  p_age_max        integer DEFAULT 99,
  p_max_distance_km float  DEFAULT 100
)
RETURNS TABLE(
  user_id           uuid,
  display_name      text,
  username          text,
  avatar_url        text,
  bio               text,
  age               integer,
  gender            text,
  interests         text[],
  looking_for       text,
  vibe_score        integer,
  is_online         boolean,
  is_verified       boolean,
  distance_km       float,
  shared_interests  text[],
  compatibility_score integer,
  vibe_type         text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH
  -- Pull the requester's profile for scoring
  my_profile AS (
    SELECT
      COALESCE(p.interests, '{}') AS my_interests,
      p.age                        AS my_age,
      p.looking_for                AS my_goal
    FROM profiles p
    WHERE p.id = p_user_id
  ),
  -- All IDs already swiped on, already matched, or pending request sent
  excluded AS (
    SELECT target_id AS ex_id
    FROM   vibe_swipes
    WHERE  user_id = p_user_id

    UNION

    SELECT matched_user_id
    FROM   vibe_matches
    WHERE  user_id = p_user_id

    UNION

    SELECT receiver_id
    FROM   vibe_requests
    WHERE  sender_id = p_user_id
      AND  status    = 'pending'
  ),
  -- Score every eligible candidate
  scored AS (
    SELECT
      p.id,
      p.display_name,
      p.username,
      p.avatar_url,
      p.bio,
      p.age,
      p.gender,
      COALESCE(p.interests, '{}')  AS interests,
      p.looking_for,
      COALESCE(p.vibe_score, 0)    AS raw_vibe_score,
      COALESCE(p.is_online, false) AS is_online,
      COALESCE(p.is_verified, false) AS is_verified,
      p.created_at,

      -- shared interests array
      ARRAY(
        SELECT unnest(COALESCE(p.interests, '{}'))
        INTERSECT
        SELECT unnest(mp.my_interests)
      ) AS shared_ints,

      -- ── Interest score: 30 pts max ─────────────────────────────────
      LEAST(
        CASE
          WHEN cardinality(COALESCE(p.interests, '{}')) > 0
               AND cardinality(mp.my_interests) > 0
          THEN (
            SELECT COUNT(*)::integer
            FROM (
              SELECT unnest(COALESCE(p.interests, '{}'))
              INTERSECT
              SELECT unnest(mp.my_interests)
            ) si
          ) * 30 / GREATEST(cardinality(mp.my_interests), 1)
          ELSE 0
        END,
        30
      ) AS interest_score,

      -- ── Goal match: 25 pts ─────────────────────────────────────────
      CASE
        WHEN mp.my_goal IS NOT NULL
             AND p.looking_for = mp.my_goal THEN 25
        ELSE 0
      END AS goal_score,

      -- ── Age compatibility: 15 pts (lose 1 pt per year of diff) ────
      CASE
        WHEN mp.my_age IS NOT NULL AND p.age IS NOT NULL
        THEN GREATEST(0, 15 - ABS(p.age - mp.my_age))
        ELSE 8
      END AS age_score,

      -- ── Location: 15 pts (no GPS yet — 7 base, 15 if online) ─────
      CASE WHEN COALESCE(p.is_online, false) THEN 15 ELSE 7 END AS location_score,

      -- ── Activity: 10 pts ──────────────────────────────────────────
      CASE WHEN COALESCE(p.is_online, false) THEN 10 ELSE 4 END AS activity_score,

      -- ── Profile completeness: 5 pts ───────────────────────────────
      (
        CASE WHEN p.avatar_url IS NOT NULL AND p.avatar_url <> '' THEN 2 ELSE 0 END
        + CASE WHEN p.bio      IS NOT NULL AND p.bio      <> '' THEN 2 ELSE 0 END
        + CASE WHEN cardinality(COALESCE(p.interests, '{}')) > 0 THEN 1 ELSE 0 END
      ) AS completeness_score,

      -- ── Ordering boosts (capped by LEAST below) ───────────────────
      CASE WHEN p.created_at >= NOW() - INTERVAL '48 hours' THEN 15 ELSE 0 END AS new_user_boost,
      (
        CASE WHEN p.avatar_url IS NOT NULL AND p.avatar_url <> '' THEN 10 ELSE 0 END
        + CASE WHEN p.bio      IS NOT NULL AND p.bio      <> '' THEN  5 ELSE 0 END
        + CASE WHEN COALESCE(p.is_online, false)                 THEN  5 ELSE 0 END
      ) AS visibility_bonus

    FROM profiles p, my_profile mp
    WHERE p.id <> p_user_id
      -- only show people who opted in
      AND COALESCE(p.show_in_matching, false) = true
      -- exclude already seen / matched / requested
      AND p.id NOT IN (SELECT ex_id FROM excluded)
      -- age filter
      AND (p.age IS NULL OR (p.age >= p_age_min AND p.age <= p_age_max))
      -- gender filter (empty array = show all)
      AND (
        cardinality(COALESCE(p_interested_in, '{}')) = 0
        OR p.gender = ANY(p_interested_in)
      )
      -- goal filter
      AND (p_looking_for IS NULL OR p.looking_for = p_looking_for)
  ),
  -- Compute final capped score
  final AS (
    SELECT
      s.*,
      LEAST(
        s.interest_score + s.goal_score + s.age_score + s.location_score
        + s.activity_score + s.completeness_score
        + s.new_user_boost + s.visibility_bonus,
        100
      ) AS final_score
    FROM scored s
  )
  SELECT
    f.id              AS user_id,
    f.display_name,
    f.username,
    f.avatar_url,
    f.bio,
    f.age,
    f.gender,
    f.interests,
    f.looking_for,
    f.final_score     AS vibe_score,
    f.is_online,
    f.is_verified,
    NULL::float       AS distance_km,
    f.shared_ints     AS shared_interests,
    f.final_score     AS compatibility_score,
    NULL::text        AS vibe_type
  FROM final f
  ORDER BY
    f.final_score DESC,
    f.is_online   DESC,
    f.created_at  DESC
  LIMIT 50;
$$;

-- Grant execute to authenticated users (SECURITY DEFINER does the actual read)
GRANT EXECUTE ON FUNCTION get_vibe_matches(uuid, text[], text, integer, integer, float)
  TO authenticated, anon;
