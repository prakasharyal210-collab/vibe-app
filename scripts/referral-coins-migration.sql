-- ============================================================
-- Referral + Coins system migration
-- Run this in the Supabase Dashboard → SQL Editor
-- Project: tatroqgcyebuqqkhmvpa
-- ============================================================

-- 1. Add referral columns to profiles (the app-level user table)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by  UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Backfill referral_code for all existing users (8-char uppercase alphanumeric)
UPDATE profiles
SET    referral_code = UPPER(SUBSTRING(MD5(id::text), 1, 8))
WHERE  referral_code IS NULL;

-- 3. Auditable coin transaction ledger
--    (balance lives in the existing `wallet` table; coin_transactions is the log)
CREATE TABLE IF NOT EXISTS coin_transactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount          INT         NOT NULL,
  reason          TEXT        NOT NULL,
  related_user_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast per-user history lookups
CREATE INDEX IF NOT EXISTS coin_transactions_user_id_idx
  ON coin_transactions (user_id, created_at DESC);

-- Index for idempotency check ("has this referral already been activated?")
CREATE INDEX IF NOT EXISTS coin_transactions_referral_idx
  ON coin_transactions (reason, related_user_id)
  WHERE reason = 'referral_activated';
