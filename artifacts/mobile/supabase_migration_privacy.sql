-- ============================================================
-- Gundruk: Find Vibe Privacy Settings Migration
-- Run this in your Supabase Dashboard → SQL Editor
-- ============================================================

-- Step 1: Add 3 new columns to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS show_in_matching   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS find_gundruk_mode  text    NOT NULL DEFAULT 'dating',
  ADD COLUMN IF NOT EXISTS vibe_request_privacy text  NOT NULL DEFAULT 'everyone';

-- Step 2: Update the get_vibe_matches RPC to respect these settings.
-- Find your current function in Supabase → Database → Functions → get_vibe_matches
-- and add the following lines to its WHERE clause:
--
--   AND p.show_in_matching = true
--   AND (
--     p.vibe_request_privacy = 'everyone'
--     OR (p.vibe_request_privacy = 'following' AND EXISTS (
--       SELECT 1 FROM follows f WHERE f.follower_id = p_user_id AND f.following_id = p.id
--     ))
--   )
--
-- Example: if your WHERE clause currently reads:
--   WHERE p.id != p_user_id
--     AND p.latitude IS NOT NULL
-- Change it to:
--   WHERE p.id != p_user_id
--     AND p.latitude IS NOT NULL
--     AND p.show_in_matching = true
--     AND (
--       p.vibe_request_privacy = 'everyone'
--       OR p.vibe_request_privacy = 'following' AND EXISTS (
--         SELECT 1 FROM follows f WHERE f.follower_id = p_user_id AND f.following_id = p.id
--       )
--     )

-- Step 3: Optional — add mode-compatibility filtering so dating-seekers
-- don't appear for people who only want friends or networking:
--
-- Add to WHERE:
--   AND (p.find_gundruk_mode = 'dating' OR p.find_gundruk_mode != 'hide')
--
-- Or for stricter mode matching:
--   AND p.find_gundruk_mode != 'hide'
