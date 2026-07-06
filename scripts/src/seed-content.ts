/**
 * scripts/src/seed-content.ts
 *
 * Reads scripts/seed-content-batch.json and posts each item through the
 * running API server.  Never writes to Supabase directly — all writes go
 * through the existing moderation + counter pipeline.
 *
 * Modes
 * ─────
 *   Normal (seed new posts):
 *     API_URL=http://localhost:80 PEXELS_API_KEY=<key> \
 *       pnpm --filter @workspace/scripts run seed-content
 *
 *   Dry-run (print plan, no HTTP calls):
 *     DRY_RUN=true pnpm --filter @workspace/scripts run seed-content
 *
 *   Update images on already-posted items (see UPDATE_IMAGES below):
 *     UPDATE_IMAGES=true API_URL=http://localhost:80 PEXELS_API_KEY=<key> \
 *       pnpm --filter @workspace/scripts run seed-content
 *
 * UPDATE_IMAGES mode
 * ──────────────────
 * Re-fetches a better image (large2x, width ≥ 1500 px) for every batch item
 * that has BOTH imageQuery AND postId set, then applies it to the existing
 * post via the best available API path:
 *
 *   • thumbnail_url  — updated via PATCH /api/posts/:id (field is whitelisted).
 *     This fixes the grid thumbnail immediately with the higher-quality Pexels
 *     URL (no re-upload required).
 *
 *   • media_url (the post's main image) — NOT updateable via the current API.
 *     PATCH /api/posts/:id only accepts: caption, is_archived, allow_comments,
 *     hide_like_count, hide_share_count, thumbnail_url, is_pinned.
 *     To replace media_url you need a new endpoint — spec printed at the end
 *     of an UPDATE_IMAGES run.
 *
 * To use UPDATE_IMAGES, add "postId": "<uuid>" to each batch item from the
 * seed run log (each OK line prints  →  <uuid>).
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
  /** Primary Pexels search query */
  imageQuery?: string;
  /**
   * Ordered fallback queries tried when imageQuery returns < MIN_RESULTS
   * qualifying photos (width ≥ MIN_WIDTH).  Go from specific → generic.
   * e.g. ["dumplings steam bowl", "asian street food"]
   */
  fallbackQueries?: string[];
  /** Post category (e.g. "Food", "Travel", "Humor") */
  category?: string;
  /** Required for confessions — the accepted couple_links.id */
  coupleId?: string;
  /** Confession metadata */
  age?: number;
  location?: string;
  /** Present on poll items (also usable on confession items) */
  poll?: PollDef;
  /**
   * Post UUID from a previous seed run — required for UPDATE_IMAGES mode.
   * Copy from the run log line:  ✓  Persona Name (post)  →  <uuid>
   */
  postId?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE      = (process.env["API_URL"] ?? "http://localhost:80").replace(/\/$/, "");
const PEXELS_KEY    = process.env["PEXELS_API_KEY"] ?? "";
const DRY_RUN       = process.env["DRY_RUN"] === "true";
const UPDATE_IMAGES = process.env["UPDATE_IMAGES"] === "true";

/** Minimum qualifying photo width in pixels */
const MIN_WIDTH = 1500;
/** If fewer than this many qualify, advance to the next query in the chain */
const MIN_RESULTS = 3;
/** Pick randomly from the top N qualifying results for variety */
const TOP_N = 5;
/** Milliseconds to wait between API calls */
const STAGGER_MS = 500;

// ---------------------------------------------------------------------------
// Pexels types + helpers
// ---------------------------------------------------------------------------

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
  /** Human-readable credit line for log output */
  credit: string;
  /** Direct CDN URL — usable for thumbnail_url without re-upload */
  directUrl: string;
}

async function searchPexels(query: string): Promise<PexelsPhoto[]> {
  const url =
    `https://api.pexels.com/v1/search` +
    `?query=${encodeURIComponent(query)}` +
    `&per_page=15&orientation=portrait&size=large`;
  try {
    const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
    if (!res.ok) {
      console.warn(`    ⚠  Pexels search HTTP ${res.status} for "${query}"`);
      return [];
    }
    const data = await res.json() as { photos?: PexelsPhoto[] };
    return data.photos ?? [];
  } catch (e: any) {
    console.warn(`    ⚠  Pexels search threw for "${query}": ${e?.message}`);
    return [];
  }
}

/**
 * Walks the query chain [imageQuery, ...fallbackQueries] until it finds a
 * query that returns ≥ MIN_RESULTS photos with width ≥ MIN_WIDTH, then
 * picks randomly from the top TOP_N qualifying results and downloads it.
 */
async function fetchPexelsImage(
  imageQuery: string,
  fallbackQueries: string[] = [],
): Promise<FetchedImage | null> {
  if (!PEXELS_KEY) {
    console.warn(`  ⚠  PEXELS_API_KEY not set — skipping image`);
    return null;
  }

  const chain = [imageQuery, ...fallbackQueries];

  for (let qi = 0; qi < chain.length; qi++) {
    const query = chain[qi]!;
    const all = await searchPexels(query);
    const qualified = all.filter(p => p.width >= MIN_WIDTH);

    const isLast = qi === chain.length - 1;
    if (qualified.length < MIN_RESULTS && !isLast) {
      console.log(
        `    🔍  [${qi + 1}/${chain.length}] "${query}" → ` +
        `${qualified.length} qualifying (< ${MIN_RESULTS}) — trying fallback…`,
      );
      continue;
    }

    if (!qualified.length) {
      console.log(`    🔍  [${qi + 1}/${chain.length}] "${query}" → 0 qualifying results`);
      continue;
    }

    // Pick randomly from top TOP_N qualifying results
    const pool = qualified.slice(0, TOP_N);
    const photo = pool[Math.floor(Math.random() * pool.length)]!;
    const imgUrl = photo.src.large2x || photo.src.large || photo.src.original;

    console.log(
      `    🔍  [${qi + 1}/${chain.length}] "${query}" → ` +
      `${qualified.length} qualifying, picked #${photo.id} ${photo.width}×${photo.height}px`,
    );

    try {
      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) {
        console.warn(`    ⚠  Download failed (${imgRes.status}) — trying next query`);
        continue;
      }
      const buf = await imgRes.arrayBuffer();
      return {
        base64:   Buffer.from(buf).toString("base64"),
        mimeType: "image/jpeg",
        ext:      "jpg",
        credit:   `Photo by ${photo.photographer} on Pexels (${photo.width}px wide)`,
        directUrl: imgUrl,
      };
    } catch (e: any) {
      console.warn(`    ⚠  Download threw: ${e?.message} — trying next query`);
    }
  }

  console.warn(`    ⚠  All ${chain.length} queries exhausted — no qualifying image found`);
  return null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function postToFeed(item: BatchItem): Promise<{ data: any; error: string | null }> {
  let image: FetchedImage | null = null;
  if (item.imageQuery) {
    image = await fetchPexelsImage(item.imageQuery, item.fallbackQueries);
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

/**
 * UPDATE_IMAGES: patch thumbnail_url on an existing post using a direct
 * Pexels CDN URL (no re-upload needed).  media_url is NOT patchable via
 * the current API — see the spec printed at end of run.
 */
async function updatePostThumbnail(
  postId: string,
  userId: string,
  directUrl: string,
): Promise<{ ok: boolean; error: string | null }> {
  const res = await fetch(`${API_BASE}/api/posts/${postId}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ userId, thumbnail_url: directUrl }),
  });
  const json = await res.json() as any;
  return {
    ok:    res.ok,
    error: res.ok ? null : (json?.error ?? `HTTP ${res.status}`),
  };
}

// ---------------------------------------------------------------------------
// UPDATE_IMAGES run
// ---------------------------------------------------------------------------

async function runUpdateImages(items: BatchItem[]): Promise<void> {
  console.log(`\n🖼   UPDATE_IMAGES mode — re-fetching higher-quality photos`);
  console.log(`    Only items with both imageQuery and postId will be processed.\n`);

  const eligible = items.filter(
    i => i.imageQuery && i.postId && i.type !== "confession",
  );
  const skipped = items.length - eligible.length;

  console.log(`    ${eligible.length} eligible  |  ${skipped} skipped (no imageQuery/postId or confession)\n`);

  if (!eligible.length) {
    console.log(
      `    Nothing to do. Add "postId": "<uuid>" to batch items from the seed run log,\n` +
      `    then re-run with UPDATE_IMAGES=true.\n`,
    );
    return;
  }

  let thumbOk = 0, thumbFail = 0, noImage = 0;

  for (const [i, item] of eligible.entries()) {
    const label = item.personaName ?? item.personaId.slice(-4);
    console.log(`[${String(i + 1).padStart(3)}/${eligible.length}]  ${label}`);

    if (DRY_RUN) {
      console.log(`         DRY RUN — would update thumbnail_url on post ${item.postId}`);
      console.log(`         query chain: ${[item.imageQuery, ...(item.fallbackQueries ?? [])].join(" → ")}`);
      continue;
    }

    const image = await fetchPexelsImage(item.imageQuery!, item.fallbackQueries);
    if (!image) {
      console.warn(`    ⚠  No qualifying image — skipping post ${item.postId}`);
      noImage++;
      await sleep(STAGGER_MS);
      continue;
    }

    console.log(`    📷  ${image.credit}`);

    // Patch thumbnail_url (direct Pexels URL, no upload)
    const { ok, error } = await updatePostThumbnail(item.postId!, item.personaId, image.directUrl);
    if (ok) {
      console.log(`    ✓  thumbnail_url updated  →  ${item.postId}`);
      thumbOk++;
    } else {
      console.error(`    ✗  thumbnail_url patch failed: ${error}`);
      thumbFail++;
    }

    await sleep(STAGGER_MS);
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`thumbnail_url: ${thumbOk} ✓  ${thumbFail} ✗  ${noImage} no-image`);
  console.log(`\n⚠  media_url (main post image) was NOT updated.`);
  console.log(`   PATCH /api/posts/:id only whitelists: caption, is_archived,`);
  console.log(`   allow_comments, hide_like_count, hide_share_count, thumbnail_url, is_pinned.`);
  console.log(`\n   To replace media_url, add this endpoint to the API server:`);
  console.log(`\n   ── spec: PATCH /api/posts/:id/media ──────────────────────────`);
  console.log(`   Route file: artifacts/api-server/src/routes/posts/update.ts`);
  console.log(`   Body:       { userId: string, imageBase64: string, mimeType: string, ext: string }`);
  console.log(`   Steps:`);
  console.log(`     1. Ownership check: posts.user_id === userId (already done in /:id)`);
  console.log(`     2. Upload buffer to Supabase Storage bucket "posts" (same as create.ts)`);
  console.log(`     3. UPDATE posts SET media_url = <storage_url> WHERE id = :id`);
  console.log(`     4. Respond { ok: true, media_url }`);
  console.log(`   ───────────────────────────────────────────────────────────────\n`);
}

// ---------------------------------------------------------------------------
// Normal seed run
// ---------------------------------------------------------------------------

async function runSeed(items: BatchItem[]): Promise<void> {
  let ok = 0, fail = 0, skip = 0;
  const failures: Array<{ index: number; item: BatchItem; error: string }> = [];

  for (const [i, item] of items.entries()) {
    const label = item.personaName
      ? `${item.personaName} (${item.type})`
      : `${item.personaId.slice(-4)} (${item.type})`;

    if (DRY_RUN) {
      const detail = item.caption ?? item.content ?? "(no text)";
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
      console.log(
        `\nHint: to update images on already-posted items, add "postId" to batch items\n` +
        `      and re-run with UPDATE_IMAGES=true.`,
      );
    }
  }
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

  const mode = UPDATE_IMAGES ? "UPDATE_IMAGES" : DRY_RUN ? "DRY RUN" : "LIVE SEED";
  console.log(`\n🌱  Gundruk seed content — ${items.length} items`);
  console.log(`    API:     ${API_BASE}`);
  console.log(`    Pexels:  ${PEXELS_KEY ? `✓ key set  (min ${MIN_WIDTH}px, top ${TOP_N} per query)` : "✗ NOT SET — posts will be text-only"}`);
  console.log(`    Mode:    ${mode}\n`);

  if (UPDATE_IMAGES) {
    await runUpdateImages(items);
  } else {
    await runSeed(items);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
