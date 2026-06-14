import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w]+/g);
  return matches ? matches.map((h) => h.slice(1).toLowerCase()) : [];
}

router.post("/create", async (req, res) => {
  const {
    userId,
    videoBase64,
    thumbnailBase64,
    mimeType = "video/mp4",
    ext = "mp4",
    caption = "",
    duration,
    visibility,
  } = req.body as {
    userId: string;
    videoBase64?: string;
    thumbnailBase64?: string;
    mimeType?: string;
    ext?: string;
    caption?: string;
    duration?: number;
    visibility?: string;
  };

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const supabaseUrl =
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
    "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceKey) {
    res.status(500).json({ error: "Server not configured" });
    return;
  }
  const sb = createClient(supabaseUrl, serviceKey);

  const ts = Date.now();
  let videoUrl: string | null = null;
  let thumbnailUrl: string | null = null;

  // Upload video — stored under {userId}/{timestamp}.{ext} in the `reels` bucket
  if (videoBase64) {
    try {
      const filename = `${userId}/${ts}.${ext}`;
      const buffer = Buffer.from(videoBase64, "base64");
      const { error: upErr } = await sb.storage
        .from("reels")
        .upload(filename, buffer, { contentType: mimeType, upsert: true });
      if (!upErr) {
        const { data: urlData } = sb.storage.from("reels").getPublicUrl(filename);
        videoUrl = urlData.publicUrl;
      } else {
        req.log.warn({ err: upErr.message }, "Reel video upload error");
      }
    } catch (err) {
      req.log.warn({ err }, "Reel video upload failed");
    }
  }

  // Upload thumbnail — stored under thumbnails/{userId}/{timestamp}.jpg in the `reels` bucket
  // (separate subfolder keeps video files and thumbs distinguishable without a second bucket)
  if (thumbnailBase64) {
    try {
      const thumbFilename = `thumbnails/${userId}/${ts}.jpg`;
      const thumbBuffer = Buffer.from(thumbnailBase64, "base64");
      const { error: thumbErr } = await sb.storage
        .from("reels")
        .upload(thumbFilename, thumbBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (!thumbErr) {
        const { data: thumbUrlData } = sb.storage
          .from("reels")
          .getPublicUrl(thumbFilename);
        thumbnailUrl = thumbUrlData.publicUrl;
      } else {
        req.log.warn({ err: thumbErr.message }, "Reel thumbnail upload error");
      }
    } catch (err) {
      req.log.warn({ err }, "Reel thumbnail upload failed");
    }
  }

  const VALID_VISIBILITIES = ["public", "friends", "private"] as const;
  const safeVisibility: string = VALID_VISIBILITIES.includes(visibility as any)
    ? (visibility as string)
    : "public";

  const reelPayload: Record<string, unknown> = {
    user_id: userId,
    video_url: videoUrl ?? "",
    thumbnail_url: thumbnailUrl ?? null,
    caption,
    hashtags: extractHashtags(caption),
    duration: duration ?? null,
    visibility: safeVisibility,
    is_public: true,
    likes_count: 0,
    comments_count: 0,
    views_count: 0,
    created_at: new Date().toISOString(),
  };

  const rr1 = await sb.from("reels").insert(reelPayload).select("id").single();
  // Graceful fallback: if visibility column not yet created, retry without it
  let data = rr1.data;
  let error = rr1.error;
  if (error?.message?.includes("visibility")) {
    const payloadNoVis = { ...reelPayload };
    delete payloadNoVis.visibility;
    const rr2 = await sb.from("reels").insert(payloadNoVis).select("id").single();
    data = rr2.data;
    error = rr2.error;
  }

  if (error) {
    req.log.error({ err: error.message }, "Reel insert failed");
    res.status(500).json({ error: error.message });
    return;
  }

  const reelId = (data as { id: string }).id;

  // Seed initial score immediately — pg_cron runs every 15 min so new reels start at 0 without this
  void Promise.resolve(sb.rpc("calculate_reel_score", { p_reel_id: reelId }))
    .then(({ data: score }) => {
      if (typeof score === "number") {
        return Promise.resolve(sb.from("reels").update({ score }).eq("id", reelId));
      }
      return undefined;
    })
    .catch(() => {}); // non-fatal

  res.json({
    id: reelId,
    videoUrl: videoUrl ?? "",
    thumbnailUrl: thumbnailUrl ?? null,
  });
});

export default router;
