---
name: Supabase RLS bypass via API server
description: Posts/reels tables have RLS that blocks both INSERT and SELECT from the mobile anon client. Route all writes and user-specific reads through the API server (service role key).
---

## Rule
Never do `supabase.from('posts').insert(...)` or `supabase.from('posts').select(...)` for user-owned data directly from the mobile app. The posts and reels tables have RLS enabled with no permissive policies for the anon/authenticated client — inserts hang (15s timeout), selects return [].

## How to apply
- **Create post** → `POST /api/posts/create` with `{ userId, imageBase64, mimeType, ext, caption }`
- **Create reel** → `POST /api/reels/create` with `{ userId, videoBase64, mimeType, ext, caption, duration }`
- **Read user posts+reels** → `GET /api/posts/user/:userId` returns `{ posts, reels }`
- API server uses service role key (SUPABASE_SERVICE_ROLE_KEY) which bypasses all RLS.

**Why:** The Supabase project has RLS enabled on posts/reels but no INSERT or SELECT policies configured for authenticated mobile users. Direct Supabase client calls from the device either hang (INSERT) or return empty (SELECT). Running via API server with service role key bypasses this entirely.

## expo-file-system SDK 54 note
- `readAsStringAsync` moved to legacy API in SDK 54 — import from `expo-file-system/legacy`, not `expo-file-system`
- `EncodingType` named export is undefined at runtime — use the string literal `'base64'` directly instead of `EncodingType.Base64`
- Express JSON body limit must be raised to `"25mb"` to handle base64-encoded photo payloads
