---
name: Gundruk AI System
description: Architecture for all Claude AI features — centralized API endpoint, mobile client lib, and which screens have AI integrations.
---

## Architecture

**Never expose ANTHROPIC_API_KEY in mobile.** All Claude calls route through the API server.

- **Endpoint:** `POST /api/ai/chat` at `artifacts/api-server/src/routes/ai/chat.ts`
- **Mobile client:** `artifacts/mobile/lib/ai.ts` — `callAI(type, payload?, options?)` returns `string | null`; silently fails on error
- **Client caching:** AsyncStorage, 1-hour TTL, key = `gundruk_ai_v1:${type}:${JSON.stringify(payload)}`; skip cache with `{ noCache: true }`
- **Server caching:** in-memory Map, 1-hour TTL for cacheable types; general (chatbot) and smart_reply are never cached

## Supported types

bio_writer, story_idea, reel_script, hashtags, smart_reply, translate, tone_check, icebreakers, compatibility, conversation_starters, date_ideas, engagement_tips, best_time, welcome, video_description, general (multi-turn chatbot)

## Where AI is wired in

- **Inbox:** Gundruk AI bot entry at top of messages list → navigates to `/ai-chat`
- **ai-chat screen:** `artifacts/mobile/app/ai-chat.tsx` — full chatbot UI, multi-turn, uses type="general" with conversation history array
- **edit-profile:** "✨ Write My Bio" button below bio textarea → type="bio_writer"
- **chat/[userId].tsx:** Smart reply pills above input bar (auto-generated 700ms after last incoming message); match banner has Icebreakers/Starters/Date Ideas pill buttons
- **find.tsx MatchOverlay:** "🎲 Get Icebreakers" button → shows 3 clickable questions; tap navigates to chat with that user
- **create.tsx sidebar:** "AI Idea" button (Post mode) → story_idea modal; "AI Script" button (Video mode) → reel_script modal

## Important notes

- Claude often wraps JSON in markdown code blocks (```json). `parseAIJson()` uses regex `/\{[\s\S]*\}|\[[\s\S]*\]/` to extract the raw JSON — handles both wrapped and unwrapped
- The existing caption route at `/api/ai/caption` is separate and unchanged
- `selectedDuration` state in create.tsx is a string like "15s" or "3min"

**Why:** Single centralized endpoint is easier to rate-limit, cache, and audit. Mobile client has unified error handling and caching without duplicating logic in each screen.
