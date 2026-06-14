-- Run this in the Supabase dashboard SQL editor (Project → SQL Editor → New query)
-- Adds visibility column to posts and reels tables.
-- Safe to re-run: IF NOT EXISTS prevents duplicate-column errors.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE reels ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';

-- Backfill any NULLs (shouldn't exist with DEFAULT, but just in case)
UPDATE posts SET visibility = 'public' WHERE visibility IS NULL;
UPDATE reels SET visibility = 'public' WHERE visibility IS NULL;
