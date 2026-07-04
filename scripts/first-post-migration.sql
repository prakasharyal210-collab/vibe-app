-- First-post validation migration
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
--
-- Adds is_first_post boolean to posts table.
-- The API server sets this to TRUE automatically when a user creates their
-- very first post. Used by:
--   - GET /api/feed/fresh-faces  — returns recent first posts for the "Fresh Faces 👋" rail
--   - POST /api/posts/create     — auto-like + welcome comment from official account

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_first_post BOOLEAN DEFAULT FALSE;

-- Index for the fresh-faces query (last 24 h + is_first_post = TRUE)
CREATE INDEX IF NOT EXISTS idx_posts_first_post_created
  ON public.posts (is_first_post, created_at DESC)
  WHERE is_first_post = TRUE;

-- Backfill: mark the earliest post of each user as their first post.
-- Safe to run after the column is added; the API server handles new posts going forward.
UPDATE public.posts p
SET    is_first_post = TRUE
FROM (
  SELECT DISTINCT ON (user_id) id
  FROM   public.posts
  ORDER  BY user_id, created_at ASC
) first_posts
WHERE  p.id = first_posts.id;
