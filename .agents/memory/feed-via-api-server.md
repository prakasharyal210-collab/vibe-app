---
name: Feed fetching must go via API server
description: Supabase JS client RPC calls from the mobile device hang indefinitely — even with Promise.race+setTimeout the timers never fire. All feed RPCs must go via API server fetch().
---

# Rule
Never call `supabase.rpc()` or `supabase.from()` directly from the mobile app for feed/content loading. Always proxy through the API server.

**Why:** On this device's network path, the Supabase JS client's `fetch()` to Supabase hangs indefinitely. Crucially, `setTimeout`-based timeouts wrapped in `Promise.race` also never fire — so `Promise.allSettled` never resolves. The event loop IS alive (other timers/effects fire), but the Supabase network hold prevents the RPC timers from being dequeued. The API server reaches Supabase in <1 s using the service role key; `fetch()` from mobile to the API server always completes.

**How to apply:**
- `getForYouFeed` → `fetch(/api/feed/foryou?userId=...&limit=...&offset=...)`
- `getFriendsFeed` → `fetch(/api/feed/friends?userId=...&limit=...&offset=...)`
- Reels For You → `fetch(/api/feed/reels?userId=...&limit=...)`
- Reels Following → `fetch(/api/feed/following-reels?userId=...&limit=...)`
- Route file: `artifacts/api-server/src/routes/feed.ts` (registered at `/api/feed`)
- All routes use service role key via `makeSupabase()` — bypasses RLS, responds in <600 ms.

**Confirmed working:** For You = 9 posts (source: v2), Friends = 7 posts (source: rpc) — both load immediately on device after HMR update.
