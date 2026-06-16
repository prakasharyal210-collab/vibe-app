-- Profile redesign migration
-- Run this in the Supabase SQL editor

-- 1. Add vibe_status to profiles (emoji + label, e.g. "🎵 In my music era")
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vibe_status TEXT DEFAULT NULL;

-- 2. Ensure is_pinned exists on posts (should already exist)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Index for fast pinned-post lookups per user
CREATE INDEX IF NOT EXISTS idx_posts_is_pinned_user
  ON posts(user_id, is_pinned)
  WHERE is_pinned = TRUE;
