---
name: Post-signup follow onboarding
description: How the "follow suggested accounts" onboarding screen and its once-per-signup gating work
---

The post-signup follow-suggestions screen is gated by an AsyncStorage flag (`follow_onboarding_seen:<userId>`), not a DB column — deliberately, so the feature stays pure JS/OTA-deployable with no migration.

**Why:** no `has_completed_onboarding` column exists on `profiles`; adding one would require a Supabase dashboard migration (manual step, deploy friction) for a feature that's otherwise fully client-side. AsyncStorage is per-device, which is an accepted tradeoff (screen may reappear after reinstall/new device — not a correctness bug).

**How to apply:** both post-auth redirect paths must check the flag before landing on `/(tabs)/feed`: the OAuth/new-session branch in `_layout.tsx` RootLayoutNav, and the username-setup completion branch in `setup-profile.tsx`. If either is bypassed, the screen won't show for that signup path.

The suggested-follows endpoint (`GET /api/onboarding/suggested-follows`) is the single shared suggestion pool — reused by the onboarding screen, the `/suggested-users` screen, and the Friends-tab empty-state CTA. Don't build a second suggestion query; extend this one instead.
