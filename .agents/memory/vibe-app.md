---
name: Vibe app architecture
description: Key decisions for the Vibe social media Expo app (artifacts/mobile)
---

# Dark theme
`useColors()` always returns the `dark` palette — no system color scheme check. This was intentional (user wants dark-only). Do not revert to `useColorScheme()` without user approval.

**Why:** `userInterfaceStyle: "dark"` in app.json only forces dark on native. Web follows system scheme, so forcing in `useColors.ts` is required for consistent dark UI everywhere.

# Supabase setup
- Client at `lib/supabase.ts` uses `@react-native-async-storage/async-storage` as auth storage adapter.
- All data queries have try/catch with mock data fallback — tables (`posts`, `profiles`, `messages`) may not exist yet in the Supabase project.
- For post uploads to work: create a public `posts` bucket in the Supabase Storage dashboard.

# Mock data
All mock data lives in `lib/supabase.ts` (MOCK_POSTS, MOCK_STORIES, MOCK_CONVERSATIONS, MOCK_NEARBY_USERS). Post images use picsum.photos seeds.

# Route structure
- `app/index.tsx` — auth gate; redirects to `/(tabs)` or `/(auth)/login`
- `app/(auth)/` — Login + Signup screens (stack, no tab bar)
- `app/(tabs)/` — 5 tabs: index(Feed), explore, post, messages, profile
- `app/chat/[userId].tsx` — full-screen chat (stack route, no tab bar)

# Packages
All needed packages were pre-installed in scaffold: expo-linear-gradient, expo-image-picker, expo-location, @react-native-async-storage/async-storage. Added: @supabase/supabase-js, @expo-google-fonts/poppins.

**How to apply:** Do not re-install pre-installed packages; check package.json first.
