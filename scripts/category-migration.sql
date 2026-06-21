-- ── Category column on posts ──────────────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL;

-- ── Check constraint ─────────────────────────────────────────────────────────
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_category_check;
ALTER TABLE posts ADD CONSTRAINT posts_category_check
  CHECK (category IS NULL OR category IN (
    'music','dance','comedy','travel','food','fitness',
    'gaming','photography','art','fashion','pets','sports',
    'tech','education','nature'
  ));

-- ── Backfill from caption keywords (priority order: first match wins) ─────────
UPDATE posts
SET category = CASE
  WHEN lower(caption) ~ '(^|\s|#)(fitness|gym|workout|workouts|run|running|exercise|exercises|health|hiit|lifting|crossfit|cardio|bodybuilding|gains|muscle)(\s|$|#)' THEN 'fitness'
  WHEN lower(caption) ~ '(^|\s|#)(gaming|game|games|play|stream|esports|gamer|twitch|xbox|playstation|nintendo|fps|rpg|mmorpg)(\s|$|#)' THEN 'gaming'
  WHEN lower(caption) ~ '(^|\s|#)(music|song|songs|beat|beats|artist|track|album|listen|melody|lyrics|singer|rapper|producer|banger|playlist)(\s|$|#)' THEN 'music'
  WHEN lower(caption) ~ '(^|\s|#)(dance|dancing|choreo|choreography|moves|tiktokdance|dancecover|dancer)(\s|$|#)' THEN 'dance'
  WHEN lower(caption) ~ '(^|\s|#)(comedy|funny|laugh|humor|humour|joke|jokes|lol|meme|skit|standup|satire)(\s|$|#)' THEN 'comedy'
  WHEN lower(caption) ~ '(^|\s|#)(travel|trip|vacation|explore|adventure|wanderlust|roadtrip|backpacking|tourist|destination|itinerary|passport)(\s|$|#)' THEN 'travel'
  WHEN lower(caption) ~ '(^|\s|#)(food|eat|eating|recipe|recipes|cooking|cook|foodie|chef|restaurant|meal|baking|delicious|yummy|tasty|homecook)(\s|$|#)' THEN 'food'
  WHEN lower(caption) ~ '(^|\s|#)(photography|photographer|photo|shot|portrait|landscape|lightroom|canon|nikon|fujifilm|compositon|goldhour|blackandwhite)(\s|$|#)' THEN 'photography'
  WHEN lower(caption) ~ '(^|\s|#)(art|artwork|drawing|painting|sketch|creative|design|illustration|artist|digitalart|watercolor|sculpt)(\s|$|#)' THEN 'art'
  WHEN lower(caption) ~ '(^|\s|#)(fashion|style|outfit|ootd|clothes|wear|wearing|clothing|streetwear|designer|aesthetic|lookbook|drip)(\s|$|#)' THEN 'fashion'
  WHEN lower(caption) ~ '(^|\s|#)(pet|pets|dog|dogs|cat|cats|puppy|puppies|kitten|kittens|animal|animals|doggo|pup|furry|furbaby|dogsofinstagram)(\s|$|#)' THEN 'pets'
  WHEN lower(caption) ~ '(^|\s|#)(sport|sports|football|basketball|soccer|tennis|athlete|cricket|baseball|golf|swimming|cycling|marathon|match|tournament)(\s|$|#)' THEN 'sports'
  WHEN lower(caption) ~ '(^|\s|#)(tech|ai|coding|code|developer|startup|software|programming|javascript|python|app|saas|buildinpublic|hackathon|engineer)(\s|$|#)' THEN 'tech'
  WHEN lower(caption) ~ '(^|\s|#)(learn|learning|education|study|school|knowledge|tutorial|course|lesson|howto|explainer|tip|tips)(\s|$|#)' THEN 'education'
  WHEN lower(caption) ~ '(^|\s|#)(nature|forest|ocean|sea|mountains|mountain|outdoor|outdoors|wildlife|hiking|hike|camping|sunset|sunrise|sky|lake|river)(\s|$|#)' THEN 'nature'
  ELSE NULL
END
WHERE category IS NULL AND caption IS NOT NULL AND caption != '';

-- ── Index for fast category filtering ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS posts_category_idx ON posts(category) WHERE category IS NOT NULL;

-- ── Distribution report ───────────────────────────────────────────────────────
SELECT
  COALESCE(category, 'uncategorized') AS category,
  COUNT(*) AS count
FROM posts
GROUP BY category
ORDER BY count DESC;
