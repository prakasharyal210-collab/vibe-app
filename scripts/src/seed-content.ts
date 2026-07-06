/**
 * scripts/src/seed-content.ts
 *
 * Drip-seeder v2 — posts content through the running API server.
 * All writes go through the existing moderation + counter pipeline.
 *
 * ─── Modes ───────────────────────────────────────────────────────────────────
 *
 *  One-shot (default): posts all items in seed-content-batch.json then exits.
 *    API_URL=http://localhost:80 pnpm --filter @workspace/scripts run seed-content
 *
 *  Drip (DRIP=true): posts items with staggered delays (~5s between posts).
 *    DRIP=true API_URL=http://localhost:80 pnpm --filter @workspace/scripts run seed-content
 *
 *  Loop (LOOP=true, continuous): each persona posts on its own rhythm, auto-
 *  regenerates content when the queue runs low, and never posts the same
 *  Pexels photo twice.  State + ledger survive restarts.
 *    LOOP=true API_URL=http://localhost:80 \
 *      pnpm --filter @workspace/scripts run seed-content
 *
 *  Background (nohup):
 *    LOOP=true API_URL=http://localhost:80 \
 *      nohup npx tsx scripts/src/seed-content.ts > /tmp/drip.log 2>&1 &
 *    tail -f /tmp/drip.log
 *    pkill -f seed-content.ts   # to stop
 *
 *  Update images on already-posted items:
 *    UPDATE_IMAGES=true API_URL=http://localhost:80 \
 *      pnpm --filter @workspace/scripts run seed-content
 *
 *  Dry-run (no HTTP calls):
 *    DRY_RUN=true pnpm --filter @workspace/scripts run seed-content
 *
 * ─── Persistence (LOOP mode) ─────────────────────────────────────────────────
 *  scripts/seed-state.json      — queue + per-persona next-post times + totals
 *  scripts/seed-used-images.json — every Pexels photo ID ever posted
 *  Both files are written after each successful post.  Restart resumes cleanly.
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
  postId?: string;   // filled in UPDATE_IMAGES mode
}

interface DripState {
  queue: QueueItem[];
  personaNextTimes: Record<string, number>; // personaId → unix ms when next can post
  globalLastPost: number;                    // unix ms of last post across all personas
  totalPosted: number;
}

interface ImageLedger {
  ids: string[]; // Pexels photo IDs ever posted
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

// Re-export so UPDATE_IMAGES mode compile still works
export type { PollDef };

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE      = (process.env["API_URL"] ?? "http://localhost:80").replace(/\/$/, "");
const PEXELS_KEY    = process.env["PEXELS_API_KEY"] ?? "";
const DRY_RUN       = process.env["DRY_RUN"] === "true";
const UPDATE_IMAGES = process.env["UPDATE_IMAGES"] === "true";
const LOOP_MODE     = process.env["LOOP"] === "true";
const DRIP_MODE     = process.env["DRIP"] === "true";

/** Minimum qualifying photo width in pixels */
const MIN_WIDTH   = 2500;
/** Advance to next query if fewer than this many unique qualified results */
const MIN_RESULTS = 3;
/** Pick randomly from the top N qualifying non-used results */
const TOP_N       = 5;
/** Minimum gap between any two posts across all personas (ms) */
const MIN_GAP_MS  = 8 * 60_000;     // 8 minutes
/** Auto-regen when fewer than this many items remain in queue */
const LOW_WATERMARK = 10;
/** Items to generate per auto-regen call */
const REGEN_COUNT   = 20;
/** Drip mode stagger between posts (ms) */
const DRIP_STAGGER_MS = 5_000;
/** One-shot mode stagger (ms) */
const SHOT_STAGGER_MS = 500;

// ---------------------------------------------------------------------------
// Per-persona posting rhythms  (base interval ± jitter in ms)
// Targets ~25–45 combined posts per 24h, limited by queue depth.
// ---------------------------------------------------------------------------

const PERSONA_RHYTHMS: Record<string, { baseMs: number; jitterMs: number }> = {
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01": { baseMs: 45 * 60_000, jitterMs: 10 * 60_000 }, // momoking — medium
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02": { baseMs: 90 * 60_000, jitterMs: 20 * 60_000 }, // sydneydarling — slow
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03": { baseMs: 120 * 60_000, jitterMs: 30 * 60_000 }, // pokharapeaks — slow
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04": { baseMs: 35 * 60_000, jitterMs: 8 * 60_000 },  // desi_chaos — fast
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05": { baseMs: 80 * 60_000, jitterMs: 15 * 60_000 }, // priya.rai — medium-slow
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06": { baseMs: 100 * 60_000, jitterMs: 20 * 60_000 }, // rohanrai — slow
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07": { baseMs: 25 * 60_000, jitterMs: 5 * 60_000 },  // aakash_eleven — frequent
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08": { baseMs: 150 * 60_000, jitterMs: 30 * 60_000 }, // nurse_anisha — slow
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09": { baseMs: 60 * 60_000, jitterMs: 15 * 60_000 }, // lopdohori — medium
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10": { baseMs: 50 * 60_000, jitterMs: 10 * 60_000 }, // nisha.thrifts — medium
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11": { baseMs: 70 * 60_000, jitterMs: 15 * 60_000 }, // kiran_in_london — medium
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12": { baseMs: 30 * 60_000, jitterMs: 8 * 60_000 },  // deepak_gainz — frequent
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13": { baseMs: 85 * 60_000, jitterMs: 20 * 60_000 }, // chiyaandthoughts — medium-slow
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14": { baseMs: 40 * 60_000, jitterMs: 10 * 60_000 }, // sunita.melb — medium
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15": { baseMs: 110 * 60_000, jitterMs: 25 * 60_000 }, // nabin.melb — slow
};

function nextInterval(personaId: string): number {
  const r = PERSONA_RHYTHMS[personaId] ?? { baseMs: 60 * 60_000, jitterMs: 15 * 60_000 };
  return r.baseMs + (Math.random() * 2 - 1) * r.jitterMs;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const STATE_PATH  = join(SCRIPTS_DIR, "seed-state.json");
const LEDGER_PATH = join(SCRIPTS_DIR, "seed-used-images.json");

async function loadState(): Promise<DripState | null> {
  try {
    const raw = await readFile(STATE_PATH, "utf-8");
    return JSON.parse(raw) as DripState;
  } catch { return null; }
}

async function saveState(state: DripState): Promise<void> {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

async function loadLedger(): Promise<Set<string>> {
  try {
    const raw = await readFile(LEDGER_PATH, "utf-8");
    const obj = JSON.parse(raw) as ImageLedger;
    return new Set(obj.ids);
  } catch { return new Set(); }
}

async function saveLedger(usedIds: Set<string>): Promise<void> {
  await writeFile(LEDGER_PATH, JSON.stringify({ ids: [...usedIds] }, null, 2), "utf-8");
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
    const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
    if (!res.ok) {
      console.warn(`    ⚠  Pexels HTTP ${res.status} for "${query}" p${page}`);
      return [];
    }
    const data = await res.json() as { photos?: PexelsPhoto[] };
    return data.photos ?? [];
  } catch (e: any) {
    console.warn(`    ⚠  Pexels threw for "${query}" p${page}: ${e?.message}`);
    return [];
  }
}

/**
 * Walks [imageQuery, ...fallbackQueries].  For each query, tries page 1 then
 * page 2 if all top candidates are already in usedIds.  Only returns photos
 * NOT in the ledger.  Returns null when the full chain is exhausted.
 */
async function fetchPexelsImage(
  imageQuery: string,
  fallbackQueries: string[] = [],
  usedIds: Set<string> = new Set(),
): Promise<FetchedImage | null> {
  if (!PEXELS_KEY) {
    console.warn(`  ⚠  PEXELS_API_KEY not set — skipping image`);
    return null;
  }

  const chain = [imageQuery, ...fallbackQueries];

  for (let qi = 0; qi < chain.length; qi++) {
    const query  = chain[qi]!;
    const isLast = qi === chain.length - 1;

    for (let page = 1; page <= 2; page++) {
      const all       = await searchPexels(query, page);
      const qualified = all.filter(p => p.width >= MIN_WIDTH && !usedIds.has(String(p.id)));
      const allWide   = all.filter(p => p.width >= MIN_WIDTH);

      if (qualified.length === 0 && allWide.length > 0 && page === 1) {
        // All wide photos on page 1 are used — try page 2
        console.log(`    🔍  [${qi + 1}/${chain.length}] "${query}" p1: all candidates used — trying p2…`);
        continue;
      }

      if (qualified.length < MIN_RESULTS && !isLast && page === 1) {
        console.log(
          `    🔍  [${qi + 1}/${chain.length}] "${query}" p${page}: ` +
          `${qualified.length} unique qualifying < ${MIN_RESULTS} — trying fallback…`,
        );
        break; // advance chain
      }

      if (qualified.length === 0) {
        console.log(`    🔍  [${qi + 1}/${chain.length}] "${query}" p${page}: 0 unique qualifying results`);
        break; // advance chain or give up
      }

      const pool  = qualified.slice(0, TOP_N);
      const photo = pool[Math.floor(Math.random() * pool.length)]!;
      const imgUrl = photo.src.original || photo.src.large2x || photo.src.large;

      console.log(
        `    🔍  [${qi + 1}/${chain.length}] "${query}" p${page} → ` +
        `${qualified.length} unique qualifying, picked #${photo.id} ${photo.width}×${photo.height}px`,
      );

      try {
        const imgRes = await fetch(imgUrl);
        if (!imgRes.ok) {
          console.warn(`    ⚠  Download failed (${imgRes.status}) — trying next`);
          break;
        }
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
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function hm(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.ceil(ms / 1000);
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r > 0 ? `${m}m${r}s` : `${m}m`;
}

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
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
    image = await fetchPexelsImage(item.imageQuery, item.fallbackQueries, usedIds);
    if (image) console.log(`    📷  ${image.credit}`);
  }

  const body: Record<string, unknown> = {
    userId:  item.personaId,
    caption: item.caption ?? "",
    options: {
      visibility: "public",
      ...(item.category ? { category: item.category } : {}),
    },
    ...(image
      ? { imageBase64: image.base64, mimeType: image.mimeType, ext: image.ext }
      : {}),
    ...(item.poll ? { poll: item.poll } : {}),
  };

  const res  = await fetch(`${API_BASE}/api/posts/create`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const json = await res.json() as any;
  return {
    data:    res.ok ? json : null,
    error:   res.ok ? null : (json?.error ?? `HTTP ${res.status}`),
    photoId: image?.photoId,
  };
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
// Status line (LOOP mode)
// ---------------------------------------------------------------------------

function printStatus(
  state: DripState,
  nextHandle: string,
  etaMs: number,
): void {
  const unposted = state.queue.filter(q => !q.posted).length;
  process.stdout.write(
    `\r[${ts()}] queue: ${unposted} unposted | posted: ${state.totalPosted} total | ` +
    `next: @${nextHandle} in ${hm(etaMs)}   `,
  );
}

// ---------------------------------------------------------------------------
// Auto-regen (LOOP mode)
// ---------------------------------------------------------------------------

async function autoRegenerate(state: DripState): Promise<void> {
  console.log(`\n[${ts()}] 🔄  Queue low — generating ${REGEN_COUNT} new items via Claude…`);
  try {
    const newItems = await generateBatch(REGEN_COUNT, 20);
    const asQueue: QueueItem[] = newItems.map(i => ({ ...i, posted: false }));
    state.queue.push(...asQueue);
    console.log(`[${ts()}] ✅  Added ${newItems.length} new items (queue now ${state.queue.filter(q => !q.posted).length} unposted)\n`);
  } catch (e: any) {
    console.error(`[${ts()}] ⚠️  Auto-regen failed: ${e?.message} — continuing with existing queue`);
  }
}

// ---------------------------------------------------------------------------
// LOOP mode
// ---------------------------------------------------------------------------

async function runLoop(initialItems: QueueItem[]): Promise<void> {
  // Load or init state
  let state = await loadState();
  if (!state) {
    state = {
      queue:            initialItems,
      personaNextTimes: {},
      globalLastPost:   0,
      totalPosted:      0,
    };
    // Assign initial staggered next-post times so not everyone fires at once
    for (const p of PERSONAS) {
      state.personaNextTimes[p.id] = Date.now() + Math.random() * 5 * 60_000;
    }
    await saveState(state);
    console.log(`[${ts()}] 🌱  Initialised fresh state with ${initialItems.length} items`);
  } else {
    console.log(
      `[${ts()}] ▶️   Resuming — ` +
      `${state.queue.filter(q => !q.posted).length} unposted, ` +
      `${state.totalPosted} total posted`,
    );
  }

  const usedIds = await loadLedger();
  console.log(`[${ts()}] 📖  Ledger: ${usedIds.size} Pexels IDs excluded\n`);

  while (true) {
    const unposted = state.queue.filter(q => !q.posted);

    // Auto-regen when low
    if (unposted.length < LOW_WATERMARK) {
      await autoRegenerate(state);
      await saveState(state);
    }

    const now = Date.now();

    // Build candidates: personas with unposted items, sorted by earliest allowed post time
    const candidates = PERSONAS
      .filter(p => state!.queue.some(q => !q.posted && q.personaId === p.id))
      .map(p => {
        const personaTime = state!.personaNextTimes[p.id] ?? now;
        const eta = Math.max(personaTime, state!.globalLastPost + MIN_GAP_MS);
        return { p, eta };
      })
      .sort((a, b) => a.eta - b.eta);

    if (candidates.length === 0) {
      // No persona has content — wait for regen to kick in next cycle
      await sleep(30_000);
      continue;
    }

    const { p, eta } = candidates[0]!;
    const waitMs = eta - Date.now();

    // Print status every second while waiting
    const statusInterval = waitMs > 2_000
      ? setInterval(() => printStatus(state!, p.handle, eta - Date.now()), 1_000)
      : null;

    if (waitMs > 0) {
      printStatus(state, p.handle, waitMs);
      await sleep(waitMs);
    }

    if (statusInterval) clearInterval(statusInterval);
    process.stdout.write("\n");

    // Pick the first unposted item for this persona
    const item = state.queue.find(q => !q.posted && q.personaId === p.id);
    if (!item) continue; // shouldn't happen but guard

    const label = `${item.personaName ?? p.name} (${item.type})`;
    console.log(`[${ts()}] 📤  ${label}`);
    if (item.caption) console.log(`         "${item.caption.slice(0, 80)}${item.caption.length > 80 ? "…" : ""}"`);

    if (DRY_RUN) {
      console.log(`         DRY RUN — would post, skipping`);
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

          // Commit photo to ledger
          if (photoId) {
            usedIds.add(photoId);
            await saveLedger(usedIds);
          }
        }
      } catch (e: any) {
        console.error(`[${ts()}] 💥  ${label}: ${e?.message}`);
        item.posted  = true;
        item.postedAt = Date.now();
      }
    }

    // Update rhythm for this persona
    state.personaNextTimes[p.id] = Date.now() + nextInterval(p.id);
    state.globalLastPost = Date.now();

    await saveState(state);
  }
}

// ---------------------------------------------------------------------------
// UPDATE_IMAGES mode
// ---------------------------------------------------------------------------

async function runUpdateImages(items: QueueItem[]): Promise<void> {
  console.log(`\n🖼   UPDATE_IMAGES mode — re-fetching higher-quality photos`);
  console.log(`    Only items with both imageQuery and postId will be processed.\n`);

  const eligible = items.filter(i => i.imageQuery && i.postId && i.type !== "confession" as any);
  const skipped  = items.length - eligible.length;
  console.log(`    ${eligible.length} eligible  |  ${skipped} skipped\n`);

  if (!eligible.length) {
    console.log(`    Nothing to do. Add "postId": "<uuid>" to batch items from the seed run log.\n`);
    return;
  }

  const usedIds = await loadLedger();
  let thumbOk = 0, thumbFail = 0, noImage = 0;

  for (const [i, item] of eligible.entries()) {
    const label = item.personaName ?? item.personaId.slice(-4);
    console.log(`[${String(i + 1).padStart(3)}/${eligible.length}]  ${label}`);

    if (DRY_RUN) {
      console.log(`         DRY RUN — would update thumbnail_url on post ${item.postId}`);
      continue;
    }

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
      console.error(`    ✗  patch failed: ${error}`);
      thumbFail++;
    }

    await sleep(SHOT_STAGGER_MS);
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`thumbnail_url: ${thumbOk} ✓  ${thumbFail} ✗  ${noImage} no-image`);
  console.log(`\n⚠  media_url (main post image) is NOT updatable via the current API.`);
  console.log(`   To replace it, add PATCH /api/posts/:id/media to the API server.\n`);
}

// ---------------------------------------------------------------------------
// One-shot seed (original behaviour)
// ---------------------------------------------------------------------------

async function runSeed(items: QueueItem[], stagger: number): Promise<void> {
  const usedIds = await loadLedger();
  let ok = 0, fail = 0, skip = 0;
  const failures: Array<{ index: number; label: string; error: string }> = [];

  for (const [i, item] of items.entries()) {
    const label = item.personaName
      ? `${item.personaName} (${item.type})`
      : `${item.personaId.slice(-4)} (${item.type})`;

    if (DRY_RUN) {
      const detail = item.caption ?? "(no text)";
      const chain  = item.imageQuery
        ? [item.imageQuery, ...(item.fallbackQueries ?? [])].join(" → ")
        : "(no image)";
      console.log(`[${String(i + 1).padStart(3)}/${items.length}]  ${label}`);
      console.log(`         ${detail.slice(0, 80)}${detail.length > 80 ? "…" : ""}`);
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
        if (photoId) {
          usedIds.add(photoId);
          await saveLedger(usedIds);
        }
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
    console.log(`Dry run complete — ${skip} items would be posted`);
  } else {
    console.log(`Done: ${ok} ✓  ${fail} ✗`);
    if (failures.length) {
      console.log("\nFailed items:");
      for (const f of failures) console.log(`  [${f.index}] ${f.label} — ${f.error}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const batchPath = join(SCRIPTS_DIR, "seed-content-batch.json");

  // Load batch JSON (used as initial queue in LOOP mode, or sole source otherwise)
  let batchItems: QueueItem[] = [];
  try {
    const raw  = await readFile(batchPath, "utf-8");
    const raw2 = JSON.parse(raw) as BatchItem[];
    batchItems = raw2.map(i => ({ ...i, posted: false }));
  } catch {
    if (!LOOP_MODE) {
      console.error(`ERROR: Cannot read ${batchPath}`);
      console.error("Run: pnpm --filter @workspace/scripts run generate-seed-content");
      process.exit(1);
    }
    // LOOP mode can start with empty batch and auto-regen
    console.warn(`⚠  No batch file found — LOOP mode will auto-generate on first cycle`);
  }

  const mode = UPDATE_IMAGES ? "UPDATE_IMAGES" : LOOP_MODE ? "LOOP" : DRIP_MODE ? "DRIP" : DRY_RUN ? "DRY_RUN" : "ONE-SHOT";

  console.log(`\n🌱  Gundruk drip seeder v2`);
  console.log(`    API:     ${API_BASE}`);
  console.log(`    Pexels:  ${PEXELS_KEY ? `✓ key set  (min ${MIN_WIDTH}px, top ${TOP_N}/query)` : "✗ NOT SET — posts will be text-only"}`);
  console.log(`    Mode:    ${mode}`);
  if (!LOOP_MODE && !UPDATE_IMAGES) console.log(`    Items:   ${batchItems.length}`);
  console.log();

  if (UPDATE_IMAGES) {
    await runUpdateImages(batchItems);
  } else if (LOOP_MODE) {
    await runLoop(batchItems);
  } else {
    await runSeed(batchItems, DRIP_MODE ? DRIP_STAGGER_MS : SHOT_STAGGER_MS);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
