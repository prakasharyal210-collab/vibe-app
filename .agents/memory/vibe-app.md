---
name: Vibe app architecture
description: Key decisions for the Vibe social media Expo app (artifacts/mobile)
---

# Dark theme
`useColors()` always returns the `dark` palette — no system color scheme check. This was intentional (user wants dark-only). Do not revert to `useColorScheme()` without user approval.

**Why:** `userInterfaceStyle: "dark"` in app.json only forces dark on native. Web follows system scheme, so forcing in `useColors.ts` is required for consistent dark UI everywhere.

# Auth gate — TikTok model
`app/index.tsx` always redirects to `/(tabs)` (Reels tab) regardless of auth state. No login wall on entry. Login is ONLY required for: creating posts, liking, commenting, messaging, Find Vibe. Unauthenticated users see `LoginPrompt` modal when they try to interact.

**Why:** User explicitly requested "Anyone can browse WITHOUT logging in (like TikTok)."
**How to apply:** Do NOT redirect to `/(auth)/login` from `app/index.tsx`.

# Tab structure (5 tabs)
- `(tabs)/index` — Reels (TikTok-style, default, no login required)
- `(tabs)/feed` — Feed (Instagram-style, no login to browse)
- `(tabs)/create` — Create (center, gradient + button, login required)
- `(tabs)/find` — Find Vibe (Tinder swipe, login required)
- `(tabs)/profile` — Profile (shows guest state if not logged in)

Old tab files (explore, post, messages) still exist but redirect to new routes and are excluded from tab bar via `href: null` in `_layout.tsx`.

# Supabase setup
- Client at `lib/supabase.ts` uses `@react-native-async-storage/async-storage` as auth storage adapter.
- All data queries have try/catch with mock data fallback — tables may not exist yet.
- For post uploads: create a public `posts` bucket in Supabase Storage dashboard.

# Mock data
All mock data in `lib/supabase.ts`. Post/reel images use picsum.photos seeds. Find Vibe uses hardcoded card arrays in `find.tsx`.

# Route structure
- `app/index.tsx` — always redirects to `/(tabs)`
- `app/(auth)/` — Login + Signup (accessed from LoginPrompt or profile)
- `app/(tabs)/` — 5 tabs (index, feed, create, find, profile)
- `app/chat/[userId].tsx` — full-screen chat (stack route)
- `app/inbox.tsx` — messages list (accessed from profile top-right icon)

# Packages
All needed packages pre-installed in scaffold. Added: @supabase/supabase-js, @expo-google-fonts/poppins.

# LoginPrompt component
`components/LoginPrompt.tsx` — bottom-sheet Modal shown when guest tries to like/comment/message/create. Has "Sign In" (gradient) and "Create Account" buttons.
