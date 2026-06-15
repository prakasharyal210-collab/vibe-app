-- Notification settings expansion
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- Adds granular per-category toggles matching the new notification settings screen.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS notif_in_app            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_reposts           BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_tags              BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_comment_likes     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_dm                BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_dm_previews       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_dm_requests       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_activity_status   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_post_following    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_post_recommended  BOOLEAN NOT NULL DEFAULT true;

-- notif_vibe_match and notif_vibe_request were added in vibe-notifications-migration.sql
-- Run that first if you haven't already.
