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

router.get("/trending", async (req, res) => {
  const apiKey = process.env["YOUTUBE_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "YOUTUBE_API_KEY not configured" });
    return;
  }

  const regionCode = (req.query["regionCode"] as string) || "US";
  const maxResults = Math.min(Number(req.query["maxResults"]) || 10, 20);
  const videoCategoryId = (req.query["videoCategoryId"] as string) || undefined;

  try {
    const params = new URLSearchParams({
      part: "snippet,statistics,contentDetails",
      chart: "mostPopular",
      regionCode,
      maxResults: String(maxResults),
      key: apiKey,
    });
    if (videoCategoryId) params.set("videoCategoryId", videoCategoryId);

    const url = `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, body: errText }, "YouTube API error");
      res.status(502).json({ error: "YouTube API error", detail: errText });
      return;
    }

    const data = await response.json() as any;
    const items: YouTubeVideo[] = (data.items ?? []).map((item: any) => ({
      id: item.id,
      title: item.snippet?.title ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      thumbnailUrl:
        item.snippet?.thumbnails?.maxres?.url ??
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        "",
      viewCount: item.statistics?.viewCount ?? "0",
      likeCount: item.statistics?.likeCount ?? "0",
      publishedAt: item.snippet?.publishedAt ?? "",
      description: item.snippet?.description ?? "",
      duration: item.contentDetails?.duration ?? "PT0S",
    }));

    res.json({ videos: items, regionCode });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch YouTube trending");
    res.status(500).json({ error: "Failed to fetch trending videos" });
  }
});

export default router;
