---
name: Seeder single-category override pattern
description: How the drip-content seeder (glistening-warmth) is temporarily restricted to one theme, and how to revert.
---

`scripts/src/generate-seed-content.ts` has a `CATEGORY_OVERRIDE: ThemeCategory | null` constant (near `PERSONA_CATEGORIES`). When non-null, it forces every persona/post in a batch to use that single image theme (Pexels queries, captions, hashtags) and maps it to the matching app `category` field via `THEME_TO_APP_CATEGORY`, instead of each persona's normal 2-3 assigned themes.

**Why:** Needed a reversible way to run the seeder in single-topic mode (e.g. "nature only") without deleting the other 12 categories' prompt logic/config.

**How to apply:** To revert to the full 13-theme mix, set `CATEGORY_OVERRIDE = null` — that's the only line that needs to change. Like all seeder logic changes, this only takes effect after a manual Railway redeploy of the `glistening-warmth` service (no auto-deploy from repo commits, and it's separate from OTA/mobile or main API deploys).
