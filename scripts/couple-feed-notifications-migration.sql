-- Run this in your Supabase SQL editor (dashboard → SQL Editor → New query).
-- Safe to run even if columns already exist (IF NOT EXISTS).

-- 1. Add last_seen_notifications_at to profiles table so we can track
--    when each user last viewed their Confession Room notifications.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_seen_notifications_at timestamptz;

-- 2. Ensure couple_feed_likes has a created_at column (Supabase normally
--    adds this automatically, but included here as a safety net).
ALTER TABLE couple_feed_likes
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
