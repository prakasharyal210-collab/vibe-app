CREATE TABLE IF NOT EXISTS couple_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  anniversary_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(requester_id, receiver_id)
);

CREATE TABLE IF NOT EXISTS couple_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id),
  url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS couple_bucketlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS couple_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS couple_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES auth.users(id),
  receiver_id UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE couple_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_photos DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_bucketlist DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_nudges DISABLE ROW LEVEL SECURITY;
