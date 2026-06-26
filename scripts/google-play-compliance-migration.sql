-- Google Play Compliance Migration
-- Run this in your Supabase dashboard → SQL Editor
-- These tables may already exist — CREATE IF NOT EXISTS is safe to re-run.

-- ─── blocks ───────────────────────────────────────────────────────────────────
-- Stores block relationships between users.
CREATE TABLE IF NOT EXISTS public.blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON public.blocks (blocker_id);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON public.blocks (blocked_id);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- Service role (API server) bypasses RLS — no policies needed for server-side access.
-- Add a policy so authenticated users can read their own blocks if you ever query client-side:
DROP POLICY IF EXISTS "Users can read their own blocks" ON public.blocks;
CREATE POLICY "Users can read their own blocks"
  ON public.blocks FOR SELECT
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

-- ─── reports ──────────────────────────────────────────────────────────────────
-- Stores user-submitted content/user reports.
CREATE TABLE IF NOT EXISTS public.reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type   text NOT NULL CHECK (target_type IN ('post', 'reel', 'comment', 'user', 'confession')),
  target_id     uuid NOT NULL,
  reason        text NOT NULL,
  details       text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_reporter_idx  ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS reports_target_idx    ON public.reports (target_id);
CREATE INDEX IF NOT EXISTS reports_status_idx    ON public.reports (status);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Only the API server (service role) reads/writes reports — no client-side policies needed.
