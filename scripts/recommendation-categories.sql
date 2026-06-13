-- ============================================================
-- Enhancement #1: Content category detection + category affinity
-- Run AFTER recommendation-scoring-config.sql
-- ============================================================

-- 1. Add categories column to posts and reels (idempotent)
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';

-- 2. extract_categories — keyword + hashtag matching against 14 predefined categories
--    IMMUTABLE: deterministic, no DB access, safe for triggers
CREATE OR REPLACE FUNCTION public.extract_categories(p_caption TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_text TEXT;
  v_cats TEXT[] := '{}';
BEGIN
  IF p_caption IS NULL OR p_caption = '' THEN
    RETURN v_cats;
  END IF;

  -- Lowercase, keep only letters/digits/spaces/hashes
  v_text := lower(regexp_replace(p_caption, '[^a-zA-Z0-9# ]', ' ', 'g'));

  IF v_text ~ '\m(cooking|recipe|baking|chef|kitchen|cuisine)\M' THEN
    v_cats := array_append(v_cats, 'cooking');
  END IF;

  IF v_text ~ '\m(food|foodie|yummy|delicious|tasty|snack|dessert|restaurant|cafe|pizza|burger|eat|meal|dinner|lunch|breakfast)\M' THEN
    v_cats := array_append(v_cats, 'food');
  END IF;

  IF v_text ~ '\m(travel|trip|vacation|holiday|explore|adventure|wanderlust|destination|journey|tourism|backpacking|abroad)\M' THEN
    v_cats := array_append(v_cats, 'travel');
  END IF;

  IF v_text ~ '\m(fitness|gym|workout|exercise|training|yoga|running|health|lifting|cardio|crossfit|athlete|weightlifting|bodybuilding)\M' THEN
    v_cats := array_append(v_cats, 'fitness');
  END IF;

  IF v_text ~ '\m(fashion|style|outfit|ootd|clothes|wear|dress|shoes|accessories|trend|streetwear|couture|lookbook)\M' THEN
    v_cats := array_append(v_cats, 'fashion');
  END IF;

  IF v_text ~ '\m(music|song|singer|artist|concert|band|rap|hiphop|rnb|pop|melody|tune|playlist|album|track|dj|producer)\M' THEN
    v_cats := array_append(v_cats, 'music');
  END IF;

  IF v_text ~ '\m(comedy|funny|humor|laugh|meme|joke|hilarious|lol|prank|skit)\M' THEN
    v_cats := array_append(v_cats, 'comedy');
  END IF;

  IF v_text ~ '\m(art|artist|drawing|painting|illustration|design|creative|sketch|artwork|gallery|sculpture|portrait)\M' THEN
    v_cats := array_append(v_cats, 'art');
  END IF;

  IF v_text ~ '\m(tech|technology|coding|programming|software|developer|ai|digital|startup|innovation|gadget|engineering|cybersecurity)\M' THEN
    v_cats := array_append(v_cats, 'tech');
  END IF;

  IF v_text ~ '\m(astrology|zodiac|horoscope|tarot|spiritual|chakra|jyotisha|vedic|aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces|manifesting|meditation)\M' THEN
    v_cats := array_append(v_cats, 'astrology');
  END IF;

  IF v_text ~ '\m(gaming|gamer|game|esports|playstation|xbox|nintendo|fps|rpg|streaming|twitch|minecraft|fortnite|valorant)\M' THEN
    v_cats := array_append(v_cats, 'gaming');
  END IF;

  IF v_text ~ '\m(beauty|makeup|skincare|cosmetics|glam|lipstick|foundation|tutorial|glow|blush|contour|serum|moisturizer)\M' THEN
    v_cats := array_append(v_cats, 'beauty');
  END IF;

  IF v_text ~ '\m(dance|dancing|choreography|dancer|moves|breakdance|ballet|contemporary|hiphop)\M' THEN
    v_cats := array_append(v_cats, 'dance');
  END IF;

  IF v_text ~ '\m(education|learn|study|school|college|university|knowledge|tutorial|howto|tips|advice|lecture|course)\M' THEN
    v_cats := array_append(v_cats, 'education');
  END IF;

  RETURN v_cats;
END;
$$;

-- 3. Trigger function — auto-tag categories on INSERT (or UPDATE of caption)
CREATE OR REPLACE FUNCTION public.auto_tag_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.categories := public.extract_categories(COALESCE(NEW.caption, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_auto_tag_categories ON public.posts;
CREATE TRIGGER posts_auto_tag_categories
  BEFORE INSERT OR UPDATE OF caption ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.auto_tag_categories();

DROP TRIGGER IF EXISTS reels_auto_tag_categories ON public.reels;
CREATE TRIGGER reels_auto_tag_categories
  BEFORE INSERT OR UPDATE OF caption ON public.reels
  FOR EACH ROW EXECUTE FUNCTION public.auto_tag_categories();

-- 4. Backfill categories for all existing posts and reels
UPDATE public.posts SET categories = public.extract_categories(COALESCE(caption, ''))
WHERE categories IS NULL OR categories = '{}';

UPDATE public.reels SET categories = public.extract_categories(COALESCE(caption, ''))
WHERE categories IS NULL OR categories = '{}';

-- 5. get_for_you_feed_v2 — now boosts by BOTH creator affinity AND category affinity
--    Replaces the version from scoring-config.sql
CREATE OR REPLACE FUNCTION public.get_for_you_feed_v2(
  p_user_id UUID,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS SETOF public.posts
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_affinity_boost FLOAT := get_config('affinity_boost_factor', 0.4);
  v_affinity_cap   FLOAT := get_config('affinity_cap',          2.0);
  v_hide_threshold FLOAT := -1.5;
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM public.posts p
  WHERE
    NOT EXISTS (
      SELECT 1 FROM public.user_interests ui
      WHERE ui.user_id     = p_user_id
        AND ui.interest_key = 'creator:' || p.user_id::TEXT
        AND ui.weight       < v_hide_threshold
    )
  ORDER BY
    p.score * (
      1.0 + (
        -- Creator affinity
        COALESCE(
          (SELECT LEAST(v_affinity_cap, GREATEST(0.0, ui.weight))
           FROM public.user_interests ui
           WHERE ui.user_id     = p_user_id
             AND ui.interest_key = 'creator:' || p.user_id::TEXT),
          0.0
        )
        -- Category affinity sum (each matched category contributes)
        + LEAST(
            v_affinity_cap,
            COALESCE(
              (SELECT SUM(LEAST(v_affinity_cap, GREATEST(0.0, ui.weight)))
               FROM public.user_interests ui
               WHERE ui.user_id     = p_user_id
                 AND ui.interest_key IN (
                   SELECT 'category:' || cat
                   FROM unnest(COALESCE(p.categories, '{}'::TEXT[])) AS cat
                 )
              ),
              0.0
            )
          )
      ) * v_affinity_boost
    ) DESC,
    p.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- 6. get_for_you_reels_v2 — same pattern for reels
CREATE OR REPLACE FUNCTION public.get_for_you_reels_v2(
  p_user_id UUID,
  p_limit   INT DEFAULT 20,
  p_offset  INT DEFAULT 0
)
RETURNS SETOF public.reels
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_affinity_boost FLOAT := get_config('affinity_boost_factor', 0.4);
  v_affinity_cap   FLOAT := get_config('affinity_cap',          2.0);
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
      1.0 + (
        -- Creator affinity
        COALESCE(
          (SELECT LEAST(v_affinity_cap, GREATEST(0.0, ui.weight))
           FROM public.user_interests ui
           WHERE ui.user_id     = p_user_id
             AND ui.interest_key = 'creator:' || r.user_id::TEXT),
          0.0
        )
        -- Category affinity sum
        + LEAST(
            v_affinity_cap,
            COALESCE(
              (SELECT SUM(LEAST(v_affinity_cap, GREATEST(0.0, ui.weight)))
               FROM public.user_interests ui
               WHERE ui.user_id     = p_user_id
                 AND ui.interest_key IN (
                   SELECT 'category:' || cat
                   FROM unnest(COALESCE(r.categories, '{}'::TEXT[])) AS cat
                 )
              ),
              0.0
            )
          )
      ) * v_affinity_boost
    ) DESC,
    r.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ── Done ─────────────────────────────────────────────────────────────────────
-- Category affinities are written by the engage API server when contentId is provided.
-- Key format: 'category:{name}'  e.g. 'category:cooking', 'category:travel'
-- Tune category weight independently in scoring_config (same affinity_boost_factor / affinity_cap).
