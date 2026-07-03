-- ─────────────────────────────────────────────────────────────────────────────
-- Content Moderation System Migration
-- Run this in the Supabase SQL editor (not via Drizzle — targets Supabase directly).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Layer 1: content_moderation_log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_moderation_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  media_url text,
  content_type text,
  rejection_reason text,
  scores jsonb,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE content_moderation_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'content_moderation_log'
      AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY "service_role_full_access"
    ON content_moderation_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Layer 3a: Add new columns to reports table ────────────────────────────────
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS report_reason text,
  ADD COLUMN IF NOT EXISTS report_category text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS actioned_by uuid;

-- Add CHECK constraints if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_report_category_check'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT reports_report_category_check
      CHECK (report_category IN (
        'sexual_content', 'violence', 'hate_speech', 'harassment',
        'spam', 'impersonation', 'self_harm', 'other'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_status_check'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT reports_status_check
      CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed'));
  END IF;
END $$;

-- Apply same columns to legacy content_reports table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content_reports') THEN
    ALTER TABLE content_reports
      ADD COLUMN IF NOT EXISTS report_reason text,
      ADD COLUMN IF NOT EXISTS report_category text,
      ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
      ADD COLUMN IF NOT EXISTS actioned_by uuid;
  END IF;
END $$;

-- ── Layer 3b: Admin flag on profiles ─────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- ── Layer 3c: Set your account as admin ──────────────────────────────────────
UPDATE profiles
SET is_admin = true
WHERE username = 'prakasharyal210';

-- ── Optional: suspension flag ─────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_suspended boolean DEFAULT false;

-- ── Indexes for admin query performance ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_moderation_log_created_at ON content_moderation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_moderation_log_user_id ON content_moderation_log(user_id);
