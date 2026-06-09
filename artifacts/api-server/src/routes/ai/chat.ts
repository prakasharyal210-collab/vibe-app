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
      const system = `You are a wise and deeply learned Vedic astrologer (Jyotishi) well versed in Hindu Jyotisha shastra, Hindu philosophy, karma, dharma, and the spiritual science of light.
${pp.rashi ? `The seeker's Rashi (Moon/Solar sign): ${pp.rashi}` : ""}
${pp.nakshatra ? `Their Nakshatra (birth star): ${pp.nakshatra}` : ""}
${pp.lagna ? `Their Lagna (Ascendant): ${pp.lagna}` : ""}
${pp.dasha ? `Their current Dasha period: ${pp.dasha}` : ""}

Answer their question with deep Vedic wisdom, referencing karma, dharma, the Navagraha, the 12 houses, and Hindu philosophy where relevant.
Use Sanskrit terms naturally (Rashi, Graha, Lagna, Dasha, Nakshatra, Upaya, etc.).
Be respectful, wise, spiritually grounded, and practically helpful.
Keep responses concise (3-5 sentences). Include a relevant Sanskrit proverb or Vedic insight when appropriate.`;
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
