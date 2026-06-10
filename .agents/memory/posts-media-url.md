---
name: Posts table media_url column
description: The Supabase posts table uses media_url, NOT image_url. image_url column does not exist. Storage buckets must be created manually.
---

## The Rule
Never SELECT or INSERT `image_url` explicitly on the posts table. Use `media_url` as the canonical column.

**Why:** The Supabase posts table was created with `media_url`. The `image_url` column never existed. Every explicit SELECT or INSERT referencing `image_url` returns a Postgres error ("column posts.image_url does not exist"), silently failing the whole query.

**How to apply:**
- INSERT payloads: use only `media_url`
- SELECT queries: use `media_url` (or `select('*')` which is fine)
- Render sites: use `item.media_url ?? item.image_url` for backwards compat
- Notifications join: `posts:post_id(media_url)` not `image_url`

## SQL migration
`scripts/supabase-storage-migration.sql` adds an `image_url` column + sync trigger so both work going forward. Run in Supabase dashboard SQL editor.

## Storage buckets
No buckets existed (posts, reels, media, avatars all missing). Must create in Supabase Storage UI as public buckets, OR the API server `ensureStorageBuckets()` on startup will create them if `SUPABASE_SERVICE_ROLE_KEY` is available.

**Without buckets:** storage.upload() fails → mediaUrl stays as local `file://` URI → gets stored in DB → image shows blank in profile grid.
