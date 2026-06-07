import { Router } from "express";

const router = Router();

export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  viewCount: string;
  likeCount: string;
  publishedAt: string;
  description: string;
  duration: string;
}

function mapItem(item: any): YouTubeVideo {
  return {
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
  };
}

/** Chart-based: most popular videos (no duration filter). */
async function fetchChart(apiKey: string, maxResults: number, regionCode: string, videoCategoryId?: string): Promise<YouTubeVideo[]> {
  const params = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    chart: "mostPopular",
    regionCode,
    maxResults: String(maxResults),
    key: apiKey,
  });
  if (videoCategoryId) params.set("videoCategoryId", videoCategoryId);

  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
  const data = await res.json() as any;
  return (data.items ?? []).map(mapItem);
}

/** Search-based: filter by videoDuration (short | medium | long). Two-step: search → details. */
async function fetchByDuration(apiKey: string, maxResults: number, regionCode: string, videoDuration: string): Promise<YouTubeVideo[]> {
  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoDuration,
    order: "viewCount",
    q: "trending viral",
    regionCode,
    maxResults: String(Math.min(maxResults, 25)),
    key: apiKey,
  });

  const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
  if (!searchRes.ok) throw new Error(`YouTube search error: ${searchRes.status}`);
  const searchData = await searchRes.json() as any;
  const ids: string[] = (searchData.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const detailParams = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    id: ids.join(","),
    key: apiKey,
  });
  const detailRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`);
  if (!detailRes.ok) throw new Error(`YouTube detail error: ${detailRes.status}`);
  const detailData = await detailRes.json() as any;
  return (detailData.items ?? []).map(mapItem);
}

router.get("/trending", async (req, res) => {
  const apiKey = process.env["YOUTUBE_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "YOUTUBE_API_KEY not configured" });
    return;
  }

  const regionCode = (req.query["regionCode"] as string) || "US";
  const maxResults = Math.min(Number(req.query["maxResults"]) || 10, 25);
  const videoCategoryId = (req.query["videoCategoryId"] as string) || undefined;
  const videoDuration = (req.query["videoDuration"] as string) || undefined;

  try {
    let items: YouTubeVideo[];
    if (videoDuration && ["short", "medium", "long"].includes(videoDuration)) {
      items = await fetchByDuration(apiKey, maxResults, regionCode, videoDuration);
    } else {
      items = await fetchChart(apiKey, maxResults, regionCode, videoCategoryId);
    }
    res.json({ videos: items, regionCode });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch YouTube trending");
    res.status(500).json({ error: "Failed to fetch trending videos" });
  }
});

export default router;
