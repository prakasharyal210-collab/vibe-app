-- ============================================================
-- Message request direction fix
-- Adds requested_by to conversations so the requests list can
-- correctly show only requests TO the viewer, not FROM them.
-- ============================================================

-- 1. Add requested_by column — tracks who initiated the conversation/request.
--    NULL on existing rows means "unknown direction" (old data, shows for nobody).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES profiles(id);

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_conversations_requested_by
  ON conversations(requested_by);

CREATE INDEX IF NOT EXISTS idx_conversations_request_pending
  ON conversations(is_request, requested_by)
  WHERE is_request = true;

-- 3. Set existing is_request=true rows to is_request=false (unknown direction,
--    safer than showing on wrong side). New messages will correctly set
--    is_request + requested_by going forward.
UPDATE conversations SET is_request = false WHERE is_request = true AND requested_by IS NULL;
