---
name: Gender-based matching system
description: Architecture of the Find Vibe gender-matching feature added to the mobile app
---

## Key decisions

**Setup wizard gating:** `AsyncStorage.getItem("vibeSetupDone:{userId}")` checked on `FindVibeScreen` mount. If missing, also queries Supabase `vibe_preferences` table. Shows `VibeSetupWizard` only if both are absent.

**Why:** First-time UX requires gender/preference data before showing gender-filtered cards. AsyncStorage avoids a Supabase round-trip on every open after setup.

**sendVibeRequest returns 'matched' | 'pending':** Checks `vibe_requests` for reverse-pending record first. If found → mutual match → updates status + inserts to `vibe_matches` both directions → returns 'matched'. Otherwise inserts new pending request and returns 'pending'.

**Why:** Enables real mutual-match detection without a separate scheduled job. Falls back to random (30% match) on Supabase error so demo still feels lively.

**getVibeMatches/getMyVibeMatches:** Call Supabase RPCs `get_vibe_matches` / query `vibe_matches` with join. Fall back to `MOCK_MATCH_PROFILES` / `MOCK_MY_MATCHES` on any error or empty result.

**Cards flow:** `FindVibeScreen` loads cards via `getVibeMatches` (with prefs as filters) and splits into `nearbyCards` (has distance) and `sameVibeCards` (has vibe/vibeScore). SwipeCardDeck receives whichever the active tab needs.

**Tabs:** 5 tabs (📍 Near, ✨ Vibe, 🌟 Daily, 🏠 Rooms, 💜 Matches) in a horizontal ScrollView so text doesn't truncate on smaller screens.

**FilterModal:** Enhanced with Show Me (gender multiselect), Looking For (goal), Age Range (min + max), Max Distance, Online Only toggle, Verified Only toggle. Passes `FilterState` to `handleApplyFilters` which re-fetches cards with new filters.

## Tables/RPCs expected in Supabase (not necessarily created)
- `vibe_preferences` (user_id, gender, interested_in[], looking_for, age, age_min, age_max, max_distance_km)
- `vibe_requests` (sender_id, receiver_id, status, matched_at)
- `vibe_matches` (user_id, matched_user_id, status, matched_at)
- RPC `get_vibe_matches(p_user_id, p_interested_in, p_looking_for, p_age_min, p_age_max, p_max_distance_km)`
- RPC `get_my_vibe_matches(p_user_id)` — or direct query as implemented
