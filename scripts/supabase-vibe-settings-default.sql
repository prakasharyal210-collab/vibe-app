-- Migration: set show_in_matching default to true
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
--
-- This ensures newly registered users are visible in Find Vibe by default.
-- The app's /api/users/setup endpoint already passes show_in_matching: true
-- for new signups; this column default is a belt-and-suspenders safety net.

ALTER TABLE profiles
  ALTER COLUMN show_in_matching SET DEFAULT true;

-- Optionally backfill existing users who signed up before this fix
-- (only updates rows where the value is currently NULL or false)
-- Uncomment if you want existing users to become visible by default:
--
-- UPDATE profiles
-- SET show_in_matching = true
-- WHERE show_in_matching IS NULL OR show_in_matching = false;
