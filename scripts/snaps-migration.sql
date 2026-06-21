-- ============================================================
-- Snaps table migration
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- ============================================================
-- Creates a dedicated snaps table so snap messages are stored
-- separately from the messages table, eliminating any risk of
-- snaps appearing in the Messages tab of the inbox.
--
-- After running this migration:
--   • New snaps are written to  public.snaps  (via POST /api/snaps)
--   • Messages tab reads only   public.messages  (no snaps ever)
--   • Snaps tab reads from      public.snaps  (new) +
--                               public.messages  (legacy snaps, backward compat)
--
-- Live schema verified 2026-06-21 via REST SELECT * LIMIT 1.
-- The original file had "content TEXT NOT NULL" and was missing
-- media_url, media_type, duration, viewed_at, expires_at — all
-- five were added directly in Supabase after the initial create.
-- ============================================================

-- ── Fresh install ─────────────────────────────────────────────────────────────
-- Run this block if the snaps table does not yet exist.

CREATE TABLE IF NOT EXISTS public.snaps (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id  UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_url    TEXT,
  media_type   TEXT,
  duration     INTEGER,
  viewed_at    TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snaps_sender_id_idx   ON public.snaps (sender_id);
CREATE INDEX IF NOT EXISTS snaps_receiver_id_idx ON public.snaps (receiver_id);
CREATE INDEX IF NOT EXISTS snaps_created_at_idx  ON public.snaps (created_at DESC);
CREATE INDEX IF NOT EXISTS snaps_viewed_at_idx   ON public.snaps (viewed_at) WHERE viewed_at IS NULL;

-- Disable RLS — all access goes through the API server with the service-role key.
ALTER TABLE public.snaps DISABLE ROW LEVEL SECURITY;


-- ── Catch-up for existing installs ────────────────────────────────────────────
-- If you already ran the original stale migration (which only had the
-- "content TEXT NOT NULL" column), run these ALTER statements to bring the
-- table up to the real schema. They are safe to re-run on a correct table.

ALTER TABLE public.snaps ADD COLUMN IF NOT EXISTS media_url   TEXT;
ALTER TABLE public.snaps ADD COLUMN IF NOT EXISTS media_type  TEXT;
ALTER TABLE public.snaps ADD COLUMN IF NOT EXISTS duration    INTEGER;
ALTER TABLE public.snaps ADD COLUMN IF NOT EXISTS viewed_at   TIMESTAMPTZ;
ALTER TABLE public.snaps ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ;

-- The original migration had "content TEXT NOT NULL" which does not exist on
-- the live table. If it was created on your instance, drop it:
-- ALTER TABLE public.snaps DROP COLUMN IF EXISTS content;
