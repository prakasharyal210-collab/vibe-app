-- ─── Relationship Goals Migration ────────────────────────────────────────────
-- Run this in your Supabase SQL editor

-- 1. Master goals table (reference data)
CREATE TABLE IF NOT EXISTS relationship_goals (
  value       TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  short_label TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  color       TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO relationship_goals (value, label, short_label, emoji, color, sort_order) VALUES
  ('long_term',        'Long-term partner',  'Long-term',    '🌹', '#EC4899', 1),
  ('serious',          'Serious commitment', 'Serious',      '💍', '#EF4444', 2),
  ('friendship_first', 'Friendship first',   'Friends first','💜', '#7C3AED', 3),
  ('friendship',       'New friends',        'Friends',      '🤝', '#8B5CF6', 4),
  ('activity',         'Activity partner',   'Activity',     '🏃', '#10B981', 5),
  ('travel',           'Travel buddy',       'Travel',       '✈️', '#3B82F6', 6),
  ('gaming',           'Gaming buddy',       'Gaming',       '🎮', '#A855F7', 7),
  ('language',         'Language partner',   'Language',     '🗣️', '#06B6D4', 8),
  ('networking',       'Networking',         'Networking',   '💼', '#64748B', 9),
  ('short_term',       'Short-term fun',     'Short-term',   '🍭', '#F59E0B', 10),
  ('tonight',          'Free tonight',       'Tonight',      '🌙', '#F97316', 11),
  ('figuring',         'Still figuring out', 'Figuring out', '🤔', '#9CA3AF', 12)
ON CONFLICT (value) DO NOTHING;

-- 2. User relationship goals table
CREATE TABLE IF NOT EXISTS user_relationship_goals (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goals        TEXT[] NOT NULL DEFAULT '{}',
  primary_goal TEXT REFERENCES relationship_goals(value),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_relationship_goals_user_id ON user_relationship_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_relationship_goals_primary ON user_relationship_goals(primary_goal);

-- 3. RLS policies for user_relationship_goals
ALTER TABLE user_relationship_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can read own goals"
  ON user_relationship_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can upsert own goals"
  ON user_relationship_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own goals"
  ON user_relationship_goals FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow others to read goals (for match display)
CREATE POLICY IF NOT EXISTS "Public can read goal primary"
  ON user_relationship_goals FOR SELECT
  USING (true);

-- 4. Goal stats view (for Explore / trending section)
CREATE OR REPLACE VIEW goal_stats AS
SELECT
  g.value,
  g.label,
  g.emoji,
  g.color,
  COUNT(urg.user_id) AS user_count
FROM relationship_goals g
LEFT JOIN user_relationship_goals urg ON g.value = ANY(urg.goals)
GROUP BY g.value, g.label, g.emoji, g.color, g.sort_order
ORDER BY g.sort_order;

-- 5. Update get_vibe_matches RPC to include goals
-- (Add primary_goal to the returned data if your RPC exists)
-- ALTER your existing get_vibe_matches function to JOIN user_relationship_goals
-- and return primary_goal as looking_for. Example snippet:
--
-- SELECT
--   p.*,
--   COALESCE(urg.primary_goal, p.looking_for) AS looking_for
-- FROM profiles p
-- LEFT JOIN user_relationship_goals urg ON urg.user_id = p.id
-- WHERE ...
