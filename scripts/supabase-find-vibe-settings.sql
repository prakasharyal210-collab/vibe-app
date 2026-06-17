-- Migration: Find Vibe Settings hub — new profile columns
-- Run in Supabase Dashboard → SQL Editor
--
-- Architecture: all new fields added to profiles table (same pattern as existing
-- show_in_matching, find_gundruk_mode, etc.).  No separate table needed — avoids
-- joins and is consistent with the existing schema.
--
-- Filter preferences (viewer's deck filters):
--   vibe_filter_min_photos  — only show candidates with ≥ N vibe_photos entries
--   vibe_filter_requires_bio — exclude candidates with an empty vibe_bio AND empty bio
--
-- Profile attributes (declared about yourself, shown on match card):
--   vibe_bio, vibe_photos, vibe_zodiac, vibe_education, vibe_family_plans,
--   vibe_communication, vibe_love_style, vibe_pets, vibe_drinking, vibe_smoking,
--   vibe_cannabis, vibe_workout, vibe_social_media,
--   vibe_open_to (TEXT[]), vibe_languages (TEXT[])

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vibe_bio              TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_photos           TEXT[]  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_filter_min_photos   INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vibe_filter_requires_bio BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vibe_zodiac           TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_education        TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_family_plans     TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_communication    TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_love_style       TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_pets             TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_drinking         TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_smoking          TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_cannabis         TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_workout          TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_social_media     TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_open_to          TEXT[]  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vibe_languages        TEXT[]  DEFAULT NULL;
