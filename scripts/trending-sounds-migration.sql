-- Trending Sounds for Reels
-- Run this in the Supabase dashboard SQL editor.

-- 1. original_sound_post_id — FK to the music-video post used as sound source
ALTER TABLE reels ADD COLUMN IF NOT EXISTS original_sound_post_id UUID REFERENCES posts(id) ON DELETE SET NULL;

-- 2. original_sound_username — denormalized credit text (avoids a join on every reel load)
ALTER TABLE reels ADD COLUMN IF NOT EXISTS original_sound_username TEXT;

-- 3. Index so the credit join (reel player fetching post detail) is fast
CREATE INDEX IF NOT EXISTS idx_reels_original_sound_post_id ON reels(original_sound_post_id) WHERE original_sound_post_id IS NOT NULL;
