-- Schema-drift consolidated migration
-- Run this once in the Supabase SQL editor.
-- All statements use IF NOT EXISTS / IF EXISTS to be safe to re-run.

-- ── stories ──────────────────────────────────────────────────────────────────
-- API server inserts `caption` for image/video stories; column was never added.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS caption TEXT;

-- ── posts ────────────────────────────────────────────────────────────────────
-- engage.ts reads `categories` to drive content-affinity scoring.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS categories TEXT[];

-- ── reels ────────────────────────────────────────────────────────────────────
-- Same engage.ts affinity path reads `categories` from reels.
ALTER TABLE reels ADD COLUMN IF NOT EXISTS categories TEXT[];

-- ── conversations ─────────────────────────────────────────────────────────────
-- fetchMessageRequests / acceptMessageRequest need to flag pending DM requests.
-- No existing equivalent column — genuinely new field.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_request BOOLEAN NOT NULL DEFAULT false;
