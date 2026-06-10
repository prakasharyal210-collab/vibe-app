import { Router } from "express";

const router = Router();

const memCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;

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
    const url =
      country === "0"
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

export default router;
