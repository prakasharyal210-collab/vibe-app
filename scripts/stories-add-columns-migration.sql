-- ─── Stories: add missing columns ─────────────────────────────────────────────
-- Run this once in the Supabase SQL editor if the stories table already exists
-- but was created without the full schema (missing bg_gradient, text_content,
-- story_type, audience, and/or viewed).  All statements are idempotent.

ALTER TABLE stories ADD COLUMN IF NOT EXISTS bg_gradient   TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS text_content  TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS story_type    TEXT NOT NULL DEFAULT 'text';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS audience      TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS viewed        BOOLEAN NOT NULL DEFAULT FALSE;
