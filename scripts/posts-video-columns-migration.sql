-- Add video support columns to the posts table.
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to run multiple times — all statements use IF NOT EXISTS / DO NOTHING.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS is_video     BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_url    TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS visibility   TEXT        NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS filter_id    TEXT,
  ADD COLUMN IF NOT EXISTS location     TEXT;

-- Backfill: mark existing rows that look like videos based on media_url extension
UPDATE posts
SET is_video = true
WHERE is_video = false
  AND media_url IS NOT NULL
  AND media_url ~* '\.(mp4|mov|webm|m4v)($|\?)';
