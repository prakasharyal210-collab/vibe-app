/**
 * scripts/src/seed-content.ts  —  Gundruk drip seeder v3
 *
 * Posts content through the running API server. All writes go through the
 * existing moderation + counter pipeline.
 *
 * ─── Modes ────────────────────────────────────────────────────────────────────
 *
 *  One-shot (default): posts all items in seed-content-batch.json then exits.
 *    API_URL=http://localhost:80 pnpm --filter @workspace/scripts run seed-content
 *
 *  Drip (DRIP=true): same as one-shot but ~5s between posts.
 *    DRIP=true API_URL=http://localhost:80 pnpm --filter @workspace/scripts run seed-content
 *
 *  Loop (LOOP=true): continuous — per-persona rhythms, auto-regen, no image repeats.
 *    LOOP=true API_URL=https://vibe-app-production.up.railway.app \
 *      pnpm --filter @workspace/scripts run seed-content
 *
 *  Background / Railway worker (nohup):
 *    LOOP=true API_URL=... nohup npx tsx scripts/src/seed-content.ts \
 *      > /tmp/drip.log 2>&1 &
 *    tail -f /tmp/drip.log
 *    pkill -f seed-content.ts   # graceful — sends SIGTERM
 *
 *  Update images on already-posted items:
 *    UPDATE_IMAGES=true API_URL=... pnpm --filter @workspace/scripts run seed-content
 *
 *  Dry-run (no HTTP calls):
 *    DRY_RUN=true pnpm --filter @workspace/scripts run seed-content
 *
 * ─── State persistence (LOOP mode) ───────────────────────────────────────────
 *  When SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, state is stored in
 *  the seeder_state Postgres table (see scripts/seed-state-migration.sql).
 *  This makes the worker safe on Railway's ephemeral filesystem.
 *
 *  Without Supabase vars (local dev), falls back to local JSON files:
 *    scripts/seed-state.json        — queue + persona times + meta
 *    scripts/seed-used-images.json  — Pexels photo ID ledger
 *
 * ─── Env vars required on Railway ────────────────────────────────────────────
 *  LOOP=true
 *  API_URL=https://vibe-app-production-d1d9.up.railway.app
 *  PEXELS_API_KEY=<key>
 *  AI_INTEGRATIONS_ANTHROPIC_API_KEY=<key>  (or ANTHROPIC_API_KEY)
 *  AI_INTEGRATIONS_ANTHROPIC_BASE_URL=<proxy url>  (if using Replit proxy)
 *  SUPABASE_URL=https://<project>.supabase.co
 *  SUPABASE_SERVICE_ROLE_KEY=<service role key>
 *  POST_HOURS_UTC=21-14   (optional — default quiet window 14:00–21:00 UTC)
 */

import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { BatchItem, PollDef } from "./generate-seed-content.js";
import { PERSONAS, generateBatch } from "./generate-seed-content.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueueItem extends BatchItem {
  posted: boolean;
  postedAt?: number;
  postId?: string;
}

interface DripState {
  queue: QueueItem[];
  personaNextTimes: Record<string, number>;
  globalLastPost: number;
  totalPosted: number;
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  src: { original: string; large2x: string; large: string; medium: string };
  photographer: string;
}

interface FetchedImage {
  base64: string;
  mimeType: string;
  ext: string;
  credit: string;
  directUrl: string;
  photoId: string;
}

export type { PollDef };

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE       = (process.env["API_URL"] ?? "http://localhost:80").replace(/\/$/, "");
const PEXELS_KEY     = process.env["PEXELS_API_KEY"] ?? "";
const DRY_RUN        = process.env["DRY_RUN"] === "true";
const UPDATE_IMAGES  = process.env["UPDATE_IMAGES"] === "true";
const LOOP_MODE      = process.env["LOOP"] === "true";
const DRIP_MODE      = process.env["DRIP"] === "true";

const SUPABASE_URL   = (process.env["SUPABASE_URL"] ?? "").replace(/\/$/, "");
const SUPABASE_KEY   = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const USE_DB         = !!(SUPABASE_URL && SUPABASE_KEY);

/** "START-END" in UTC hours.  e.g. "0-20" = active 00:00–19:59 UTC.
 *  Default sleep window 20:00–00:00 UTC covers ~2am–6am NPT deep night:
 *    00:00 UTC = 05:45 NPT / 10:00 AEST — both waking up   → seeder starts
 *    20:00 UTC = 01:45 NPT / 06:00 AEST — both past midnight → seeder sleeps */
const POST_HOURS_UTC = process.env["POST_HOURS_UTC"] ?? "0-20";

const MIN_WIDTH        = 2500;
const MIN_RESULTS      = 3;
const TOP_N            = 5;
const MIN_GAP_MS       = 8 * 60_000;
const LOW_WATERMARK    = 10;
const REGEN_COUNT      = 20;
const DRIP_STAGGER_MS  = 5_000;
const SHOT_STAGGER_MS  = 500;
const HEARTBEAT_MS     = 10 * 60_000;

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let shuttingDown = false;

process.on("SIGTERM", () => {
  shuttingDown = true;
  process.stdout.write(`\n[${ts()}] 🛑 SIGTERM — finishing current operation and saving state…\n`);
});

// ---------------------------------------------------------------------------
// Per-persona posting rhythms
// ---------------------------------------------------------------------------

const PERSONA_RHYTHMS: Record<string, { baseMs: number; jitterMs: number }> = {
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01": { baseMs: 45 * 60_000,  jitterMs: 10 * 60_000 },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02": { baseMs: 90 * 60_000,  jitterMs: 20 * 60_000 },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03": { baseMs: 120 * 60_000, jitterMs: 30 * 60_000 },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04": { baseMs: 35 * 60_000,  jitterMs: 8 * 60_000  },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05": { baseMs: 80 * 60_000,  jitterMs: 15 * 60_000 },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06": { baseMs: 100 * 60_000, jitterMs: 20 * 60_000 },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07": { baseMs: 25 * 60_000,  jitterMs: 5 * 60_000  },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08": { baseMs: 150 * 60_000, jitterMs: 30 * 60_000 },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09": { baseMs: 60 * 60_000,  jitterMs: 15 * 60_000 },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10": { baseMs: 50 * 60_000,  jitterMs: 10 * 60_000 },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11": { baseMs: 70 * 60_000,  jitterMs: 15 * 60_000 },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12": { baseMs: 30 * 60_000,  jitterMs: 8 * 60_000  },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13": { baseMs: 85 * 60_000,  jitterMs: 20 * 60_000 },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14": { baseMs: 40 * 60_000,  jitterMs: 10 * 60_000 },
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15": { baseMs: 110 * 60_000, jitterMs: 25 * 60_000 },
};

function nextInterval(personaId: string): number {
  const r = PERSONA_RHYTHMS[personaId] ?? { baseMs: 60 * 60_000, jitterMs: 15 * 60_000 };
  return r.baseMs + (Math.random() * 2 - 1) * r.jitterMs;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

function hm(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r > 0 ? `${m}m${r}s` : `${m}m`;
}

/** SIGTERM-interruptible sleep: wakes every 500ms to check shuttingDown. */
async function sleep(ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end && !shuttingDown) {
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(500, end - Date.now())));
  }
}

// ---------------------------------------------------------------------------
// Active-hours window
// ---------------------------------------------------------------------------

function isInActiveHours(): boolean {
  const parts  = POST_HOURS_UTC.split("-");
  const start  = parseInt(parts[0] ?? "21", 10);
  const end    = parseInt(parts[1] ?? "14", 10);
  const hour   = new Date().getUTCHours();
  return start <= end
    ? (hour >= start && hour < end)
    : (hour >= start || hour < end);   // wraps midnight
}

async function waitForActiveHours(): Promise<void> {
  if (isInActiveHours()) return;
  const parts     = POST_HOURS_UTC.split("-");
  const startHour = parseInt(parts[0] ?? "21", 10);
  const now       = new Date();
  const next      = new Date(now);
  next.setUTCHours(startHour, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const waitMs = next.getTime() - now.getTime();
  console.log(
    `[${ts()}] 🌙 Outside active hours (POST_HOURS_UTC=${POST_HOURS_UTC}) — ` +
    `sleeping ${hm(waitMs)} until ${next.toISOString().slice(0, 16)} UTC`,
  );
  await sleep(waitMs);
}

// ---------------------------------------------------------------------------
// Supabase REST helpers
// ---------------------------------------------------------------------------

async function dbGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/seeder_state?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
    );
    if (!res.ok) return fallback;
    const rows = await res.json() as Array<{ value: T }>;
    return rows[0]?.value ?? fallback;
  } catch { return fallback; }
}

async function dbSet(key: string, value: unknown): Promise<void> {
  // Serialize to a UTF-8 byte buffer first.  Using a Uint8Array (not a plain
  // string) ensures Node.js undici never misroutes the payload into a header
  // slot — the source of "ByteString contains non-Latin1 code point" errors
  // when captions include →, emoji, or curly quotes.
  const bodyBytes = new TextEncoder().encode(
    JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  );
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/seeder_state`, {
      method: "POST",
      headers: {
        apikey:           SUPABASE_KEY,
        Authorization:    `Bearer ${SUPABASE_KEY}`,
        "Content-Type":   "application/json",
        "Content-Length": String(bodyBytes.byteLength),
        Prefer:           "resolution=merge-duplicates",
      },
      body: bodyBytes,
    });
    // Always drain the response body so undici can reuse the connection.
    // Skipping this is the other trigger for ByteString errors on subsequent
    // requests — the old response stream leaks into the next one.
    await res.text().catch(() => undefined);
  } catch (e: any) {
    console.warn(`    ⚠  dbSet("${key}") failed: ${e?.message}`);
  }
}

// ---------------------------------------------------------------------------
// State persistence — DB-backed with local-file fallback for dev
// ---------------------------------------------------------------------------

const STATE_PATH  = join(SCRIPTS_DIR, "seed-state.json");
const LEDGER_PATH = join(SCRIPTS_DIR, "seed-used-images.json");

async function loadLedger(): Promise<Set<string>> {
  if (USE_DB) {
    const ids = await dbGet<string[]>("drip_used_ids", []);
    return new Set(ids);
  }
  try {
    const raw = await readFile(LEDGER_PATH, "utf-8");
    return new Set((JSON.parse(raw) as { ids: string[] }).ids);
  } catch { return new Set(); }
}

async function saveLedger(usedIds: Set<string>): Promise<void> {
  if (USE_DB) { await dbSet("drip_used_ids", [...usedIds]); return; }
  await writeFile(LEDGER_PATH, JSON.stringify({ ids: [...usedIds] }, null, 2), "utf-8");
}

/** Returns prior LOOP state + ledger, or null if no prior run exists. */
async function loadLoopState(): Promise<{ state: DripState; usedIds: Set<string> } | null> {
  if (USE_DB) {
    const [queue, usedIdsArr, personaTimes, meta] = await Promise.all([
      dbGet<QueueItem[]>("drip_queue", []),
      dbGet<string[]>("drip_used_ids", []),
      dbGet<Record<string, number>>("drip_persona_times", {}),
      dbGet<{ globalLastPost: number; totalPosted: number }>(
        "drip_meta", { globalLastPost: 0, totalPosted: 0 },
      ),
    ]);
    const hasPrior = queue.length > 0 || Object.keys(personaTimes).length > 0 || meta.totalPosted > 0;
    if (!hasPrior) return null;
    return {
      state:   { queue, personaNextTimes: personaTimes, ...meta },
      usedIds: new Set(usedIdsArr),
    };
  }
  try {
    const raw     = await readFile(STATE_PATH, "utf-8");
    const state   = JSON.parse(raw) as DripState;
    const usedIds = await loadLedger();
    return { state, usedIds };
  } catch { return null; }
}

/** Persists loop state.  Only unposted items are stored to keep payload small. */
async function saveLoopState(state: DripState, usedIds: Set<string>): Promise<void> {
  if (USE_DB) {
    await Promise.all([
      dbSet("drip_queue",          state.queue.filter(q => !q.posted)),
      dbSet("drip_used_ids",       [...usedIds]),
      dbSet("drip_persona_times",  state.personaNextTimes),
      dbSet("drip_meta",           { globalLastPost: state.globalLastPost, totalPosted: state.totalPosted }),
    ]);
    return;
  }
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  await saveLedger(usedIds);
}

// ---------------------------------------------------------------------------
// Pexels helpers
// ---------------------------------------------------------------------------

async function searchPexels(query: string, page = 1): Promise<PexelsPhoto[]> {
  const url =
    `https://api.pexels.com/v1/search` +
    `?query=${encodeURIComponent(query)}` +
    `&per_page=15&orientation=portrait&size=large&page=${page}`;
  try {
    const res  = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
    if (!res.ok) { console.warn(`    ⚠  Pexels HTTP ${res.status} for "${query}" p${page}`); return []; }
    const data = await res.json() as { photos?: PexelsPhoto[] };
    return data.photos ?? [];
  } catch (e: any) {
    console.warn(`    ⚠  Pexels threw for "${query}" p${page}: ${e?.message}`);
    return [];
  }
}

async function fetchPexelsImage(
  imageQuery: string,
  fallbackQueries: string[] = [],
  usedIds: Set<string> = new Set(),
): Promise<FetchedImage | null> {
  if (!PEXELS_KEY) { console.warn(`  ⚠  PEXELS_API_KEY not set`); return null; }

  const chain = [imageQuery, ...fallbackQueries];

  for (let qi = 0; qi < chain.length; qi++) {
    const query  = chain[qi]!;
    const isLast = qi === chain.length - 1;

    for (let page = 1; page <= 2; page++) {
      const all       = await searchPexels(query, page);
      const qualified = all.filter(p => p.width >= MIN_WIDTH && !usedIds.has(String(p.id)));
      const allWide   = all.filter(p => p.width >= MIN_WIDTH);

      if (qualified.length === 0 && allWide.length > 0 && page === 1) {
        console.log(`    🔍  [${qi + 1}/${chain.length}] "${query}" p1: all candidates used — trying p2…`);
        continue;
      }
      if (qualified.length < MIN_RESULTS && !isLast && page === 1) {
        console.log(`    🔍  [${qi + 1}/${chain.length}] "${query}" p${page}: ${qualified.length} unique < ${MIN_RESULTS} — fallback…`);
        break;
      }
      if (qualified.length === 0) {
        console.log(`    🔍  [${qi + 1}/${chain.length}] "${query}" p${page}: 0 unique qualifying`);
        break;
      }

      const pool  = qualified.slice(0, TOP_N);
      const photo = pool[Math.floor(Math.random() * pool.length)]!;
      const imgUrl = photo.src.original || photo.src.large2x || photo.src.large;

      console.log(
        `    🔍  [${qi + 1}/${chain.length}] "${query}" p${page} → ` +
        `${qualified.length} unique, picked #${photo.id} ${photo.width}×${photo.height}px`,
      );

      try {
        const imgRes = await fetch(imgUrl);
        if (!imgRes.ok) { console.warn(`    ⚠  Download failed (${imgRes.status})`); break; }
        const buf = await imgRes.arrayBuffer();
        return {
          base64:    Buffer.from(buf).toString("base64"),
          mimeType:  "image/jpeg",
          ext:       "jpg",
          credit:    `Photo #${photo.id} by ${photo.photographer} on Pexels (${photo.width}px)`,
          directUrl: imgUrl,
          photoId:   String(photo.id),
        };
      } catch (e: any) {
        console.warn(`    ⚠  Download threw: ${e?.message}`);
        break;
      }
    }
  }

  console.warn(`    ⚠  All ${chain.length} queries exhausted — no unique qualifying image`);
  return null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function postToFeed(
  item: BatchItem,
  usedIds: Set<string>,
): Promise<{ data: any; error: string | null; photoId?: string }> {
  let image: FetchedImage | null = null;
  if (item.imageQuery) {
    // fetchPexelsImage() already walks the full [imageQuery, ...fallbackQueries]
    // chain (2 pages each) internally before giving up and returning null — so
    // there is no separate retry to add here. We only need to make sure that
    // when the whole chain is exhausted, we do NOT fall through and create a
    // caption-only post with an empty image_url.
    console.log(`    🔍  Fetching image for @${item.personaId} — trying "${item.imageQuery}" + ${item.fallbackQueries?.length ?? 0} fallback quer${item.fallbackQueries?.length === 1 ? "y" : "ies"}…`);
    image = await fetchPexelsImage(item.imageQuery, item.fallbackQueries, usedIds);
    if (image) {
      console.log(`    📷  ${image.credit}`);
    } else {
      const msg = `Pexels image fetch failed for @${item.personaId} — all fallback queries exhausted, skipping post creation for this cycle`;
      console.warn(`    ⚠️  ${msg}`);
      return { data: null, error: `SKIPPED_NO_IMAGE: ${msg}` };
    }
  }

  const body: Record<string, unknown> = {
    userId:  item.personaId,
    caption: item.caption ?? "",
    options: { visibility: "public", ...(item.category ? { category: item.category } : {}) },
    ...(image ? { imageBase64: image.base64, mimeType: image.mimeType, ext: image.ext } : {}),
    ...(item.poll ? { poll: item.poll } : {}),
  };

  const res  = await fetch(`${API_BASE}/api/posts/create`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const json = await res.json() as any;
  return { data: res.ok ? json : null, error: res.ok ? null : (json?.error ?? `HTTP ${res.status}`), photoId: image?.photoId };
}

async function updatePostThumbnail(
  postId: string,
  userId: string,
  directUrl: string,
): Promise<{ ok: boolean; error: string | null }> {
  const res  = await fetch(`${API_BASE}/api/posts/${postId}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ userId, thumbnail_url: directUrl }),
  });
  const json = await res.json() as any;
  return { ok: res.ok, error: res.ok ? null : (json?.error ?? `HTTP ${res.status}`) };
}

// ---------------------------------------------------------------------------
// Status line
// ---------------------------------------------------------------------------

function printStatus(state: DripState, nextHandle: string, etaMs: number): void {
  const unposted = state.queue.filter(q => !q.posted).length;
  process.stdout.write(
    `\r[${ts()}] queue: ${unposted} | posted: ${state.totalPosted} | next: @${nextHandle} in ${hm(etaMs)}   `,
  );
}

// ---------------------------------------------------------------------------
// Auto-regen
// ---------------------------------------------------------------------------

async function autoRegenerate(state: DripState): Promise<void> {
  console.log(`\n[${ts()}] 🔄  Queue low (${state.queue.filter(q => !q.posted).length}) — generating ${REGEN_COUNT} new items via Claude…`);
  try {
    const newItems = await generateBatch(REGEN_COUNT, 20);
    state.queue.push(...newItems.map(i => ({ ...i, posted: false } as QueueItem)));
    console.log(`[${ts()}] ✅  Added ${newItems.length} items (queue: ${state.queue.filter(q => !q.posted).length} unposted)\n`);
  } catch (e: any) {
    console.error(`[${ts()}] ⚠️  Auto-regen failed: ${e?.message} — continuing with existing queue`);
  }
}

// ---------------------------------------------------------------------------
// LOOP mode
// ---------------------------------------------------------------------------

async function runLoop(initialItems: QueueItem[]): Promise<void> {
  // Load or init state
  const prior = await loadLoopState();
  let state: DripState;
  let usedIds: Set<string>;

  if (prior) {
    ({ state, usedIds } = prior);
    console.log(
      `[${ts()}] ▶️   Resuming — ` +
      `${state.queue.filter(q => !q.posted).length} unposted, ` +
      `${state.totalPosted} total posted`,
    );
  } else {
    usedIds = new Set();
    state   = { queue: initialItems, personaNextTimes: {}, globalLastPost: 0, totalPosted: 0 };
    for (const p of PERSONAS) {
      state.personaNextTimes[p.id] = Date.now() + Math.random() * 5 * 60_000;
    }
    await saveLoopState(state, usedIds);
    console.log(`[${ts()}] 🌱  Initialised fresh state with ${initialItems.length} items`);
  }

  console.log(`[${ts()}] 📖  Ledger: ${usedIds.size} Pexels IDs excluded`);
  console.log(`[${ts()}] 🕐  Active hours: ${POST_HOURS_UTC} UTC`);
  console.log(`[${ts()}] 💾  Persistence: ${USE_DB ? "Supabase (seeder_state)" : "local JSON files"}\n`);

  // 10-min heartbeat so Railway logs show liveness
  const heartbeatTimer = setInterval(() => {
    const unposted = state.queue.filter(q => !q.posted).length;
    console.log(`\n[${ts()}] 💓 alive — ${state.totalPosted} posted, ${unposted} queued, ${usedIds.size} images used`);
  }, HEARTBEAT_MS);

  while (!shuttingDown) {
    // Honour active-hours window
    await waitForActiveHours();
    if (shuttingDown) break;

    const unposted = state.queue.filter(q => !q.posted);

    if (unposted.length < LOW_WATERMARK) {
      await autoRegenerate(state);
      await saveLoopState(state, usedIds);
      if (shuttingDown) break;
    }

    const now = Date.now();

    const candidates = PERSONAS
      .filter(p => state.queue.some(q => !q.posted && q.personaId === p.id))
      .map(p => {
        const personaTime = state.personaNextTimes[p.id] ?? now;
        const eta = Math.max(personaTime, state.globalLastPost + MIN_GAP_MS);
        return { p, eta };
      })
      .sort((a, b) => a.eta - b.eta);

    if (candidates.length === 0) { await sleep(30_000); continue; }

    const { p, eta } = candidates[0]!;
    const waitMs = eta - Date.now();

    const statusTick = waitMs > 2_000
      ? setInterval(() => printStatus(state, p.handle, eta - Date.now()), 1_000)
      : null;
    if (waitMs > 0) { printStatus(state, p.handle, waitMs); await sleep(waitMs); }
    if (statusTick) clearInterval(statusTick);
    if (shuttingDown) { process.stdout.write("\n"); break; }
    process.stdout.write("\n");

    const item = state.queue.find(q => !q.posted && q.personaId === p.id);
    if (!item) continue;

    const label = `${item.personaName ?? p.name} (${item.type})`;
    console.log(`[${ts()}] 📤  ${label}`);
    if (item.caption) console.log(`         "${item.caption.slice(0, 80)}${item.caption.length > 80 ? "…" : ""}"`);

    if (DRY_RUN) {
      console.log(`         DRY RUN — skipping`);
      item.posted = true;
      item.postedAt = Date.now();
    } else {
      try {
        const { data, error, photoId } = await postToFeed(item, usedIds);
        item.posted  = true;
        item.postedAt = Date.now();
        if (error) {
          console.error(`[${ts()}] ✗  ${label}: ${error}`);
        } else {
          const id = data?.id ?? data?.post?.id ?? "?";
          console.log(`[${ts()}] ✓  ${label}  →  ${id}`);
          state.totalPosted++;
          if (photoId) usedIds.add(photoId);
        }
      } catch (e: any) {
        console.error(`[${ts()}] 💥  ${label}: ${e?.message}`);
        item.posted  = true;
        item.postedAt = Date.now();
      }
    }

    state.personaNextTimes[p.id] = Date.now() + nextInterval(p.id);
    state.globalLastPost = Date.now();

    await saveLoopState(state, usedIds);
  }

  // Graceful SIGTERM exit
  clearInterval(heartbeatTimer);
  await saveLoopState(state, usedIds);
  console.log(`[${ts()}] 💾 State saved. Exiting cleanly.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// UPDATE_IMAGES mode
// ---------------------------------------------------------------------------

async function runUpdateImages(items: QueueItem[]): Promise<void> {
  console.log(`\n🖼   UPDATE_IMAGES mode — re-fetching higher-quality photos\n`);
  const eligible = items.filter(i => i.imageQuery && i.postId);
  console.log(`    ${eligible.length} eligible  |  ${items.length - eligible.length} skipped\n`);
  if (!eligible.length) { console.log(`    Add "postId": "<uuid>" to batch items first.\n`); return; }

  const usedIds = await loadLedger();
  let thumbOk = 0, thumbFail = 0, noImage = 0;

  for (const [i, item] of eligible.entries()) {
    const label = item.personaName ?? item.personaId.slice(-4);
    console.log(`[${String(i + 1).padStart(3)}/${eligible.length}]  ${label}`);
    if (DRY_RUN) { console.log(`         DRY RUN — would patch ${item.postId}`); continue; }

    const image = await fetchPexelsImage(item.imageQuery!, item.fallbackQueries, usedIds);
    if (!image) { noImage++; await sleep(SHOT_STAGGER_MS); continue; }

    console.log(`    📷  ${image.credit}`);
    const { ok, error } = await updatePostThumbnail(item.postId!, item.personaId, image.directUrl);
    if (ok) {
      console.log(`    ✓  thumbnail_url updated  →  ${item.postId}`);
      usedIds.add(image.photoId);
      await saveLedger(usedIds);
      thumbOk++;
    } else {
      console.error(`    ✗  ${error}`);
      thumbFail++;
    }
    await sleep(SHOT_STAGGER_MS);
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`thumbnail_url: ${thumbOk} ✓  ${thumbFail} ✗  ${noImage} no-image`);
  console.log(`\n⚠  media_url is NOT updatable via the current API.`);
  console.log(`   Add PATCH /api/posts/:id/media to replace it.\n`);
}

// ---------------------------------------------------------------------------
// One-shot / drip seed
// ---------------------------------------------------------------------------

async function runSeed(items: QueueItem[], stagger: number): Promise<void> {
  const usedIds = await loadLedger();
  let ok = 0, fail = 0, skip = 0;
  const failures: Array<{ index: number; label: string; error: string }> = [];

  for (const [i, item] of items.entries()) {
    const label = item.personaName ? `${item.personaName} (${item.type})` : `${item.personaId.slice(-4)} (${item.type})`;

    if (DRY_RUN) {
      const chain = item.imageQuery ? [item.imageQuery, ...(item.fallbackQueries ?? [])].join(" → ") : "(no image)";
      console.log(`[${String(i + 1).padStart(3)}/${items.length}]  ${label}`);
      console.log(`         ${(item.caption ?? "(no text)").slice(0, 80)}`);
      console.log(`         queries: ${chain}`);
      skip++;
      continue;
    }

    try {
      const { data, error, photoId } = await postToFeed(item, usedIds);
      if (error) {
        console.error(`[${String(i + 1).padStart(3)}/${items.length}]  ✗  ${label}: ${error}`);
        failures.push({ index: i + 1, label, error });
        fail++;
      } else {
        const id = data?.id ?? data?.post?.id ?? "?";
        console.log(`[${String(i + 1).padStart(3)}/${items.length}]  ✓  ${label}  →  ${id}`);
        ok++;
        if (photoId) { usedIds.add(photoId); await saveLedger(usedIds); }
      }
      await sleep(stagger);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error(`[${String(i + 1).padStart(3)}/${items.length}]  💥  ${label}: ${msg}`);
      failures.push({ index: i + 1, label, error: msg });
      fail++;
      await sleep(stagger);
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  if (DRY_RUN) {
    console.log(`Dry run: ${skip} items would be posted`);
  } else {
    console.log(`Done: ${ok} ✓  ${fail} ✗`);
    if (failures.length) {
      console.log("\nFailed:");
      for (const f of failures) console.log(`  [${f.index}] ${f.label} — ${f.error}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const batchPath = join(SCRIPTS_DIR, "seed-content-batch.json");
  let batchItems: QueueItem[] = [];

  try {
    const raw = await readFile(batchPath, "utf-8");
    batchItems = (JSON.parse(raw) as BatchItem[]).map(i => ({ ...i, posted: false }));
  } catch {
    if (!LOOP_MODE) {
      console.error(`ERROR: Cannot read ${batchPath}`);
      console.error("Run: pnpm --filter @workspace/scripts run generate-seed-content");
      process.exit(1);
    }
    console.warn(`⚠  No batch file — LOOP mode will auto-generate on first cycle`);
  }

  const mode = UPDATE_IMAGES ? "UPDATE_IMAGES" : LOOP_MODE ? "LOOP" : DRIP_MODE ? "DRIP" : DRY_RUN ? "DRY_RUN" : "ONE-SHOT";

  console.log(`\n🌱  Gundruk drip seeder v3`);
  console.log(`    API:         ${API_BASE}`);
  console.log(`    Pexels:      ${PEXELS_KEY ? `✓ key set (min ${MIN_WIDTH}px, top ${TOP_N}/query)` : "✗ NOT SET — text-only posts"}`);
  console.log(`    Persistence: ${USE_DB ? `Supabase @ ${SUPABASE_URL}` : "local JSON files (no SUPABASE_URL set)"}`);
  console.log(`    Mode:        ${mode}`);
  if (!LOOP_MODE && !UPDATE_IMAGES) console.log(`    Items:       ${batchItems.length}`);
  console.log();

  if (UPDATE_IMAGES)    await runUpdateImages(batchItems);
  else if (LOOP_MODE)   await runLoop(batchItems);
  else                  await runSeed(batchItems, DRIP_MODE ? DRIP_STAGGER_MS : SHOT_STAGGER_MS);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
