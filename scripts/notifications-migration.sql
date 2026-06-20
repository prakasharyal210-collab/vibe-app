-- Notifications table: ensure all required columns exist
-- Safe to run multiple times (idempotent DO blocks)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'thumbnail_url'
  ) THEN
    ALTER TABLE notifications ADD COLUMN thumbnail_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'reference_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN reference_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'sender_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN sender_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'post_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN post_id UUID;
  END IF;
END $$;

-- Fast recipient lookup (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications(recipient_id, created_at DESC);

-- Dedup check for post likes/reposts: one notification per sender+post
CREATE INDEX IF NOT EXISTS idx_notifications_post_dedup
  ON notifications(recipient_id, sender_id, type, post_id)
  WHERE post_id IS NOT NULL;

-- Dedup check for reel likes/comments: one notification per sender+reel
CREATE INDEX IF NOT EXISTS idx_notifications_reel_dedup
  ON notifications(recipient_id, sender_id, type, reference_id)
  WHERE reference_id IS NOT NULL;

-- Unread count query
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(recipient_id, is_read)
  WHERE is_read = false;
