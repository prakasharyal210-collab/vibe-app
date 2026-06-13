-- One-time recalculation of profile stats counters
-- Run in Supabase Dashboard → SQL Editor
-- Safe to re-run (idempotent UPDATE)

UPDATE profiles SET
  posts_count = (
    SELECT COUNT(*) FROM posts WHERE posts.user_id = profiles.id
  ),
  followers_count = (
    SELECT COUNT(*) FROM follows WHERE follows.following_id = profiles.id
  ),
  following_count = (
    SELECT COUNT(*) FROM follows WHERE follows.follower_id = profiles.id
  );

-- Verify your counts after running:
-- SELECT id, username, posts_count, followers_count, following_count FROM profiles ORDER BY created_at DESC LIMIT 20;
