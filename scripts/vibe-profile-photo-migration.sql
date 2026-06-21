-- Add dedicated primary Find Vibe profile photo field to profiles table.
-- This is separate from vibe_photos (the gallery array).
-- Setting a new vibe_profile_photo_url REPLACES the previous one (not appended).
-- Run this in the Supabase SQL Editor (NOT via drizzle push — DB lives in Supabase).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vibe_profile_photo_url TEXT DEFAULT NULL;
