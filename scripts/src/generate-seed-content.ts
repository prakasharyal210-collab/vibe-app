/**
 * scripts/src/generate-seed-content.ts
 *
 * Generates seed content batches via Claude.  Can be used as a CLI or imported
 * programmatically by the drip seeder (LOOP mode).
 *
 * CLI:
 *   pnpm --filter @workspace/scripts run generate-seed-content
 *
 * Programmatic (from seed-content.ts):
 *   import { generateBatch } from "./generate-seed-content.js";
 *   const items = await generateBatch(20, 20);  // 20 items, 1 poll per 20
 */

import { writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types (exported so seed-content.ts can import without duplicating)
// ---------------------------------------------------------------------------

export interface PollDef {
  question: string;
  options: string[];
  duration_hours: number;
}

export interface BatchItem {
  type: "post" | "poll";
  personaId: string;
  personaName?: string;
  caption?: string;
  category?: string;
  imageQuery?: string;
  fallbackQueries?: string[];
  poll?: PollDef;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODEL     = "claude-sonnet-4-5";
const MAX_TOKENS = 8192;

// ---------------------------------------------------------------------------
// App category list (must match artifacts/mobile/lib/categories.ts)
// ---------------------------------------------------------------------------

const CATEGORIES = [
  "music", "dance", "comedy", "travel", "food", "fitness", "gaming",
  "photography", "art", "fashion", "pets", "sports", "tech", "education",
  "nature", "love", "spiritual", "memes", "culture", "other",
] as const;

// ---------------------------------------------------------------------------
// Persona definitions — IDs MUST match seed-personas.sql
// Exported so seed-content.ts can build rhythm tables without duplication.
// ---------------------------------------------------------------------------

export const PERSONAS = [
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
    handle: "momoking_ktm",
    name: "Aarav Shrestha",
    niche: "food",
    vibe: "Street food obsessive. Reviews dishes like a critic but never takes himself too seriously. Warm humour, short punchy lines.",
    imageStyle: "close-up food photography, steam, dark moody background, restaurant plating",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
    handle: "sydneydarling_np",
    name: "Riya Gurung",
    niche: "lifestyle",
    vibe: "Uni student, golden hour girl. Posts study vibes, coastal walks, late-night library, Sunday brunch. Short captions.",
    imageStyle: "golden hour coastal, university campus, brunch aesthetic, soft natural light",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03",
    handle: "pokharapeaks",
    name: "Bikash Tamang",
    niche: "photography",
    vibe: "Landscape and travel photographer. Lets photos speak. Minimal, almost poetic captions.",
    imageStyle: "dramatic mountain landscape, fog, long exposure, epic golden hour wide shot",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04",
    handle: "desi_chaos_np",
    name: "Suraj Bhattarai",
    niche: "memes",
    vibe: "Gen Z meme lord. Dry, absurdist humour. Never explains the joke. Posts polls and hot takes.",
    imageStyle: "absurd relatable situations, minimal aesthetic, bold contrast",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05",
    handle: "priya.rai.np",
    name: "Priya Rai",
    niche: "lifestyle",
    vibe: "Home aesthetic, couple life, slow mornings. Warm, occasionally sarcastic.",
    imageStyle: "cozy home interior, warm tones, morning light, couple aesthetic",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06",
    handle: "rohanrai.life",
    name: "Rohan Rai",
    niche: "food",
    vibe: "Engineer who cooks. Minimal words, maximum flavour. Dry humour.",
    imageStyle: "home cooked meals, dark moody kitchen, close up plating",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07",
    handle: "aakash_eleven",
    name: "Aakash Limbu",
    niche: "sports",
    vibe: "Sports fanatic. Lives for match nights. Caps for big moments. Polls, hot takes, stadium energy.",
    imageStyle: "stadium floodlights, crowd celebration, athlete action, sports arena night",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08",
    handle: "nurse_anisha_ca",
    name: "Anisha Karki",
    niche: "lifestyle",
    vibe: "Healthcare professional, city dweller. Posts shift-end city walks, Sunday cooking, cozy night-in energy.",
    imageStyle: "city night winter, cozy apartment, snow street bokeh",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09",
    handle: "lopdohori_sagar",
    name: "Sagar Pandey",
    niche: "music",
    vibe: "Music discovery guy. Playlists, concert vibes, headphones-in-the-dark energy.",
    imageStyle: "concert stage lights, headphones neon, vinyl record, festival crowd",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10",
    handle: "nisha.thrifts",
    name: "Nisha Thapa",
    niche: "fashion",
    vibe: "Thrift queen, sustainable fashion. Outfit of the day, haul flat lays, bold editorial energy.",
    imageStyle: "vintage clothing flat lay, thrift haul aesthetic, editorial portrait, fabric texture close up",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    handle: "kiran_in_london",
    name: "Kiran Adhikari",
    niche: "tech",
    vibe: "Software dev. Coffee shop coder. City night walker. Dry wit.",
    imageStyle: "laptop coffee shop dark aesthetic, city rain night, coding setup minimal, neon street reflection",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
    handle: "deepak_gainz",
    name: "Deepak Magar",
    niche: "fitness",
    vibe: "Gym bro with personality. Posts gains, meal prep, motivational takes.",
    imageStyle: "gym workout barbell, physique progress, meal prep dark photography, protein bowl",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
    handle: "chiyaandthoughts",
    name: "Smriti Basnet",
    niche: "lifestyle",
    vibe: "Cozy thinker. Tea/coffee enthusiast. Short philosophical observations, window-light aesthetics.",
    imageStyle: "tea cup window morning light, cozy reading corner, soft bokeh interior, rain window",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14",
    handle: "sunita.melb",
    name: "Sunita Poudel",
    niche: "food",
    vibe: "Barista and cafe-hop addict. Specialty coffee obsessive. Warm aesthetic.",
    imageStyle: "latte art top down, specialty coffee cafe, brunch flat lay, morning cafe window",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
    handle: "nabin.melb",
    name: "Nabin Maharjan",
    niche: "food",
    vibe: "Home cook who actually tries. Posts Sunday cooking projects, recipe fails, occasional triumphs.",
    imageStyle: "home cooking close up, kitchen prep aesthetic, curry bowl steam, baking bread",
  },
] as const;

// ---------------------------------------------------------------------------
// Anthropic helpers
// ---------------------------------------------------------------------------

async function callClaude(system: string, userMessage: string): Promise<string> {
  const apiKey  = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
  const baseUrl = (process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com").replace(/\/$/, "");

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text}`);
  }
  const data = await res.json() as { content?: Array<{ text?: string }> };
  return data?.content?.[0]?.text ?? "";
}

function parseJSONArray(raw: string): BatchItem[] {
  const stripped = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  const parsed = JSON.parse(stripped);
  if (!Array.isArray(parsed)) throw new Error("Response is not a JSON array");
  return parsed as BatchItem[];
}

// ---------------------------------------------------------------------------
// Prompt builders (parameterised for programmatic use)
// ---------------------------------------------------------------------------

function buildSystemPrompt(totalItems: number, pollCount: number): string {
  const photoCount = totalItems - pollCount;
  const categoryList = CATEGORIES.join(", ");

  return `You are generating seed content for Gundruk, a dark-themed global social app.

Output a JSON array of exactly ${totalItems} items. Each item must match this TypeScript interface:

  interface BatchItem {
    type: "post" | "poll";
    personaId: string;        // copy UUID exactly
    personaName: string;      // human-readable, for logging
    caption?: string;         // required for "post"; optional for "poll"
    category: string;         // one of: ${categoryList}
    imageQuery?: string;      // required for every "post"
    fallbackQueries?: string[]; // required alongside imageQuery — EXACTLY 2 entries
    poll?: {
      question: string;
      options: string[];      // 3-4 options
      duration_hours: number; // 24, 48, or 72
    };
  }

═══════════════════════════════════════════════════════
BATCH COMPOSITION (strict)
═══════════════════════════════════════════════════════
• Total: exactly ${totalItems} items
• ${photoCount} photo posts (type: "post") — each MUST have imageQuery + fallbackQueries[2]
• ${pollCount} poll${pollCount === 1 ? "" : "s"} (type: "poll") — fun global debate${pollCount === 1 ? "" : "s"}, no photo needed
• NO confessions, NO text-only posts, NO posts missing imageQuery

═══════════════════════════════════════════════════════
CAPTION RULES
═══════════════════════════════════════════════════════
• ZERO references to Nepal, Nepali, Kathmandu, diaspora, dal bhat, momo, chiya,
  or any South Asian location, food, or language. Fully global English only.
• Short and vibey — 1–2 lines max. Global creator energy.
  Good: "golden hour never misses ✨"  |  "this pasta changed my mood entirely"
  Good: "leg day therapy 🏋️"           |  "finding magic in the in-between moments"
  Bad: anything more than 3 sentences or location-specific
• Match caption energy to the persona's niche.
• Emojis: 0–2 max, only where they genuinely fit.
• HASHTAGS: every caption ends with 1–3 category-appropriate hashtags, natural not bolted-on.
  food → #food #foodie       travel → #travel #wanderlust    fitness → #fitness #gymlife
  music → #music             fashion → #fashion #style        photography → #photography
  tech → #tech               sports → #sports                 nature → #nature #landscape
  art → #art                 lifestyle → #lifestyle            education → #education
  memes/comedy → #viral      pets → #pets                     gaming → #gaming

═══════════════════════════════════════════════════════
IMAGE QUERY RULES — CRITICAL
═══════════════════════════════════════════════════════
• Query the universal beautiful version of the subject — NOT geography.
• BANNED words in ALL queries: nepal, nepali, kathmandu, pokhara, annapurna,
  himalaya, himalayan, sydney, toronto, london, dubai, melbourne, australian,
  canadian, british, indian, asian, south asian, and any country/city/region name.
• Think like a Getty/Unsplash art director: dramatic light, beautiful composition, 4K.
• Proven high-result subjects on Pexels:
    food:        "pasta carbonara close up dark food photography"
                 "latte art top down coffee" | "fresh sushi platter dark background"
    travel:      "northern lights reflection lake" | "desert sand dunes golden hour"
    fitness:     "barbell deadlift gym dramatic lighting" | "runner silhouette sunset beach"
    music:       "concert stage lights crowd" | "vinyl record turntable warm light"
    fashion:     "editorial portrait model dramatic light" | "vintage clothing flat lay"
    photography: "long exposure waterfall forest" | "milky way stars dark sky"
    tech:        "laptop coffee shop dark moody" | "neon city rain reflection"
    sports:      "stadium floodlights crowd celebration" | "surfer wave barrel"
    nature:      "autumn forest path fog" | "ocean wave sunset silhouette"
    lifestyle:   "cozy reading corner lamp books" | "brunch flat lay natural light"
• imageQuery: the most specific beautiful version of this post's subject
• fallbackQueries[0]: slightly broader, same subject, different angle
• fallbackQueries[1]: guaranteed-universal that always resolves on Pexels:
    "food photography dark background" / "landscape golden hour" /
    "city bokeh night" / "portrait natural light" / "cozy interior window light"
• Never repeat the same word across all three entries.

═══════════════════════════════════════════════════════
POLL RULES
═══════════════════════════════════════════════════════
• Fun, global, genuinely debatable. No imageQuery needed.
• Good: "pineapple on pizza: crime or masterpiece?" | "beach vs mountain vacation"
• 3–4 options per poll, spicy and specific.

═══════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════
Return ONLY the raw JSON array. No markdown fences. No explanation.`;
}

function buildUserPrompt(totalItems: number, pollCount: number): string {
  const photoCount = totalItems - pollCount;
  const personaSheets = PERSONAS.map(p =>
    `  id: "${p.id}"  @${p.handle}  (${p.name})
   niche: ${p.niche} | vibe: ${p.vibe}
   imageStyle: ${p.imageStyle}`,
  ).join("\n\n");

  return `Generate exactly ${totalItems} items (${photoCount} photo posts + ${pollCount} poll${pollCount === 1 ? "" : "s"}) distributed across all 15 personas.

Each persona should appear at least once. Vary categories — don't give the same category to the same persona twice. Interleave personas so items from different accounts are mixed throughout the array (not persona-by-persona).

PERSONAS:
${personaSheets}

Caption must match the persona's vibe AND the image subject. imageQuery must match the imageStyle guidance. No geography anywhere.

${pollCount > 0 ? `Assign the ${pollCount === 1 ? "poll" : `${pollCount} polls`} to different personas (prefer niche: memes or sports for one). Both ${pollCount === 1 ? "poll" : "polls"} must be fun global debates with no location references.` : ""}

Return ONLY the JSON array.`;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const BANNED_QUERY_TERMS = [
  "nepal", "nepali", "kathmandu", "pokhara", "annapurna", "himalaya", "himalayan",
  "sydney", "toronto", "london", "dubai", "melbourne", "australian", "canadian", "british",
];

function validateItems(items: BatchItem[]): string[] {
  const violations: string[] = [];
  for (const [i, item] of items.entries()) {
    const queries = [item.imageQuery, ...(item.fallbackQueries ?? [])].filter(Boolean) as string[];
    for (const q of queries) {
      for (const b of BANNED_QUERY_TERMS) {
        if (q.toLowerCase().includes(b)) {
          violations.push(`item[${i}] query "${q}" contains banned term "${b}"`);
        }
      }
    }
    if (item.type === "post" && !item.imageQuery) {
      violations.push(`item[${i}] (@${item.personaName ?? item.personaId.slice(-4)}) is a post but missing imageQuery`);
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Core export — callable from seed-content.ts in LOOP mode
// ---------------------------------------------------------------------------

/**
 * Generate a batch of seed content items via Claude.
 * @param count      Total items to generate (default 40)
 * @param pollEvery  Produce 1 poll per N items (default 20, so ~5% polls)
 */
export async function generateBatch(count: number = 40, pollEvery: number = 20): Promise<BatchItem[]> {
  const pollCount  = Math.max(1, Math.floor(count / pollEvery));
  const system     = buildSystemPrompt(count, pollCount);
  const userMsg    = buildUserPrompt(count, pollCount);
  const rawReply   = await callClaude(system, userMsg);
  return parseJSONArray(rawReply);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const hasKey = !!(process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"]);
  if (!hasKey) {
    console.error("ERROR: neither AI_INTEGRATIONS_ANTHROPIC_API_KEY nor ANTHROPIC_API_KEY is set");
    process.exit(1);
  }

  const count     = 40;
  const pollEvery = 20;
  const pollCount = Math.max(1, Math.floor(count / pollEvery));

  console.log(`\n✨  Generating ${count} seed items (${count - pollCount} photo posts + ${pollCount} polls) via Claude ${MODEL}…`);
  console.log(`    This may take 20–40 seconds.\n`);

  let items: BatchItem[];
  try {
    items = await generateBatch(count, pollEvery);
  } catch (e: any) {
    console.error("Failed:", e?.message);
    process.exit(1);
  }

  const outPath = join(__dirname, "../seed-content-batch.json");
  await writeFile(outPath, JSON.stringify(items, null, 2), "utf-8");
  console.log(`✅  Wrote ${items.length} items to ${outPath}`);

  const violations = validateItems(items);
  if (violations.length > 0) {
    console.warn(`\n⚠️  ${violations.length} validation issue(s):`);
    for (const v of violations) console.warn(`   • ${v}`);
  } else {
    console.log(`✅  Validation clean — zero banned terms, all posts have imageQuery\n`);
  }

  // Print 4 samples from different categories
  const byCategory = new Map<string, BatchItem>();
  for (const item of items) {
    if (item.type === "post" && item.category && !byCategory.has(item.category)) {
      byCategory.set(item.category, item);
    }
  }
  const samples = [...byCategory.values()].slice(0, 4);

  console.log("─────────────────────────────────────────");
  console.log("4 sample posts (different categories):");
  console.log("─────────────────────────────────────────\n");
  for (const [i, s] of samples.entries()) {
    const handle = PERSONAS.find(p => p.id === s.personaId)?.handle ?? s.personaId;
    console.log(`[${i + 1}] @${handle}  category: ${s.category}`);
    if (s.caption)         console.log(`    caption:  ${s.caption}`);
    if (s.imageQuery)      console.log(`    image[0]: ${s.imageQuery}`);
    if (s.fallbackQueries) console.log(`    image[1]: ${s.fallbackQueries[0]}`);
    if (s.fallbackQueries) console.log(`    image[2]: ${s.fallbackQueries[1]}`);
    console.log();
  }

  const polls = items.filter(i => i.type === "poll");
  if (polls.length > 0) {
    console.log("─────────────────────────────────────────");
    console.log("Polls:");
    console.log("─────────────────────────────────────────\n");
    for (const p of polls) {
      const handle = PERSONAS.find(p2 => p2.id === p.personaId)?.handle ?? p.personaId;
      console.log(`  @${handle}: "${p.poll?.question}"`);
      console.log(`    options: [${p.poll?.options.join(" | ")}]`);
      console.log();
    }
  }

  console.log(`Next step: review ${outPath}, then run:`);
  console.log(`  API_URL=http://localhost:80 pnpm --filter @workspace/scripts run seed-content\n`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
