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
  } = req.body as {
    userId: string;
    videoBase64?: string;
    thumbnailBase64?: string;
    mimeType?: string;
    ext?: string;
    caption?: string;
    duration?: number;
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

  let videoUrl: string | null = null;
  let thumbnailUrl: string | null = null;

  if (videoBase64) {
    try {
      const filename = `${userId}/${Date.now()}.${ext}`;
      const buffer = Buffer.from(videoBase64, "base64");
      const { error: upErr } = await sb.storage
        .from("reels")
        .upload(filename, buffer, { contentType: mimeType, upsert: true });
      if (!upErr) {
        const { data: urlData } = sb.storage
          .from("reels")
          .getPublicUrl(filename);
        videoUrl = urlData.publicUrl;
      } else {
        req.log.warn({ err: upErr.message }, "Reel storage upload error");
      }
    } catch (err) {
      req.log.warn({ err }, "Reel storage upload failed");
    }
  }

  if (thumbnailBase64) {
    try {
      const thumbFilename = `${userId}/thumb_${Date.now()}.jpg`;
      const thumbBuffer = Buffer.from(thumbnailBase64, "base64");
      const { error: thumbErr } = await sb.storage
        .from("reels")
        .upload(thumbFilename, thumbBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (!thumbErr) {
        const { data: thumbUrl } = sb.storage
          .from("reels")
          .getPublicUrl(thumbFilename);
        thumbnailUrl = thumbUrl.publicUrl;
      }
    } catch {}
  }

  const { data, error } = await sb
    .from("reels")
    .insert({
      user_id: userId,
      video_url: videoUrl ?? "",
      thumbnail_url: thumbnailUrl ?? null,
      caption,
      hashtags: extractHashtags(caption),
      duration: duration ?? null,
      is_public: true,
      likes_count: 0,
      comments_count: 0,
      views_count: 0,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    req.log.error({ err: error.message }, "Reel insert failed");
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({
    id: (data as { id: string }).id,
    videoUrl: videoUrl ?? "",
    thumbnailUrl: thumbnailUrl ?? null,
  });
});

export default router;
