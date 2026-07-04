-- Run in Supabase Dashboard → SQL Editor → New query
-- Creates polls, poll_options, poll_votes tables for the Gundruk Poll feature.

-- 1. polls ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS polls (
  id                  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id             uuid         REFERENCES posts(id)             ON DELETE CASCADE,
  confession_post_id  uuid         REFERENCES couple_feed_posts(id) ON DELETE CASCADE,
  question            text,
  ends_at             timestamptz  NOT NULL,
  created_at          timestamptz  DEFAULT now() NOT NULL,
  CONSTRAINT polls_exactly_one_parent CHECK (
    (post_id IS NOT NULL AND confession_post_id IS NULL) OR
    (post_id IS NULL  AND confession_post_id IS NOT NULL)
  )
);
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_polls" ON polls
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. poll_options ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poll_options (
  id       uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id  uuid         NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label    varchar(60)  NOT NULL,
  position int          NOT NULL DEFAULT 0
);
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_poll_options" ON poll_options
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. poll_votes  (UNIQUE per user per poll — changeable via upsert) ──────────
CREATE TABLE IF NOT EXISTS poll_votes (
  id         uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id    uuid         NOT NULL REFERENCES polls(id)        ON DELETE CASCADE,
  option_id  uuid         NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id    uuid         NOT NULL,
  created_at timestamptz  DEFAULT now() NOT NULL,
  UNIQUE (poll_id, user_id)
);
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_poll_votes" ON poll_votes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS polls_post_id_idx            ON polls(post_id);
CREATE INDEX IF NOT EXISTS polls_confession_post_id_idx ON polls(confession_post_id);
CREATE INDEX IF NOT EXISTS poll_options_poll_id_idx     ON poll_options(poll_id);
CREATE INDEX IF NOT EXISTS poll_votes_poll_id_idx       ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS poll_votes_user_id_idx       ON poll_votes(user_id);
