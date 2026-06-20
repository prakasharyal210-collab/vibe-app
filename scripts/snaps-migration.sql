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
-- ============================================================

CREATE TABLE IF NOT EXISTS public.snaps (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snaps_sender_id_idx   ON public.snaps (sender_id);
CREATE INDEX IF NOT EXISTS snaps_receiver_id_idx ON public.snaps (receiver_id);
CREATE INDEX IF NOT EXISTS snaps_created_at_idx  ON public.snaps (created_at DESC);

-- Disable RLS on snaps — all access goes through the API server
-- which uses the service-role key, bypassing RLS entirely.
ALTER TABLE public.snaps DISABLE ROW LEVEL SECURITY;
