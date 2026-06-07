---
name: Find Gundruk privacy settings
description: 3 new profile columns for Find Gundruk discovery privacy; where they live and how they wire together.
---

## Columns added to `profiles` table (Supabase)

- `show_in_matching boolean DEFAULT true` — whether user appears in discovery
- `find_gundruk_mode text DEFAULT 'dating'` — dating|friends|networking|browsing|hide
- `vibe_request_privacy text DEFAULT 'everyone'` — everyone|following|nobody

Migration SQL: `artifacts/mobile/supabase_migration_privacy.sql`

**Why:** Profiles live in Supabase, not the local Drizzle/postgres DB (DATABASE_URL). Running `psql $DATABASE_URL` returns "relation profiles does not exist" — the local DB only has API-server tables (Drizzle). All Supabase schema changes must be run from the Supabase SQL Editor.

## Code wiring

- `lib/db.ts` — `GundrukProfile` interface, `getGundrukProfile(userId)`, `saveGundrukProfile(userId, patch)` — reads/writes the 3 columns directly from the `profiles` table.
- `app/settings.tsx` — "FIND GUNDRUK" section between LANGUAGE & DATA and CREATOR TOOLS sections. Toggle for show_in_matching; OptionPicker for mode; OptionPicker for vibe request privacy.
- `app/(tabs)/find.tsx` — `ModeSelectionSheet` component (first-time bottom sheet); AsyncStorage key `gundruk_mode_selected_<userId>` marks as seen; orange pause banner when vibePrivacy === 'nobody'.

## get_vibe_matches RPC

The `get_vibe_matches` Supabase RPC needs its WHERE clause updated to add:
- `AND p.show_in_matching = true`
- `AND (p.vibe_request_privacy = 'everyone' OR ...following check...)`
- `AND p.find_gundruk_mode != 'hide'`

Template SQL is in `artifacts/mobile/supabase_migration_privacy.sql` Step 2.

## AsyncStorage key

`gundruk_mode_selected_<userId>` — set after first mode selection; checked on every Find Gundruk mount; if absent the ModeSelectionSheet appears.
