---
name: For You feed v2 personalization — production state gap
description: get_for_you_feed_v2's category-affinity branch is a silent no-op in prod; posts.score is stale for most rows. Check before building on top of it.
---

The full personalization stack described in scripts/personalization-migration.sql,
recommendation-scoring-config.sql, recommendation-categories.sql, and
creator-boost-migration.sql IS deployed to the live Supabase project (scoring_config,
user_interests, get_for_you_feed_v2, bump_affinity, calculate_post_score all exist
and are callable) — but two parts are silently inert:

1. `posts.categories` (TEXT[]) is NULL on every row and `extract_categories()` does
   not exist in the schema cache — recommendation-categories.sql was never actually
   run in Supabase despite being present in scripts/. This means v2's category-affinity
   term always evaluates to 0; only the creator-affinity term has ever had effect.
2. `posts.score` is 0 on the vast majority of posts (only ~1% had a non-zero score
   when checked) because `refresh_recent_scores()` — meant to run via pg_cron every
   15 min per the migration's own instructions — was never scheduled in production.

**Why this matters:** Don't assume a migration script sitting in scripts/ reflects
production state just because the RPC it defines is callable. Verify column/function
existence and actual data population directly against Supabase (via a quick
supabase-js script using SUPABASE_SERVICE_ROLE_KEY) before building new ranking logic
on top of existing personalization RPCs — the singular `posts.category` column (not
the plural `categories` array) is the one that's actually populated and safe to use
for category-affinity queries in this project.

**How to apply:** When extending get_for_you_feed_v2/v3 or any RPC that reads
scoring_config/user_interests/posts.score/posts.categories, query prod first to
confirm the columns/functions are live and populated, not just present in a .sql file.
