-- Run this in the Supabase SQL editor (dashboard → SQL Editor → New query)
-- Creates the story_reactions table so emoji taps on stories persist.

CREATE TABLE IF NOT EXISTS story_reactions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id    uuid        NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       text        NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (story_id, user_id)   -- one active reaction per viewer per story; latest tap wins
);

CREATE INDEX IF NOT EXISTS story_reactions_story_id_idx ON story_reactions(story_id);
CREATE INDEX IF NOT EXISTS story_reactions_user_id_idx  ON story_reactions(user_id);

-- Disable RLS — all reads/writes go through the API server with the service-role key
ALTER TABLE story_reactions DISABLE ROW LEVEL SECURITY;
