-- Privacy Settings Migration
-- Run in the Supabase SQL Editor

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS post_view_permission   VARCHAR NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS mention_permission      VARCHAR NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS activity_visibility     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS story_permission        VARCHAR NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS story_reply_permission  VARCHAR NOT NULL DEFAULT 'everyone';

-- Backfill any existing rows that pre-date the new columns
UPDATE user_settings SET
  post_view_permission  = 'everyone'  WHERE post_view_permission  IS NULL;
UPDATE user_settings SET
  mention_permission    = 'everyone'  WHERE mention_permission    IS NULL;
UPDATE user_settings SET
  activity_visibility   = TRUE        WHERE activity_visibility   IS NULL;
UPDATE user_settings SET
  story_permission      = 'everyone'  WHERE story_permission      IS NULL;
UPDATE user_settings SET
  story_reply_permission = 'everyone' WHERE story_reply_permission IS NULL;
