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

// ─── POST /api/stories ────────────────────────────────────────────────────────
// body: { userId, storyType, textContent?, bgGradient?, caption?,
//         mediaUrl?, imageBase64?, mimeType?, ext? }
router.post("/", async (req, res) => {
  const {
    userId,
    mediaUrl,
    caption,
    bgGradient,
    textContent,
    storyType,
    imageBase64,
    mimeType,
    ext,
  } = req.body as {
    userId?: string;
    mediaUrl?: string;
    caption?: string;
    bgGradient?: string;
    textContent?: string;
    storyType?: string;
    imageBase64?: string;
    mimeType?: string;
    ext?: string;
  };

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const supabase = makeSupabase();

  // Upload media to storage if base64 blob provided
  let finalMediaUrl = mediaUrl ?? null;
  if (imageBase64 && mimeType && ext) {
    const filename = `stories/${userId}/${Date.now()}.${ext}`;
    try {
      const buffer = Buffer.from(imageBase64, "base64");
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(filename, buffer, { contentType: mimeType, upsert: true });
      if (!upErr) {
        const { data: urlData } = supabase.storage
          .from("media")
          .getPublicUrl(filename);
        finalMediaUrl = urlData.publicUrl;
      } else {
        req.log.warn({ err: upErr.message }, "story storage upload error");
      }
    } catch (err) {
      req.log.warn({ err }, "story storage upload failed");
    }
  }

  const { data, error } = await supabase
    .from("stories")
    .insert({
      user_id: userId,
      media_url: finalMediaUrl,
      caption: caption ?? null,
      bg_gradient: bgGradient ?? null,
      text_content: textContent ?? null,
      story_type: storyType ?? "text",
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    req.log.error({ err: error }, "failed to create story");
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json({ id: data.id, mediaUrl: finalMediaUrl });
});

// ─── GET /api/stories ─────────────────────────────────────────────────────────
// query: { userId }  — own story + stories from accounts the user follows
router.get("/", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const supabase = makeSupabase();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // One-directional: anyone the current user follows
  const { data: followingData } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  const followingIds = (followingData ?? []).map(
    (f: any) => f.following_id as string,
  );
  const allIds = [userId, ...followingIds];

  const { data: storiesData, error } = await supabase
    .from("stories")
    .select("*, profiles:user_id(id, username, avatar_url)")
    .in("user_id", allIds)
    .gt("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (error) {
    req.log.error({ err: error }, "failed to fetch stories");
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ stories: storiesData ?? [] });
});

// ─── GET /api/stories/check ───────────────────────────────────────────────────
// query: { userId }  — lightweight own-story existence check (no follows lookup)
// Returns: { exists: boolean, storyId?: string, storyType?, textContent?, bgGradient?, caption? }
router.get("/check", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const supabase = makeSupabase();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("stories")
    .select("id, story_type, text_content, bg_gradient, caption")
    .eq("user_id", userId)
    .gt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    res.json({ exists: false });
    return;
  }

  res.json({
    exists: true,
    storyId: data.id,
    storyType: data.story_type ?? undefined,
    textContent: data.text_content ?? undefined,
    bgGradient: data.bg_gradient ?? undefined,
    caption: data.caption ?? undefined,
  });
});

// ─── DELETE /api/stories/:storyId ─────────────────────────────────────────────
router.delete("/:storyId", async (req, res) => {
  const { storyId } = req.params;
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const supabase = makeSupabase();
  const { error } = await supabase
    .from("stories")
    .delete()
    .eq("id", storyId)
    .eq("user_id", userId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

export default router;
