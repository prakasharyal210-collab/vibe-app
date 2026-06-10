-- Messages feature DB migration
-- Run this in Supabase SQL Editor

-- Snap streaks between two users
CREATE TABLE IF NOT EXISTS snap_streaks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  streak_count INTEGER DEFAULT 0,
  last_snap_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user1_id, user2_id)
);

-- Snap score on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS snap_score INTEGER DEFAULT 0;

-- Screenshot notifications
CREATE TABLE IF NOT EXISTS snap_screenshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snap_id UUID,
  viewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for streak lookups
CREATE INDEX IF NOT EXISTS idx_snap_streaks_user1 ON snap_streaks(user1_id);
CREATE INDEX IF NOT EXISTS idx_snap_streaks_user2 ON snap_streaks(user2_id);
