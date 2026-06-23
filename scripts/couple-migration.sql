-- Couple feature migration
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS couple_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  anniversary_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(requester_id, receiver_id)
);

CREATE TABLE IF NOT EXISTS couple_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS couple_bucketlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS couple_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS couple_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES users(id),
  receiver_id UUID REFERENCES users(id),
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE couple_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_photos DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_bucketlist DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_nudges DISABLE ROW LEVEL SECURITY;

-- Couple of the Month competition tables
CREATE TABLE IF NOT EXISTS couple_competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INT NOT NULL,
  year INT NOT NULL,
  couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
  couple_name TEXT NOT NULL,
  cover_photo_url TEXT,
  vote_count INT DEFAULT 0,
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(couple_id, month, year)
);

CREATE TABLE IF NOT EXISTS couple_competition_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id UUID REFERENCES users(id) ON DELETE CASCADE,
  competition_id UUID REFERENCES couple_competitions(id) ON DELETE CASCADE,
  voted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(voter_id, competition_id)
);

CREATE TABLE IF NOT EXISTS couple_competition_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
  month INT NOT NULL,
  year INT NOT NULL,
  rank INT NOT NULL CHECK (rank IN (1, 2, 3)),
  vote_count INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE couple_competitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_competition_votes DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_competition_winners DISABLE ROW LEVEL SECURITY;
