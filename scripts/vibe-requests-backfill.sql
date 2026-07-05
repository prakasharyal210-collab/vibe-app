-- ─────────────────────────────────────────────────────────────────────────────
-- vibe-requests-backfill.sql
--
-- PURPOSE
--   Before the deck swipe path was patched to write vibe_requests rows, every
--   right-swipe only created a notification row. This script backfills ONE
--   pending vibe_requests row per (sender, receiver) pair that:
--     • has at least one vibe_request-type notification, AND
--     • has NO existing vibe_requests row (pending OR matched/rejected), AND
--     • the pair is NOT already in vibe_matches (no retroactive "match" rows).
--
--   Deduplication: only the newest notification per pair becomes a request row.
--   So haceriz's 5 notifications → exactly 1 pending request for the main account.
--
-- REVIEW BEFORE RUNNING in Supabase SQL editor (Dashboard → SQL editor).
-- Run the SELECT preview block first to see what will be inserted.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Preview: rows that WOULD be inserted ─────────────────────────────────────
/*
SELECT
  n.sender_id,
  n.recipient_id AS receiver_id,
  MAX(n.created_at) AS newest_notif_at
FROM notifications n
WHERE n.type IN ('vibe_request', 'vibe')
  -- No vibe_requests row of any status for this pair
  AND NOT EXISTS (
    SELECT 1 FROM vibe_requests vr
    WHERE vr.sender_id = n.sender_id
      AND vr.receiver_id = n.recipient_id
  )
  -- Not already matched
  AND NOT EXISTS (
    SELECT 1 FROM vibe_matches vm
    WHERE vm.sender_id = n.sender_id
      AND vm.receiver_id = n.recipient_id
  )
GROUP BY n.sender_id, n.recipient_id
ORDER BY newest_notif_at DESC;
*/

-- ── Backfill insert ───────────────────────────────────────────────────────────
INSERT INTO vibe_requests (sender_id, receiver_id, status, created_at)
SELECT
  n.sender_id,
  n.recipient_id AS receiver_id,
  'pending'      AS status,
  MAX(n.created_at) AS created_at
FROM notifications n
WHERE n.type IN ('vibe_request', 'vibe')
  AND NOT EXISTS (
    SELECT 1 FROM vibe_requests vr
    WHERE vr.sender_id = n.sender_id
      AND vr.receiver_id = n.recipient_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM vibe_matches vm
    WHERE vm.sender_id = n.sender_id
      AND vm.receiver_id = n.recipient_id
  )
GROUP BY n.sender_id, n.recipient_id
ON CONFLICT (sender_id, receiver_id) DO NOTHING;

-- ── Verify: how many rows were backfilled ─────────────────────────────────────
SELECT COUNT(*) AS backfilled_rows
FROM vibe_requests
WHERE status = 'pending'
  AND created_at >= NOW() - INTERVAL '5 minutes';
