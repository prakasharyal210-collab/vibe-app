import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

router.post("/create", async (req, res) => {
  const {
    userId,
    imageBase64,
    mimeType = "image/jpeg",
    ext = "jpg",
    caption = "",
    options = {},
  } = req.body as {
    userId: string;
    imageBase64?: string;
    mimeType?: string;
    ext?: string;
    caption?: string;
    options?: {
      location?: string;
      taggedUsers?: string[];
      commentsEnabled?: boolean;
      downloadsEnabled?: boolean;
    };
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

  let mediaUrl: string | null = null;

  // Upload image to storage if base64 provided
  if (imageBase64) {
    try {
      const filename = `${userId}/${Date.now()}.${ext}`;
      const buffer = Buffer.from(imageBase64, "base64");
      const { error: upErr } = await sb.storage
        .from("posts")
        .upload(filename, buffer, { contentType: mimeType, upsert: true });
      if (!upErr) {
        const { data: urlData } = sb.storage
          .from("posts")
          .getPublicUrl(filename);
        mediaUrl = urlData.publicUrl;
      } else {
        req.log.warn({ err: upErr.message }, "Storage upload error");
      }
    } catch (err) {
      req.log.warn({ err }, "Storage upload failed");
    }
  }

  // Insert post record (service role bypasses RLS)
  const payload: Record<string, unknown> = {
    user_id: userId,
    media_url: mediaUrl ?? "",
    caption,
    likes_count: 0,
    comments_count: 0,
    views_count: 0,
    created_at: new Date().toISOString(),
  };
  if (options.location) payload.location = options.location;
  if (options.commentsEnabled !== undefined)
    payload.comments_enabled = options.commentsEnabled;
  if (options.downloadsEnabled !== undefined)
    payload.downloads_enabled = options.downloadsEnabled;

  const { data, error } = await sb
    .from("posts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    req.log.error({ err: error.message }, "Post insert failed");
    res.status(500).json({ error: error.message });
    return;
  }

  const postId = (data as { id: string }).id;

  // Save tagged users (fire-and-forget)
  if (options.taggedUsers?.length) {
    sb.from("post_tags")
      .insert(
        options.taggedUsers.map((uid) => ({
          post_id: postId,
          tagged_user_id: uid,
          tagged_by: userId,
        })),
      )
      .then(() => {}, () => {});
  }

  res.json({ id: postId, mediaUrl: mediaUrl ?? "" });
});

export default router;
