-- ══════════════════════════════════════════════════════════════════════════════
-- Performance: missing indexes + atomic bump_affinity RPC
-- Run in Supabase SQL Editor — safe to re-run (IF NOT EXISTS / OR REPLACE)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Indexes ────────────────────────────────────────────────────────────────

-- user_interests: primary lookup in engage route (user_id + interest_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_interests_uid_key
  ON public.user_interests (user_id, interest_key);

-- follows: feed queries filter/join on following_id
CREATE INDEX IF NOT EXISTS idx_follows_following_id
  ON public.follows (following_id);

-- follows: notification queries filter on follower_id
CREATE INDEX IF NOT EXISTS idx_follows_follower_id
  ON public.follows (follower_id);

-- messages: conversation message paging (most common query)
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON public.messages (conversation_id, created_at DESC);

-- notifications: per-user feed sorted by time
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- posts: score-ordered feed (get_for_you_feed_v2/v3 ORDER BY score)
-- Only created if the score column exists (added by personalization-migration.sql)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'score'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_posts_score_desc ON public.posts (score DESC NULLS LAST)';
  END IF;
END $$;

-- reels: score-ordered reel feed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reels' AND column_name = 'score'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reels_score_desc ON public.reels (score DESC NULLS LAST)';
  END IF;
END $$;

-- post_hashtags: hashtag→posts lookup (used by /api/posts/hashtag/:tag)
CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag_id
  ON public.post_hashtags (hashtag_id);

-- hashtags: name lookup
CREATE INDEX IF NOT EXISTS idx_hashtags_name
  ON public.hashtags (name);

-- blocks: both directions for RLS checks
CREATE INDEX IF NOT EXISTS idx_blocks_blocker
  ON public.blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked
  ON public.blocks (blocked_id);

-- ── 2. bump_affinity — atomic single-round-trip affinity update ───────────────
-- Replaces the 2-round-trip SELECT → compute → UPSERT pattern in engage.ts.
-- Uses INSERT ... ON CONFLICT DO UPDATE so the whole operation is one DB call.
-- Weight clamped to [-5, 10].
CREATE OR REPLACE FUNCTION public.bump_affinity(
  p_user_id     uuid,
  p_key         text,
  p_delta       float
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.user_interests (user_id, interest_key, weight, updated_at)
  VALUES (p_user_id, p_key, LEAST(10, GREATEST(-5, p_delta)), now())
  ON CONFLICT (user_id, interest_key)
  DO UPDATE SET
    weight     = LEAST(10, GREATEST(-5, public.user_interests.weight + p_delta)),
    updated_at = now();
$$;

-- ── 3. get_hashtag_posts — single-query replacement for 3-hop hashtag fetch ──
-- Combines hashtag lookup + join table + posts fetch into ONE round trip.
CREATE OR REPLACE FUNCTION public.get_hashtag_posts(
  p_tag   TEXT,
  p_limit INT DEFAULT 60
)
RETURNS TABLE (
  id          uuid,
  media_url   text,
  likes_count int,
  is_reel     bool,
  posts_count int
)
LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.media_url,
    p.likes_count,
    p.is_reel,
    h.posts_count
  FROM public.hashtags h
  JOIN public.post_hashtags ph ON ph.hashtag_id = h.id
  JOIN public.posts          p  ON p.id          = ph.post_id
  WHERE h.name = p_tag
  ORDER BY p.likes_count DESC NULLS LAST
  LIMIT p_limit;
$$;
