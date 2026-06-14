-- ══════════════════════════════════════════════════════════════════════════════
-- Performance: missing indexes + atomic bump_affinity RPC
-- Run in Supabase SQL Editor — safe to re-run (IF NOT EXISTS / OR REPLACE)
-- Every index is wrapped in a column-existence check so it never fails on
-- schema mismatches between environments.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Helper: create index only when all required columns exist ─────────────────
-- Each DO block checks the schema before issuing CREATE INDEX IF NOT EXISTS.

-- user_interests (user_id + interest_key)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_interests' AND column_name='user_id')
 AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_interests' AND column_name='interest_key')
  THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_interests_uid_key ON public.user_interests (user_id, interest_key)';
  END IF;
END $$;

-- follows (following_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='follows' AND column_name='following_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows (following_id)';
  END IF;
END $$;

-- follows (follower_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='follows' AND column_name='follower_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows (follower_id)';
  END IF;
END $$;

-- messages (conversation_id + created_at)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='conversation_id')
 AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='created_at')
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages (conversation_id, created_at DESC)';
  END IF;
END $$;

-- notifications — try user_id first, fall back to recipient_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='user_id')
 AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='created_at')
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC)';
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='recipient_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='created_at')
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON public.notifications (recipient_id, created_at DESC)';
  END IF;
END $$;

-- posts (score) — only if personalization migration has been run
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='score') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_posts_score_desc ON public.posts (score DESC NULLS LAST)';
  END IF;
END $$;

-- reels (score) — only if personalization migration has been run
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reels' AND column_name='score') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reels_score_desc ON public.reels (score DESC NULLS LAST)';
  END IF;
END $$;

-- post_hashtags (hashtag_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_hashtags' AND column_name='hashtag_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag_id ON public.post_hashtags (hashtag_id)';
  END IF;
END $$;

-- hashtags (name)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hashtags' AND column_name='name') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hashtags_name ON public.hashtags (name)';
  END IF;
END $$;

-- blocks (blocker_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blocks' AND column_name='blocker_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks (blocker_id)';
  END IF;
END $$;

-- blocks (blocked_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blocks' AND column_name='blocked_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks (blocked_id)';
  END IF;
END $$;

-- ── 2. bump_affinity — atomic single-round-trip affinity update ───────────────
-- Replaces the 2-round-trip SELECT → compute → UPSERT pattern in engage.ts.
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
