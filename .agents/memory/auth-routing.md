---
name: Auth routing pattern — Expo Router
description: The correct pattern for post-login/logout navigation in this app using Expo Router.
---

## Rule

All auth-based navigation (post-login redirect, post-logout redirect) must live in `_layout.tsx`'s `RootLayoutNav`, NOT in individual screens.

**Why:** When `signInWithPassword` resolves and `onAuthStateChange` fires, React re-renders `AuthProvider` and all children. If the login screen simultaneously calls `router.replace`, the navigation and the auth-state re-render race — one can win, leaving the other's navigation dead with a blank/black screen.

## How to apply

`RootLayoutNav` tracks `session` transitions via `prevSessionRef`:
- `undefined` = initial state (loading not yet done) — skip, let `index.tsx` handle cold start
- `null → Session` = just signed in → `router.replace("/(tabs)/feed")`
- `Session → null` = just signed out → `router.replace("/(auth)/login")`

Login screen (`app/(auth)/login.tsx`) and signup screen must NOT call `router.replace` after a successful auth call. They only show errors if the call fails. Navigation is owned by `RootLayoutNav`.

## Guest browsing

Initial load with no session → `index.tsx` fires `router.replace("/(tabs)/feed")` (guests can browse freely). The `prevSessionRef === undefined` guard in `RootLayoutNav` ensures this cold-start path is not disturbed.
