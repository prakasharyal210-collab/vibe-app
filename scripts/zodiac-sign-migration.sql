-- Zodiac Sign feature: add zodiac_sign column to profiles table
-- Run this in the Supabase dashboard SQL editor.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS zodiac_sign TEXT CHECK (
  zodiac_sign IN (
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
  )
) DEFAULT NULL;
