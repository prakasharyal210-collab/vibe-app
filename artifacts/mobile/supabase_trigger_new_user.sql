-- ================================================================
-- Gundruk: Ensure handle_new_user creates Find Vibe columns
-- Run in Supabase Dashboard → SQL Editor
-- ================================================================

-- STEP 1 — Add columns if not already present (idempotent)
-- If you already ran supabase_migration_privacy.sql, skip this step.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_in_matching     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS find_gundruk_mode    text    NOT NULL DEFAULT 'dating',
  ADD COLUMN IF NOT EXISTS vibe_request_privacy text    NOT NULL DEFAULT 'everyone';

-- STEP 2 — Check your current trigger definition
-- Run this SELECT to see exactly what your trigger currently inserts:
--
--   SELECT prosrc
--   FROM pg_proc
--   WHERE proname = 'handle_new_user';
--
-- If the output already contains show_in_matching, you're done.
-- If not, continue to Step 3.

-- STEP 3 — Replace handle_new_user with a version that explicitly sets defaults.
--
-- Because the columns have NOT NULL DEFAULT values (Step 1), any INSERT that
-- omits them already gets the right defaults automatically. Step 3 is optional
-- but makes intent explicit and guards against future DEFAULT changes.
--
-- ⚠️  This replaces the ENTIRE function. Copy your current prosrc output from
--     Step 2 first and merge these 3 columns into the INSERT list.
--
-- The snippet below is the standard Supabase starter trigger augmented with
-- the 3 Find Vibe columns. Adjust to match your actual existing columns.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    show_in_matching,
    find_gundruk_mode,
    vibe_request_privacy
    -- If your trigger already inserts other columns (username, email, etc.),
    -- add them here and add matching values below.
  )
  VALUES (
    new.id,
    false,
    'dating',
    'everyone'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- STEP 4 — Verify the trigger binding still exists (it should survive OR REPLACE)
-- Run this to confirm:
--
--   SELECT trigger_name, event_object_table
--   FROM information_schema.triggers
--   WHERE trigger_name = 'on_auth_user_created';
--
-- If no row is returned, recreate the trigger binding:
--
--   CREATE TRIGGER on_auth_user_created
--     AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- STEP 5 — Backfill any existing profiles where the columns are still NULL
-- (Only needed if Step 1 was run *after* some users signed up, using ALTER
--  without a DEFAULT — the ALTER above sets DEFAULT so this is usually a no-op.)
UPDATE public.profiles
SET
  show_in_matching     = COALESCE(show_in_matching,     false),
  find_gundruk_mode    = COALESCE(find_gundruk_mode,    'dating'),
  vibe_request_privacy = COALESCE(vibe_request_privacy, 'everyone')
WHERE
  show_in_matching IS NULL
  OR find_gundruk_mode IS NULL
  OR vibe_request_privacy IS NULL;
