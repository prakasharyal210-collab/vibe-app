---
name: Vibe smart matching algorithm
description: 100-point scoring for Find Vibe; new tables, SQL function, anti-abuse limits, and boost system.
---

## SQL migration
File: `scripts/vibe-matching-migration.sql` — run this in the Supabase SQL Editor.

Creates:
- `vibe_swipes` table (user_id, target_id, direction left/right/super, created_at; UNIQUE user_id+target_id)
- `vibe_scores` table (user_id, target_id, score, computed_at; PK user_id+target_id)
- Replaces `get_vibe_matches()` Postgres function with the scored version

## Scoring breakdown (capped at 100)
Interests match 30 + goal match 25 + age compat 15 + location 15 + activity 10 + completeness 5
+ new-user boost 15 (first 48h) + visibility bonus up to 20 (avatar, bio, online)

## Why SECURITY DEFINER
The function runs as the DB owner so it can read all profiles regardless of RLS. Anon/authenticated both get EXECUTE.

## Anti-abuse limits (TypeScript side)
Constants exported from db.ts:
- FREE_DAILY_SWIPE_LIMIT = 100
- COOLDOWN_CONSECUTIVE_LEFTS = 20
- COOLDOWN_DURATION_MS = 3_600_000 (1 hour)

Functions exported from db.ts:
- recordVibeSwipe(userId, targetId, direction) — upsert to vibe_swipes, silently no-ops if table absent
- getDailySwipeCount(userId) — count of swipes in last 24h
- checkConsecutiveLeftCooldown(userId) — true if last 20 swipes all left AND within 1hr window
- saveVibeScore(userId, targetId, score) — upsert to vibe_scores

## find.tsx integration (SwipeCardDeck)
- State: dailySwipeCount, consecutiveLefts, cooldownUntil
- useEffect on mount: loads getDailySwipeCount + AsyncStorage cooldown key `vibe_cooldown_until:<userId>`
- handleSwipe: checks cooldown → checks daily limit → records swipe → tracks consecutive lefts → writes cooldown to AsyncStorage when triggered
- UI: thin progress bar + "N vibes left today" label below action buttons; amber cooldown pill when active

## Boost system
Implemented in SQL function ordering boosts (not separate column):
- new_user_boost: +15 if created_at within 48h
- visibility_bonus: avatar +10, bio +5, is_online +5

## Database note
Supabase Postgres ≠ Replit-managed Postgres (DATABASE_URL). The migration SQL must be run in the Supabase dashboard, not via pnpm push.
