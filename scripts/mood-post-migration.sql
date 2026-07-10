-- Adds an explicit post_type marker column so "Mood" (text-only) posts can be
-- distinguished from legacy/incomplete rows. Existing rows are left NULL —
-- their type is still inferred from is_video / media_url / polls join as before.
-- The API server gracefully falls back to omitting this column if the
-- migration hasn't been run yet (see posts/create.ts insert fallback chain),
-- but Mood posts won't render correctly on read until this is applied.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_type TEXT;

COMMENT ON COLUMN posts.post_type IS
  'Explicit post type marker. Currently only set to ''mood'' for text-only posts; photo/video/poll remain inferred from is_video/media_url/polls join.';
