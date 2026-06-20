-- Story views table — run once in the Supabase dashboard SQL editor.
-- Records one row per viewer per story (upserted, so repeated opens don't duplicate).
-- story_reactions already exists from story-reactions-migration.sql.

CREATE TABLE IF NOT EXISTS story_views (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id   uuid        NOT NULL REFERENCES stories(id)   ON DELETE CASCADE,
  viewer_id  uuid        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  viewed_at  timestamptz DEFAULT now()                     NOT NULL,
  UNIQUE (story_id, viewer_id)   -- one row per viewer; upsert updates viewed_at on re-view
);

CREATE INDEX IF NOT EXISTS idx_story_views_story_id  ON story_views(story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer_id ON story_views(viewer_id);
