-- Migration: Add relationship_goals TEXT[] column to profiles
-- Run this in the Supabase Dashboard SQL editor.
-- We use a NEW plural column so the old single-value relationship_goal is preserved
-- for backward-compat reads (deck RPC, legacy code) while the new UI writes the array.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS relationship_goals TEXT[] DEFAULT NULL;

-- Backfill: copy any existing single-value relationship_goal into the new array column
UPDATE profiles
   SET relationship_goals = ARRAY[relationship_goal]
 WHERE relationship_goal IS NOT NULL
   AND relationship_goals IS NULL;
