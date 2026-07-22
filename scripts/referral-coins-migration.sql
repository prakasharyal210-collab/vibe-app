-- ============================================================
-- Referral + Coins system migration
-- Run this in the Supabase Dashboard → SQL Editor
-- Project: tatroqgcyebuqqkhmvpa
-- Safe to re-run: all statements are idempotent
-- ============================================================

-- 1. Add referral columns to profiles (the app-level user table)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by  UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Backfill referral_code for all existing users (8-char uppercase alphanumeric)
UPDATE profiles
SET    referral_code = UPPER(SUBSTRING(MD5(id::text), 1, 8))
WHERE  referral_code IS NULL;

-- 3a. Create coin_transactions table if it does not exist at all
--     (minimal columns only — we add the rest via ALTER TABLE below)
CREATE TABLE IF NOT EXISTS coin_transactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3b. Add each column individually — safe even if table already exists
--     with a different schema.
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS amount          INT  NOT NULL DEFAULT 0;
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS reason          TEXT NOT NULL DEFAULT '';
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS related_user_id UUID;

-- 3c. Indexes (IF NOT EXISTS is safe to re-run)
CREATE INDEX IF NOT EXISTS coin_transactions_user_id_idx
  ON coin_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coin_transactions_reason_idx
  ON coin_transactions (reason, related_user_id);
