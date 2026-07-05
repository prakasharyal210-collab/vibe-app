-- Run this in the Supabase SQL editor (Dashboard → SQL editor).
-- Creates the reels-watermarked storage bucket used by POST /api/reels/:id/download.
-- The bucket is public so getPublicUrl() returns a directly usable download URL.
--
-- NOTE: The API server's ensureSupabaseSetup() only auto-creates the buckets listed
-- in its hardcoded loop (posts, reels, media, avatars, snaps). reels-watermarked must
-- be created manually with this script once.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reels-watermarked',
  'reels-watermarked',
  true,                          -- public: getPublicUrl() returns usable URLs
  524288000,                     -- 500 MB file size limit per object
  ARRAY['video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read (download) from the bucket.
-- The API server writes using the service-role key which bypasses RLS.
CREATE POLICY "Public read access on reels-watermarked"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'reels-watermarked');

-- Verify
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'reels-watermarked';
