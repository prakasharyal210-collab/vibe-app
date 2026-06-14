-- ================================================================
-- Phase 1–4 social feature expansion migration
-- Run in Supabase SQL editor (service-role access)
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- PHASE 1: Mute, Close Friends, Stories audience, Message Requests
-- ──────────────────────────────────────────────────────────────────

-- Muted users
CREATE TABLE IF NOT EXISTS muted_users (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  muter_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  muted_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(muter_id, muted_id)
);

-- Close friends list
CREATE TABLE IF NOT EXISTS close_friends (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- Stories: audience column ('everyone' | 'close_friends')
ALTER TABLE stories ADD COLUMN IF NOT EXISTS audience text DEFAULT 'everyone';

-- ──────────────────────────────────────────────────────────────────
-- PHASE 2: Comment likes + replies, comment ranking
-- ──────────────────────────────────────────────────────────────────

-- Comment likes (persisted per user)
CREATE TABLE IF NOT EXISTS comment_likes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment_id  uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, comment_id)
);

-- Trigger to maintain comments.likes_count
CREATE OR REPLACE FUNCTION update_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comment_likes ON comment_likes;
CREATE TRIGGER trg_comment_likes
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION update_comment_likes_count();

-- Comment replies: parent_comment_id
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_comment_id uuid
  REFERENCES comments(id) ON DELETE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- PHASE 4: Activity status, Read receipts, Message reactions
-- ──────────────────────────────────────────────────────────────────

-- Profiles: last active timestamp
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- Messages: read receipt timestamp
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Message reactions (emoji per message per user)
CREATE TABLE IF NOT EXISTS message_reactions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id)
);
