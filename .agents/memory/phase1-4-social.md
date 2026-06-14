---
name: Phase 1-4 social features
description: Mute, close-friends, mutuals, comment likes, saved posts, message reactions — all API-routed; SQL migration location and key prop gotcha.
---

## What was built
Comprehensive social engagement features across 4 phases:

**API endpoints added:**
- `POST/DELETE /api/users/social/mute` — mute/unmute a user
- `GET /api/users/social/mute-status?muterId=&mutedId=` — check mute status
- `GET /api/users/social/close-friends?userId=` — list close friends
- `POST/DELETE /api/users/social/close-friends` — add/remove close friend
- `GET /api/users/social/mutuals?viewerId=&targetId=` — mutual followers
- `POST /api/comments/like` — toggle comment like (returns `{ liked, likes_count }`)
- `GET /api/posts/saved?userId=` — user's saved/favourited posts
- `PATCH /api/messages/read` — mark messages read
- `POST /api/messages/react` — toggle emoji reaction on message
- `GET /api/messages/reactions?messageIds=` — grouped by message ID
- `POST/GET /api/messages/activity` — update / read last_active_at

**Mobile screens/components:**
- `app/close-friends.tsx` — new screen with search + toggle, green badge indicators
- `components/CommentsSheet.tsx` — full rewrite: sort toggle (Top/Recent), persisted likes via API, reply-to functionality
- `app/profile/[username].tsx` — Mute option in ThreeDotsModal, mutual followers display ("Followed by @x, @y and N others")
- `app/inbox.tsx` — messageRequests state, ChatsTab shows requests banner row with purple badge
- `app/(tabs)/profile.tsx` — Saved tab (bookmark icon), loads via /api/posts/saved, empty state

**DB tables (run in Supabase dashboard):**
`scripts/phase1-4-migration.sql` — muted_users, close_friends, stories.audience, comment_likes + trigger, comments.parent_comment_id, profiles.last_active_at, messages.read_at, message_reactions

## Key gotchas
- `UserAvatar` component prop is `url` (not `avatarUrl`) — confirmed from UserAvatar.tsx line 14.
- Comment likes API toggle returns `{ liked: boolean, likes_count: number }` — use both values to update UI.
- Saved posts endpoint uses `favourites` table (Supabase) joined to `posts` with service-role key to bypass RLS.

**Why:** All DB reads/writes route through API server (service-role Supabase key) — direct Supabase client from mobile hangs on Android for certain query patterns.
