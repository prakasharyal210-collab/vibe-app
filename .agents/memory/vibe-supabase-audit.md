---
name: Vibe app mock-to-Supabase audit
description: Which screens had mock initial states and what was done to fix them; key db.ts functions added
---

## Pre-existing TS errors — NEVER fix
`SkeletonLoader.tsx`, `useColors.ts`, `_layout.tsx` (SFSymbols), `sounds/[title].tsx`, `edit-profile.tsx`

## Platform offsets (web/native)
`topInset = Platform.OS === "web" ? 67 : insets.top`
`bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50`

## What was fixed (session 2)
All files now start with empty `[]` / `null` states and load real Supabase data:

- **notifications.tsx** — `useState([])` not `useState(MOCK_NOTIFICATIONS)`
- **inbox.tsx** — `useState([])` not `useState(MOCK_CONVERSATIONS)`
- **search.tsx** — all 4 state inits are `[]`
- **wallet.tsx** — `TRANSACTIONS` hardcoded array removed; empty-state shown when no real data; `EARNINGS_DATA` chart kept static (transactions don't carry raw timestamps in type)
- **index.tsx (reels)** — `MOCK_REELS` / `MOCK_FOLLOWING_REELS` constants deleted; both states start `[]`; Supabase RPCs `get_for_you_reels` / `get_following_reels` fill them

## profile/[username].tsx — full data rewrite
- Removed: `UserRecord`, `MOCK_USER_DATA`, `getDefaultData`, `GRID_IMAGES`
- Added: `profile` (PublicProfile | null), `posts` (ProfileGridItem[]) state
- Loads: `lookupProfileByUsername(u)` → `fetchProfilePosts(profile.id)` → `checkIsFollowing(myId, profile.id)` + `isUserBlocked(myId, profile.id)`
- Follow button calls real Supabase insert/delete on `follows` table
- `ThreeDotsModal` now takes `userId?` prop — passes `profile?.id` so `blockUser` gets a real UUID not a username string
- `userData` derived object maps Supabase fields to the same shape the render expects (no render changes needed)

## db.ts additions (session 2)
- `PublicProfile` interface — shape from `profiles` table
- `lookupProfileByUsername(username)` — `maybeSingle()` on profiles by username
- `checkIsFollowing(followerId, followingId)` — checks `follows` table
- `ensureUserSetup(userId, username, email?)` — idempotent: creates profile / wallet / user_settings / vibe_scores rows if missing

## AuthContext.tsx
- Calls `ensureUserSetup` on `SIGNED_IN` and `TOKEN_REFRESHED` events — guarantees all required rows exist for every login

**Why:** Supabase may or may not have DB triggers that auto-create rows. `ensureUserSetup` is a safety net so the app never crashes due to missing profile/wallet rows.
