-- Vibe Discovery Preferences Migration
-- Run in the Supabase SQL Editor

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS vibe_age_min             SMALLINT NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS vibe_age_max             SMALLINT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS vibe_max_distance_km     SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS vibe_show_distance       BOOLEAN  NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vibe_exclude_connections BOOLEAN  NOT NULL DEFAULT FALSE;

-- Backfill any pre-existing rows
UPDATE user_settings SET vibe_age_min             = 18    WHERE vibe_age_min             IS NULL;
UPDATE user_settings SET vibe_age_max             = 60    WHERE vibe_age_max             IS NULL;
UPDATE user_settings SET vibe_max_distance_km     = 50    WHERE vibe_max_distance_km     IS NULL;
UPDATE user_settings SET vibe_show_distance       = TRUE  WHERE vibe_show_distance       IS NULL;
UPDATE user_settings SET vibe_exclude_connections = FALSE WHERE vibe_exclude_connections IS NULL;
