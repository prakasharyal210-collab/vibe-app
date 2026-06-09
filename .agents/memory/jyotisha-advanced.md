---
name: Jyotisha advanced features
description: 8 new advanced Jyotisha tabs added to JyotishaTab.tsx and 6 new AI routes in chat.ts; JYOTISHA_KNOWLEDGE knowledge base.
---

## What was added

### AI route (artifacts/api-server/src/routes/ai/chat.ts)
- `JYOTISHA_KNOWLEDGE` const (~3000 chars) injected into `jyotishi_chat` system prompt and all new buildPrompt cases
- 6 new buildPrompt cases: `jyotisha_prashna`, `jyotisha_spiritual_path`, `jyotisha_past_life`, `jyotisha_karma_types`, `jyotisha_ishta_devata`, `jyotisha_navamsa`

### JyotishaTab.tsx (artifacts/mobile/components/JyotishaTab.tsx)
- New cache key functions: `SPIRITUAL_PATH_KEY`, `PAST_LIFE_KEY`, `KARMA_TYPES_KEY`, `ISHTA_KEY`, `NAVAMSA_KEY`, `JAPA_COUNTS_KEY`
- `NAKSHATRA_DASHA` map + `calcDashas()` function for Vimshottari Dasha calculation (pure JS, no AI)
- `MANTRA_LIBRARY` const with all 9 Navagraha mantras (Sanskrit, transliteration, benefit, day)
- 8 new section components: `PrashnaSection`, `SpiritualPathSection`, `PastLifeSection`, `KarmaTypesSection`, `IshtaDevataSection`, `DashaCalendarSection`, `MantraLibrarySection`, `NavamsaSection`
- Section type updated, NAV has 20 tabs total, all sections wired in render

## Key technical constraint
`parseAIJson<T>()` requires 2 arguments: `(raw, fallback)`. For nullable results use `parseAIJson<MyType | null>(raw, null)`.

**Why:** The function signature is `parseAIJson<T>(result: string | null, fallback: T): T` — TypeScript infers T from fallback, so null requires T to include null in its union.
