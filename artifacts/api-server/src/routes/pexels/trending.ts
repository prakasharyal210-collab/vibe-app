import { Router } from "express";

const router = Router();

export interface PexelsPhoto {
  id: number;
  photographer: string;
  photographerUrl: string;
  url: string;
  avgColor: string;
  src: {
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  alt: string;
  width: number;
  height: number;
}

const CATEGORIES = ["nature", "lifestyle", "travel", "food", "fashion", "technology"] as const;
type Category = (typeof CATEGORIES)[number];

async function fetchPexels(apiKey: string, path: string): Promise<any> {
  const res = await fetch(`https://api.pexels.com/v1/${path}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    throw new Error(`Pexels API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function mapPhoto(p: any): PexelsPhoto {
  return {
    id: p.id,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    url: p.url,
    avgColor: p.avg_color ?? "#111",
    src: {
      large2x: p.src?.large2x ?? "",
      large: p.src?.large ?? "",
      medium: p.src?.medium ?? "",
      small: p.src?.small ?? "",
      portrait: p.src?.portrait ?? "",
      landscape: p.src?.landscape ?? "",
      tiny: p.src?.tiny ?? "",
    },
    alt: p.alt ?? "",
    width: p.width ?? 0,
    height: p.height ?? 0,
  };
}

router.get("/trending", async (req, res) => {
  const apiKey = process.env["PEXELS_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "PEXELS_API_KEY not configured" });
    return;
  }

  const perPage = Math.min(Number(req.query["perPage"]) || 12, 20);
  const category = (req.query["category"] as Category | undefined) ?? undefined;

  try {
    let photos: PexelsPhoto[] = [];

    if (category && CATEGORIES.includes(category as Category)) {
      const data = await fetchPexels(
        apiKey,
        `search?query=${encodeURIComponent(category)}&per_page=${perPage}&orientation=portrait`
      );
      photos = (data.photos ?? []).map(mapPhoto);
    } else {
      const photosPerCat = Math.ceil(perPage / CATEGORIES.length);
      const results = await Promise.allSettled(
        CATEGORIES.map((cat) =>
          fetchPexels(
            apiKey,
            `search?query=${encodeURIComponent(cat)}&per_page=${photosPerCat}&orientation=portrait`
          )
        )
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          photos.push(...(r.value.photos ?? []).map(mapPhoto));
        }
      }
      photos = photos.sort(() => Math.random() - 0.5).slice(0, perPage);
    }

    res.json({ photos, category: category ?? "mixed" });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Pexels photos");
    res.status(500).json({ error: "Failed to fetch photos" });
  }
});

export default router;
