import { Router } from "express";

const router = Router();

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  videographerName: string;
  videographerUrl: string;
  thumbnailUrl: string;
  videoUrl: string;
  avgColor: string;
}

async function fetchPexelsVideos(apiKey: string, path: string): Promise<any> {
  const res = await fetch(`https://api.pexels.com/videos/${path}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) throw new Error(`Pexels videos API ${res.status}: ${await res.text()}`);
  return res.json();
}

function selectVideoUrl(videoFiles: any[]): string {
  const mp4s = (videoFiles ?? []).filter((f: any) => f.file_type === "video/mp4" && f.link);
  if (!mp4s.length) return "";
  // Prefer ~720p for mobile balance between quality and bandwidth
  const sorted = [...mp4s].sort((a, b) => {
    const dist = (v: any) => Math.abs((v.width ?? 0) - 720);
    return dist(a) - dist(b);
  });
  return sorted[0]?.link ?? "";
}

function mapVideo(v: any): PexelsVideo {
  return {
    id: v.id,
    width: v.width ?? 0,
    height: v.height ?? 0,
    duration: v.duration ?? 0,
    videographerName: v.user?.name ?? "Creator",
    videographerUrl: v.user?.url ?? "",
    thumbnailUrl: v.image ?? v.video_pictures?.[0]?.picture ?? "",
    videoUrl: selectVideoUrl(v.video_files ?? []),
    avgColor: "#111",
  };
}

// GET /videos/popular — inline videos for the For You feed
router.get("/popular", async (req, res) => {
  const apiKey = process.env["PEXELS_API_KEY"];
  if (!apiKey) { res.status(500).json({ error: "PEXELS_API_KEY not configured" }); return; }

  const perPage = Math.min(Number(req.query["perPage"]) || 15, 25);

  try {
    const data = await fetchPexelsVideos(apiKey, `popular?per_page=${perPage}&min_width=360`);
    const videos: PexelsVideo[] = (data.videos ?? []).map(mapVideo).filter((v: PexelsVideo) => v.videoUrl);
    res.json({ videos });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Pexels popular videos");
    res.status(500).json({ error: "Failed to fetch popular videos" });
  }
});

// GET /videos/short — full-screen reels (duration ≤ 30s)
const SHORT_QUERIES = ["lifestyle", "nature", "travel", "people", "street"] as const;

router.get("/short", async (req, res) => {
  const apiKey = process.env["PEXELS_API_KEY"];
  if (!apiKey) { res.status(500).json({ error: "PEXELS_API_KEY not configured" }); return; }

  const perPage = Math.min(Number(req.query["perPage"]) || 20, 30);
  const perQuery = Math.ceil(perPage / SHORT_QUERIES.length);

  try {
    const results = await Promise.allSettled(
      SHORT_QUERIES.map((q) =>
        fetchPexelsVideos(
          apiKey,
          `search?query=${encodeURIComponent(q)}&per_page=${perQuery}&max_duration=30&min_width=360&orientation=portrait`
        )
      )
    );

    let videos: PexelsVideo[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && Array.isArray(r.value?.videos)) {
        videos.push(...r.value.videos.map(mapVideo));
      }
    }

    videos = videos
      .filter((v) => v.videoUrl && v.duration > 0 && v.duration <= 30)
      .sort(() => Math.random() - 0.5)
      .slice(0, perPage);

    res.json({ videos });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Pexels short videos");
    res.status(500).json({ error: "Failed to fetch short videos" });
  }
});

export default router;
