-- Run this in your Supabase SQL editor if the age/location columns don't yet exist.
-- Safe to run even if columns already exist (IF NOT EXISTS).

ALTER TABLE couple_feed_posts
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS location text;
