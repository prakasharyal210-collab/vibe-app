-- ===========================================================================
-- Gundruk — Feature Migration
-- Story Interactions, Story Highlights, Pinned Posts, Creator Analytics
--
-- Run this in the Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/tatroqgcyebuqqkhmvpa/sql
-- ===========================================================================

-- ── story_interactions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE story_interactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='story_interactions' AND policyname='si_select') THEN
    CREATE POLICY "si_select" ON story_interactions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='story_interactions' AND policyname='si_insert') THEN
    CREATE POLICY "si_insert" ON story_interactions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── story_highlights ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_highlights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cover_image_url TEXT,
  story_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE story_highlights ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='story_highlights' AND policyname='sh_select') THEN
    CREATE POLICY "sh_select" ON story_highlights FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='story_highlights' AND policyname='sh_all') THEN
    CREATE POLICY "sh_all" ON story_highlights FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── pinned posts ─────────────────────────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

-- ── post_analytics ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  views_count INTEGER DEFAULT 0,
  reach_count INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE post_analytics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_analytics' AND policyname='pa_select') THEN
    CREATE POLICY "pa_select" ON post_analytics FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_analytics' AND policyname='pa_insert') THEN
    CREATE POLICY "pa_insert" ON post_analytics FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ── profile_analytics ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  profile_views INTEGER DEFAULT 0,
  new_followers INTEGER DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE profile_analytics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_analytics' AND policyname='pra_select') THEN
    CREATE POLICY "pra_select" ON profile_analytics FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_analytics' AND policyname='pra_insert') THEN
    CREATE POLICY "pra_insert" ON profile_analytics FOR INSERT WITH CHECK (true);
  END IF;
END $$;
