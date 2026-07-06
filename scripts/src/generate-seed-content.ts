/**
 * scripts/src/generate-seed-content.ts
 *
 * Uses ANTHROPIC_API_KEY to ask Claude to generate a single seeding batch of
 * ~40 global-lifestyle photo posts + 2 polls spread across 15 personas.
 * Outputs scripts/seed-content-batch.json which seed-content.ts then posts
 * through the API server.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=<key> pnpm --filter @workspace/scripts run generate-seed-content
 */

import { writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TARGET_ITEMS = 40;   // 38 photo posts + 2 polls
const MODEL        = "claude-sonnet-4-5";
const MAX_TOKENS   = 8192;

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
// ---------------------------------------------------------------------------

const PERSONAS = [
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
    handle: "momoking_ktm",
    name: "Aarav Shrestha",
    niche: "food",
    vibe: "Street food obsessive. Reviews dishes like a critic but never takes himself too seriously. Warm humour, short punchy lines. Primary categories: food.",
    imageStyle: "close-up food photography, steam, dark moody background, restaurant plating",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
    handle: "sydneydarling_np",
    name: "Riya Gurung",
    niche: "lifestyle",
    vibe: "Uni student, golden hour girl. Posts study vibes, coastal walks, late-night library, Sunday brunch. Short captions, occasional existential tangent. Primary categories: lifestyle, nature.",
    imageStyle: "golden hour coastal, university campus, brunch aesthetic, soft natural light",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03",
    handle: "pokharapeaks",
    name: "Bikash Tamang",
    niche: "photography",
    vibe: "Landscape and travel photographer. Lets photos speak. Minimal, almost poetic captions. 'Light is everything.' Primary categories: photography, travel, nature.",
    imageStyle: "dramatic mountain landscape, fog, long exposure, epic golden hour wide shot",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04",
    handle: "desi_chaos_np",
    name: "Suraj Bhattarai",
    niche: "memes",
    vibe: "Gen Z meme lord. Dry, absurdist humour. Never explains the joke. Posts polls, hot takes, one-liners. Primary categories: memes, comedy.",
    imageStyle: "absurd relatable situations, minimal aesthetic, bold contrast",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05",
    handle: "priya.rai.np",
    name: "Priya Rai",
    niche: "lifestyle",
    vibe: "Home aesthetic, couple life, slow mornings. Posts cozy interiors, cooking attempts, little life observations. Warm, occasionally sarcastic. Primary categories: lifestyle, food.",
    imageStyle: "cozy home interior, warm tones, morning light, couple aesthetic, cooking",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06",
    handle: "rohanrai.life",
    name: "Rohan Rai",
    niche: "food",
    vibe: "Engineer who cooks. Minimal words, maximum flavour. Dry humour. Posts food experiments and city life. Primary categories: food, lifestyle.",
    imageStyle: "home cooked meals, dark moody kitchen, close up plating, city night window",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07",
    handle: "aakash_eleven",
    name: "Aakash Limbu",
    niche: "sports",
    vibe: "Sports fanatic. Lives for match nights. Caps for big moments. Polls, hot takes, stadium energy. Primary categories: sports.",
    imageStyle: "stadium floodlights, crowd celebration, athlete action, sports arena night",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08",
    handle: "nurse_anisha_ca",
    name: "Anisha Karki",
    niche: "lifestyle",
    vibe: "Healthcare professional, city dweller. Posts shift-end city walks, Sunday cooking, cozy night-in energy. Compassionate voice. Primary categories: lifestyle, fitness.",
    imageStyle: "city night winter, cozy apartment, hospital corridor, snow street bokeh",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09",
    handle: "lopdohori_sagar",
    name: "Sagar Pandey",
    niche: "music",
    vibe: "Music discovery guy. Playlists, concert vibes, music opinions, headphones-in-the-dark energy. Uses music metaphors for everything. Primary categories: music.",
    imageStyle: "concert stage lights, headphones neon, vinyl record, festival crowd, music studio",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10",
    handle: "nisha.thrifts",
    name: "Nisha Thapa",
    niche: "fashion",
    vibe: "Thrift queen, sustainable fashion advocate. Outfit of the day, haul flat lays, bold editorial energy. Educates while being fun. Primary categories: fashion, art.",
    imageStyle: "vintage clothing flat lay, thrift haul aesthetic, editorial portrait, fabric texture close up",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    handle: "kiran_in_london",
    name: "Kiran Adhikari",
    niche: "tech",
    vibe: "Software dev. Coffee shop coder. City night walker. Dry wit, self-aware about tech-bro life. Primary categories: tech, lifestyle.",
    imageStyle: "laptop coffee shop dark aesthetic, city rain night, coding setup minimal, neon street reflection",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
    handle: "deepak_gainz",
    name: "Deepak Magar",
    niche: "fitness",
    vibe: "Gym bro with personality. Posts gains, meal prep, motivational takes that always end up being about food. Energetic, consistent. Primary categories: fitness, food.",
    imageStyle: "gym workout barbell, physique progress, meal prep dark photography, protein bowl",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
    handle: "chiyaandthoughts",
    name: "Smriti Basnet",
    niche: "lifestyle",
    vibe: "Cozy thinker. Tea/coffee enthusiast. Short philosophical observations, window-light aesthetics, slow-life energy. Primary categories: lifestyle, spiritual.",
    imageStyle: "tea cup window morning light, cozy reading corner, soft bokeh interior, rain window",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14",
    handle: "sunita.melb",
    name: "Sunita Poudel",
    niche: "food",
    vibe: "Barista and cafe-hop addict. Specialty coffee obsessive. Posts latte art, brunch plates, Sunday morning energy. Warm aesthetic. Primary categories: food, lifestyle.",
    imageStyle: "latte art top down, specialty coffee cafe, brunch flat lay, morning cafe window",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
    handle: "nabin.melb",
    name: "Nabin Maharjan",
    niche: "food",
    vibe: "Home cook who actually tries. Posts Sunday cooking projects, recipe fails, occasional triumphs. Quietly funny. Primary categories: food, lifestyle.",
    imageStyle: "home cooking close up, kitchen prep aesthetic, curry bowl steam, baking bread",
  },
];

// ---------------------------------------------------------------------------
// Anthropic helpers
// ---------------------------------------------------------------------------

async function callClaude(
  system: string,
  userMessage: string,
): Promise<string> {
  // Use Replit AI Integration proxy when available, fall back to direct Anthropic
  const apiKey  = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
  const baseUrl = (process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com").replace(/\/$/, "");

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: userMessage }],
  };

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key":          apiKey,
      "anthropic-version":  "2023-06-01",
      "content-type":       "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text}`);
  }
  const data = await res.json() as any;
  return data?.content?.[0]?.text ?? "";
}

function parseJSON<T>(raw: string): T {
  const stripped = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  return JSON.parse(stripped) as T;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  const categoryList = CATEGORIES.join(", ");

  return `You are generating seed content for Gundruk, a dark-themed global social app.

Output a JSON array. Each item must match this TypeScript interface exactly:

  interface BatchItem {
    type: "post" | "poll";
    personaId: string;        // copy UUID exactly — no changes
    personaName: string;      // human-readable, for logging
    caption?: string;         // required for "post"; optional for "poll"
    category: string;         // one of: ${categoryList}
    imageQuery?: string;      // required for every "post" — primary Pexels search
    fallbackQueries?: string[]; // required alongside imageQuery — EXACTLY 2 entries
    poll?: {
      question: string;
      options: string[];      // 2-4 options
      duration_hours: number; // 24, 48, or 72
    };
  }

═══════════════════════════════════════════════════════
BATCH COMPOSITION (strict)
═══════════════════════════════════════════════════════
• Total: exactly ${TARGET_ITEMS} items
• 38 photo posts (type: "post") — each MUST have imageQuery + fallbackQueries[2]
• 2 polls (type: "poll") — fun global debates, no photo needed
• NO confessions, NO text-only posts, NO items missing imageQuery

═══════════════════════════════════════════════════════
CAPTION RULES
═══════════════════════════════════════════════════════
• ZERO references to Nepal, Nepali, Kathmandu, diaspora, dal bhat, momo, chiya,
  or any South Asian location, food, or language. Fully global English only.
• Short and vibey — 1–2 lines max. Global creator energy.
  Good: "golden hour never misses ✨"
  Good: "this pasta changed my mood entirely"
  Good: "leg day therapy 🏋️"
  Good: "finding magic in the in-between moments"
  Bad: anything more than 3 sentences
  Bad: anything location-specific or culturally coded
• Match caption energy to the persona's niche (foodie → food words, gym → effort words).
• Emojis: 0–2 max, only where they genuinely fit. Not every post needs one.

═══════════════════════════════════════════════════════
IMAGE QUERY RULES — CRITICAL
═══════════════════════════════════════════════════════
• Query the universal beautiful version of the subject — NOT any geography.
• BANNED words in ALL three queries: nepal, nepali, kathmandu, pokhara, annapurna,
  himalaya, himalayan, sydney, toronto, london, dubai, melbourne, australian,
  canadian, british, indian, asian, south asian, and any other country/city/region name.
• Think like a Getty/Unsplash art director: dramatic light, beautiful composition, 4K.
• Proven high-result subjects on Pexels:
    food:        "pasta carbonara close up dark food photography"
                 "latte art top down coffee"
                 "fresh sushi platter dark background"
    travel:      "northern lights reflection lake"
                 "desert sand dunes golden hour"
                 "misty mountain peak sunrise"
    fitness:     "barbell deadlift gym dramatic lighting"
                 "runner silhouette sunset beach"
                 "yoga pose cliff ocean"
    music:       "concert stage lights crowd"
                 "vinyl record turntable warm light"
                 "musician playing guitar dark"
    fashion:     "editorial portrait model dramatic light"
                 "vintage clothing flat lay aesthetic"
                 "street style fashion bold"
    photography: "long exposure waterfall forest"
                 "milky way stars dark sky"
                 "foggy forest morning light"
    tech:        "laptop coffee shop dark moody"
                 "coding setup minimal desk"
                 "neon city rain reflection"
    sports:      "stadium floodlights crowd celebration"
                 "surfer wave barrel"
                 "athlete sprint track dramatic"
    nature:      "autumn forest path fog"
                 "ocean wave sunset silhouette"
                 "wildflower field golden hour"
    lifestyle:   "cozy reading corner lamp books"
                 "brunch flat lay natural light"
                 "city rooftop sunset skyline"
• When imageQuery is set, ALWAYS add fallbackQueries with EXACTLY 2 entries:
    [0] — slightly broader, same subject, different angle
    [1] — guaranteed-universal that always resolves on Pexels:
          "food photography dark background" / "landscape golden hour" /
          "city bokeh night" / "portrait natural light" / "cozy interior window light"
• Never repeat the same word across all three entries in a chain.

═══════════════════════════════════════════════════════
POLL RULES
═══════════════════════════════════════════════════════
• 2 polls total — fun, global, genuinely debatable.
• No imageQuery needed on polls.
• Good poll topics: "pineapple on pizza: crime or masterpiece?",
  "beach vs mountain vacation", "texting back immediately: cute or desperate?",
  "overrated: coffee OR tea?", "morning person vs night owl supremacy"
• 3–4 options per poll, spicy and specific.

═══════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════
Return ONLY the raw JSON array. No markdown fences. No explanation. No surrounding text.`;
}

function buildUserPrompt(): string {
  const personaSheets = PERSONAS.map(p =>
    `  id: "${p.id}"  @${p.handle}  (${p.name})
   niche: ${p.niche}
   vibe: ${p.vibe}
   imageStyle: ${p.imageStyle}`,
  ).join("\n\n");

  return `Generate exactly ${TARGET_ITEMS} items (38 photo posts + 2 polls) distributed across all 15 personas below.

Each persona should appear 2–3 times. Vary the categories — don't give the same category to the same persona twice. Arrange the array so items from different personas are interleaved (not persona by persona).

PERSONAS:
${personaSheets}

For photo posts: caption must match the persona's vibe and the image subject. imageQuery must match the imageStyle guidance for that persona. No geography in any query.

For the 2 polls: assign one to a persona with niche "memes" or "sports", the other to any persona. Both polls must be fun global debates with no location references.

Return ONLY the JSON array.`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error("ERROR: neither AI_INTEGRATIONS_ANTHROPIC_API_KEY nor ANTHROPIC_API_KEY is set");
    process.exit(1);
  }

  console.log(`\n✨  Generating ${TARGET_ITEMS} seed items (38 photo posts + 2 polls) via Claude ${MODEL}…`);
  console.log(`    This may take 20–40 seconds.\n`);

  const system   = buildSystemPrompt();
  const userMsg  = buildUserPrompt();
  const rawReply = await callClaude(system, userMsg);

  let items: unknown[];
  try {
    items = parseJSON<unknown[]>(rawReply);
  } catch (e: any) {
    console.error("Failed to parse Claude's JSON response:", e?.message);
    console.error("Raw reply (first 500 chars):", rawReply.slice(0, 500));
    process.exit(1);
  }

  if (!Array.isArray(items) || items.length === 0) {
    console.error("Claude returned an empty or non-array response");
    process.exit(1);
  }

  const outPath = join(__dirname, "../seed-content-batch.json");
  await writeFile(outPath, JSON.stringify(items, null, 2), "utf-8");

  console.log(`✅  Wrote ${items.length} items to ${outPath}`);

  // Quick validation sweep
  const violations: string[] = [];
  const banned = ["nepal", "nepali", "kathmandu", "pokhara", "annapurna", "himalaya", "himalayan",
    "sydney", "toronto", "london", "dubai", "melbourne", "australian", "canadian", "british"];
  for (const [i, item] of (items as any[]).entries()) {
    const queries = [item.imageQuery, ...(item.fallbackQueries ?? [])].filter(Boolean) as string[];
    for (const q of queries) {
      for (const b of banned) {
        if (q.toLowerCase().includes(b)) {
          violations.push(`item[${i}] query "${q}" contains banned term "${b}"`);
        }
      }
    }
    if (item.type === "post" && !item.imageQuery) {
      violations.push(`item[${i}] is a post but has no imageQuery`);
    }
  }

  if (violations.length > 0) {
    console.warn(`\n⚠️  ${violations.length} validation issue(s) found:`);
    for (const v of violations) console.warn(`   • ${v}`);
  } else {
    console.log(`✅  Validation clean — zero banned terms, all posts have imageQuery\n`);
  }

  // Print 4 sample items from different categories
  const allItems = items as any[];
  const byCategory = new Map<string, any>();
  for (const item of allItems) {
    if (item.type === "post" && item.category && !byCategory.has(item.category)) {
      byCategory.set(item.category, item);
    }
  }
  const samples = [...byCategory.values()].slice(0, 4);

  console.log("─────────────────────────────────────────");
  console.log("4 sample items (different categories):");
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

  // Also show both polls
  const polls = allItems.filter(i => i.type === "poll");
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
