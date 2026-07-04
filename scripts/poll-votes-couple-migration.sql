-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: one-vote-per-couple for confession polls
-- Run in Supabase Dashboard SQL editor (NOT via drizzle push).
-- Regular feed post polls (post_id IS NOT NULL) are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add nullable couple_id column to poll_votes
--    References couple_links so orphan rows are cleaned up on couple deletion.
ALTER TABLE poll_votes
  ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couple_links(id) ON DELETE CASCADE;

-- 2. Partial unique index: one vote per couple per poll (confession polls only).
--    The existing UNIQUE(poll_id, user_id) constraint stays for per-user dedupe
--    on regular feed polls (and as a fallback for singles on confession polls).
CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_one_per_couple
  ON poll_votes(poll_id, couple_id)
  WHERE couple_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill: stamp couple_id on existing confession-poll votes
--    Joins poll_votes → polls (confession_post_id IS NOT NULL) → couple_links
--    to find the couple each voter belongs to.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE poll_votes pv
SET couple_id = cl.id
FROM polls p,
     couple_links cl
WHERE pv.poll_id = p.id
  AND p.confession_post_id IS NOT NULL   -- only confession polls
  AND pv.couple_id IS NULL               -- not yet stamped
  AND cl.status = 'accepted'
  AND (cl.requester_id = pv.user_id OR cl.receiver_id = pv.user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Deduplicate: collapse same-couple duplicate votes.
--    Keeps one row per (poll_id, couple_id) — the one with the minimum ctid
--    (i.e. earliest insert order, sufficient since we have no created_at).
--    The prawn poll currently has 2 votes from one couple; this collapses them.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM poll_votes a
WHERE a.couple_id IS NOT NULL
  AND a.ctid <> (
    SELECT min(b.ctid)
    FROM poll_votes b
    WHERE b.poll_id = a.poll_id
      AND b.couple_id = a.couple_id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries (run after migration to confirm):
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Confirm column exists:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'poll_votes' AND column_name = 'couple_id';
--
-- Confirm index exists:
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'poll_votes' AND indexname = 'poll_votes_one_per_couple';
--
-- Confirm no duplicate couple votes remain:
--   SELECT poll_id, couple_id, count(*)
--   FROM poll_votes
--   WHERE couple_id IS NOT NULL
--   GROUP BY poll_id, couple_id
--   HAVING count(*) > 1;
--   -- Should return 0 rows.
--
-- Check prawn poll collapsed to 1 row:
--   SELECT pv.*, p.question
--   FROM poll_votes pv
--   JOIN polls p ON p.id = pv.poll_id
--   WHERE p.confession_post_id IS NOT NULL;
