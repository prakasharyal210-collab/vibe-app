import { Router } from "express";

const router = Router();

const cache = new Map<string, { result: string; expiresAt: number }>();
const CACHE_TTL = 60 * 60 * 1000;

async function callClaude(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  system?: string,
  maxTokens = 512,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-5",
    max_tokens: maxTokens,
    messages,
  };
  if (system) body.system = system;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t}`);
  }
  const data = await res.json() as any;
  return data?.content?.[0]?.text ?? "";
}

const JYOTISHA_KNOWLEDGE = `VEDIC JYOTISHA KNOWLEDGE BASE:

RASHIS (12 Signs) — Ruler — Element:
Mesha/Aries(Mars/Fire), Vrishabha/Taurus(Venus/Earth), Mithuna/Gemini(Mercury/Air), Karka/Cancer(Moon/Water), Simha/Leo(Sun/Fire), Kanya/Virgo(Mercury/Earth), Tula/Libra(Venus/Air), Vrishchika/Scorpio(Mars+Ketu/Water), Dhanu/Sagittarius(Jupiter/Fire), Makara/Capricorn(Saturn/Earth), Kumbha/Aquarius(Saturn+Rahu/Air), Meena/Pisces(Jupiter+Ketu/Water).

NAVAGRAHA — Domain — Exaltation — Debilitation:
Surya(Sun): soul/father/authority/health/government — exalted Mesha — debilitated Tula
Chandra(Moon): mind/mother/emotions/public — exalted Vrishabha — debilitated Vrishchika
Mangal(Mars): energy/courage/brothers/surgery/land — exalted Makara — debilitated Karka
Budha(Mercury): intellect/trade/communication/nerves — exalted Kanya — debilitated Meena
Guru/Brihaspati(Jupiter): dharma/children/wealth/wisdom — exalted Karka — debilitated Makara
Shukra(Venus): love/beauty/marriage/arts/luxury — exalted Meena — debilitated Kanya
Shani(Saturn): karma/discipline/delays/longevity/service — exalted Tula — debilitated Mesha
Rahu(North Node): desire/illusion/foreigners/technology/amplifier — shadow planet
Ketu(South Node): past karma/liberation/mysticism/detachment — always opposite Rahu

12 BHAVAS (Houses): 1=Self/Body, 2=Wealth/Speech/Family, 3=Siblings/Communication/Courage, 4=Home/Mother/Happiness, 5=Children/Creativity/Intelligence/Past karma, 6=Enemies/Health/Debts, 7=Marriage/Partnerships/Business, 8=Death/Transformation/Secrets/Inheritance, 9=Dharma/Father/Fortune/Higher learning, 10=Career/Karma/Status/Government, 11=Gains/Aspirations/Friends/Elder siblings, 12=Liberation/Loss/Foreign lands/Spirituality.
Kendras(1,4,7,10)=strongest houses. Trikonas(1,5,9)=fortune and dharma. Dusthanas(6,8,12)=difficult but transformative.

27 NAKSHATRAS — Ruling Planet — Key theme:
Ashwini(Ketu/healing), Bharani(Venus/death-rebirth), Krittika(Sun/sharpness), Rohini(Moon/fertility), Mrigashira(Mars/seeking), Ardra(Rahu/storms), Punarvasu(Jupiter/renewal), Pushya(Saturn/nourishment), Ashlesha(Mercury/serpent wisdom), Magha(Ketu/ancestors), Purva Phalguni(Venus/pleasure), Uttara Phalguni(Sun/service), Hasta(Moon/crafts), Chitra(Mars/beauty), Swati(Rahu/independence), Vishakha(Jupiter/determination), Anuradha(Saturn/devotion), Jyeshtha(Mercury/authority), Mula(Ketu/roots/destruction), Purva Ashadha(Venus/invincibility), Uttara Ashadha(Sun/victory), Shravana(Moon/listening), Dhanishtha(Mars/wealth), Shatabhisha(Rahu/healing waters), Purva Bhadrapada(Jupiter/passion), Uttara Bhadrapada(Saturn/depth), Revati(Mercury/completion).

VIMSHOTTARI DASHA (120-year cycle — starting planet = ruling planet of birth Moon's Nakshatra):
Ketu(7yr)→Venus(20yr)→Sun(6yr)→Moon(10yr)→Mars(7yr)→Rahu(18yr)→Jupiter(16yr)→Saturn(19yr)→Mercury(17yr)→repeat.
During a Dasha, that planet's themes, strengths, and weaknesses dominate life events.

SADE SATI: Saturn transiting 12th, 1st, 2nd from Moon sign = 7.5 years of karmic testing and growth.
3 phases: Rising/Udaya(12th from Moon — pressure begins), Peak/Madhya(Moon sign — maximum intensity), Setting/Asta(2nd from Moon — results manifest).

PANCHANG (5 daily elements): Tithi(lunar day 1-30/30), Vara(weekday+ruling deity), Nakshatra(Moon's current star), Yoga(planetary combination 1-27), Karana(half-tithi).
Auspicious: Brahma Muhurta(1.5hr before sunrise), Abhijit Muhurta(midday 48 min), Choghadiya.
Inauspicious: Rahu Kaal(1.5hr varies by day), Gulika Kaal, Yamaganda.

KEY YOGAS: Raj Yoga(kendra+trikona lords unite=power), Dhana Yoga(2nd+11th lords=wealth), Gaja Kesari(Jupiter in kendra from Moon=fame), Budhaditya(Sun+Mercury=intelligence), Viparita Raja Yoga(dusthana lord in dusthana=rise from adversity), Neecha Bhanga(cancelled debilitation=unexpected rise), Kaal Sarpa Dosha(all planets hemmed Rahu-Ketu=obstacles), Mangal Dosha(Mars in 1/4/7/8/12=marriage challenges).

THREE TYPES OF KARMA: Sanchita(total accumulated from all past lives — the storehouse), Prarabdha(portion ripening THIS life — shown in birth chart — must be experienced), Kriyamana/Agami(karma created NOW by current actions — fully within our control).

FOUR YOGA PATHS: Bhakti Yoga(devotion — strong Moon/Venus/12th house), Karma Yoga(selfless action — strong Sun/Mars/10th house), Jnana Yoga(knowledge/discrimination — strong Mercury/Jupiter/5th-9th), Raja Yoga(meditation/pranayama — strong Saturn/Ketu/12th house).

ISHTA DEVATA (Personal Deity via Atmakaraka — planet at highest degree in natal chart):
Sun→Shiva/Rama, Moon→Parvati/Krishna, Mars→Kartikeya/Narasimha, Mercury→Vishnu/Saraswati, Jupiter→Brahma/Dattatreya, Venus→Lakshmi/Radha, Saturn→Shiva/Hanuman, Rahu→Durga/Saraswati, Ketu→Ganesha/Shiva.

BEEJ MANTRAS: Surya(Om Hraam Hreem Hraum Sah Suryaya Namah), Chandra(Om Shraam Shreem Shraum Sah Chandraya Namah), Mangal(Om Kraam Kreem Kraum Sah Bhaumaya Namah), Budha(Om Braam Breem Braum Sah Budhaya Namah), Guru(Om Graam Greem Graum Sah Gurave Namah), Shukra(Om Draam Dreem Draum Sah Shukraya Namah), Shani(Om Praam Preem Praum Sah Shanaischaraya Namah), Rahu(Om Bhraam Bhreem Bhraum Sah Rahave Namah), Ketu(Om Sraam Sreem Sraum Sah Ketave Namah).

GEMSTONES BY PLANET: Ruby(Sun), Pearl(Moon), Red Coral(Mars), Emerald(Mercury), Yellow Sapphire(Jupiter), Diamond/White Sapphire(Venus), Blue Sapphire(Saturn), Hessonite/Gomed(Rahu), Cat's Eye/Lehsunia(Ketu).

PRASHNA KUNDALI (Horary): Chart cast for the exact moment a question is asked. Lagna lord's condition, Moon's applying aspects, and planets in houses determine the answer. Strong 1st/5th/9th/11th = favorable. Strong 6th/8th/12th = obstacles or delay. Void-of-course Moon = nothing happens.

NAVAMSA (D9): Divisional chart showing soul's nature and spouse's true qualities. Vargottama = planet in same sign in D1 and D9 = exceptionally strong.

MUHURTA: Auspicious timing. Vivaha Muhurta(marriage), Griha Pravesh(entering new home), Naamkaran(naming ceremony). Key factors: Tara Balam, Chandra Balam, Panchaka, avoiding Rahu Kaal and Gulika.

REMEDIES (UPAYAS): Mantras(108x daily at prescribed time), Gemstones(worn in correct metal on correct finger), Fasting(planet's day), Daan/Charity(donate items linked to planet — gold for Sun, milk for Moon, red cloth for Mars), Puja/Homa, Rudraksha beads(1-mukhi=Shiva, 2-mukhi=Moon, etc.), Colors, Pilgrimage, Seva(selfless service).`.trim();

function buildPrompt(type: string, payload: Record<string, unknown>): string {
  const p = payload;
  switch (type) {
    case "bio_writer":
      return `You are a profile bio writer for Gundruk — a dark aesthetic Gen-Z social app.
Write ONE compelling profile bio for:
Name: ${p.fullName || p.username || "this person"}
Interests: ${Array.isArray(p.interests) ? (p.interests as string[]).join(", ") : "various"}

Rules: max 150 chars, first person, dark/aesthetic Gen-Z tone, no hashtags.
Return ONLY the bio text.`;

    case "story_idea": {
      const h = new Date().getHours();
      const tod = h < 6 ? "late night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
      return `Content coach for Gundruk (dark Gen-Z app). It's ${tod}.
Suggest 3 story ideas for this time of day.
Each idea: 1 sentence, under 60 chars, specific & actionable, dark/aesthetic vibe.
Return ONLY JSON: {"ideas":["idea1","idea2","idea3"]}`;
    }

    case "reel_script":
      return `Viral reel scriptwriter for Gundruk (dark Gen-Z app).
Topic: "${p.topic || "my day"}" Duration: ${p.duration || "15"}s
Write 4-5 punchy lines. Hook first, twist at end. Under 100 words.
Return ONLY JSON: {"script":["line1","line2","line3","line4"],"title":"catchy title"}`;

    case "hashtags":
      return `Generate 10 relevant hashtags for this Gundruk post caption.
Caption: "${p.caption || ""}"
Mix niche + broad. No spaces. Include #.
Return ONLY JSON: {"hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6","#tag7","#tag8","#tag9","#tag10"]}`;

    case "smart_reply":
      return `Smart reply assistant for Gundruk (Gen-Z messaging app).
Last message: "${p.lastMessage || ""}"
Generate 3 short replies (under 40 chars each). One casual, one warm, one witty.
Return ONLY JSON: {"replies":["reply1","reply2","reply3"]}`;

    case "translate":
      return `Translate this message. If it's English, translate to Spanish. If not English, translate to English.
Message: "${p.text || ""}"
Return ONLY JSON: {"translation":"translated text","fromLanguage":"detected language"}`;

    case "tone_check":
      return `Check if this message sounds rude/aggressive/harsh.
Message: "${p.message || ""}"
Return ONLY JSON: {"isHarsh":false,"suggestion":null}
If harsh, set isHarsh:true and suggestion to a polite rephrasing.`;

    case "icebreakers":
      return `Icebreaker generator for two people who just matched on Gundruk (Gen-Z social app).
Shared interests: ${Array.isArray(p.sharedInterests) ? (p.sharedInterests as string[]).join(", ") : "general topics"}
Their name: ${p.theirName || "them"}
5 personalized, fun, flirty questions. Specific to interests. Under 80 chars each.
Return ONLY JSON: {"questions":["q1?","q2?","q3?","q4?","q5?"]}`;

    case "compatibility":
      return `Write a short AI compatibility summary for two Gundruk matches.
Shared interests: ${Array.isArray(p.sharedInterests) ? (p.sharedInterests as string[]).join(", ") : "various"}
Score: ${p.score || 75}%
1-2 sentences, fun Gen-Z tone, mention actual shared interests.
Return ONLY JSON: {"summary":"Your compatibility description here"}`;

    case "conversation_starters":
      return `3 conversation openers for two Gundruk matches.
Their shared interests: ${Array.isArray(p.sharedInterests) ? (p.sharedInterests as string[]).join(", ") : "various"}
Their name: ${p.theirName || "them"}
Fun, genuine, under 100 chars each.
Return ONLY JSON: {"starters":["starter1","starter2","starter3"]}`;

    case "date_ideas":
      return `3 creative date ideas based on shared interests for Gundruk matches.
Shared interests: ${Array.isArray(p.sharedInterests) ? (p.sharedInterests as string[]).join(", ") : "general"}
Mix low-key + exciting. Each 1-2 sentences.
Return ONLY JSON: {"ideas":[{"title":"Idea Name","description":"short desc"}]}`;

    case "engagement_tips":
      return `2 quick post engagement tips for a Gundruk creator.
Post type: ${p.postType || "photo"}, Caption length: ${p.captionLength || 0} chars, Hashtags: ${p.hashtagCount || 0}
Specific, actionable, encouraging. Each tip under 80 chars.
Return ONLY JSON: {"tips":["tip1","tip2"]}`;

    case "best_time":
      return `Best times to post on Gundruk (Gen-Z social app) for maximum engagement.
Return 3 time slots with reasons.
Return ONLY JSON: {"times":[{"time":"7-9 PM","reason":"why this works"},{"time":"12-2 PM","reason":"reason"},{"time":"10-11 PM","reason":"reason"}]}`;

    case "welcome":
      return `Write a warm welcome message from "Gundruk AI" to new user "${p.username || "friend"}".
2-3 sentences, friendly dark aesthetic Gen-Z tone, mention posting/finding matches/chatting.
Return ONLY the message text.`;

    case "video_description":
      return `Write an engaging reel description for Gundruk (dark aesthetic Gen-Z).
Topic: "${p.topic || "my reel"}" Duration: ${p.duration || "15"}s
1-2 sentences, under 120 chars, ends with call to action, no hashtags.
Return ONLY the description text.`;

    case "jyotisha_readings": {
      return `You are a deeply learned Vedic astrologer (Jyotishi) well versed in Hindu Jyotisha shastra.
The seeker's birth details:
- Rashi (Moon/Solar sign): ${p.rashi || "Mesha"}
- Lagna (Ascendant): ${p.lagna || "unknown"}
- Nakshatra (birth star): ${p.nakshatra || "Ashwini"}
- Current Dasha period: ${p.dasha || "unknown"}
- Birth date: ${p.birthDate || "unknown"}

Generate four spiritual readings with deep Vedic wisdom:

1. Karma Reading (past karma shaping this life — 2-3 sentences, mystical and specific to ${p.rashi})
2. Dharma in Love (relationships, marriage destiny — 2-3 sentences, referencing the Nakshatra)
3. Artha (career, wealth karma — 2-3 sentences, reference Graha/planets)
4. Moksha Path (spiritual growth, liberation — 2-3 sentences)

Use Sanskrit terms naturally. Be specific to the Rashi and Nakshatra. Grounded in Vedic tradition.
Return ONLY JSON: {"karma":"...","love":"...","artha":"...","moksha":"...","dashaMeaning":"2 sentences about what ${p.dasha} dasha means for this person"}`;
    }

    case "jyotisha_panchang": {
      const today = new Date();
      const dateStr = today.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      return `You are a Vedic Panchang calculator. Generate today's Panchang for ${dateStr}.
Return ONLY JSON:
{
  "tithi": "Tithi name (e.g. Panchami, Ekadashi)",
  "nakshatra": "Today's lunar nakshatra",
  "yoga": "Today's Yoga name (e.g. Siddhi, Shubha, Vyatipata)",
  "karana": "Today's Karana (e.g. Bava, Balava, Kaulava)",
  "vaara": "Day deity (e.g. Surya for Sunday, Chandra for Monday)",
  "rahuKaal": "Rahu Kaal time window (e.g. 7:30 AM - 9:00 AM)",
  "brahmaMuhurta": "Brahma Muhurta (e.g. 4:48 AM - 5:36 AM)",
  "auspicious": "Brief note on today's auspiciousness",
  "avoid": "What to avoid today"
}`;
    }

    case "jyotisha_nakshatra_detail": {
      return `You are a Vedic Nakshatra expert. Give a full spiritual profile of the ${p.nakshatra || "Ashwini"} Nakshatra.
Return ONLY JSON:
{
  "deity": "ruling deity name",
  "planet": "ruling planet",
  "symbol": "symbol description",
  "qualities": ["quality1","quality2","quality3","quality4"],
  "strengths": "2 sentences on core strengths",
  "challenges": "1-2 sentences on challenges to overcome",
  "purpose": "1-2 sentences on life purpose / dharma",
  "compatible": ["Nakshatra1","Nakshatra2","Nakshatra3"],
  "mantra": "seed mantra or key mantra for this nakshatra",
  "famousPeople": ["Person 1","Person 2","Person 3"],
  "gemstone": "recommended gemstone",
  "color": "auspicious color"
}`;
    }

    case "jyotisha_remedies": {
      return `You are a Vedic Jyotishi specializing in Upaya (remedies). Based on the person's chart:
- Rashi: ${p.rashi || "Mesha"}
- Nakshatra: ${p.nakshatra || "Ashwini"}
- Weak/afflicted planet: ${p.planet || "Shani"}

Give practical, traditional Vedic remedies.
Return ONLY JSON:
{
  "mantra": {"text":"mantra text","count":"108 times daily","deity":"deity name"},
  "gemstone": {"name":"gemstone","metal":"metal to set in","finger":"which finger","day":"best day to start"},
  "fasting": {"day":"fasting day","benefit":"why this helps"},
  "puja": "specific puja or ritual recommendation",
  "charity": "what to donate and on which day",
  "color": "color to wear and on which day",
  "food": "food to offer or avoid"
}`;
    }

    case "jyotisha_compatibility": {
      return `You are a Vedic Kundali matching expert. Calculate Guna Milan between:
- Person 1: Rashi ${p.rashi1}, Nakshatra ${p.nakshatra1}
- Person 2: Rashi ${p.rashi2}, Nakshatra ${p.nakshatra2}

Calculate the 8 Kootas (Gunas):
1. Varna (1 pt max), 2. Vashya (2 pts), 3. Tara (3 pts), 4. Yoni (4 pts),
5. Graha Maitri (5 pts), 6. Gana (6 pts), 7. Bhakoot (7 pts), 8. Nadi (8 pts)

Return ONLY JSON:
{
  "total": 25,
  "outOf": 36,
  "kootas": [
    {"name":"Varna","score":1,"max":1,"meaning":"brief meaning"},
    {"name":"Vashya","score":2,"max":2,"meaning":"brief"},
    {"name":"Tara","score":2,"max":3,"meaning":"brief"},
    {"name":"Yoni","score":3,"max":4,"meaning":"brief"},
    {"name":"Graha Maitri","score":4,"max":5,"meaning":"brief"},
    {"name":"Gana","score":5,"max":6,"meaning":"brief"},
    {"name":"Bhakoot","score":6,"max":7,"meaning":"brief"},
    {"name":"Nadi","score":8,"max":8,"meaning":"brief"}
  ],
  "verdict": "Traditional Vedic verdict on this match (2-3 sentences)",
  "strengthLevel": "Excellent|Good|Acceptable|Challenging",
  "advice": "1-2 sentences of Vedic wisdom for this pairing"
}`;
    }

    case "astro_horoscope": {
      const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      return `Generate a detailed daily horoscope for ${p.sign || "Aries"} for today, ${today}.
Include exactly these 5 sections, each 2-3 sentences:
- Love (💕): romantic energy, relationships, heart matters
- Career (💼): work, ambitions, professional growth
- Health (💪): physical energy, wellness, self-care
- Money (💰): finances, opportunities, spending
- Energy (🌙): overall daily spiritual energy and mood

Make it mystical, positive, inspiring, and personal to the ${p.sign} personality.
Return ONLY JSON: {"love":"...","career":"...","health":"...","money":"...","energy":"...","luckyNumber":${Math.floor(Math.random()*99)+1},"luckyColor":"color name"}`;
    }

    case "astro_compatibility": {
      return `Analyze the romantic compatibility between ${p.sign1 || "Aries"} and ${p.sign2 || "Libra"}.
Be a mystical astrologer. Give:
- A score out of 100
- 2 key strengths of this pairing (short, vivid phrases)
- 2 challenges to navigate (honest but constructive)
- A 2-sentence romantic verdict

Fun, mystical, wise tone. Based on actual astrological traditions.
Return ONLY JSON: {"score":85,"strengths":["strength1","strength2"],"challenges":["challenge1","challenge2"],"verdict":"2-sentence romantic verdict","emoji":"🔥"}`;
    }

    case "jyotisha_daily_mantra": {
      const dayOfWeek = new Date().toLocaleDateString("en-IN", { weekday: "long" });
      const dayPlanetMap: Record<string, string> = {
        Sunday: "Surya", Monday: "Chandra", Tuesday: "Mangal",
        Wednesday: "Budha", Thursday: "Guru", Friday: "Shukra", Saturday: "Shani",
      };
      const rulingPlanet = dayPlanetMap[dayOfWeek] ?? "Surya";
      return `You are a Vedic mantra guru. Give the daily mantra for someone born in ${p.nakshatra || "Ashwini"} Nakshatra.
Today is ${dayOfWeek} ruled by ${rulingPlanet}.

Return ONLY JSON:
{
  "mantra": "Full mantra in Sanskrit (Devanagari script)",
  "transliteration": "Roman transliteration of the mantra",
  "meaning": "English meaning of the mantra (1-2 sentences)",
  "deity": "Name of the deity this mantra is for",
  "deityDescription": "Who this deity is and why they relate to this Nakshatra (1 sentence)",
  "chantCount": "108",
  "chantTime": "Brahma Muhurta (4:00 AM - 6:00 AM) or at sunrise",
  "benefits": "3-4 key spiritual and material benefits of chanting this mantra",
  "daySpecial": "Why today (${dayOfWeek}) is significant for this mantra (1 sentence)"
}`;
    }

    case "jyotisha_sade_sati": {
      const rashiIdx = ["Mesha","Vrishabha","Mithuna","Karka","Simha","Kanya","Tula","Vrishchika","Dhanu","Makara","Kumbha","Meena"].indexOf(String(p.rashi || "Mesha"));
      const saturnRashiIdx = (rashiIdx + 10) % 12;
      const rashiList = ["Mesha","Vrishabha","Mithuna","Karka","Simha","Kanya","Tula","Vrishchika","Dhanu","Makara","Kumbha","Meena"];
      const saturnRashi = rashiList[saturnRashiIdx] ?? "Makara";
      return `You are a Vedic astrologer specializing in Shani (Saturn) transits.
The user's Moon sign (Rashi) is ${p.rashi || "Mesha"}.
Current estimated Saturn position is approximately in ${saturnRashi}.
User's approximate age: ${p.age || "30"}.

Analyze their Sade Sati and Shani Dhaiya status.
Return ONLY JSON:
{
  "inSadeSati": true or false,
  "phase": "Rising Phase / Peak Phase / Setting Phase / Not in Sade Sati",
  "sadeSatiStart": "approximate year Sade Sati started or will start",
  "sadeSatiEnd": "approximate year it will end",
  "inDhaiya": true or false,
  "dhaiyaDetails": "brief explanation of Shani Dhaiya status",
  "affectedAreas": ["area1", "area2", "area3", "area4"],
  "currentEffects": "2-3 sentences on what Shani is currently teaching this person",
  "remedies": [
    {"name":"Remedy 1","description":"how to perform"},
    {"name":"Remedy 2","description":"how to perform"},
    {"name":"Remedy 3","description":"how to perform"},
    {"name":"Remedy 4","description":"how to perform"},
    {"name":"Remedy 5","description":"how to perform"}
  ],
  "scriptureQuote": "A relevant quote from Hindu scripture about Shani Dev",
  "message": "An encouraging spiritual message for this person about Saturn's role in their karma (2 sentences)"
}`;
    }

    case "jyotisha_gemstone_finder": {
      return `You are a Vedic gemologist and Jyotishi. Based on this birth chart:
- Lagna (Ascendant): ${p.lagna || "Karka"}
- Moon sign (Rashi): ${p.rashi || "Mesha"}
- Current Dasha: ${p.dasha || "Shani Dasha"}
- Nakshatra: ${p.nakshatra || "Ashwini"}

Determine which planets are strong and which are weak based on the Lagna and Rashi.
Give personalized gemstone recommendations based on classical Jyotisha texts.

Return ONLY JSON:
{
  "primaryGemstone": {
    "planet": "planet name",
    "gem": "gemstone name",
    "gemSanskrit": "Sanskrit/Hindi name",
    "finger": "which finger",
    "metal": "which metal",
    "day": "best day to start wearing",
    "time": "auspicious time",
    "mantra": "mantra to chant while wearing",
    "carats": "recommended weight in carats",
    "benefit": "main benefit for this person specifically"
  },
  "secondaryGemstone": {
    "planet": "planet name",
    "gem": "gemstone name",
    "gemSanskrit": "Sanskrit/Hindi name",
    "finger": "which finger",
    "metal": "which metal",
    "day": "best day",
    "mantra": "activation mantra",
    "benefit": "specific benefit"
  },
  "thirdGemstone": {
    "planet": "planet name",
    "gem": "gemstone name",
    "gemSanskrit": "Sanskrit/Hindi name",
    "finger": "which finger",
    "metal": "which metal",
    "day": "best day",
    "mantra": "activation mantra",
    "benefit": "specific benefit"
  },
  "avoid": ["gemstone to avoid 1 (reason)", "gemstone to avoid 2 (reason)"],
  "warning": "Important caution about gemstone combinations to avoid",
  "activationRitual": "How to purify and activate any gemstone before wearing (3-4 steps)"
}`;
    }

    case "jyotisha_marriage_timing": {
      const rashiList2 = ["Mesha","Vrishabha","Mithuna","Karka","Simha","Kanya","Tula","Vrishchika","Dhanu","Makara","Kumbha","Meena"];
      const rashiIdx2 = rashiList2.indexOf(String(p.lagna || "Karka"));
      const seventhLordRashi = rashiList2[(rashiIdx2 + 6) % 12] ?? "Makara";
      return `You are a Vedic marriage astrologer using classical Jyotisha principles.
Birth details:
- Rashi (Moon sign): ${p.rashi || "Mesha"}
- Lagna (Ascendant): ${p.lagna || "Karka"}
- 7th house falls in: ${seventhLordRashi}
- Current Dasha period: ${p.dasha || "unknown"}
- Age: ${p.age || "25"}

Analyze marriage timing and prospects using the 7th house, Venus, and Dasha system.
Return ONLY JSON:
{
  "likelyAgeRange": "e.g. 24-28 years",
  "bestYears": ["year1", "year2", "year3"],
  "currentDashaFavorable": true or false,
  "dashaAnalysis": "2 sentences on whether current Dasha supports marriage",
  "partnerQualities": "What kind of partner is indicated by the 7th house lord (2-3 sentences, mention physical and personality traits)",
  "marriagePlanets": ["planet1 - why","planet2 - why"],
  "obstacles": ["obstacle1", "obstacle2"],
  "remedies": ["remedy1", "remedy2", "remedy3"],
  "mangalDosha": true or false,
  "mangalDoshaDetails": "Brief explanation of Mangal Dosha status and its effects if present",
  "auspiciousMonths": ["month1", "month2", "month3"],
  "vedicWisdom": "A relevant Vedic verse or wisdom about marriage and dharma (1-2 sentences)"
}`;
    }

    case "jyotisha_house_reading": {
      const houseNames = ["","Tanu","Dhana","Sahaja","Sukha","Putra","Shatru","Kalatra","Randhra","Bhagya","Karma","Labha","Vyaya"];
      const houseAreas = ["","Self & Body","Wealth & Family","Siblings & Communication","Home & Happiness","Children & Creativity","Enemies & Health","Marriage & Partnership","Transformation & Mysteries","Fortune & Dharma","Career & Karma","Gains & Aspirations","Loss & Liberation"];
      const houseNum = typeof p.houseNumber === "number" ? p.houseNumber : 1;
      const houseName = houseNames[houseNum] ?? "Tanu";
      const houseArea = houseAreas[houseNum] ?? "Self";
      return `You are a Vedic astrologer giving a house reading.
House: ${houseNum}th House (${houseName} Bhava) — governs ${houseArea}
- Lagna: ${p.lagna || "Karka"}
- Rashi: ${p.rashi || "Mesha"}
- Nakshatra: ${p.nakshatra || "Ashwini"}

Give a detailed reading for this house.
Return ONLY JSON:
{
  "houseName": "${houseName}",
  "houseArea": "${houseArea}",
  "houseNumber": ${houseNum},
  "houseLord": "the planet that rules this house based on the Lagna",
  "naturalSignificator": "the planet naturally associated with this house's themes",
  "strength": "Strong/Moderate/Needs Attention",
  "strengthReason": "1 sentence why",
  "positives": "2-3 sentences on the strengths and blessings of this house for this person",
  "challenges": "1-2 sentences on challenges to navigate",
  "keyAreas": ["specific life area 1", "specific life area 2", "specific life area 3"],
  "remedy": "1 specific Vedic remedy to strengthen this house",
  "mantra": "a mantra for the house lord",
  "vedicInsight": "A deep Vedic philosophical insight about this house's themes (1-2 sentences)"
}`;
    }

    case "jyotisha_prashna": {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      return `${JYOTISHA_KNOWLEDGE}

You are a Prashna (Horary Astrology) Jyotishi. The seeker asks:
"${p.question || "Will this matter be resolved favorably?"}"

Time of question: ${timeStr} on ${dateStr}
Seeker's natal Rashi: ${p.rashi || "unknown"}, Nakshatra: ${p.nakshatra || "unknown"}

Using classical Prashna Kundali principles, analyze and give a traditional Vedic answer.
Return ONLY JSON:
{
  "answer": "Direct answer to the question — favorable/unfavorable/mixed with reason (2 sentences)",
  "timing": "When the matter may resolve — be specific (days/weeks/months/season)",
  "keyPlanet": "The planet most affecting this question and why (1 sentence)",
  "advice": "What the seeker should do or avoid right now (1-2 sentences)",
  "signFromUniverse": "A spiritual sign or synchronicity to watch for",
  "moonIndication": "What today's Moon position and Nakshatra indicate about the outcome",
  "upaya": "A specific remedy to support a favorable outcome",
  "scriptureWisdom": "A relevant Sanskrit verse or Vedic wisdom about this life matter"
}`;
    }

    case "jyotisha_spiritual_path": {
      return `${JYOTISHA_KNOWLEDGE}

You are a Vedic spiritual guide. Based on this person's birth chart, determine their primary spiritual path (Yoga Marga).
- Rashi: ${p.rashi || "Mesha"}
- Lagna: ${p.lagna || "Karka"}
- Nakshatra: ${p.nakshatra || "Ashwini"}
- Current Dasha: ${p.dasha || "unknown"}

Analyze which of the 4 Yoga paths is most aligned with their soul's nature and current karma.
Return ONLY JSON:
{
  "primaryPath": "Bhakti Yoga | Karma Yoga | Jnana Yoga | Raja Yoga",
  "pathEmoji": "🙏 or ⚡ or 📚 or 🧘",
  "pathSanskrit": "Sanskrit name and meaning",
  "whyThisPath": "3 sentences explaining why this path fits their Rashi, Nakshatra, and Dasha",
  "dailyPractice": ["practice 1", "practice 2", "practice 3", "practice 4"],
  "spiritualObstacle": "1-2 sentences on the main spiritual challenge for this person to overcome",
  "secondaryPath": "Secondary complementary path and why",
  "idealSadhnaTime": "Best time of day for spiritual practice based on their chart and why",
  "sacredText": "The scripture most aligned with their path (e.g. Bhagavad Gita, Yoga Sutras, Upanishads) and why",
  "mantra": "The most powerful mantra for their spiritual path",
  "soulPurpose": "2 sentences on their soul's purpose this incarnation based on Nakshatra and Lagna"
}`;
    }

    case "jyotisha_past_life": {
      return `${JYOTISHA_KNOWLEDGE}

You are a Vedic past-life reader using Ketu (South Node), 12th house, and Purva Janma principles.
Birth chart:
- Rashi: ${p.rashi || "Mesha"}
- Lagna: ${p.lagna || "Karka"}
- Nakshatra: ${p.nakshatra || "Ashwini"}
- Current Dasha: ${p.dasha || "unknown"}

Ketu and the 12th house reveal accumulated wisdom and karma from past lives.
Return ONLY JSON:
{
  "pastLifeTheme": "The dominant theme/mission of their most recent significant past life (2 sentences)",
  "pastLifeRole": "What role, profession, or spiritual position they held",
  "pastLifeLocation": "Region of the world and time period (based on Nakshatra and Lagna indicators)",
  "ketuLesson": "What Ketu's placement in their Nakshatra reveals about past life mastery",
  "karmaCarriedForward": "Main karma, skill, or soul wisdom brought into this incarnation",
  "pastLifeChallenge": "The unresolved challenge or regret this soul is healing in THIS life",
  "birthGifts": ["natural gift 1", "natural gift 2", "natural gift 3"],
  "soulsJourney": "2 sentences on the soul's evolutionary arc from past to present life",
  "rahuDirection": "What Rahu (opposite Ketu) indicates this soul MUST develop and face in this life",
  "liberationPath": "How this person can transcend past karma and move toward Moksha (1-2 sentences)"
}`;
    }

    case "jyotisha_karma_types": {
      return `${JYOTISHA_KNOWLEDGE}

You are a Vedic karma guru. Explain the three types of karma as they apply specifically to this person's chart.
- Rashi: ${p.rashi || "Mesha"}
- Lagna: ${p.lagna || "Karka"}
- Nakshatra: ${p.nakshatra || "Ashwini"}
- Current Dasha: ${p.dasha || "unknown"}

Return ONLY JSON:
{
  "sanchita": {
    "title": "Sanchita Karma",
    "titleSa": "सञ्चित कर्म",
    "meaning": "The storehouse of accumulated karma from all past lives",
    "forThisPerson": "2-3 sentences on what their total karmic storehouse looks like based on their Rashi and Lagna",
    "magnitude": "Vast | Large | Moderate"
  },
  "prarabdha": {
    "title": "Prarabdha Karma",
    "titleSa": "प्रारब्ध कर्म",
    "meaning": "The portion of karma destined to ripen in this lifetime — shown by birth chart",
    "forThisPerson": "2-3 sentences on the specific karma currently manifesting based on Rashi, Lagna, and current Dasha",
    "mainThemes": ["karma theme 1", "karma theme 2", "karma theme 3"],
    "canItChange": "No — it must be experienced, but conscious awareness softens its impact"
  },
  "kriyamana": {
    "title": "Kriyamana Karma",
    "titleSa": "क्रियमाण कर्म",
    "meaning": "Karma being created right now by current actions — fully within your control",
    "forThisPerson": "2 sentences on where this person has the most free will based on current Dasha",
    "powerActions": ["powerful good action 1", "action 2", "action 3"]
  },
  "overallMessage": "A profound Vedic wisdom message about karma and free will personalized to this person",
  "gitaVerse": "A relevant verse or teaching from the Bhagavad Gita about karma"
}`;
    }

    case "jyotisha_ishta_devata": {
      return `${JYOTISHA_KNOWLEDGE}

You are a Vedic Jyotishi specializing in Ishta Devata (personal deity) determination using Atmakaraka and Nakshatra methods.
Birth chart:
- Rashi: ${p.rashi || "Mesha"}
- Lagna: ${p.lagna || "Karka"}
- Nakshatra: ${p.nakshatra || "Ashwini"}
- Current Dasha: ${p.dasha || "unknown"}

Determine the Ishta Devata — the personal deity most aligned with this soul's path.
Return ONLY JSON:
{
  "ishtaDevata": "Name of their primary personal deity",
  "devataSanskrit": "Sanskrit/Devanagari name",
  "devataEmoji": "relevant emoji",
  "whyThisDeity": "2-3 sentences explaining why this deity is theirs based on chart indicators",
  "form": "The specific form/aspect of this deity most auspicious for them",
  "worship": {
    "day": "Most auspicious day for worship",
    "time": "Best time of day",
    "mantra": "Primary mantra for this deity",
    "offering": "Traditional offering (flowers, food, etc.)",
    "prayer": "A short invocation — Sanskrit transliteration + English meaning"
  },
  "story": "A brief Puranic story about this deity that resonates with this person's karma (2 sentences)",
  "blessing": "The specific blessings this deity grants for this person's chart",
  "nakshatraDeity": "The deity ruling their Nakshatra and how it relates to their Ishta Devata",
  "pilgrimage": "A sacred site or temple associated with this deity worth visiting"
}`;
    }

    case "jyotisha_navamsa": {
      return `${JYOTISHA_KNOWLEDGE}

You are a Vedic astrologer specializing in the Navamsa (D9) — the chart of the soul and marriage.
Birth chart:
- Rashi: ${p.rashi || "Mesha"}
- Lagna: ${p.lagna || "Karka"}
- Nakshatra: ${p.nakshatra || "Ashwini"}
- Current Dasha: ${p.dasha || "unknown"}

Analyze the Navamsa chart which reveals the soul's deeper nature, spiritual evolution, and marriage partner's true qualities.
Return ONLY JSON:
{
  "navamsaLagna": "Likely Navamsa Lagna sign based on natal Lagna",
  "soulNature": "3 sentences on the soul's deeper nature revealed by Navamsa indicators",
  "vargottama": "Whether any key planets may be Vargottama and what that means for this person",
  "spiritualMaturity": "Advanced | Developing | Growing — with a 1-sentence explanation",
  "marriagePartner": {
    "nature": "True personality traits of their destined life partner (2 sentences)",
    "appearance": "Physical and personality description",
    "background": "Cultural/family background indicated"
  },
  "latentTalents": ["hidden talent revealed by D9 — 1", "talent 2", "talent 3"],
  "soulLesson": "The primary spiritual lesson the soul chose to learn this incarnation",
  "pastLifeStrengths": "Strengths and virtues carried forward from past lives (1-2 sentences)",
  "divineGrace": "Where this soul has special divine protection or blessings",
  "dharmaPath": "Their soul's specific dharma — the unique contribution they came to make"
}`;
    }

    default:
      return `You are Gundruk AI. ${p.message || "Hello!"}`;
  }
}

router.post("/chat", async (req, res) => {
  const { type, payload, messages: history } = req.body as {
    type: string;
    payload?: Record<string, unknown>;
    messages?: Array<{ role: string; content: string }>;
  };

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  const p = payload ?? {};

  try {
    if (type === "general") {
      const msgs = history ?? [];
      if (msgs.length === 0) {
        res.status(400).json({ error: "No messages provided" });
        return;
      }
      const system = `You are Gundruk AI — the witty, friendly AI built into the Gundruk app. Gundruk is a dark aesthetic Gen-Z social platform for posting, reels, vibe matching, and chatting.
Help with: content ideas, captions, hashtags, bio writing, match tips, app help, creative writing, fun conversation.
Keep responses concise (2-4 sentences). Friendly, slightly edgy Gen-Z tone. Use emojis occasionally.`;
      const result = await callClaude(apiKey, msgs, system, 512);
      res.json({ result });
      return;
    }

    if (type === "jyotishi_chat") {
      const msgs = history ?? [];
      if (msgs.length === 0) {
        res.status(400).json({ error: "No messages provided" });
        return;
      }
      const pp = p as Record<string, unknown>;
      const system = `${JYOTISHA_KNOWLEDGE}

You are a wise and deeply learned Vedic astrologer (Jyotishi) well versed in all aspects of Jyotisha shastra, Hindu philosophy, karma, dharma, and the spiritual science of light.
${pp.rashi ? `The seeker's Rashi (Moon/Solar sign): ${pp.rashi}` : ""}
${pp.nakshatra ? `Their Nakshatra (birth star): ${pp.nakshatra}` : ""}
${pp.lagna ? `Their Lagna (Ascendant): ${pp.lagna}` : ""}
${pp.dasha ? `Their current Dasha period: ${pp.dasha}` : ""}

Answer their question with precise, authentic Vedic wisdom — use the knowledge base above to give accurate, specific answers.
Reference karma, dharma, the Navagraha, the 12 houses, Dasha system, and Hindu philosophy as appropriate.
Use Sanskrit terms naturally (Rashi, Graha, Lagna, Dasha, Nakshatra, Upaya, Yoga, Bhava, etc.).
Be respectful, wise, spiritually grounded, and practically helpful.
Keep responses concise (3-5 sentences). Include a relevant Sanskrit proverb, shloka, or Vedic insight when appropriate.`;
      const result = await callClaude(apiKey, msgs, system, 700);
      res.json({ result });
      return;
    }

    if (type === "astro_chat") {
      const msgs = history ?? [];
      if (msgs.length === 0) {
        res.status(400).json({ error: "No messages provided" });
        return;
      }
      const zodiacSign = (p as Record<string, unknown>).zodiacSign as string | undefined;
      const system = `You are a mystical astrologer and cosmic guide. You have deep knowledge of astrology, zodiac signs, planetary movements, birth charts, and cosmic energies.${zodiacSign ? ` The user is a ${zodiacSign}.` : ""}
Answer questions about astrology with wisdom, mysticism, and warmth. Reference real astrological concepts (Mercury retrograde, Venus transits, moon phases, rising signs, etc.).
Be encouraging, positive, and insightful. Use mystical language and occasional star/moon emojis ✨🌙⭐🔮.
Keep responses concise (3-5 sentences). Never make harmful predictions.`;
      const result = await callClaude(apiKey, msgs, system, 600);
      res.json({ result });
      return;
    }

    const prompt = buildPrompt(type, p);
    const cacheKey = `${type}:${JSON.stringify(p)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ result: cached.result });
      return;
    }

    const result = await callClaude(apiKey, [{ role: "user", content: prompt }]);
    cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL });
    res.json({ result });
  } catch (err) {
    req.log.error({ err }, "AI chat failed");
    res.status(500).json({ error: "AI request failed" });
  }
});

export default router;
