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
  type: "post" | "poll" | "confession";
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
// 13 thematic image-content buckets — broader than app categories.
// Each persona is assigned 2–3 buckets that match their personality.
// Claude is told to rotate through ALL 13 across the batch so the feed
// shows real variety, not just food/lifestyle/music every time.
// ---------------------------------------------------------------------------

type ThemeCategory =
  | "Food" | "Nature" | "Travel" | "Lifestyle" | "Fashion"
  | "Fitness/Sports" | "Animals" | "Business/Tech" | "Music"
  | "Art & Design" | "Wellness" | "Celebrations" | "Transportation";

// Keyed by persona UUID so we can look up in buildUserPrompt without
// modifying the exported PERSONAS tuple.
const PERSONA_CATEGORIES: Record<string, ThemeCategory[]> = {
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01": ["Food", "Travel", "Lifestyle"],           // momoking_ktm
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02": ["Lifestyle", "Travel", "Wellness"],        // sydneydarling_np
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03": ["Nature", "Travel", "Art & Design"],       // pokharapeaks
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04": ["Business/Tech", "Celebrations", "Transportation"], // desi_chaos_np
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05": ["Lifestyle", "Food", "Wellness"],          // priya.rai.np
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06": ["Food", "Business/Tech", "Lifestyle"],     // rohanrai.life
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07": ["Fitness/Sports", "Celebrations", "Travel"], // aakash_eleven
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08": ["Wellness", "Lifestyle", "Nature"],        // nurse_anisha_ca
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09": ["Music", "Art & Design", "Lifestyle"],     // lopdohori_sagar
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10": ["Fashion", "Art & Design", "Lifestyle"],   // nisha.thrifts
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11": ["Business/Tech", "Transportation", "Music"], // kiran_in_london
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12": ["Fitness/Sports", "Food", "Wellness"],     // deepak_gainz
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13": ["Wellness", "Lifestyle", "Nature"],        // chiyaandthoughts
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14": ["Food", "Lifestyle", "Celebrations"],      // sunita.melb
  "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15": ["Food", "Lifestyle", "Animals"],           // nabin.melb
};

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
// Couple personas — alternate within each pair across batches
// Pair 0: priya.rai.np / rohanrai.life
// Pair 1: sunita.melb  / nabin.melb
// ---------------------------------------------------------------------------

const COUPLE_PAIRS = [
  [PERSONAS[4], PERSONAS[5]],  // priya.rai.np / rohanrai.life
  [PERSONAS[13], PERSONAS[14]], // sunita.melb  / nabin.melb
] as const;

// Monotonic batch counter — advances every generateBatch() call; controls which
// persona within each couple pair posts the confession this batch.
let _batchCount = 0;

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
// Prompt builders — photo posts + polls only (confessions generated separately)
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
• Reference queries by theme — pick the closest match to this post's content:

  Food            "pasta carbonara close up dark food photography"
                  "latte art top down specialty coffee" | "sushi platter dark background"
                  "homemade bread baking golden crust" | "fruit smoothie bowl overhead"

  Nature          "misty forest path golden hour" | "ocean wave sunset silhouette"
                  "mountain peak dramatic clouds" | "autumn leaves bokeh sunlight"

  Travel          "cobblestone street cafe morning light" | "desert sand dunes golden hour"
                  "road trip highway horizon sunset" | "city skyline night bokeh"

  Lifestyle       "cozy reading nook lamp rain window" | "brunch flat lay natural light"
                  "morning coffee aesthetic warm tones" | "minimalist bedroom soft light"

  Fashion         "street style editorial portrait dramatic light" | "vintage clothing flat lay"
                  "monochrome outfit minimal background" | "accessories close up texture"

  Fitness/Sports  "barbell deadlift gym dramatic lighting" | "runner silhouette sunrise beach"
                  "stadium floodlights crowd celebration" | "yoga pose outdoor sunrise"

  Animals         "golden retriever portrait natural light" | "cat window sunbeam bokeh"
                  "wildlife bird close up nature" | "dog park action blur"

  Business/Tech   "minimal desk setup dark aesthetic monitor" | "laptop neon glow dark room"
                  "coding screen dark mode close up" | "coffee notebook workspace morning"

  Music           "concert stage lights crowd silhouette" | "vinyl record turntable warm light"
                  "guitarist spotlight dark stage" | "headphones neon bokeh studio"

  Art & Design    "modern architecture geometric shadow" | "abstract paint splash close up"
                  "colorful mural urban wall texture" | "sculpture museum dramatic light"

  Wellness        "morning yoga stretch mat sunlight" | "spa stones candle calm water"
                  "meditation garden serene path" | "herbal tea hands steam close up"

  Celebrations    "string lights party bokeh warm" | "birthday cake candles dark background"
                  "champagne glasses golden sparkle" | "confetti celebration aerial"

  Transportation  "vintage car city night reflection" | "train window rain landscape blur"
                  "motorcycle mountain road winding aerial" | "bicycle street golden hour"

• imageQuery: most specific, most photogenic version of this exact post's subject
• fallbackQueries[0]: slightly broader angle, same theme
• fallbackQueries[1]: guaranteed-safe catch-all that always resolves on Pexels —
    pick from: "food photography dark background" / "landscape golden hour" /
    "city bokeh night" / "portrait natural light" / "cozy interior warm light" /
    "nature sunlight bokeh" / "abstract texture close up"
• Never repeat the same keyword across all three entries.

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

  // Include each persona's assigned theme categories in the sheet so Claude
  // knows which buckets to draw from per account, while the overall batch
  // instruction tells it to cover ALL 13 themes across the full array.
  const personaSheets = PERSONAS.map(p => {
    const themes = (PERSONA_CATEGORIES[p.id] ?? []).join(", ");
    return `  id: "${p.id}"  @${p.handle}  (${p.name})
   niche: ${p.niche} | themes: ${themes}
   vibe: ${p.vibe}
   imageStyle: ${p.imageStyle}`;
  }).join("\n\n");

  const allThemes = [
    "Food", "Nature", "Travel", "Lifestyle", "Fashion",
    "Fitness/Sports", "Animals", "Business/Tech", "Music",
    "Art & Design", "Wellness", "Celebrations", "Transportation",
  ].join(", ");

  return `Generate exactly ${totalItems} items (${photoCount} photo posts + ${pollCount} poll${pollCount === 1 ? "" : "s"}) distributed across all 15 personas.

THEME COVERAGE (critical):
The 13 image themes are: ${allThemes}
• Every persona posts from their listed themes only — don't force a fitness persona to post fashion.
• Across the FULL batch, every theme must appear at least once. Check coverage before finalising.
• Within a persona's themes, rotate — don't assign the same theme to the same persona twice.

DISTRIBUTION RULES:
• Each persona appears at least once.
• Interleave personas throughout the array (not persona-by-persona blocks).
• Vary both theme AND app category within each persona's assigned themes.

PERSONAS:
${personaSheets}

Caption must match the persona's vibe AND the image subject. imageQuery must match the imageStyle guidance and the chosen theme. No geography anywhere.

${pollCount > 0 ? `Assign the ${pollCount === 1 ? "poll" : `${pollCount} polls`} to different personas (prefer niche: memes or sports for one). Polls must be fun global debates with no location references.` : ""}

Return ONLY the JSON array.`;
}

// ---------------------------------------------------------------------------
// Confession generation — separate Claude call for focused quality
// ---------------------------------------------------------------------------

function buildConfessionSystemPrompt(): string {
  return `You are generating confession posts for Gundruk, a dark-themed global social app.

Output a JSON array where each item matches:
  {
    "type": "confession",
    "personaId": "<provided UUID>",
    "personaName": "<provided name>",
    "caption": "<the confession text>",
    "category": "love" or "lifestyle"
  }

VOICE: warm, funny, universally relatable married/couple-life observations.
Think: a witty tweet about your spouse that makes everyone who's been in a long-term
relationship nod immediately.

TOPIC POOL — pick different ones for each persona:
  • the wet towel always ends up on the bed
  • "I'll do it later" as a full life philosophy
  • in-laws calling at the exact worst moment
  • whose turn it is to cook / the negotiation
  • he/she said they "cleaned up" (found evidence to the contrary)
  • snoring denial — absolute conviction they don't snore
  • the fridge that only one person can navigate
  • Sunday plans vs actual Sunday
  • asking "what do you want for dinner" as a relationship stress test
  • 3am phone brightness, no remorse
  • the passive-aggressive thermostat wars
  • buying something and pretending it's been in the house forever

RULES:
• 1–2 sentences. Conversational tone. Lowercase energy is fine.
• 0–2 emojis max, only where they genuinely add.
• End with 1–2 hashtags: #love  #lifestyle  #couplelife  #marriedlife
• ZERO location references — no Nepal, Melbourne, Sydney, or any place name.
• No imageQuery field — these are text-only posts.
• Each confession must use a DIFFERENT topic from the pool above.
• Do NOT write the same joke twice with different wording.

OUTPUT: raw JSON array only. No markdown. No explanation.`;
}

function buildConfessionUserPrompt(
  personas: Array<{ id: string; handle: string; name: string }>,
): string {
  const sheets = personas.map(p =>
    `  id: "${p.id}"  @${p.handle}  (${p.name})`,
  ).join("\n");

  return `Generate exactly ${personas.length} confession posts, one per persona below.

PERSONAS:
${sheets}

Each persona gets one confession. Pick a different topic from the pool for each.
Return ONLY the JSON array.`;
}

async function generateConfessions(toggle: number): Promise<BatchItem[]> {
  // toggle 0 → first persona in each pair (priya, sunita)
  // toggle 1 → second persona in each pair (rohan, nabin)
  const selectedPersonas = COUPLE_PAIRS.map(pair => pair[toggle]);

  const system   = buildConfessionSystemPrompt();
  const userMsg  = buildConfessionUserPrompt(selectedPersonas.map(p => ({ id: p.id, handle: p.handle, name: p.name })));
  const rawReply = await callClaude(system, userMsg);
  const items    = parseJSONArray(rawReply);

  // Normalise: ensure type is "confession"
  return items.map(item => ({ ...item, type: "confession" as const }));
}

// ---------------------------------------------------------------------------
// Merge helper — spread confessions evenly through the main array
// ---------------------------------------------------------------------------

function mergeWithConfessions(main: BatchItem[], confessions: BatchItem[]): BatchItem[] {
  if (confessions.length === 0) return main;
  const result = [...main];
  const step   = Math.floor(result.length / (confessions.length + 1));
  // Insert from end to preserve earlier positions
  for (let i = confessions.length - 1; i >= 0; i--) {
    result.splice((i + 1) * step, 0, confessions[i]!);
  }
  return result;
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
    if (item.type === "confession" && !item.caption) {
      violations.push(`item[${i}] (@${item.personaName ?? item.personaId.slice(-4)}) is a confession but missing caption`);
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Core export — callable from seed-content.ts in LOOP mode
// ---------------------------------------------------------------------------

/**
 * Generate a batch of seed content items via Claude.
 *
 * Batch composition per `count` items:
 *   • 2 confessions (couple personas, alternating per batch)
 *   • floor(count / pollEvery) polls
 *   • remainder: photo posts
 *
 * @param count      Total items to generate (default 40)
 * @param pollEvery  Produce 1 poll per N items (default 20)
 */
export async function generateBatch(count: number = 40, pollEvery: number = 20): Promise<BatchItem[]> {
  const toggle         = _batchCount++ % 2;
  const confessionCount = 2;
  const pollCount      = Math.max(1, Math.floor(count / pollEvery));
  const photoAndPollCount = count - confessionCount;  // items Claude generates

  // Run both Claude calls in parallel
  const [photosAndPolls, confessions] = await Promise.all([
    (async () => {
      const system  = buildSystemPrompt(photoAndPollCount, pollCount);
      const userMsg = buildUserPrompt(photoAndPollCount, pollCount);
      const raw     = await callClaude(system, userMsg);
      return parseJSONArray(raw);
    })(),
    generateConfessions(toggle),
  ]);

  return mergeWithConfessions(photosAndPolls, confessions);
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
  const confessionCount = 2;
  const pollCount = Math.max(1, Math.floor(count / pollEvery));
  const photoCount = count - confessionCount - pollCount;

  console.log(`\n✨  Generating ${count} seed items:`);
  console.log(`    ${photoCount} photo posts + ${pollCount} polls + ${confessionCount} confessions`);
  console.log(`    via Claude ${MODEL}…\n`);
  console.log(`    (2 parallel Claude calls — may take 20–40 seconds)\n`);

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
    console.log(`✅  Validation clean\n`);
  }

  // Print 4 photo post samples from different categories
  const byCategory = new Map<string, BatchItem>();
  for (const item of items) {
    if (item.type === "post" && item.category && !byCategory.has(item.category)) {
      byCategory.set(item.category, item);
    }
  }
  const samples = [...byCategory.values()].slice(0, 4);

  console.log("─────────────────────────────────────────");
  console.log("4 sample photo posts (different categories):");
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

  // Print confessions
  const confessions = items.filter(i => i.type === "confession");
  if (confessions.length > 0) {
    console.log("─────────────────────────────────────────");
    console.log("Confessions:");
    console.log("─────────────────────────────────────────\n");
    for (const c of confessions) {
      const handle = PERSONAS.find(p => p.id === c.personaId)?.handle ?? c.personaId;
      console.log(`  @${handle}  [${c.category}]`);
      console.log(`  "${c.caption}"`);
      console.log();
    }
  }

  // Print polls
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
