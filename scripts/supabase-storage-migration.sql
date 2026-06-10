-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/tatroqgcyebuqqkhmvpa/sql

-- 1. Add image_url column to posts table (the app uses media_url as canonical;
--    image_url is kept as a read alias populated by trigger for backwards compat)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Backfill existing rows
UPDATE posts SET image_url = media_url WHERE image_url IS NULL AND media_url IS NOT NULL;

-- Keep image_url in sync with media_url on insert/update
CREATE OR REPLACE FUNCTION sync_posts_image_url()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.media_url IS NOT NULL THEN
    NEW.image_url := NEW.media_url;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_posts_image_url ON posts;
CREATE TRIGGER trg_sync_posts_image_url
  BEFORE INSERT OR UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION sync_posts_image_url();

-- 2. Storage buckets (posts, reels, media, avatars) are created automatically
--    by the API server on startup using the SUPABASE_SERVICE_ROLE_KEY.
--    If you prefer to create them manually, run in the Supabase Storage UI:
--    - posts  (public)
--    - reels  (public)
--    - media  (public)
--    - avatars (public)

-- 3. Storage RLS policies — allow authenticated uploads and public reads
DO $$
BEGIN
  -- posts bucket
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'posts_public_read'
  ) THEN
    EXECUTE 'CREATE POLICY posts_public_read ON storage.objects FOR SELECT USING (bucket_id = ''posts'')';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'posts_auth_upload'
  ) THEN
    EXECUTE 'CREATE POLICY posts_auth_upload ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''posts'' AND auth.role() = ''authenticated'')';
  END IF;

  -- reels bucket
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'reels_public_read'
  ) THEN
    EXECUTE 'CREATE POLICY reels_public_read ON storage.objects FOR SELECT USING (bucket_id = ''reels'')';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'reels_auth_upload'
  ) THEN
    EXECUTE 'CREATE POLICY reels_auth_upload ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''reels'' AND auth.role() = ''authenticated'')';
  END IF;
END $$;
