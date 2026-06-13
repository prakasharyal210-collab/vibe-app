-- Push Notifications migration
-- Run this in the Supabase SQL editor for your project.

-- 1. Add push_token column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- 2. Add push preference columns to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notif_push_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notif_messages BOOLEAN NOT NULL DEFAULT TRUE;

-- Index for fast token lookups when sending pushes
CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON profiles(push_token) WHERE push_token IS NOT NULL;
