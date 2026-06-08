#!/usr/bin/env node
// One-shot migration runner — delete after use
import { readFileSync } from 'fs';
import https from 'https';

const SUPABASE_URL = "https://tatroqgcyebuqqkhmvpa.supabase.co";
const SERVICE_ROLE_KEY = process.argv[2];

if (!SERVICE_ROLE_KEY) {
  console.error("Usage: node scripts/run-migration.mjs <service_role_key>");
  process.exit(1);
}

const sql = readFileSync('scripts/vibe-matching-migration.sql', 'utf8');

// Split into individual statements to run them one by one via the SQL API
// Supabase exposes pg via the Management API — but service_role key works
// with the direct pg REST at /rest/v1/rpc if we have a SQL runner function.
// Instead, use the Supabase pg endpoint via node-postgres style HTTP.

// The cleanest approach: use the Supabase REST API with service_role for DDL
// by hitting the pg REST endpoint that accepts raw SQL (available in Supabase).
const body = JSON.stringify({ query: sql });

const makeRequest = (hostname, path, body, key) => new Promise((resolve, reject) => {
  const options = {
    hostname,
    port: 443,
    path,
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    }
  };
  const req = https.request(options, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => resolve({ status: res.statusCode, body: d }));
  });
  req.on('error', reject);
  req.write(body);
  req.end();
});

// Try Management API first
console.log("Trying Supabase Management API...");
try {
  const r1 = await makeRequest(
    'api.supabase.com',
    '/v1/projects/tatroqgcyebuqqkhmvpa/database/query',
    body,
    SERVICE_ROLE_KEY
  );
  console.log("Management API status:", r1.status);
  console.log("Response:", r1.body.substring(0, 500));

  if (r1.status === 200 || r1.status === 201) {
    console.log("\n✅ Migration completed successfully via Management API!");
    process.exit(0);
  }
} catch(e) {
  console.log("Management API error:", e.message);
}

// Fallback: try pg REST direct
console.log("\nTrying Supabase REST /rest/v1/rpc/exec_sql...");
const rpcBody = JSON.stringify({ sql });
const r2 = await makeRequest(
  'tatroqgcyebuqqkhmvpa.supabase.co',
  '/rest/v1/rpc/exec_sql',
  rpcBody,
  SERVICE_ROLE_KEY
);
console.log("RPC status:", r2.status, r2.body.substring(0, 500));

// Also verify tables exist after
console.log("\nVerifying tables...");
const checkTables = async (table) => {
  const r = await makeRequest(
    'tatroqgcyebuqqkhmvpa.supabase.co',
    `/rest/v1/${table}?limit=1`,
    '{}',
    SERVICE_ROLE_KEY
  );
  return { table, status: r.status, ok: r.status === 200 };
};

const results = await Promise.all([
  checkTables('vibe_swipes'),
  checkTables('vibe_scores'),
]);
results.forEach(r => console.log(r.ok ? `✅ ${r.table}` : `❌ ${r.table} (${r.status})`));
