-- Migration: bring reel_comments to feature parity with post comments
-- Run in Supabase SQL editor (Dashboard → SQL Editor)

-- 1. Nested replies: add parent_comment_id to reel_comments
ALTER TABLE reel_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES reel_comments(id) ON DELETE CASCADE;

-- 2. Ensure likes_count column exists on reel_comments
ALTER TABLE reel_comments
  ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

-- 3. Index for fast reply lookups
CREATE INDEX IF NOT EXISTS reel_comments_parent_id_idx
  ON reel_comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;
