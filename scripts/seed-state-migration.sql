-- scripts/seed-state-migration.sql
-- Run once in the Supabase dashboard SQL editor (never run automatically).
-- Creates a lightweight key-value store for the Railway drip worker so state
-- survives container restarts and redeploys (Railway filesystems are ephemeral).
--
-- Keys written by seed-content.ts:
--   drip_queue         jsonb array  — unposted QueueItem[] (trimmed to ~20 items)
--   drip_used_ids      jsonb array  — every Pexels photo ID ever posted (grows forever)
--   drip_persona_times jsonb object — personaId → next-post unix ms
--   drip_meta          jsonb object — { globalLastPost: number, totalPosted: number }

CREATE TABLE IF NOT EXISTS seeder_state (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL DEFAULT 'null'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: enable but grant full access to service role (bypasses RLS automatically).
-- No anon/authenticated policies — only the worker (service role) touches this table.
ALTER TABLE seeder_state ENABLE ROW LEVEL SECURITY;

-- Seed the four initial rows so upserts always find an existing key.
INSERT INTO seeder_state (key, value) VALUES
  ('drip_queue',         '[]'::jsonb),
  ('drip_used_ids',      '[]'::jsonb),
  ('drip_persona_times', '{}'::jsonb),
  ('drip_meta',          '{"globalLastPost":0,"totalPosted":0}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Optional: index on updated_at for monitoring queries.
CREATE INDEX IF NOT EXISTS seeder_state_updated_at_idx ON seeder_state (updated_at DESC);
