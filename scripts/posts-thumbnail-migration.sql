-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Adds thumbnail_url column to posts table so video posts can store a
-- static JPEG preview for the profile grid instead of a raw video URL.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Backfill: for existing video posts where media_url is a video and
-- thumbnail_url is not yet set, leave it NULL — the profile grid will
-- fall back to the gradient + play-icon placeholder for those posts.

-- Verify the column was added:
-- SELECT id, media_url, thumbnail_url FROM posts LIMIT 5;
