---
name: Full RLS audit complete
description: All active-screen direct supabase.from/rpc calls in mobile have been rerouted through the API server. Summary of what was done and what intentionally remains.
---

# Rule
Every mobile screen/component that reads or writes DB tables must go through the API server (service-role key bypasses RLS). Direct anon-key calls to RLS-protected tables hang indefinitely (15s timeout on writes) or return empty arrays.

**Why:** Supabase RLS policies block the anon key for most tables. The service-role key on the API server bypasses all policies cleanly.

**How to apply:** Any new `supabase.from(...)` or `supabase.rpc(...)` added to mobile must be proxied via a new API route. `supabase.auth.*`, `supabase.storage.getPublicUrl()`, and realtime channel subscriptions are exempt (they don't touch RLS-protected table data).

# New API endpoints added in this audit (final batch)

| Endpoint | File |
|----------|------|
| GET /api/vibe/swipe-count | routes/vibe.ts |
| GET /api/stories/active-user-ids | routes/stories.ts |
| GET /api/stories/my | routes/stories.ts |
| GET /api/stories/highlights (GET/POST/DELETE) | routes/stories.ts |
| GET /api/stories/highlights/:id/stories (GET/POST/DELETE) | routes/stories.ts |
| GET /api/users/hashtags | routes/users/search.ts |
| GET /api/rewards/leaderboard | routes/rewards.ts |
| POST /api/live/stream | routes/live.ts (new file) |
| PATCH /api/live/stream/:id/end | routes/live.ts |
| PATCH /api/posts/:id/pin | routes/posts/update.ts |
| GET /api/posts/by-location | routes/posts/create.ts |

# Mobile functions fixed (final batch)
- `getDailySwipeCount` → GET /api/vibe/swipe-count
- `fetchHighlights` → GET /api/stories/highlights
- `createHighlight` → POST /api/stories/highlights
- `deleteHighlight` → DELETE /api/stories/highlights/:id
- `fetchHighlightStories` → GET /api/stories/highlights/:id/stories
- `addStoryToHighlight` → POST /api/stories/highlights/:id/stories
- `removeStoryFromHighlight` → DELETE /api/stories/highlights/:id/stories/:storyId
- `fetchMyStories` → GET /api/stories/my
- `searchHashtags` → GET /api/users/hashtags
- `fetchLeaderboard` → GET /api/rewards/leaderboard
- `createLiveStream` → POST /api/live/stream
- `endLiveStream` → PATCH /api/live/stream/:id/end
- `togglePinPost` → PATCH /api/posts/:id/pin
- `inbox.tsx loadStories` → GET /api/stories/active-user-ids
- `location/[name].tsx` → GET /api/posts/by-location

# Intentionally left as direct supabase calls (all dead code — zero UI callers)
- `checkReposted`, `toggleRepost`, `fetchRepostedPosts` — reposts feature removed from UI
- `fetchLikedPosts` — no screen imports it
- `createVibeMatch` — no screen calls it
- `fetchActiveStories` — superseded by inbox.tsx's loadStories (now fixed)
- `fetchUserProfile`, `updateUserProfile` — no screen calls these
- `getPinnedCount` — no screen calls it
- `fetchFreshPosts` (db.ts:1224) — internal feed fallback with 4s timeout guard; won't hang indefinitely
