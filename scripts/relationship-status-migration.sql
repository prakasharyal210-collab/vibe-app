-- Relationship Status migration
-- Run this in the Supabase SQL editor

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS relationship_status TEXT
  CHECK (
    relationship_status IN (
      'Single',
      'In a Relationship',
      'Married',
      'Engaged',
      'It''s Complicated',
      'Open Relationship',
      'Divorced',
      'Widowed'
    )
  )
  DEFAULT NULL;
