---
name: profiles FK ambiguity + RLS hang
description: posts table has multiple FKs to profiles; bare profiles() errors; profiles!user_id() works but triggers RLS hang on anon client
---

## Rule
NEVER use `profiles(*)` or `profiles(col,...)` on the `posts` table. Always use `profiles!user_id(*)`.

**Why:** The `posts` table has multiple FK paths to `profiles`. Bare `profiles()` causes an immediate PostgREST "ambiguous FK" error. This error was accidentally a protective shield — it resolved instantly, letting `Promise.allSettled` settle fast. After fixing to `profiles!user_id(*)`, PostgREST accepts the syntax and executes the JOIN, which triggers RLS evaluation on the anon key → hangs indefinitely.

## RLS Hang Pattern
Any direct `supabase.from('posts')` or `supabase.rpc(...)` call from the mobile anon client against RLS-protected tables can hang forever (never resolves OR rejects). This blocks `Promise.allSettled` callers indefinitely.

**How to apply:**
- ALL Supabase RPC calls that touch posts/reels must be wrapped with `rpcWithTimeout()` (helper in `lib/db.ts`)
- `fetchFreshPosts` has its own 4s timeout via `Promise.race`
- `getForYouFeed`: both `get_for_you_feed_v2` and `get_for_you_feed` RPCs are wrapped
- `getFriendsFeed`: `get_friends_feed` RPC is wrapped
- Any NEW RPC or direct query against posts/reels from the anon client must also use `rpcWithTimeout`

## Correct pattern (from lib/db.ts)
```ts
rpcWithTimeout(supabase.rpc('get_for_you_feed_v2', { ... }))
```

## Root cause chain
1. `fetchFreshPosts` had `profiles(*)` → immediate PostgREST error → fast fail → OK
2. FK sweep changed to `profiles!user_id(*)` → valid syntax → query executes → RLS hang
3. `Promise.allSettled` in `getForYouFeed`/`getFriendsFeed` waited forever
4. No `[loadTabData]` logs appeared; feeds stayed blank
5. Fix: `rpcWithTimeout` helper wraps all RPC calls + `fetchFreshPosts` has its own timeout
