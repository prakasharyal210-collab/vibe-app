---
name: For You feed v1.1 tuning (pagination + diversity)
description: How the JS-ranked For You feed pool is built, cached, and windowed — read before touching feed.ts ranking/pagination again.
---

The v1-js-ranked path in `artifacts/api-server/src/routes/feed.ts` now computes the FULL ranked+diversified candidate pool once per user (`getRankedForYouPool`, cached 60s via `rankedFeedCache`), then windows it with `.slice(offset, offset+limit)` per request — never re-rank per page.

**Why:** ranking/filtering/poll-capping independently per page window can shrink an individual page below `limit`. The mobile client sets `atEnd = data.length < PAGE_SIZE`, so any page-local shrinkage silently kills pagination ("feed stops after ~10 posts") even though the underlying pool has plenty more. Always apply pool-wide operations (poll cap, diversity shuffle, category/content-type filter) BEFORE slicing, never after.

**Also:** `artifacts/api-server` dev script is `build && start` with no watch/hot-reload — always restart the workflow after editing route files before trusting curl test results, or you'll test stale code (caused a false pagination-bug diagnosis once already).

**How to apply:** any future ranking tweak (new boost, new penalty, new pool size) goes inside `getRankedForYouPool`/`computeForYouScore`/`diversifyFeed`, not inside the route handler's per-request slicing logic.
