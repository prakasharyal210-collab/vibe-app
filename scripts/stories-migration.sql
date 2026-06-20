-- ─── Stories Table ────────────────────────────────────────────────────────────
-- Run this in the Supabase SQL editor (once).

CREATE TABLE IF NOT EXISTS stories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url     TEXT,
  caption       TEXT,
  bg_gradient   TEXT,
  text_content  TEXT,
  story_type    TEXT NOT NULL DEFAULT 'text',   -- 'text' | 'image' | 'video'
  audience      TEXT NOT NULL DEFAULT 'everyone', -- 'everyone' | 'friends' | 'close_friends' | 'followers' | 'only_me'
  viewed        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stories_user_id_idx ON stories (user_id);
CREATE INDEX IF NOT EXISTS stories_created_at_idx ON stories (created_at DESC);

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stories' AND policyname='stories_select') THEN
    CREATE POLICY "stories_select" ON stories FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stories' AND policyname='stories_insert') THEN
    CREATE POLICY "stories_insert" ON stories FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stories' AND policyname='stories_delete') THEN
    CREATE POLICY "stories_delete" ON stories FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

-- Auto-delete stories older than 24 hours (optional pg_cron job)
-- SELECT cron.schedule('delete-expired-stories', '0 * * * *',
--   $$DELETE FROM stories WHERE created_at < NOW() - INTERVAL '24 hours'$$);
