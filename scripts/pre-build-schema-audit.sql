-- ============================================================
-- pre-build-schema-audit.sql
-- 100% READ-ONLY — run in Supabase SQL Editor before every release.
-- Checks table existence, column presence, RLS status, indexes, storage buckets.
-- Each section is independent — run together or section by section.
-- ============================================================


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1: TABLE EXISTENCE
-- Every table the API server references (extracted from .from("...") calls).
-- Expected: every row shows EXISTS = true.
-- A false row means a migration was never run → HIGH RISK.
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  t.tname AS table_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables ist
    WHERE ist.table_schema = 'public' AND ist.table_name = t.tname
  ) AS exists
FROM (VALUES
  -- Core social
  ('profiles'),
  ('posts'),
  ('reels'),
  ('likes'),
  ('post_likes'),
  ('comments'),
  ('comment_likes'),
  ('reel_comments'),
  ('reel_likes'),
  ('follows'),
  ('saved_posts'),
  ('post_hashtags'),
  ('hashtags'),
  ('post_tags'),

  -- Messaging
  ('conversations'),
  ('messages'),
  ('message_reactions'),
  ('snaps'),
  ('snap_streaks'),

  -- Stories
  ('stories'),
  ('story_views'),
  ('story_reactions'),
  ('story_highlights'),
  ('highlight_stories'),
  ('story_interactions'),

  -- Vibe / matching
  ('vibe_swipes'),
  ('vibe_matches'),
  ('vibe_requests'),
  ('vibe_preferences'),
  ('vibe_compat_scores'),
  ('vibe_scores'),
  ('vibe_rooms'),
  ('vibe_room_members'),
  ('vibe_room_messages'),

  -- Couple
  ('couple_links'),
  ('couple_photos'),
  ('couple_feed_posts'),
  ('couple_feed_likes'),
  ('couple_feed_comments'),
  ('couple_bucketlist'),
  ('couple_notes'),
  ('couple_nudges'),
  ('couple_battles'),
  ('battle_answers'),
  ('couple_competitions'),
  ('couple_competition_votes'),
  ('couple_competition_winners'),

  -- Games / content
  ('game_questions'),
  ('polls'),
  ('poll_options'),
  ('poll_votes'),

  -- Gamification / rewards
  ('wallet'),
  ('wallets'),
  ('daily_rewards'),
  ('leaderboard'),
  ('watch_events'),
  ('scoring_config'),

  -- User settings / preferences
  ('user_settings'),
  ('user_interests'),
  ('user_relationship_goals'),
  ('user_tab_preferences'),
  ('search_history'),

  -- Moderation / safety
  ('blocks'),
  ('reports'),
  ('content_reports'),
  ('content_moderation_log'),
  ('restricted_users'),
  ('muted_users'),
  ('close_friends'),
  ('hidden_ads'),

  -- Ads / creator
  ('ad_campaigns'),

  -- Misc
  ('notifications'),
  ('favourites'),
  ('live_streams'),
  ('media'),
  ('music_tracks'),
  ('confession_polls'),
  ('kundali_profiles')
) AS t(tname)
ORDER BY exists ASC, table_name;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2a: COLUMN CHECK — profiles
-- Code expects all of these columns.
-- ════════════════════════════════════════════════════════════════════════════

-- CODE EXPECTS: id, username, full_name, display_name, avatar_url, bio, age, gender,
--   interests[], relationship_goal, relationship_goals[], is_verified, last_active,
--   last_active_at, last_seen_notifications_at, created_at, show_in_matching,
--   location, push_token, website, is_admin,
--   vibe_bio, vibe_photos[], vibe_profile_photo_url, vibe_filter_min_photos,
--   vibe_filter_requires_bio, vibe_zodiac, vibe_education, vibe_family_plans,
--   vibe_communication, vibe_love_style, vibe_pets, vibe_drinking, vibe_smoking,
--   vibe_cannabis, vibe_workout, vibe_social_media, vibe_open_to[], vibe_languages[],
--   vibe_goal_filter[], find_gundruk_mode, vibe_request_privacy,
--   vibe_status, zodiac_sign, relationship_status, couple_id,
--   posts_count, followers_count, following_count, snap_score,
--   is_couple_post (not on profiles — cross-check only)

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2b: COLUMN CHECK — posts
-- CODE EXPECTS: id, user_id, media_url, image_url, caption, visibility, is_reel,
--   is_video, is_first_post, is_pinned, is_archived, is_couple_post, couple_id,
--   thumbnail_url, filter_id, location, category, categories[], score,
--   likes_count, comments_count, views_count, shares_count, saves_count,
--   hide_like_count, hide_share_count, created_at
-- ════════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'posts'
ORDER BY ordinal_position;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2c: COLUMN CHECK — conversations
-- CODE EXPECTS: id, user1_id, user2_id, last_message, last_message_at,
--   is_request, requested_by, unread_count_1, unread_count_2
-- ════════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'conversations'
ORDER BY ordinal_position;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2d: COLUMN CHECK — messages
-- CODE EXPECTS: id, conversation_id, sender_id, content, type, created_at, read, read_at
-- ════════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'messages'
ORDER BY ordinal_position;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2e: COLUMN CHECK — notifications
-- CODE EXPECTS: id, user_id, actor_id, type, message, post_id, read,
--   created_at, thumbnail_url, reference_id
-- ════════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
ORDER BY ordinal_position;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2f: COLUMN CHECK — user_settings
-- CODE EXPECTS (after all migrations):
--   user_id, updated_at,
--   comment_permission, message_permission, duet_permission,
--   liked_private, saved_private,
--   notif_in_app, notif_reposts, notif_tags, notif_comment_likes,
--   notif_dm, notif_dm_previews, notif_dm_requests,
--   notif_activity_status, notif_post_following, notif_post_recommended,
--   notif_push_enabled, notif_messages,
--   notif_vibe_match, notif_vibe_request,
--   vibe_age_min, vibe_age_max, vibe_max_distance_km,
--   vibe_show_distance, vibe_exclude_connections,
--   post_view_permission, mention_permission, activity_visibility,
--   story_permission, story_reply_permission
-- ════════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_settings'
ORDER BY ordinal_position;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2g: COLUMN CHECK — vibe_requests
-- CODE EXPECTS: id, sender_id, receiver_id, status, created_at, updated_at
-- ════════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'vibe_requests'
ORDER BY ordinal_position;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2h: COLUMN CHECK — vibe_matches
-- CODE EXPECTS: id, sender_id, receiver_id, status, match_score, matched_at, created_at
-- vibe.ts upsert uses: id (gen), sender_id, receiver_id, status='matched'
-- vibe-requests.ts also upserts with same shape
-- ════════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'vibe_matches'
ORDER BY ordinal_position;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2i: COLUMN CHECK — couple_links
-- CODE EXPECTS: id, requester_id, receiver_id, status, anniversary_date,
--   created_at, accepted_at
-- NOTE: original couple-migration.sql refs users(id) — confirm it was fixed
--   to profiles(id) or auth.users(id) in the live DB.
-- ════════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'couple_links'
ORDER BY ordinal_position;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2j: COLUMN CHECK — couple_battles + battle_answers
-- CODE EXPECTS couple_battles: id, couple_id, question_id, status, winner,
--   requester_score, receiver_score, created_at
-- CODE EXPECTS battle_answers: id, battle_id, question_id, couple_id,
--   selected_option, created_at
-- ════════════════════════════════════════════════════════════════════════════

SELECT 'couple_battles' AS tbl, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'couple_battles'
UNION ALL
SELECT 'battle_answers', column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'battle_answers'
ORDER BY tbl, column_name;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2k: COLUMN CHECK — polls, poll_options, poll_votes
-- CODE EXPECTS polls: id, post_id, confession_post_id, question, ends_at, created_at
-- CODE EXPECTS poll_options: id, poll_id, text, votes_count
-- CODE EXPECTS poll_votes: id, poll_id, user_id, option_id, couple_id, created_at
-- ════════════════════════════════════════════════════════════════════════════

SELECT 'polls' AS tbl, column_name, data_type
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'polls'
UNION ALL
SELECT 'poll_options', column_name, data_type
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'poll_options'
UNION ALL
SELECT 'poll_votes', column_name, data_type
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'poll_votes'
ORDER BY tbl, column_name;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2l: COLUMN CHECK — snaps
-- CODE EXPECTS: id, sender_id, recipient_id, content, media_url, media_type,
--   duration, viewed_at, expires_at, created_at
-- ════════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'snaps'
ORDER BY ordinal_position;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2m: COLUMN CHECK — content_reports, content_moderation_log
-- content_reports: id, reporter_id, target_type, target_id, reason, details,
--   status, created_at
-- content_moderation_log: id, user_id, media_url, content_type,
--   rejection_reason, scores, created_at
-- ════════════════════════════════════════════════════════════════════════════

SELECT 'content_reports' AS tbl, column_name, data_type
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'content_reports'
UNION ALL
SELECT 'content_moderation_log', column_name, data_type
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'content_moderation_log'
ORDER BY tbl, column_name;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3: RLS STATUS — all public tables
-- Flag any table where rowsecurity = false (security risk).
-- Every table the app uses should have RLS enabled, with a service_role policy.
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  CASE WHEN rowsecurity THEN 'OK' ELSE '⚠ RLS DISABLED' END AS status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rowsecurity ASC, tablename;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4: CRITICAL UNIQUE INDEXES & CONSTRAINTS
-- The app relies on these for upsert conflict targets and data integrity.
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  ix.indexname,
  ix.tablename,
  ix.indexdef,
  CASE
    WHEN ix.indexdef ILIKE '%unique%' THEN 'UNIQUE'
    ELSE 'INDEX'
  END AS index_type
FROM pg_indexes ix
WHERE ix.schemaname = 'public'
  AND (
    -- couple uniqueness guards
    ix.indexname IN (
      'one_accepted_couple_requester',
      'one_accepted_couple_receiver'
    )
    -- vibe dedup
    OR ix.tablename IN ('vibe_swipes', 'vibe_matches', 'vibe_requests')
    -- battle answer dedup
    OR ix.tablename = 'battle_answers'
    -- poll vote dedup (including per-couple)
    OR ix.tablename IN ('poll_votes', 'poll_options')
    -- conversation direction index
    OR ix.tablename = 'conversations'
    -- snap_streaks
    OR ix.tablename = 'snap_streaks'
    -- reel_likes dedup
    OR ix.tablename = 'reel_likes'
  )
ORDER BY ix.tablename, ix.indexname;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 5: SPECIFIC HIGH-RISK INDEX CHECK
-- Confirms the partial indexes the app relies on for upsert safety.
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  c.conname AS constraint_name,
  c.contype,
  c.conrelid::regclass AS table_name,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.connamespace = 'public'::regnamespace
  AND c.contype IN ('u', 'p')   -- unique or primary key
  AND c.conrelid::regclass::text IN (
    'vibe_swipes', 'vibe_matches', 'vibe_requests',
    'couple_links', 'battle_answers', 'poll_votes',
    'reel_likes', 'snap_streaks', 'story_views',
    'story_reactions', 'muted_users', 'blocks',
    'saved_posts', 'follows'
  )
ORDER BY table_name, constraint_name;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 6: STORAGE BUCKETS
-- CODE EXPECTS: posts, reels, avatars, media, snaps
-- reels-watermarked may not exist (optional).
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  id AS bucket_name,
  public,
  created_at
FROM storage.buckets
ORDER BY id;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 7: RPC FUNCTIONS EXISTENCE
-- The API server calls these RPCs — if missing, those endpoints silently 404
-- or fall back (where a fallback exists).
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  f.fname AS function_name,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f.fname
  ) AS exists
FROM (VALUES
  ('get_for_you_feed_v2'),
  ('get_friends_feed'),
  ('get_following_feed'),
  ('get_nearby_feed'),
  ('get_vibes_feed'),
  ('get_vibe_matches'),
  ('get_suggested_accounts'),
  ('get_hashtag_posts'),
  ('bump_affinity')
) AS f(fname)
ORDER BY exists ASC, function_name;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 8: QUICK SPOT-CHECK — critical columns that are often missing
-- These are the most common causes of silent failures in prod.
-- Each query returns the column if present, or nothing if absent.
-- ════════════════════════════════════════════════════════════════════════════

-- conversations.is_request (schema-drift-migration.sql)
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'conversations'
  AND column_name IN ('is_request', 'requested_by');

-- conversations ← "missing requested_by breaks request-direction routing"

-- poll_votes.couple_id (poll-votes-couple-migration.sql)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'poll_votes'
  AND column_name = 'couple_id';

-- profiles vibe columns (supabase-find-vibe-settings.sql)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name IN (
    'vibe_bio', 'vibe_photos', 'vibe_profile_photo_url',
    'vibe_filter_min_photos', 'vibe_filter_requires_bio',
    'vibe_goal_filter', 'find_gundruk_mode', 'vibe_request_privacy',
    'relationship_goals', 'vibe_open_to', 'vibe_languages'
  )
ORDER BY column_name;

-- user_settings notification columns (notification-settings-migration.sql)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_settings'
  AND column_name IN (
    'notif_in_app', 'notif_vibe_match', 'notif_vibe_request',
    'notif_messages', 'notif_push_enabled',
    'vibe_age_min', 'vibe_age_max', 'vibe_max_distance_km',
    'vibe_show_distance', 'vibe_exclude_connections',
    'post_view_permission', 'mention_permission', 'activity_visibility'
  )
ORDER BY column_name;

-- posts critical columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'posts'
  AND column_name IN (
    'is_archived', 'is_pinned', 'is_first_post', 'is_couple_post',
    'couple_id', 'thumbnail_url', 'visibility', 'hide_like_count',
    'hide_share_count', 'categories', 'score', 'is_video'
  )
ORDER BY column_name;
