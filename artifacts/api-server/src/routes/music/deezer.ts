import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

const memCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;

// Countries with official Deezer chart IDs
const CHART_URLS: Record<string, string> = {
  "0":  "https://api.deezer.com/chart/0/tracks?limit=50",
  "US": "https://api.deezer.com/chart/23/tracks?limit=50",
  "GB": "https://api.deezer.com/chart/23/tracks?limit=50",
  "FR": "https://api.deezer.com/chart/116/tracks?limit=50",
  "DE": "https://api.deezer.com/chart/322/tracks?limit=50",
};

// Countries using keyword search (no dedicated chart)
const SEARCH_URLS: Record<string, string> = {
  "IN": "https://api.deezer.com/search?q=bollywood&limit=50",
  "NP": "https://api.deezer.com/search?q=nepali+pop&limit=50",
  "PK": "https://api.deezer.com/search?q=urdu+pop&limit=50",
  "BD": "https://api.deezer.com/search?q=bangladeshi+music&limit=50",
  "KR": "https://api.deezer.com/search?q=kpop&limit=50",
  "JP": "https://api.deezer.com/search?q=japanese+pop&limit=50",
  "BR": "https://api.deezer.com/search?q=brazil+pop&limit=50",
  "ES": "https://api.deezer.com/search?q=latin+pop&limit=50",
  "NG": "https://api.deezer.com/search?q=afrobeats&limit=50",
};

// Existing /deezer endpoint kept for backwards compat
router.get("/deezer", async (req, res) => {
  const country = (req.query["country"] as string | undefined) ?? "0";
  const limit = Math.min(Number(req.query["limit"]) || 50, 100);
  const cacheKey = `deezer_${country}_${limit}`;

  const cached = memCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.json(cached.data);
    return;
  }

  try {
    const url = country === "0"
      ? `https://api.deezer.com/chart/0/tracks?limit=${limit}`
      : `https://api.deezer.com/chart/${encodeURIComponent(country)}/tracks?limit=${limit}`;

    const upstream = await fetch(url, {
      headers: { "User-Agent": "Gundruk/1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      req.log.warn({ status: upstream.status, country }, "Deezer upstream error");
      res.status(502).json({ error: "Deezer unavailable" });
      return;
    }

    const data = await upstream.json();
    memCache.set(cacheKey, { data, ts: Date.now() });
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to proxy Deezer chart");
    res.status(500).json({ error: "Failed to fetch music" });
  }
});

// New /trending endpoint — supports all 12 countries
router.get("/trending", async (req, res) => {
  const country = ((req.query["country"] as string | undefined) ?? "0").toUpperCase().replace("GLOBAL", "0");
  const cacheKey = `trending_${country}`;

  const cached = memCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.json(cached.data);
    return;
  }

  try {
    let url: string;
    let isSearch = false;

    if (CHART_URLS[country]) {
      url = CHART_URLS[country];
    } else if (SEARCH_URLS[country]) {
      url = SEARCH_URLS[country];
      isSearch = true;
    } else {
      url = CHART_URLS["0"];
    }

    const upstream = await fetch(url, {
      headers: { "User-Agent": "Gundruk/1.0" },
      signal: AbortSignal.timeout(12_000),
    });

    if (!upstream.ok) {
      req.log.warn({ status: upstream.status, country }, "Deezer trending error");
      res.status(502).json({ error: "Deezer unavailable" });
      return;
    }

    const json = await upstream.json() as Record<string, unknown>;

    // Normalise: chart returns { data: [...] }, search returns { data: [...] }
    // Chart wraps in { tracks: { data: [...] } } for some endpoints
    const rawTracks =
      (json["data"] as unknown[] | undefined) ??
      ((json["tracks"] as Record<string, unknown> | undefined)?.["data"] as unknown[] | undefined) ??
      [];

    const result = { tracks: rawTracks, country, isSearch };
    memCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch trending music");
    res.status(500).json({ error: "Failed to fetch music" });
  }
});

// POST /api/music/track
// Upsert a music track into the music_tracks table (saves user-selected tracks server-side).
// body: { id, title, artist, coverUrl, audioUrl, duration, category }
router.post("/track", async (req, res) => {
  const { id, title, artist, coverUrl, audioUrl, duration, category } = req.body as {
    id?: string; title?: string; artist?: string; coverUrl?: string;
    audioUrl?: string; duration?: number; category?: string;
  };
  if (!id || !title) { res.status(400).json({ error: "id and title required" }); return; }
  const sb = makeSupabase();
  try {
    const { error } = await sb.from("music_tracks").upsert(
      { id, title, artist: artist ?? "", cover_url: coverUrl ?? null, audio_url: audioUrl ?? null,
        duration: duration ?? 0, category: category ?? "trending", is_free: true },
      { onConflict: "id" }
    );
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "music/track upsert error");
    res.status(500).json({ error: "Failed to save track" });
  }
});

export default router;
