-- Phase 2 post options: hide_like_count and hide_share_count
-- Run this in your Supabase dashboard → SQL Editor
-- The PATCH /api/posts/:id endpoint already supports these fields once added.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS hide_like_count BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hide_share_count BOOLEAN DEFAULT false;

-- Confirm columns added:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'posts'
  AND column_name IN ('hide_like_count', 'hide_share_count', 'is_archived', 'allow_comments');
