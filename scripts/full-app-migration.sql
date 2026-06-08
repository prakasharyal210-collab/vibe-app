-- ===========================================================================
-- Gundruk — Full App SQL Migration (canonical, idempotent)
-- Run via Supabase SQL Editor or Management API.
-- Safe to re-run on any fresh Supabase project.
--
-- Tables this migration creates/ensures:
--   blocks, post_tags, vibe_preferences, vibe_requests,
--   vibe_swipes, vibe_compat_scores
--
-- Functions this migration creates/ensures:
--   get_vibe_matches (6-arg, SECURITY DEFINER)
--
-- Tables that already exist in Supabase (no action needed):
--   profiles, posts, reels, stories, comments, reel_comments,
--   likes, follows, reposts, messages, conversations,
--   notifications, search_history, hashtags, hidden_ads,
--   music_tracks, gifts, leaderboard, snaps, favourites,
--   daily_rewards, ad_campaigns, live_streams, wallet,
--   user_settings, user_tab_preferences, user_relationship_goals,
--   restricted_users, vibe_matches, vibe_room_messages,
--   vibe_scores (gamification), content_reports, vibe_room_members
-- ===========================================================================

-- ── 1. blocks ───────────────────────────────────────────────────────────────
-- App code uses: blocker_id, blocked_id, id
-- (blocked_users is a legacy table used by RPCs; blocks is for app code)
CREATE TABLE IF NOT EXISTS blocks (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id  uuid        NOT NULL,
  blocked_id  uuid        NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='blocks' AND policyname='blocks_own') THEN
    CREATE POLICY blocks_own ON blocks FOR ALL USING (auth.uid() = blocker_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON blocks (blocker_id);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx  ON blocks (blocked_id);

-- ── 2. post_tags ────────────────────────────────────────────────────────────
-- App code uses: post_id, tagged_user_id
-- (post_hashtags links posts to hashtags; post_tags links posts to tagged users)
CREATE TABLE IF NOT EXISTS post_tags (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id         uuid        NOT NULL,
  tagged_user_id  uuid        NOT NULL,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (post_id, tagged_user_id)
);
ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_tags' AND policyname='post_tags_read') THEN
    CREATE POLICY post_tags_read  ON post_tags FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_tags' AND policyname='post_tags_write') THEN
    CREATE POLICY post_tags_write ON post_tags FOR INSERT WITH CHECK (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS post_tags_user_idx ON post_tags (tagged_user_id);
CREATE INDEX IF NOT EXISTS post_tags_post_idx ON post_tags (post_id);

-- ── 3. vibe_preferences ─────────────────────────────────────────────────────
-- App code uses: user_id, gender, interested_in, looking_for, age, age_min,
--   age_max, max_distance_km, updated_at
CREATE TABLE IF NOT EXISTS vibe_preferences (
  user_id         uuid        PRIMARY KEY,
  gender          text,
  interested_in   text[],
  looking_for     text,
  age             integer,
  age_min         integer     DEFAULT 18,
  age_max         integer     DEFAULT 99,
  max_distance_km integer     DEFAULT 100,
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE vibe_preferences ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vibe_preferences' AND policyname='vibe_prefs_own') THEN
    CREATE POLICY vibe_prefs_own ON vibe_preferences FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── 4. vibe_requests ────────────────────────────────────────────────────────
-- App code uses: sender_id, receiver_id, status, matched_at, id
-- When both sides swipe right → status becomes 'matched' → row inserted in vibe_matches
CREATE TABLE IF NOT EXISTS vibe_requests (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id   uuid        NOT NULL,
  receiver_id uuid        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'matched', 'rejected')),
  matched_at  timestamptz,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (sender_id, receiver_id)
);
ALTER TABLE vibe_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vibe_requests' AND policyname='vibe_requests_participants') THEN
    CREATE POLICY vibe_requests_participants ON vibe_requests
      FOR ALL USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS vibe_requests_sender_idx   ON vibe_requests (sender_id);
CREATE INDEX IF NOT EXISTS vibe_requests_receiver_idx ON vibe_requests (receiver_id);

-- ── 5. vibe_swipes ──────────────────────────────────────────────────────────
-- Tracks every directional swipe in the smart matching feed
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vibe_swipes' AND policyname='users_own_swipes_insert') THEN
    CREATE POLICY users_own_swipes_insert ON vibe_swipes FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vibe_swipes' AND policyname='users_own_swipes_select') THEN
    CREATE POLICY users_own_swipes_select ON vibe_swipes FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vibe_swipes' AND policyname='users_own_swipes_update') THEN
    CREATE POLICY users_own_swipes_update ON vibe_swipes FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS vibe_swipes_user_idx   ON vibe_swipes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vibe_swipes_target_idx ON vibe_swipes (target_id);

-- ── 6. vibe_compat_scores ────────────────────────────────────────────────────
-- Compatibility score cache per user-target pair
-- (vibe_scores is the separate gamification table — do NOT modify it)
CREATE TABLE IF NOT EXISTS vibe_compat_scores (
  user_id     uuid        NOT NULL,
  target_id   uuid        NOT NULL,
  score       integer     NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  computed_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, target_id)
);
ALTER TABLE vibe_compat_scores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vibe_compat_scores' AND policyname='compat_scores_own_user') THEN
    CREATE POLICY compat_scores_own_user ON vibe_compat_scores FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS vibe_compat_scores_user_idx ON vibe_compat_scores (user_id, computed_at DESC);

-- ── 7. get_vibe_matches function ─────────────────────────────────────────────
-- Smart 100-pt scoring algorithm.
-- Score breakdown:
--   Interests match   30 pts
--   Goal match        25 pts  (relationship_goal)
--   Age compatibility 15 pts  (15 − |age_diff|, min 0)
--   Activity          15 pts  (last_active recency)
--   Location          10 pts  (location field set)
--   Profile complete   5 pts  (avatar 2, bio 2, interests 1)
-- Ordering boosts (total capped at 100):
--   New-user          +15 pts (created_at within 48h)
--   Avatar            +10 pts
--   Bio                +5 pts
--   Online now         +5 pts (last_active < 10 min)

DROP FUNCTION IF EXISTS get_vibe_matches(uuid, text, numeric, numeric, integer);

CREATE OR REPLACE FUNCTION get_vibe_matches(
  p_user_id         uuid,
  p_interested_in   text[]  DEFAULT '{}',
  p_looking_for     text    DEFAULT NULL,
  p_age_min         integer DEFAULT 18,
  p_age_max         integer DEFAULT 99,
  p_max_distance_km float   DEFAULT 100
)
RETURNS TABLE(
  user_id             uuid,
  display_name        text,
  username            text,
  avatar_url          text,
  bio                 text,
  age                 integer,
  gender              text,
  interests           text[],
  looking_for         text,
  vibe_score          integer,
  is_online           boolean,
  is_verified         boolean,
  distance_km         float,
  shared_interests    text[],
  compatibility_score integer,
  vibe_type           text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH
  my_profile AS (
    SELECT
      COALESCE(p.interests, '{}') AS my_interests,
      p.age                        AS my_age,
      p.relationship_goal          AS my_goal
    FROM profiles p
    WHERE p.id = p_user_id
  ),
  excluded AS (
    SELECT target_id AS ex_id FROM vibe_swipes  WHERE user_id   = p_user_id
    UNION
    SELECT receiver_id             FROM vibe_matches WHERE sender_id  = p_user_id
    UNION
    SELECT sender_id               FROM vibe_matches WHERE receiver_id = p_user_id
  ),
  scored AS (
    SELECT
      p.id,
      COALESCE(NULLIF(p.full_name, ''), p.username)  AS display_name,
      p.username,
      p.avatar_url,
      p.bio,
      p.age,
      p.gender,
      COALESCE(p.interests, '{}')                    AS interests,
      p.relationship_goal,
      COALESCE(p.is_verified, false)                 AS is_verified,
      p.last_active,
      p.created_at,
      (p.last_active IS NOT NULL AND p.last_active >= NOW() - INTERVAL '10 minutes') AS is_online_bool,
      ARRAY(
        SELECT unnest(COALESCE(p.interests, '{}'))
        INTERSECT
        SELECT unnest(mp.my_interests)
      ) AS shared_ints,
      LEAST(
        CASE
          WHEN cardinality(COALESCE(p.interests,'{}')) > 0 AND cardinality(mp.my_interests) > 0
          THEN (SELECT COUNT(*)::integer FROM (SELECT unnest(COALESCE(p.interests,'{}')) INTERSECT SELECT unnest(mp.my_interests)) si)
               * 30 / GREATEST(cardinality(mp.my_interests), 1)
          ELSE 0
        END, 30) AS interest_score,
      CASE WHEN mp.my_goal IS NOT NULL AND p.relationship_goal = mp.my_goal THEN 25 ELSE 0 END AS goal_score,
      CASE
        WHEN mp.my_age IS NOT NULL AND p.age IS NOT NULL THEN GREATEST(0, 15 - ABS(p.age - mp.my_age))
        ELSE 8
      END AS age_score,
      CASE
        WHEN p.last_active IS NOT NULL AND p.last_active >= NOW() - INTERVAL '10 minutes' THEN 15
        WHEN p.last_active IS NOT NULL AND p.last_active >= NOW() - INTERVAL '1 hour'     THEN 8
        WHEN p.last_active IS NOT NULL AND p.last_active >= NOW() - INTERVAL '1 day'      THEN 5
        ELSE 3
      END AS activity_score,
      CASE WHEN p.location IS NOT NULL AND p.location <> '' THEN 10 ELSE 4 END AS location_score,
      (CASE WHEN p.avatar_url IS NOT NULL AND p.avatar_url <> '' THEN 2 ELSE 0 END
       + CASE WHEN p.bio IS NOT NULL AND p.bio <> '' THEN 2 ELSE 0 END
       + CASE WHEN cardinality(COALESCE(p.interests,'{}')) > 0 THEN 1 ELSE 0 END) AS completeness_score,
      CASE WHEN p.created_at >= NOW() - INTERVAL '48 hours' THEN 15 ELSE 0 END AS new_user_boost,
      (CASE WHEN p.avatar_url IS NOT NULL AND p.avatar_url <> '' THEN 10 ELSE 0 END
       + CASE WHEN p.bio IS NOT NULL AND p.bio <> '' THEN 5 ELSE 0 END
       + CASE WHEN p.last_active IS NOT NULL AND p.last_active >= NOW() - INTERVAL '10 minutes' THEN 5 ELSE 0 END
      ) AS visibility_bonus
    FROM profiles p, my_profile mp
    WHERE p.id <> p_user_id
      AND COALESCE(p.show_in_matching, false) = true
      AND p.id NOT IN (SELECT ex_id FROM excluded)
      AND (p.age IS NULL OR (p.age >= p_age_min AND p.age <= p_age_max))
      AND (cardinality(COALESCE(p_interested_in,'{}')) = 0 OR p.gender = ANY(p_interested_in))
      AND (p_looking_for IS NULL OR p.relationship_goal = p_looking_for)
  ),
  final AS (
    SELECT s.*,
      LEAST(s.interest_score + s.goal_score + s.age_score + s.activity_score
            + s.location_score + s.completeness_score + s.new_user_boost + s.visibility_bonus, 100) AS final_score
    FROM scored s
  )
  SELECT
    f.id                AS user_id,
    f.display_name,
    f.username,
    f.avatar_url,
    f.bio,
    f.age,
    f.gender,
    f.interests,
    f.relationship_goal AS looking_for,
    f.final_score       AS vibe_score,
    f.is_online_bool    AS is_online,
    f.is_verified,
    NULL::float         AS distance_km,
    f.shared_ints       AS shared_interests,
    f.final_score       AS compatibility_score,
    NULL::text          AS vibe_type
  FROM final f
  ORDER BY f.final_score DESC, f.is_online_bool DESC, f.created_at DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION get_vibe_matches(uuid, text[], text, integer, integer, float)
  TO authenticated, anon;
