-- Counter Integrity Triggers
-- Run this in the Supabase SQL editor.
-- These triggers keep denormalized count columns in sync automatically
-- so no app code ever needs to manually increment or decrement them.

-- ─── Likes count on posts ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE posts SET likes_count = COALESCE(likes_count, 0) + 1
    WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE posts SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_likes_count ON likes;
CREATE TRIGGER trg_post_likes_count
AFTER INSERT OR DELETE ON likes
FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

-- ─── Comments count on posts ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_post_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE posts SET comments_count = COALESCE(comments_count, 0) + 1
    WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE posts SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comments_count ON comments;
CREATE TRIGGER trg_post_comments_count
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION update_post_comments_count();

-- ─── Likes count on reels ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_reel_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE reels SET likes_count = COALESCE(likes_count, 0) + 1
    WHERE id = NEW.reel_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE reels SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
    WHERE id = OLD.reel_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reel_likes_count ON reel_likes;
CREATE TRIGGER trg_reel_likes_count
AFTER INSERT OR DELETE ON reel_likes
FOR EACH ROW EXECUTE FUNCTION update_reel_likes_count();

-- ─── Comments count on reels ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_reel_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE reels SET comments_count = COALESCE(comments_count, 0) + 1
    WHERE id = NEW.reel_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE reels SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0)
    WHERE id = OLD.reel_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reel_comments_count ON reel_comments;
CREATE TRIGGER trg_reel_comments_count
AFTER INSERT OR DELETE ON reel_comments
FOR EACH ROW EXECUTE FUNCTION update_reel_comments_count();

-- ─── Followers / following counts on profiles ──────────────────────────────────

CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE profiles SET followers_count = COALESCE(followers_count, 0) + 1
    WHERE id = NEW.following_id;
    UPDATE profiles SET following_count = COALESCE(following_count, 0) + 1
    WHERE id = NEW.follower_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE profiles SET followers_count = GREATEST(COALESCE(followers_count, 0) - 1, 0)
    WHERE id = OLD.following_id;
    UPDATE profiles SET following_count = GREATEST(COALESCE(following_count, 0) - 1, 0)
    WHERE id = OLD.follower_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_counts ON follows;
CREATE TRIGGER trg_follow_counts
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- ─── Posts count on profiles ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_profile_posts_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE profiles SET posts_count = COALESCE(posts_count, 0) + 1
    WHERE id = NEW.user_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE profiles SET posts_count = GREATEST(COALESCE(posts_count, 0) - 1, 0)
    WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_posts_count ON posts;
CREATE TRIGGER trg_profile_posts_count
AFTER INSERT OR DELETE ON posts
FOR EACH ROW EXECUTE FUNCTION update_profile_posts_count();

DROP TRIGGER IF EXISTS trg_profile_reels_count ON reels;
CREATE TRIGGER trg_profile_reels_count
AFTER INSERT OR DELETE ON reels
FOR EACH ROW EXECUTE FUNCTION update_profile_posts_count();

-- ─── Backfill: recount all existing rows ──────────────────────────────────────
-- This one-time update brings all denormalized counts in sync with the actual data.
-- Safe to run multiple times (idempotent).

UPDATE profiles p SET
  followers_count  = (SELECT COUNT(*) FROM follows WHERE following_id = p.id),
  following_count  = (SELECT COUNT(*) FROM follows WHERE follower_id  = p.id),
  posts_count      = (SELECT COUNT(*) FROM posts   WHERE user_id      = p.id)
                   + (SELECT COUNT(*) FROM reels   WHERE user_id      = p.id);

UPDATE posts p SET
  likes_count    = (SELECT COUNT(*) FROM likes    WHERE post_id = p.id),
  comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = p.id);

UPDATE reels r SET
  likes_count    = (SELECT COUNT(*) FROM reel_likes    WHERE reel_id = r.id),
  comments_count = (SELECT COUNT(*) FROM reel_comments WHERE reel_id = r.id);
