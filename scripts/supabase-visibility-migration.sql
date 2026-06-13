-- Post Visibility Migration (idempotent)
-- Adds: visibility column on posts table

ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public'
  CHECK (visibility IN ('public', 'friends', 'private'));

-- Index for faster feed filtering
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts (visibility);
