---
name: Seeder silently creates text-only posts on image-fetch failure
description: Why some seed-persona posts end up with no image; not yet fixed, flagged for future decision
---

`scripts/src/seed-content.ts` → `postToFeed()`: calls `fetchPexelsImage()` and, whatever it returns, always POSTs to `/api/posts/create` — there's no check that `image` is non-null before proceeding, and no retry/skip/abort path when the whole fallback query chain in `fetchPexelsImage()` is exhausted (it just returns `null` with a console warning).

`artifacts/api-server/src/routes/posts/create.ts` compounds this: when no `imageBase64` is sent, `media_url: mediaUrl ?? ""` stores an empty string rather than `null` and never rejects the request, so a caption-only "post" is created and looks indistinguishable from an intentional text post downstream (even though the Create UI in the app has no text-only post option).

**Why it matters:** confirmed root cause of at least one real seed post (`nabin.melb`, "...third hour of negotiation...") shipping with `image_url: ""`, `media_url: ""` — Pexels image search/download silently failed and the post was created anyway.

**Fixed (2026-07-10):** `postToFeed()` now returns early with a `SKIPPED_NO_IMAGE` error (no API call made) when `fetchPexelsImage()` exhausts its fallback chain and returns null, instead of falling through to create a captionless-image post. `posts/create.ts` intentionally left untouched — real-user upload validation is a separate concern. The seeder runs as its own Railway service (`glistening-warmth`); this fix needs a redeploy of that service specifically, not the main api-server or an EAS update.
