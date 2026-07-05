-- ============================================================
-- Couple Games migration
-- Run in Supabase dashboard SQL editor (not via drizzle-kit)
-- ============================================================

-- ── 1. game_questions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_questions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text       TEXT NOT NULL,
  option_a   TEXT NOT NULL DEFAULT 'Me',
  option_b   TEXT NOT NULL DEFAULT 'My partner',
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.game_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.game_questions
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_active" ON public.game_questions
  FOR SELECT TO authenticated USING (active = true);

-- ── 2. couple_battles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.couple_battles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type            TEXT NOT NULL DEFAULT 'quiz',
  challenger_couple_id UUID NOT NULL REFERENCES public.couple_links(id) ON DELETE CASCADE,
  opponent_couple_id   UUID NOT NULL REFERENCES public.couple_links(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','active','completed','declined','expired')),
  question_ids         UUID[] NOT NULL DEFAULT '{}',
  winner_couple_id     UUID REFERENCES public.couple_links(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS couple_battles_challenger_idx ON public.couple_battles(challenger_couple_id);
CREATE INDEX IF NOT EXISTS couple_battles_opponent_idx   ON public.couple_battles(opponent_couple_id);

ALTER TABLE public.couple_battles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.couple_battles
  TO service_role USING (true) WITH CHECK (true);

-- ── 3. battle_answers ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.battle_answers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id   UUID NOT NULL REFERENCES public.couple_battles(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  question_id UUID NOT NULL REFERENCES public.game_questions(id) ON DELETE CASCADE,
  answer      TEXT NOT NULL CHECK (answer IN ('A','B')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (battle_id, user_id, question_id)
);

CREATE INDEX IF NOT EXISTS battle_answers_battle_idx ON public.battle_answers(battle_id);
CREATE INDEX IF NOT EXISTS battle_answers_user_idx   ON public.battle_answers(user_id);

ALTER TABLE public.battle_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.battle_answers
  TO service_role USING (true) WITH CHECK (true);

-- ── 4. Seed: 30 starter questions ────────────────────────────────────────────
INSERT INTO public.game_questions (text, option_a, option_b) VALUES
  ('Who said "I love you" first?',                                     'Me',         'My partner'),
  ('Who texts back faster?',                                           'Me',         'My partner'),
  ('Who is more likely to hog the blanket?',                           'Me',         'My partner'),
  ('Who plans the dates?',                                             'Me',         'My partner'),
  ('Who apologizes first after an argument?',                          'Me',         'My partner'),
  ('Who is the better cook?',                                          'Me',         'My partner'),
  ('Who takes longer to get ready?',                                   'Me',         'My partner'),
  ('Who is the bigger spender?',                                       'Me',         'My partner'),
  ('Who remembers anniversaries and important dates better?',          'Me',         'My partner'),
  ('Who is the morning person in the relationship?',                   'Me',         'My partner'),
  ('Who makes the other laugh more?',                                  'Me',         'My partner'),
  ('Who would survive longer in the wilderness?',                      'Me',         'My partner'),
  ('Who is more likely to cry during a movie?',                        'Me',         'My partner'),
  ('Who is more stubborn?',                                            'Me',         'My partner'),
  ('Who is the better driver?',                                        'Me',         'My partner'),
  ('Who gives better advice?',                                         'Me',         'My partner'),
  ('Who is more likely to get lost without GPS?',                      'Me',         'My partner'),
  ('Who is the bigger social butterfly?',                              'Me',         'My partner'),
  ('Who is more likely to break a diet for dessert?',                  'Me',         'My partner'),
  ('Who made the first move?',                                         'Me',         'My partner'),
  ('Who is the better gift-giver?',                                    'Me',         'My partner'),
  ('Who is more patient?',                                             'Me',         'My partner'),
  ('Who is more likely to stay up past midnight?',                     'Me',         'My partner'),
  ('Who controls the TV remote?',                                      'Me',         'My partner'),
  ('Who is more organized?',                                           'Me',         'My partner'),
  ('Who is the peacemaker during arguments?',                          'Me',         'My partner'),
  ('Who takes better care of the other when they are sick?',           'Me',         'My partner'),
  ('Who is more likely to make an impulse purchase?',                  'Me',         'My partner'),
  ('Who is the better singer (according to the other)?',               'Me',         'My partner'),
  ('Who would win in a trivia competition?',                           'Me',         'My partner')
ON CONFLICT DO NOTHING;
