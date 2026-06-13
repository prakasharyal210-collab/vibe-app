-- Post Enhancements Migration (idempotent — safe to run multiple times)
-- Adds: filter_id + location columns on posts, tagged_by column on post_tags

-- 1. Add filter_id and location to posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS filter_id TEXT DEFAULT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location  TEXT DEFAULT NULL;

-- 2. Create post_tags if it does not already exist
CREATE TABLE IF NOT EXISTS post_tags (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        UUID NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  tagged_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, tagged_user_id)
);

-- 3. Add tagged_by column in case the table already existed without it
ALTER TABLE post_tags
  ADD COLUMN IF NOT EXISTS tagged_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 4. Enable RLS
ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;

-- 5. Policies (drop first for idempotency)
DROP POLICY IF EXISTS "post_tags_select" ON post_tags;
CREATE POLICY "post_tags_select"
  ON post_tags FOR SELECT USING (true);

DROP POLICY IF EXISTS "post_tags_insert" ON post_tags;
CREATE POLICY "post_tags_insert"
  ON post_tags FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "post_tags_delete" ON post_tags;
CREATE POLICY "post_tags_delete"
  ON post_tags FOR DELETE USING (
    auth.uid() = tagged_by OR auth.uid() = tagged_user_id
  );

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_post_tags_tagged_user ON post_tags(tagged_user_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_post_id     ON post_tags(post_id);
