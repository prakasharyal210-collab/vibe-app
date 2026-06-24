CREATE TABLE IF NOT EXISTS couple_feed_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  photo_url TEXT,
  category TEXT NOT NULL DEFAULT 'Story' CHECK (category IN ('Story', 'Advice', 'Milestone', 'Venting')),
  like_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS couple_feed_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES couple_feed_posts(id) ON DELETE CASCADE,
  couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
  liker_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, couple_id)
);

CREATE TABLE IF NOT EXISTS couple_feed_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES couple_feed_posts(id) ON DELETE CASCADE,
  couple_id UUID REFERENCES couple_links(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_couple_feed_posts_created ON couple_feed_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_couple_feed_comments_post ON couple_feed_comments(post_id);

ALTER TABLE couple_feed_posts    DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_feed_likes    DISABLE ROW LEVEL SECURITY;
ALTER TABLE couple_feed_comments DISABLE ROW LEVEL SECURITY;
