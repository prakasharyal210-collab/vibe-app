-- Vibe Requests feature migration
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS vibe_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_vibe_requests_receiver ON vibe_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_vibe_requests_sender ON vibe_requests(sender_id);

-- Also ensure notifications table has a reference_id column for linking back to requests
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_id UUID;
