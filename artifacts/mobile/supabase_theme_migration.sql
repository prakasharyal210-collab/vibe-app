-- =====================================================================
-- Vibe Theme System — Supabase Migration
-- Run this in your Supabase SQL editor (Project > SQL Editor > New Query)
-- =====================================================================

-- Add selected_theme column to user_settings (safe — skips if already exists)
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS selected_theme TEXT DEFAULT 'classic';

-- Optional: add a check constraint so only valid theme IDs can be stored
ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_selected_theme_check;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_selected_theme_check
  CHECK (selected_theme IN (
    'classic', 'gold', 'ocean', 'rose',
    'forest', 'sunset', 'galaxy', 'arctic'
  ));
