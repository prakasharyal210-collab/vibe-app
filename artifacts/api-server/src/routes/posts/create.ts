import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url =
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
    "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// GET /api/posts/user/:userId — fetch profile posts + reels bypassing RLS
router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  const [postsRes, reelsRes] = await Promise.allSettled([
    sb.from("posts").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    sb.from("reels").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  res.json({
    posts: postsRes.status === "fulfilled" ? (postsRes.value.data ?? []) : [],
    reels: reelsRes.status === "fulfilled" ? (reelsRes.value.data ?? []) : [],
  });
});

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
      filterId?: string;
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
  // Only include columns guaranteed to exist in the schema
  const payload: Record<string, unknown> = {
    user_id: userId,
    media_url: mediaUrl ?? "",
    caption,
    likes_count: 0,
    comments_count: 0,
    views_count: 0,
    created_at: new Date().toISOString(),
    ...(options.filterId ? { filter_id: options.filterId } : {}),
    ...(options.location ? { location: options.location } : {}),
  };

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
