-- ============================================================
-- Gundruk — Storage bucket setup + RLS policies
-- Run this entire script in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Create storage buckets (public so images are accessible without auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('posts', 'posts', true, 52428800, ARRAY['image/jpeg','image/png','image/gif','image/webp']),
  ('reels', 'reels', true, 524288000, ARRAY['video/mp4','video/quicktime','video/webm'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================================
-- 2. Storage RLS policies — posts bucket
-- ============================================================

-- Allow authenticated users to upload their own files
CREATE POLICY "Users can upload their own post media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'posts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read of all post media
CREATE POLICY "Post media is publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'posts');

-- Allow users to delete their own post media
CREATE POLICY "Users can delete their own post media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'posts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 3. Storage RLS policies — reels bucket
-- ============================================================

CREATE POLICY "Users can upload their own reel media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'reels'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Reel media is publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'reels');

CREATE POLICY "Users can delete their own reel media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'reels'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 4. Posts table RLS policies (if not already set)
-- ============================================================

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own posts" ON posts
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Posts are publicly readable" ON posts
FOR SELECT USING (true);

CREATE POLICY "Users can update own posts" ON posts
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts" ON posts
FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 5. Add image_url column if it doesn't exist
--    (app writes both media_url and image_url for compatibility)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE posts ADD COLUMN image_url text;
    UPDATE posts SET image_url = media_url WHERE image_url IS NULL;
  END IF;
END $$;
