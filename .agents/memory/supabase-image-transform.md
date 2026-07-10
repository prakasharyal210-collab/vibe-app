---
name: Supabase Storage image transform helper
description: How Gundruk resizes/compresses images on the fly via Supabase Storage's render/image endpoint
---

All Gundruk media buckets (posts, reels, avatars, media) are created `public: true`, so stored URLs are `.../storage/v1/object/public/<bucket>/<path>`.

`artifacts/mobile/lib/imageUrl.ts` rewrites that to Supabase's transform endpoint (`.../storage/v1/render/image/public/...?width=W&height=H&resize=cover&quality=Q`) via `thumbUrl()` (200px, grids) and `cardUrl()` (800px, feed/reel cards). `getTransformedImageUrl(url, "full")` returns the URL untouched — used for fullscreen photo/story viewers.

**Why:** avoids shipping full 2500px+ originals to small UI surfaces; pure string rewrite done client-side, so it's OTA-deployable with no api-server or upload-pipeline changes.

**How to apply:** wrap any new `<Image source={{ uri: ... }}>` reading from these buckets with `thumbUrl()`/`cardUrl()` based on the rendered size; keep cache keys / `recyclingKey` on the *original* untransformed URL so `_ratioCache`-style keying stays consistent. Requires the Supabase project to be on a plan with Image Transformations enabled — falls through to the plain object URL otherwise only if Supabase itself 400s (not handled defensively; verify the toggle is on before relying on it).
