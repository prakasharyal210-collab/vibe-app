---
name: Vibe discovery preferences
description: 5 new user_settings columns for Find Vibe filtering; getNearbyUsers now proxies through API server /deck route instead of calling the RPC directly.
---

## Rule
`getNearbyUsers` in `lib/db.ts` must call `GET /api/vibe/deck` on the API server — NOT `supabase.rpc("get_nearby_users")` directly. The `_radiusKm` param is accepted for backward compat but ignored; the API server reads radius from the user's `vibe_max_distance_km` setting.

**Why:** All server-side filtering (age range, distance, exclude_connections, strip distance for vibe_show_distance=false) requires service-role access to multiple tables. The mobile client can't do this atomically without exposing service keys.

## New user_settings columns (run scripts/vibe-prefs-migration.sql in Supabase dashboard)
- `vibe_age_min` SMALLINT DEFAULT 18
- `vibe_age_max` SMALLINT DEFAULT 60
- `vibe_max_distance_km` SMALLINT DEFAULT 50
- `vibe_show_distance` BOOLEAN DEFAULT TRUE — controls whether distance_km is visible to OTHER users' swipe decks
- `vibe_exclude_connections` BOOLEAN DEFAULT FALSE — excludes mutual follows from the viewer's own deck

## API route GET /api/vibe/deck
Located in `artifacts/api-server/src/routes/vibe.ts`. Steps:
1. Read viewer's 4 settings columns
2. Call `get_nearby_users` RPC with `p_radius_km = vibe_max_distance_km`
3. JS-filter by age range
4. If `vibe_exclude_connections`: fetch follows both ways, exclude those IDs
5. Batch-fetch `vibe_show_distance` for all candidate IDs; strip `distance_km` where false

## How to apply
Any future change to the vibe swipe deck (what profiles appear, what fields are shown) must go through this route. Do not revert `getNearbyUsers` to call the RPC directly.
