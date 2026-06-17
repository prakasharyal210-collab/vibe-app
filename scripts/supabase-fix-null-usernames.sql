-- Migration: fix null usernames and add safety constraints
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Context: Supabase's on_auth_user_created trigger (if present) inserts a profiles row
-- with only `id`, leaving username = null. The app's setup endpoint previously skipped
-- the row (ignoreDuplicates: true), so username never got filled in.
-- The setup endpoint is now fixed, but existing broken rows need a backfill.

-- ── 1. Backfill existing null usernames ──────────────────────────────────────
-- Generates a fallback like "user_81422457" from the first 8 chars of the UUID.
-- Users can update their username in the app afterwards.
UPDATE profiles
SET username = 'user_' || LEFT(id::text, 8)
WHERE username IS NULL OR username = '';

-- ── 2. Backfill null show_in_matching (should be true by default) ─────────────
UPDATE profiles
SET show_in_matching = true
WHERE show_in_matching IS NULL;

-- ── 3. Set column defaults so future trigger-created rows are safer ───────────
ALTER TABLE profiles
  ALTER COLUMN show_in_matching SET DEFAULT true;

-- Optional: add a NOT NULL constraint on username now that nulls are cleared.
-- This prevents any future code path (trigger or otherwise) from leaving it null.
-- Uncomment after confirming the backfill above ran cleanly:
--
-- ALTER TABLE profiles
--   ALTER COLUMN username SET NOT NULL;
