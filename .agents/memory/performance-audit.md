---
name: Performance Audit Results
description: Latency measurements and fixes for LIKE, hashtag, follow, feed endpoints
---

## Baseline timings (localhost → Supabase, no mobile hop, June 2026)
| Endpoint | Before | After | Change |
|---|---|---|---|
| LIKE (engage) | 981ms | ~391ms warm | **-60%** |
| Hashtag feed | 1367ms cold / 350ms warm | ~389ms warm | ~same warm, cold improved |
| Follow | 310ms | ~211ms | -32% |
| Message SEND | 5ms | 5ms | unchanged |
| Healthz | 7ms | 2ms | — |

**Real-world mobile adds** ~50–200ms one-way network on top.

## Root causes found
1. **LIKE 981ms** — `upsertAffinity()` in engage.ts: SELECT + UPSERT per affinity key, sequentially. Creator + 2 categories = 6 sequential Supabase round trips × ~160ms = ~960ms.
2. **Hashtag 1.3s cold** — 3 sequential Supabase queries (hashtag lookup → post_ids → posts fetch).
3. **Feed load** — goes mobile→Supabase directly via RPC (already `Promise.allSettled` parallel). No server-side issue.
4. **Like + follow UI** — already optimistic before any of these fixes. ✅

## Fixes shipped (code-only, active now)
- `engage.ts`: category affinity bumps are now **fire-and-forget** (non-blocking). Response returns after creator bump only. Eliminates ~600ms of waiting per like.
- `engage.ts`: has `bumpAffinityRpcAvailable` flag; after first RPC failure stops retrying — no wasted round trips.
- `posts/create.ts` hashtag endpoint: tries `get_hashtag_posts` RPC first; sets `hashtagRpcAvailable = false` after first failure and falls back cleanly.
- `app.ts`: `X-Response-Time` header on every response (intercepts `res.end`).

## Fixes waiting on SQL deployment
Run **`scripts/performance-indexes.sql`** in Supabase SQL Editor to unlock:
- `bump_affinity(user_id, key, delta)` — atomic 1-round-trip affinity update. LIKE: 391ms → ~170ms.
- `get_hashtag_posts(tag, limit)` — single-JOIN query. Hashtag: ~389ms → ~150ms.
- 11 missing indexes: `follows(following_id)`, `notifications(user_id, created_at)`, `messages(conversation_id, created_at)`, `post_hashtags(hashtag_id)`, `posts/reels(score DESC)`, etc.

## Key patterns to maintain
- `bumpAffinity` must always be called for creator affinity (blocking), then categories fire-and-forget.
- Category affinity requires `categories TEXT[]` column on posts/reels — only populated after step8-category-auto-tagging.sql is run.
- Never move feed RPC calls to the API server — mobile→Supabase direct is already parallelized.
