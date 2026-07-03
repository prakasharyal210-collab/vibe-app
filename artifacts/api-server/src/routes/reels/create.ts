import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { checkVideoContent, checkCaptionText, logRejection } from "../../utils/contentModeration";

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
    originalSoundPostId,
    originalSoundUsername,
    coupleId,
    isCouplePost,
  } = req.body as {
    userId: string;
    videoBase64?: string;
    thumbnailBase64?: string;
    mimeType?: string;
    ext?: string;
    caption?: string;
    duration?: number;
    visibility?: string;
    originalSoundPostId?: string | null;
    originalSoundUsername?: string | null;
    coupleId?: string;
    isCouplePost?: boolean;
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

  // Validate couple link — only include if the user is actually part of the couple
  let validatedCoupleId: string | null = null;
  if (isCouplePost && coupleId) {
    try {
      const { data: link } = await sb
        .from("couple_links")
        .select("id")
        .eq("id", coupleId)
        .eq("status", "accepted")
        .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
        .maybeSingle();
      if (link) validatedCoupleId = coupleId;
    } catch {}
  }

  const ts = Date.now();
  let videoUrl: string | null = null;
  let thumbnailUrl: string | null = null;
  let uploadedVideoFilename: string | null = null;
  let uploadedThumbFilename: string | null = null;

  // Upload video — stored under {userId}/{timestamp}.{ext} in the `reels` bucket
  if (videoBase64) {
    try {
      const filename = `${userId}/${ts}.${ext}`;
      uploadedVideoFilename = filename;
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
      uploadedThumbFilename = thumbFilename;
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

  // ── Layer 1: Video content scan (Sightengine) ─────────────────────────────
  if (videoUrl) {
    const scanResult = await checkVideoContent(videoUrl);
    if (!scanResult.safe) {
      const toRemove = [uploadedVideoFilename, uploadedThumbFilename].filter(Boolean) as string[];
      if (toRemove.length) void sb.storage.from("reels").remove(toRemove);
      void logRejection(userId, videoUrl, "video", scanResult.reason, scanResult.scores);
      res.status(400).json({ error: "This content violates Gundruk's community guidelines" });
      return;
    }
  }

  // ── Layer 2: Caption text moderation (keyword + Perspective API) ──────────
  if (caption) {
    const captionResult = await checkCaptionText(caption);
    if (!captionResult.safe) {
      const toRemove = [uploadedVideoFilename, uploadedThumbFilename].filter(Boolean) as string[];
      if (toRemove.length) void sb.storage.from("reels").remove(toRemove);
      void logRejection(userId, null, "caption", captionResult.reason);
      res.status(400).json({ error: "Your caption contains content that violates our community guidelines" });
      return;
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
    ...(originalSoundPostId ? { original_sound_post_id: originalSoundPostId } : {}),
    ...(originalSoundUsername ? { original_sound_username: originalSoundUsername } : {}),
    ...(validatedCoupleId ? { couple_id: validatedCoupleId, is_couple_post: true } : {}),
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
  // Graceful fallback: if sound columns haven't been migrated yet, retry without them
  if (error?.message?.includes("original_sound")) {
    const payloadNoSound = { ...reelPayload };
    delete payloadNoSound.original_sound_post_id;
    delete payloadNoSound.original_sound_username;
    const rr3 = await sb.from("reels").insert(payloadNoSound).select("id").single();
    data = rr3.data;
    error = rr3.error;
  }
  // Graceful fallback: if couple columns not yet added
  if (error?.message?.includes("couple_id") || error?.message?.includes("is_couple_post")) {
    const payloadNoCouple = { ...reelPayload };
    delete payloadNoCouple.couple_id;
    delete payloadNoCouple.is_couple_post;
    const rr4 = await sb.from("reels").insert(payloadNoCouple).select("id").single();
    data = rr4.data;
    error = rr4.error;
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
