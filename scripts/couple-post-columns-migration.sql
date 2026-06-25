-- Couple post columns for the posts table
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- Safe to run multiple times (uses IF NOT EXISTS / DO $$ guards)

-- 1. Add couple_id column (FK to couple_links.id, nullable)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS couple_id UUID REFERENCES couple_links(id) ON DELETE SET NULL;

-- 2. Add is_couple_post boolean flag (defaults false so old rows are unaffected)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS is_couple_post BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Index for fast couple-post lookups (feed enrichment + profile grid)
CREATE INDEX IF NOT EXISTS idx_posts_couple_id
  ON posts (couple_id)
  WHERE couple_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_is_couple_post
  ON posts (is_couple_post)
  WHERE is_couple_post = TRUE;

-- Verify: after running, this should return 0 errors and show both columns
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'posts'
  AND column_name IN ('couple_id', 'is_couple_post')
ORDER BY column_name;
