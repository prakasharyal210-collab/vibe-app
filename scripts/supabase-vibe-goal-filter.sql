-- Migration: add vibe_goal_filter column to profiles
-- Run in Supabase Dashboard → SQL Editor
--
-- NULL (default) = "open to all goals" — no deck filtering applied.
-- Empty array also treated as "open to all" in the deck endpoint.
-- Non-empty array = only show candidates whose relationship_goal is in this set.
-- Candidates with NULL relationship_goal are EXCLUDED when the filter is active.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vibe_goal_filter TEXT[] DEFAULT NULL;
