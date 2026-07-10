-- Adds image_width/image_height columns to posts so PostCard can compute the
-- correct media-container aspect ratio on the very first render (no guess,
-- no post-load resize). Existing rows are left NULL — PostCard falls back to
-- its onLoad-based detection (now animated via LayoutAnimation) for those.
--
-- Run this in the Supabase SQL editor (dashboard), not via the local DB.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_width integer;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_height integer;
