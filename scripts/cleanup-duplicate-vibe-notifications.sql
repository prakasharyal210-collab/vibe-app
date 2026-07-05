-- ─────────────────────────────────────────────────────────────────────────────
-- cleanup-duplicate-vibe-notifications.sql
--
-- PURPOSE
--   Remove stale duplicate vibe_request notifications that were created before
--   the server-side dedup guard was added (per-pair check on sender_id +
--   recipient_id). Each (sender_id, recipient_id) pair should have at most one
--   pending vibe_request notification. This is a one-time cleanup; future
--   inserts are deduplicated at the application layer.
--
--   Also cleans duplicate vibe_match notifications for the same reason
--   (crossing-request path could produce two rows before the fix).
--
-- REVIEW BEFORE RUNNING in Supabase SQL editor (Dashboard → SQL editor).
-- This is a DELETE — run the SELECT block first to verify what will be removed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Preview (run this first to see what will be deleted) ─────────────────────
/*
SELECT id, type, sender_id, recipient_id, created_at
FROM notifications
WHERE type IN ('vibe_request', 'vibe_match')
  AND id NOT IN (
    SELECT DISTINCT ON (type, sender_id, recipient_id) id
    FROM notifications
    WHERE type IN ('vibe_request', 'vibe_match')
    ORDER BY type, sender_id, recipient_id, created_at DESC
  )
ORDER BY type, sender_id, recipient_id, created_at;
*/

-- ── Delete duplicates, keeping the newest per (type, sender_id, recipient_id) ─
DELETE FROM notifications
WHERE type IN ('vibe_request', 'vibe_match')
  AND id NOT IN (
    SELECT DISTINCT ON (type, sender_id, recipient_id) id
    FROM notifications
    WHERE type IN ('vibe_request', 'vibe_match')
    ORDER BY type, sender_id, recipient_id, created_at DESC
  );

-- ── Verify: should return 0 rows ─────────────────────────────────────────────
SELECT type, sender_id, recipient_id, COUNT(*) AS cnt
FROM notifications
WHERE type IN ('vibe_request', 'vibe_match')
GROUP BY type, sender_id, recipient_id
HAVING COUNT(*) > 1;
