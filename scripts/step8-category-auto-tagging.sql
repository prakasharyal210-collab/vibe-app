-- ══════════════════════════════════════════════════════════════════════════════
-- Step 8: Category Auto-Tagging  —  run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1a. Add categories column to posts ────────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';

-- ── 1b. Add categories column to reels ────────────────────────────────────────
ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';

-- ── 1c. Index for feed boost lookup (GIN for array containment queries) ───────
CREATE INDEX IF NOT EXISTS idx_posts_categories ON public.posts USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_reels_categories ON public.reels USING GIN (categories);

-- ── 1d. New scoring_config entry: category_affinity_weight ───────────────────
-- Default mirrors affinity_boost_factor so both signals start equally weighted.
INSERT INTO public.scoring_config (key, value) VALUES
  ('category_affinity_weight', 0.4)
ON CONFLICT (key) DO NOTHING;

-- ── 2. get_for_you_feed_v3 — creator + category combined affinity boost ───────
-- Score multiplier = 1 + (creator_affinity * creator_w) + (best_category_affinity * cat_w)
-- • best_category_affinity = MAX(weight) across categories the user has affinity for
-- • Negative creator affinity still suppresses content (hide threshold unchanged)
CREATE OR REPLACE FUNCTION public.get_for_you_feed_v3(
  p_user_id UUID,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS SETOF public.posts
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_creator_w      FLOAT := get_config('affinity_boost_factor',   0.4);
  v_cat_w          FLOAT := get_config('category_affinity_weight', 0.4);
  v_affinity_cap   FLOAT := get_config('affinity_cap',             2.0);
  v_hide_threshold FLOAT := -1.5;
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM public.posts p
  WHERE
    -- Suppress hard-blocked creators
    NOT EXISTS (
      SELECT 1 FROM public.user_interests ui
      WHERE ui.user_id     = p_user_id
        AND ui.interest_key = 'creator:' || p.user_id::TEXT
        AND ui.weight       < v_hide_threshold
    )
  ORDER BY
    p.score * (
      1.0
      -- Creator affinity boost
      + COALESCE(
          (SELECT LEAST(v_affinity_cap, GREATEST(0.0, ui.weight))
           FROM public.user_interests ui
           WHERE ui.user_id     = p_user_id
             AND ui.interest_key = 'creator:' || p.user_id::TEXT),
          0.0
        ) * v_creator_w
      -- Category affinity boost — strongest matching category, capped at affinity_cap
      + COALESCE(
          (SELECT LEAST(v_affinity_cap, GREATEST(0.0, MAX(ui.weight)))
           FROM public.user_interests ui
           WHERE ui.user_id     = p_user_id
             AND ui.interest_key = ANY(
               SELECT 'category:' || unnest(p.categories)
             )),
          0.0
        ) * v_cat_w
    ) DESC,
    p.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ── 3. get_for_you_reels_v3 — creator + category combined affinity boost ──────
CREATE OR REPLACE FUNCTION public.get_for_you_reels_v3(
  p_user_id UUID,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS SETOF public.reels
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_creator_w      FLOAT := get_config('affinity_boost_factor',   0.4);
  v_cat_w          FLOAT := get_config('category_affinity_weight', 0.4);
  v_affinity_cap   FLOAT := get_config('affinity_cap',             2.0);
  v_hide_threshold FLOAT := -1.5;
BEGIN
  RETURN QUERY
  SELECT r.*
  FROM public.reels r
  WHERE
    NOT EXISTS (
      SELECT 1 FROM public.user_interests ui
      WHERE ui.user_id     = p_user_id
        AND ui.interest_key = 'creator:' || r.user_id::TEXT
        AND ui.weight       < v_hide_threshold
    )
  ORDER BY
    r.score * (
      1.0
      -- Creator affinity
      + COALESCE(
          (SELECT LEAST(v_affinity_cap, GREATEST(0.0, ui.weight))
           FROM public.user_interests ui
           WHERE ui.user_id     = p_user_id
             AND ui.interest_key = 'creator:' || r.user_id::TEXT),
          0.0
        ) * v_creator_w
      -- Category affinity (best match)
      + COALESCE(
          (SELECT LEAST(v_affinity_cap, GREATEST(0.0, MAX(ui.weight)))
           FROM public.user_interests ui
           WHERE ui.user_id     = p_user_id
             AND ui.interest_key = ANY(
               SELECT 'category:' || unnest(r.categories)
             )),
          0.0
        ) * v_cat_w
    ) DESC,
    r.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ── 4a. Backfill: update existing posts with detected categories ───────────────
-- Runs the same keyword-matching logic used by the API server (JS version)
-- against existing captions to populate the categories column for historical content.
-- This is a one-time idempotent run — safe to re-run (only touches rows with categories = '{}').
DO $$
DECLARE
  mapping JSONB := '{
    "cooking":    ["cooking","recipe","foodie","chef","kitchen","bake","baking","meal","dish","cuisine","food52","instafood"],
    "travel":     ["travel","wanderlust","trip","destination","explore","adventure","journey","tourism","travelblogger","travelgram"],
    "fitness":    ["fitness","workout","gym","exercise","fit","health","training","yoga","running","weightlifting","crossfit"],
    "fashion":    ["fashion","style","ootd","outfit","clothing","streetwear","trend","fashionista","lookbook"],
    "music":      ["music","song","artist","singer","melody","beat","album","concert","rap","hiphop","newmusic"],
    "comedy":     ["comedy","funny","humor","meme","laugh","joke","hilarious","lol","standup"],
    "art":        ["art","artist","drawing","painting","paint","sketch","illustration","creative","design","craft","digitalart"],
    "tech":       ["tech","technology","coding","programming","software","developer","ai","digital","gadget","startup"],
    "astrology":  ["astrology","vedic","horoscope","zodiac","jyotisha","kundali","birthchart","planets","numerology","tarot"],
    "gaming":     ["gaming","gamer","game","videogame","twitch","playstation","xbox","stream","console","esports"],
    "beauty":     ["beauty","makeup","skincare","cosmetics","glam","glow","tutorial","lipstick","eyeshadow","nails"],
    "food":       ["food","foodporn","eat","restaurant","cafe","delicious","yummy","taste","snack","dessert"],
    "dance":      ["dance","dancer","dancing","choreography","groove","performance","ballet","hiphop","contemporary"],
    "education":  ["education","learn","study","school","knowledge","course","lesson","teach","tutorial","howto"],
    "nature":     ["nature","outdoors","hiking","landscape","mountain","forest","beach","ocean","sunset","wildlife"],
    "sports":     ["sports","football","cricket","basketball","athlete","match","team","soccer","tennis","golf"],
    "motivation": ["motivation","inspiration","mindset","success","goal","dream","hustle","growth","positivity","quote"],
    "lifestyle":  ["lifestyle","life","daily","vlog","routine","home","living","wellness","selfcare","minimalism"]
  }';
  cat     TEXT;
  keywords JSONB;
  kw      TEXT;
  r       RECORD;
  matched TEXT[];
BEGIN
  FOR r IN SELECT id, caption FROM public.posts WHERE categories = '{}' AND caption IS NOT NULL AND caption <> '' LOOP
    matched := '{}';
    FOR cat IN SELECT jsonb_object_keys(mapping) LOOP
      keywords := mapping->cat;
      FOR kw IN SELECT jsonb_array_elements_text(keywords) LOOP
        IF lower(r.caption) LIKE '%' || kw || '%' THEN
          IF NOT (cat = ANY(matched)) THEN
            matched := array_append(matched, cat);
          END IF;
          EXIT; -- only need one keyword hit per category
        END IF;
      END LOOP;
    END LOOP;
    IF array_length(matched, 1) > 0 THEN
      UPDATE public.posts SET categories = matched WHERE id = r.id;
    END IF;
  END LOOP;

  FOR r IN SELECT id, caption FROM public.reels WHERE categories = '{}' AND caption IS NOT NULL AND caption <> '' LOOP
    matched := '{}';
    FOR cat IN SELECT jsonb_object_keys(mapping) LOOP
      keywords := mapping->cat;
      FOR kw IN SELECT jsonb_array_elements_text(keywords) LOOP
        IF lower(r.caption) LIKE '%' || kw || '%' THEN
          IF NOT (cat = ANY(matched)) THEN
            matched := array_append(matched, cat);
          END IF;
          EXIT;
        END IF;
      END LOOP;
    END LOOP;
    IF array_length(matched, 1) > 0 THEN
      UPDATE public.reels SET categories = matched WHERE id = r.id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill complete';
END $$;

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Verify: SELECT id, caption, categories FROM posts WHERE categories <> '{}' LIMIT 5;
-- Tune:   UPDATE scoring_config SET value = 0.6 WHERE key = 'category_affinity_weight';
