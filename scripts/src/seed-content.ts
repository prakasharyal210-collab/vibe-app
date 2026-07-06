/**
 * scripts/src/seed-content.ts
 *
 * Reads scripts/seed-content-batch.json and posts each item through the
 * running API server.  Never writes to Supabase directly — all writes go
 * through the existing moderation + counter pipeline.
 *
 * Usage:
 *   API_URL=http://localhost:80 \
 *   PEXELS_API_KEY=<key>        \
 *   pnpm --filter @workspace/scripts run seed-content
 *
 *   Or from the scripts/ directory:
 *   tsx ./src/seed-content.ts
 *
 * The API server must be running before you execute this script.
 * Dry-run mode (prints plan, no HTTP calls):
 *   DRY_RUN=true tsx ./src/seed-content.ts
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PollDef {
  question: string;
  options: string[];
  duration_hours: number;
}

interface BatchItem {
  type: "post" | "poll" | "confession";
  personaId: string;
  /** Human-readable label for log output */
  personaName?: string;
  /** Used for feed posts and polls */
  caption?: string;
  /** Used for confession posts (couple_feed_posts) */
  content?: string;
  /** Pexels search query — fetches a real photo as the post image */
  imageQuery?: string;
  /** Post category (e.g. "Food", "Travel", "Humor") */
  category?: string;
  /** Required for confessions — the accepted couple_links.id */
  coupleId?: string;
  /** Confession metadata */
  age?: number;
  location?: string;
  /** Present on poll items (also usable on confession items) */
  poll?: PollDef;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE   = (process.env["API_URL"] ?? "http://localhost:80").replace(/\/$/, "");
const PEXELS_KEY = process.env["PEXELS_API_KEY"] ?? "";
const DRY_RUN    = process.env["DRY_RUN"] === "true";
/** Milliseconds to wait between API calls — be polite to content moderation services */
const STAGGER_MS = 500;

// ---------------------------------------------------------------------------
// Pexels image helper
// ---------------------------------------------------------------------------

interface FetchedImage {
  base64: string;
  mimeType: string;
  ext: string;
  credit: string;
}

async function fetchPexelsImage(query: string): Promise<FetchedImage | null> {
  if (!PEXELS_KEY) {
    console.warn(`  ⚠  PEXELS_API_KEY not set — skipping image for query: "${query}"`);
    return null;
  }
  try {
    const searchRes = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=portrait&size=medium`,
      { headers: { Authorization: PEXELS_KEY } }
    );
    if (!searchRes.ok) {
      console.warn(`  ⚠  Pexels search failed (${searchRes.status}) for "${query}"`);
      return null;
    }
    const searchData = await searchRes.json() as { photos?: Array<{ id: number; src: { medium: string }; photographer: string }> };
    // Pick a random one from the first 5 results to add variety
    const photos = (searchData.photos ?? []).slice(0, 5);
    if (!photos.length) {
      console.warn(`  ⚠  Pexels returned 0 results for "${query}"`);
      return null;
    }
    const photo = photos[Math.floor(Math.random() * photos.length)]!;
    const imgRes = await fetch(photo.src.medium);
    if (!imgRes.ok) {
      console.warn(`  ⚠  Pexels image download failed (${imgRes.status})`);
      return null;
    }
    const buf = await imgRes.arrayBuffer();
    return {
      base64: Buffer.from(buf).toString("base64"),
      mimeType: "image/jpeg",
      ext: "jpg",
      credit: `Photo by ${photo.photographer} on Pexels`,
    };
  } catch (e: any) {
    console.warn(`  ⚠  fetchPexelsImage threw: ${e?.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function postToFeed(item: BatchItem): Promise<{ data: any; error: string | null }> {
  let image: FetchedImage | null = null;
  if (item.imageQuery) {
    image = await fetchPexelsImage(item.imageQuery);
    if (image) {
      console.log(`    📷  ${image.credit}`);
    }
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

  const res = await fetch(`${API_BASE}/api/posts/create`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const json = await res.json() as any;
  return {
    data:  res.ok ? json : null,
    error: res.ok ? null : (json?.error ?? `HTTP ${res.status}`),
  };
}

async function postConfession(item: BatchItem): Promise<{ data: any; error: string | null }> {
  if (!item.coupleId) {
    return { data: null, error: "confession item is missing coupleId" };
  }
  const body: Record<string, unknown> = {
    coupleId: item.coupleId,
    authorId: item.personaId,
    content:  item.content ?? item.caption ?? "",
    category: item.category ?? "Confession",
    ...(item.age      != null ? { age:      item.age }      : {}),
    ...(item.location        ? { location: item.location }  : {}),
    ...(item.poll            ? { poll:     item.poll }       : {}),
  };

  const res = await fetch(`${API_BASE}/api/couple-feed/posts`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const json = await res.json() as any;
  return {
    data:  res.ok ? json : null,
    error: res.ok ? null : (json?.error ?? `HTTP ${res.status}`),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const batchPath = join(__dirname, "../seed-content-batch.json");
  let raw: string;
  try {
    raw = await readFile(batchPath, "utf-8");
  } catch {
    console.error(`ERROR: Cannot read ${batchPath}`);
    console.error("Run generate-seed-content first:  pnpm --filter @workspace/scripts run generate-seed-content");
    process.exit(1);
  }

  const items = JSON.parse(raw) as BatchItem[];
  console.log(`\n🌱  Gundruk seed content — ${items.length} items`);
  console.log(`    API:     ${API_BASE}`);
  console.log(`    Pexels:  ${PEXELS_KEY ? "✓ key set" : "✗ NOT SET — posts will be text-only"}`);
  console.log(`    Mode:    ${DRY_RUN ? "DRY RUN (no HTTP calls)" : "LIVE"}\n`);

  let ok = 0, fail = 0, skip = 0;
  const failures: Array<{ index: number; item: BatchItem; error: string }> = [];

  for (const [i, item] of items.entries()) {
    const label = item.personaName
      ? `${item.personaName} (${item.type})`
      : `${item.personaId.slice(-4)} (${item.type})`;

    if (DRY_RUN) {
      const detail = item.caption ?? item.content ?? "(no text)";
      console.log(`[${String(i + 1).padStart(3)}/${items.length}]  ${label}`);
      console.log(`         ${detail.slice(0, 80)}${detail.length > 80 ? "…" : ""}`);
      skip++;
      continue;
    }

    try {
      let result: { data: any; error: string | null };
      if (item.type === "confession") {
        result = await postConfession(item);
      } else {
        result = await postToFeed(item);
      }

      const { data, error } = result;
      if (error) {
        console.error(`[${String(i + 1).padStart(3)}/${items.length}]  ✗  ${label}: ${error}`);
        failures.push({ index: i + 1, item, error });
        fail++;
      } else {
        const id = data?.id ?? data?.post?.id ?? "?";
        console.log(`[${String(i + 1).padStart(3)}/${items.length}]  ✓  ${label}  →  ${id}`);
        ok++;
      }

      await sleep(STAGGER_MS);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error(`[${String(i + 1).padStart(3)}/${items.length}]  💥 ${label}: ${msg}`);
      failures.push({ index: i + 1, item, error: msg });
      fail++;
      await sleep(STAGGER_MS);
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  if (DRY_RUN) {
    console.log(`Dry run complete — ${skip} items would be posted`);
  } else {
    console.log(`Done: ${ok} ✓  ${fail} ✗`);
    if (failures.length) {
      console.log("\nFailed items:");
      for (const f of failures) {
        console.log(`  [${f.index}] ${f.item.type} — ${f.error}`);
      }
    }
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
