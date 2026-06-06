-- =====================================================================
-- Vibe Find Friends — Supabase Migration
-- Run this in your Supabase SQL editor (Project > SQL Editor > New Query)
-- =====================================================================

-- ─── find_users_by_contacts ───────────────────────────────────────────────────
-- Matches a list of contact emails against Vibe users.
-- Uses SECURITY DEFINER so it can read auth.users without exposing emails via RLS.

CREATE OR REPLACE FUNCTION public.find_users_by_contacts(
  p_emails  TEXT[],
  p_user_id UUID
)
RETURNS TABLE (
  id             UUID,
  username       TEXT,
  avatar_url     TEXT,
  bio            TEXT,
  followers_count BIGINT,
  is_verified    BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.username,
    p.avatar_url,
    p.bio,
    p.followers_count,
    p.is_verified
  FROM auth.users  u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.email = ANY(p_emails)
    AND u.id <> p_user_id
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.find_users_by_contacts TO authenticated;

-- ─── social_connections table (if not yet created) ────────────────────────────
-- Stores users' linked social platform usernames for cross-platform friend finding.

CREATE TABLE IF NOT EXISTS public.social_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL CHECK (platform IN ('facebook', 'tiktok', 'instagram')),
  platform_username TEXT NOT NULL,
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage own social connections"
  ON public.social_connections FOR ALL
  USING (auth.uid() = user_id);

-- Index for cross-username lookups
CREATE INDEX IF NOT EXISTS idx_social_connections_platform_username
  ON public.social_connections (platform, platform_username);
