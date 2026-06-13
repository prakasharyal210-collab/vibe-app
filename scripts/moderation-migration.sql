-- Content Moderation migration
-- Run this in the Supabase SQL editor.

-- 1. Clean reports table (replaces content_reports)
CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('post', 'reel', 'comment', 'user')),
  target_id    TEXT NOT NULL,
  reason       TEXT NOT NULL,
  details      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_status      ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_target_id   ON reports(target_id);

-- Row-level security: only service role (API) can read/write reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON reports USING (false);

-- 2. Ensure blocked_users table exists (some setups use 'blocks')
CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- If 'blocks' already exists, create a view alias so both names work
-- (Only run this if 'blocked_users' didn't already exist)
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'blocked_users') THEN
--     CREATE VIEW blocked_users AS SELECT blocker_id, blocked_id, created_at FROM blocks;
--   END IF;
-- END $$;
