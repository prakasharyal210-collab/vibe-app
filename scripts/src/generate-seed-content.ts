/**
 * scripts/src/generate-seed-content.ts
 *
 * Uses ANTHROPIC_API_KEY to ask Claude to write 7 days of seed content for
 * 15 Nepali-diaspora persona accounts.  Outputs scripts/seed-content-batch.json
 * which seed-content.ts will then post through the API server.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=<key> pnpm --filter @workspace/scripts run generate-seed-content
 *
 * Tune ITEMS_PER_DAY and DAYS to adjust volume.
 */

import { writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DAYS          = 7;
const ITEMS_PER_DAY = 7;   // ~49 total — 6-8 per day per brief
const MODEL         = "claude-sonnet-4-5";
const MAX_TOKENS    = 8192;

// ---------------------------------------------------------------------------
// Persona definitions — single source of truth for both this generator and
// the batch JSON.  These IDs MUST match the UUIDs in seed-personas.sql.
// ---------------------------------------------------------------------------

const PERSONAS = [
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
    name: "Aarav Shrestha",
    handle: "momoking_ktm",
    type: "solo",
    voice: "Kathmandu foodie — street-food-obsessed, warm humour, Nepali-English code-switch. Reviews momos like a wine critic but never takes himself seriously. Uses phrases like 'bro', 'yaar', 'jhol ko vibe', 'peak Kathmandu energy'. Posts food photos with loc: Thamel/Asan/Patan. Category: Food.",
    postCategories: ["Food"],
    imageQueries: ["nepali momo dumplings street food", "kathmandu street food vendor", "nepali jhol momo soup", "thamel restaurant nepal"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
    name: "Riya Gurung",
    handle: "sydneydarling_np",
    type: "solo",
    voice: "Sydney uni student (UNSW), homesick diaspora vibes. Posts mix of uni stress, missing home, Sydney life, being the only Nepali in class. Code-switch Nepali-English, uses 'yaar', 'ghar', 'ama'. Tender + funny. Sometimes posts in Devanagari. Category: Lifestyle, Diaspora.",
    postCategories: ["Lifestyle"],
    imageQueries: ["sydney university student study", "sydney harbour nepali", "homesick student food"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03",
    name: "Bikash Tamang",
    handle: "pokharapeaks",
    type: "solo",
    voice: "Landscape + street photographer from Pokhara. Minimalist captions, lets photos speak. Occasionally waxes poetic about light/mountains. Drops facts about trek routes. Quiet pride in Nepal's beauty. Category: Photography, Travel.",
    postCategories: ["Travel", "Photography"],
    imageQueries: ["annapurna mountain nepal", "pokhara lake nepal", "nepal trekking mountain", "phewa lake reflection"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04",
    name: "Suraj Bhattarai",
    handle: "desi_chaos_np",
    type: "solo",
    voice: "Internet meme lord, dry humour, Nepali Gen Z shitposter. Posts polls like 'momo vs chowmein', makes fun of relatable Nepali life (load shedding nostalgia, wai wai, board exam trauma). Short punchy sentences. Never explains the joke. Category: Humor.",
    postCategories: ["Humor"],
    imageQueries: ["funny meme relatable", "nepali humor"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05",
    name: "Priya Rai",
    handle: "priya.rai.np",
    coupleId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01",
    type: "couple",
    voice: "Newly-married wife (2 months), Lalitpur. Posts couple content, confession content. Honest about adjustment phase of marriage, funny observations about cohabitation. Warmth under the sarcasm — clearly adores her husband. Uses 'wifey life', 'newlywed problems'. Category: Lifestyle, Confession.",
    postCategories: ["Lifestyle"],
    imageQueries: ["couple home cooking", "newly married couple", "lalitpur nepal street"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06",
    name: "Rohan Rai",
    handle: "rohanrai.life",
    coupleId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01",
    type: "couple",
    voice: "Newly-married husband, engineer, kebab enthusiast. Lalitpur. Dry wit, low-key romantic, posts things like 'she said she hates when I cook but ate all of it'. Minimal words, maximum impact. Couple content + solo posts. Category: Lifestyle, Food.",
    postCategories: ["Lifestyle", "Food"],
    imageQueries: ["cooking couple kitchen", "nepali husband wife", "lalitpur nepal"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07",
    name: "Aakash Limbu",
    handle: "aakash_eleven",
    type: "solo",
    voice: "Cricket + football fanatic, Biratnagar. Posts match reactions, 3am watching sessions, hot takes ('Nepal cricket > everything'), polls on match predictions, disappointment and joy in equal measure. Energetic, lots of caps for big moments. Category: Sports.",
    postCategories: ["Sports"],
    imageQueries: ["cricket match nepal", "football stadium night", "sports fan watching"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08",
    name: "Anisha Karki",
    handle: "nurse_anisha_ca",
    type: "solo",
    voice: "RN at Toronto General, Nepali diaspora nurse. Posts about 12-hour shift exhaustion, cooking biryani on Sundays, calling ama every night, missing home during winter. Compassionate, occasionally vents about healthcare system, pride in work. Code-switch Nepali-English. Category: Lifestyle, Diaspora.",
    postCategories: ["Lifestyle"],
    imageQueries: ["toronto winter nurse", "nepali diaspora food canada", "hospital nurse tired", "biryani cooking"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09",
    name: "Sagar Pandey",
    handle: "lopdohori_sagar",
    type: "solo",
    voice: "Music guy, Kathmandu. Posts about Nepali artists (lok dohori to rap), playlists, music opinions, discovery of underrated artists. Uses music metaphors for life. Runs a Gundruk playlist no one asked for. Posts polls about Nepali artists. Category: Music.",
    postCategories: ["Music"],
    imageQueries: ["nepali music concert", "folk music singing", "headphones music city night"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10",
    name: "Nisha Thapa",
    handle: "nisha.thrifts",
    type: "solo",
    voice: "Thrift + sustainable fashion girl, Kathmandu. Posts thrift hauls from Asan market, outfit-of-day, sustainable fashion rants, Nepali textile appreciation. Confident, aesthetic eye, educates while being fun. Code-switch Nepali-English. Category: Fashion, Lifestyle.",
    postCategories: ["Fashion"],
    imageQueries: ["thrift store fashion clothes", "kathmandu market fabric", "sustainable fashion outfit", "nepali textile fabric"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    name: "Kiran Adhikari",
    handle: "kiran_in_london",
    type: "solo",
    voice: "Software dev, London. Nepali diaspora tech bro who misses dal bhat. Self-aware about London prices (£4 coffee). Posts about coding, London life, remote work, occasional homesickness. Dry British humour absorbed after years there, but still culturally Nepali. Category: Tech, Lifestyle.",
    postCategories: ["Lifestyle", "Tech"],
    imageQueries: ["london city night developer", "coding laptop coffee shop", "london nepali food", "tech worker london"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
    name: "Deepak Magar",
    handle: "deepak_gainz",
    type: "solo",
    voice: "Gym bro, Dubai. Posts gains, workout updates, desi gym humour ('bro dal bhat is literally protein'), Dubai life, Nepali food in UAE, motivational takes that end up being about food. Energetic, consistent, loyal to his routine. Category: Fitness, Lifestyle.",
    postCategories: ["Fitness"],
    imageQueries: ["gym workout fitness", "dubai skyline nepali", "protein food meal prep", "weight lifting gym"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
    name: "Smriti Basnet",
    handle: "chiyaandthoughts",
    type: "solo",
    voice: "Chiya addict, philosophy-flavoured poster, Chitwan. Posts thoughtful observations about Nepali culture, society, and being a young woman. Short essays formatted as posts. Occasionally absurd. Chiya is her solution to everything. Category: Lifestyle, Philosophy.",
    postCategories: ["Lifestyle"],
    imageQueries: ["nepal tea cup morning", "chitwan nepal woman", "philosophy book thinking", "chai tea morning"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14",
    name: "Sunita Poudel",
    handle: "sunita.melb",
    coupleId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02",
    type: "couple",
    voice: "Barista + cafe hop addict, Melbourne. Posts Melbourne cafe scenes, specialty coffee culture, Nepali food attempts, couple content with @nabin.melb. Warm aesthetic, loves a good flat white, posts Sunday-morning energy. Category: Food, Lifestyle, Confession.",
    postCategories: ["Food", "Lifestyle"],
    imageQueries: ["melbourne cafe coffee flat white", "coffee barista latte art", "melbourne street cafe"],
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
    name: "Nabin Maharjan",
    handle: "nabin.melb",
    coupleId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02",
    type: "couple",
    voice: "Software dev, Melbourne. @sunita.melb's person. Posts about Sunday dal bhat cooking projects, trying to impress her family on video call, Melbourne life, Nepal nostalgia. Quietly funny, good-natured. Category: Food, Lifestyle, Confession.",
    postCategories: ["Food", "Lifestyle"],
    imageQueries: ["cooking dal bhat nepal rice", "melbourne apartment cooking", "video call family nepal"],
  },
];

// ---------------------------------------------------------------------------
// Couple definitions (for confession generation context)
// ---------------------------------------------------------------------------

const COUPLES = [
  {
    id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01",
    partnerA: { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05", name: "Priya Rai" },
    partnerB: { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06", name: "Rohan Rai" },
    context: "Newly married 2 months ago, living together in Lalitpur, adjusting to married life, funny cohabitation moments.",
  },
  {
    id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02",
    partnerA: { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14", name: "Sunita Poudel" },
    partnerB: { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15", name: "Nabin Maharjan" },
    context: "Melbourne couple, together 1 year, both working professionals, video call dinners with family in Nepal, Sunday cooking rituals.",
  },
];

// ---------------------------------------------------------------------------
// Anthropic helpers (same raw-fetch pattern used in api-server/src/routes/ai/chat.ts)
// ---------------------------------------------------------------------------

async function callClaude(
  apiKey: string,
  system: string,
  userMessage: string,
): Promise<string> {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: userMessage }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
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
  // Strip markdown code fences if Claude wrapped the output
  const stripped = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  return JSON.parse(stripped) as T;
}

// ---------------------------------------------------------------------------
// Build prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are a creative content writer generating authentic social media posts for Gundruk,
a dark-themed social app for the Nepali diaspora community.

You will produce a JSON array of batch items.  Each item must strictly conform to this TypeScript interface:

  interface BatchItem {
    type: "post" | "poll" | "confession";
    personaId: string;           // fixed UUID — copy exactly from persona definitions
    personaName: string;         // human-readable name for logging
    caption?: string;            // for "post" and "poll" items
    content?: string;            // for "confession" items (what appears on the confession feed)
    imageQuery?: string;         // PRIMARY Pexels search query when a photo would enhance the post
    fallbackQueries?: string[];  // EXACTLY 2 fallback queries, specific → generic (only when imageQuery is set)
    category?: string;           // e.g. "Food", "Travel", "Humor", "Sports", "Music", "Fashion", "Fitness", "Lifestyle", "Tech"
    coupleId?: string;           // required for confessions — copy exactly from couple definitions
    age?: number;                // optional for confessions — the poster's age
    location?: string;           // optional for confessions — city/location string
    poll?: {
      question: string;
      options: string[];         // 2-4 options
      duration_hours: number;    // 24, 48, or 72
    };
  }

Rules:
1. Voice authenticity is paramount. Each post must sound exactly like that persona — not like a generic social media template.
2. Nepali-English code-switching where natural (not forced). Mix in Nepali words like: yaar, bro, ghar, ama, chiya, momo, dal bhat, bhai, didi, ke garne, thik cha, dhanyabad, etc.
3. Emojis: use sparingly and only where they feel authentic to that persona's style.
4. Post lengths: 
   - Short punchy posts (meme lord, gym bro): 1-3 sentences
   - Medium posts (foodie, student, nurse): 2-5 sentences + optional hashtags
   - Thoughtful posts (philosopher, photographer): 1 paragraph, max 4 sentences
5. Polls must have 2-4 options that feel like genuine Nepali community debates.
6. Confessions must be raw and relatable couple moments — not sappy, not generic. Think: the chai incident, the dal bhat negotiation, the 3am fight about the wet towel.
7. imageQuery + fallbackQueries rules:
   - Set imageQuery only for posts where a real photo genuinely enhances the content.
   - Leave imageQuery absent for text-only posts, polls, and most confessions.
   - CRITICAL — NO location-specific terms: imageQuery and fallbackQueries must NEVER contain
     "nepal", "nepali", "kathmandu", "pokhara", "annapurna", "himalaya", "himalayan",
     "sydney", "toronto", "london", "dubai", "melbourne", "biratnagar", "chitwan", or any
     other city/country/region name. The caption carries the cultural context; the image
     only needs to match the subject's VIBE at a universal level.
   - Query the subject, mood, and aesthetic — NOT the geography:
       Momo post          → "dumplings steam bowl food photography"   NOT "nepali momo"
       Annapurna sunrise  → "mountain peak sunrise golden light"      NOT "annapurna sunrise"
       Asan thrift haul   → "vintage clothing flat lay aesthetic"      NOT "kathmandu market"
       Dal bhat attempt   → "home cooked curry rice bowl"             NOT "nepali dal bhat"
       Nurse after shift  → "city winter night snow street"           NOT "toronto nurse winter"
       Chiya philosophy   → "tea cup window morning light cozy"       NOT "nepali chiya"
       Cricket win        → "stadium floodlights crowd celebration"   NOT "nepal cricket"
   - When imageQuery is set, ALWAYS include fallbackQueries with EXACTLY 2 entries:
       fallbackQueries[0] — slightly broader subject/mood (still no location terms)
       fallbackQueries[1] — guaranteed-universal beauty shot that always has Pexels results
                            e.g. "food photography dark background", "landscape golden hour",
                                 "city bokeh night", "portrait natural light", "cozy interior window"
   - Do NOT repeat the same word across all three queries in a chain.
8. Stagger variety: not every item from a persona should be the same type. Mix posts, occasional polls, confessions for couple personas.
9. Return ONLY the JSON array — no markdown, no explanation, no surrounding text.`;
}

function buildUserPrompt(): string {
  const personaSheets = PERSONAS.map(p =>
    `  - id: "${p.id}"  handle: @${p.handle}  name: "${p.name}"
    voice: ${p.voice}
    imageQueryExamples: ${p.imageQueries.join(", ")}`
  ).join("\n\n");

  const coupleSheets = COUPLES.map(c =>
    `  - coupleId: "${c.id}"
    partnerA: "${c.partnerA.name}" (id: ${c.partnerA.id})
    partnerB: "${c.partnerB.name}" (id: ${c.partnerB.id})
    context: ${c.context}`
  ).join("\n\n");

  return `Generate ${DAYS * ITEMS_PER_DAY} social media posts (${DAYS} days × ~${ITEMS_PER_DAY} items/day) spread across all 15 personas.

PERSONAS:
${personaSheets}

COUPLES (for confession posts):
${coupleSheets}

Distribution guidelines:
- Couple personas (p05/p06 and p14/p15) should post a mix of:
    - Solo feed posts (their personal content)
    - 2-3 confession posts each (type: "confession", using their coupleId)
- Include at least 3 poll items total — spread across meme lord (p04), sports guy (p07), and music guy (p09).
- Include at least 1 confession poll (type: "confession" with poll field) for one of the couples.
- The foodie (p01), photographer (p03), nurse (p08), thrift girl (p10) should each have at least 1 imageQuery post.
- Each persona should appear at least 3 times across the 7 days.
- Arrange the array roughly chronologically (Day 1 items first, Day 7 last) — not all one persona then another.

Voice quality bar: a Nepali person reading these should think "yo, that's actually what we say" — not "this was written by an AI."`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  console.log(`\n✨  Generating ${DAYS * ITEMS_PER_DAY} seed content items via Claude ${MODEL}…`);
  console.log(`    This may take 20-40 seconds.\n`);

  const system   = buildSystemPrompt();
  const userMsg  = buildUserPrompt();
  const rawReply = await callClaude(apiKey, system, userMsg);

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

  console.log(`✅  Wrote ${items.length} items to ${outPath}\n`);

  // Print 3 sample items for voice quality review
  console.log("─────────────────────────────────────────");
  console.log("Sample items (first 3) — check voice quality:");
  console.log("─────────────────────────────────────────\n");

  const samples = (items as any[]).slice(0, 3);
  for (const [i, s] of samples.entries()) {
    console.log(`[${i + 1}] @${PERSONAS.find(p => p.id === s.personaId)?.handle ?? s.personaId}`);
    console.log(`    type:    ${s.type}`);
    if (s.caption)   console.log(`    caption: ${s.caption}`);
    if (s.content)   console.log(`    content: ${s.content}`);
    if (s.imageQuery) console.log(`    image:   ${s.imageQuery}`);
    if (s.poll)      console.log(`    poll:    "${s.poll.question}" — [${s.poll.options.join(", ")}]`);
    console.log();
  }

  console.log(`\nNext step: review ${outPath}, then run:`);
  console.log(`  API_URL=http://localhost:80 pnpm --filter @workspace/scripts run seed-content\n`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
