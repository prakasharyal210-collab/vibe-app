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
// body: { userId, mediaUrl?, caption?, bgGradient?, textContent?, storyType }
router.post("/", async (req, res) => {
  const { userId, mediaUrl, caption, bgGradient, textContent, storyType } =
    req.body as {
      userId?: string;
      mediaUrl?: string;
      caption?: string;
      bgGradient?: string;
      textContent?: string;
      storyType?: string;
    };

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const supabase = makeSupabase();

  const { data, error } = await supabase
    .from("stories")
    .insert({
      user_id: userId,
      media_url: mediaUrl ?? null,
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

  res.status(201).json({ id: data.id });
});

// ─── GET /api/stories ─────────────────────────────────────────────────────────
// query: { userId }  — returns active stories from mutual follows + own
router.get("/", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const supabase = makeSupabase();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Get mutual followers
  const [{ data: followingData }, { data: followersData }] = await Promise.all([
    supabase.from("follows").select("following_id").eq("follower_id", userId),
    supabase.from("follows").select("follower_id").eq("following_id", userId),
  ]);

  const followingSet = new Set(
    (followingData ?? []).map((f: any) => f.following_id as string)
  );
  const mutualIds = (followersData ?? [])
    .map((f: any) => f.follower_id as string)
    .filter((id) => followingSet.has(id));

  const allIds = [userId, ...mutualIds];

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
