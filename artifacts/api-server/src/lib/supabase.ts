/**
 * Server-side Supabase client factory.
 *
 * Shared by all route handlers. Key differences from a browser client:
 *   - No session persistence (server-side, no cookie/localStorage)
 *   - Realtime disabled — the API server only needs REST/PostgREST DB access
 *   - Uses the service-role key, which bypasses RLS on all tables
 *
 * WebSocket polyfill is applied globally in src/index.ts before this module
 * is first used, so the realtime-js check for `globalThis.WebSocket` passes
 * even on Node.js 20 (Railway) where the native global is absent.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
  "https://tatroqgcyebuqqkhmvpa.supabase.co";

/** Server-side Supabase options — no auth session, realtime effectively idle. */
const SERVER_OPTIONS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: -1 },
  },
} as const;

/**
 * Create a service-role Supabase client.
 * Called once per request in route handlers.
 */
export function makeSupabase() {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(SUPABASE_URL, key, SERVER_OPTIONS);
}
