---
name: Pre-existing TS errors
description: Files with known TypeScript errors that should never be touched
---

## Never fix these files

- `components/SkeletonLoader.tsx` — ViewStyle filter type clash
- `hooks/useColors.ts` — Record index signature mismatch
- `app/(tabs)/_layout.tsx` line 74 — SFSymbols7_0 string type
- `app/sounds/[title].tsx` — PromiseLike.finally
- `app/edit-profile.tsx` — PromiseLike.finally + MediaType missing

**Why:** These are pre-existing issues unrelated to new feature work. Fixing them could break something else and is out of scope per user instructions.
