-- Add Vibe-specific notification preference columns to user_settings
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)

-- 1. Vibe Match notification toggle (default ON)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS notif_vibe_match BOOLEAN NOT NULL DEFAULT true;

-- 2. Vibe Request notification toggle (default ON)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS notif_vibe_request BOOLEAN NOT NULL DEFAULT true;

-- 3. Backfill existing rows that were inserted before these columns existed
UPDATE user_settings
SET
  notif_vibe_match   = true,
  notif_vibe_request = true
WHERE notif_vibe_match IS NULL OR notif_vibe_request IS NULL;
