-- Post Enhancements Migration
-- Run this in the Supabase SQL editor for the Gundruk project
-- Adds: filter_id column on posts, location column on posts, post_tags table

-- 1. Add filter_id to posts (stores which filter was applied: vivid, warm, cool, etc.)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS filter_id TEXT DEFAULT NULL;

-- 2. Add location to posts (in case not already present)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS location TEXT DEFAULT NULL;

-- 3. Create post_tags table for tagging users in posts
CREATE TABLE IF NOT EXISTS post_tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tagged_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tagged_by     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, tagged_user_id)
);

-- 4. Enable RLS on post_tags
ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for post_tags
-- Anyone can read tags on public posts
CREATE POLICY IF NOT EXISTS "post_tags_select"
  ON post_tags FOR SELECT USING (true);

-- Only authenticated users can insert tags (service role bypasses this)
CREATE POLICY IF NOT EXISTS "post_tags_insert"
  ON post_tags FOR INSERT WITH CHECK (auth.uid() = tagged_by);

-- Tagger or tagged user can delete a tag
CREATE POLICY IF NOT EXISTS "post_tags_delete"
  ON post_tags FOR DELETE USING (
    auth.uid() = tagged_by OR auth.uid() = tagged_user_id
  );

-- 6. Index for fast lookup of posts a user is tagged in
CREATE INDEX IF NOT EXISTS idx_post_tags_tagged_user
  ON post_tags(tagged_user_id);

CREATE INDEX IF NOT EXISTS idx_post_tags_post_id
  ON post_tags(post_id);

-- Done. Run pnpm --filter @workspace/mobile ... to regenerate types if needed.
