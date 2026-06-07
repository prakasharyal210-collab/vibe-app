import { Router } from "express";
import type { YouTubeVideo } from "./trending";

const router = Router();

/** Two-step: search → then fetch full details (statistics + contentDetails). */
async function fetchShorts(apiKey: string, maxResults: number, regionCode: string): Promise<YouTubeVideo[]> {
  // Step 1: search for short videos
  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoDuration: "short",
    videoDefinition: "high",
    order: "viewCount",
    q: "shorts trending",
    regionCode,
    maxResults: String(Math.min(maxResults, 25)),
    key: apiKey,
  });

  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${searchParams}`
  );
  if (!searchRes.ok) {
    throw new Error(`YouTube search error: ${searchRes.status}`);
  }
  const searchData = await searchRes.json() as any;
  const ids: string[] = (searchData.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  // Step 2: fetch full video details
  const detailParams = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    id: ids.join(","),
    key: apiKey,
  });
  const detailRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${detailParams}`
  );
  if (!detailRes.ok) {
    throw new Error(`YouTube videos detail error: ${detailRes.status}`);
  }
  const detailData = await detailRes.json() as any;

  return (detailData.items ?? []).map((item: any): YouTubeVideo => ({
    id: item.id,
    title: item.snippet?.title ?? "",
    channelTitle: item.snippet?.channelTitle ?? "",
    thumbnailUrl:
      item.snippet?.thumbnails?.maxres?.url ??
      item.snippet?.thumbnails?.high?.url ??
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ?? "",
    viewCount: item.statistics?.viewCount ?? "0",
    likeCount: item.statistics?.likeCount ?? "0",
    publishedAt: item.snippet?.publishedAt ?? "",
    description: item.snippet?.description ?? "",
    duration: item.contentDetails?.duration ?? "PT0S",
  }));
}

router.get("/shorts", async (req, res) => {
  const apiKey = process.env["YOUTUBE_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "YOUTUBE_API_KEY not configured" });
    return;
  }

  const maxResults = Math.min(Number(req.query["maxResults"]) || 15, 25);
  const regionCode = (req.query["regionCode"] as string) || "US";

  try {
    const videos = await fetchShorts(apiKey, maxResults, regionCode);
    res.json({ videos, regionCode });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch YouTube Shorts");
    res.status(500).json({ error: "Failed to fetch YouTube Shorts" });
  }
});

export default router;
