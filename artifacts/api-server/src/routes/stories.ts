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
//         mediaUrl?, imageBase64?, mimeType?, ext?, audience? }
// audience values: "Everyone" | "Close Friends" | "Friends" | "Followers" | "Only Me"
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
    audience,
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
    audience?: string;
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

  // Normalise audience value — map UI labels to DB values
  const audienceMap: Record<string, string> = {
    "Close Friends": "close_friends",
    "Everyone": "everyone",
    "Friends": "friends",
    "Followers": "followers",
    "Only Me": "only_me",
  };
  const audienceDb = (audience && audienceMap[audience]) ? audienceMap[audience] : "everyone";

  const { data, error } = await supabase
    .from("stories")
    .insert({
      user_id: userId,
      media_url: finalMediaUrl,
      caption: caption ?? null,
      bg_gradient: bgGradient ?? null,
      text_content: textContent ?? null,
      story_type: storyType ?? "text",
      audience: audienceDb,
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
// query: { userId }  — own story + stories from followed accounts
// Applies three filters:
//   1. Excludes stories from muted users
//   2. Excludes "close_friends" stories unless the viewer is in the author's close friends list
//   3. Excludes "only_me" stories from other users
router.get("/", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const supabase = makeSupabase();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch follow list, muted list, and close-friend-of list in parallel
  const [followingRes, mutedRes, cfRes] = await Promise.allSettled([
    supabase.from("follows").select("following_id").eq("follower_id", userId),
    supabase.from("muted_users").select("muted_id").eq("muter_id", userId),
    // "close-friend-of": users who have added ME as their close friend
    supabase.from("close_friends").select("user_id").eq("friend_id", userId),
  ]);

  const followingIds = followingRes.status === "fulfilled"
    ? (followingRes.value.data ?? []).map((f: any) => f.following_id as string)
    : [];
  const mutedSet = new Set<string>(
    mutedRes.status === "fulfilled"
      ? (mutedRes.value.data ?? []).map((r: any) => r.muted_id as string)
      : []
  );
  // Authors who have added the viewer as a close friend — viewer can see their close-friends stories
  const cfAuthorIds = new Set<string>(
    cfRes.status === "fulfilled"
      ? (cfRes.value.data ?? []).map((r: any) => r.user_id as string)
      : []
  );
  // Always include yourself for all audience types
  cfAuthorIds.add(userId);

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

  // Apply audience + mute filters
  let stories = (storiesData ?? []).filter((s: any) => {
    if (s.user_id === userId) return true;
    if (mutedSet.has(s.user_id)) return false;
    if (s.audience === "only_me") return false;
    if (s.audience === "close_friends" && !cfAuthorIds.has(s.user_id)) return false;
    return true;
  });

  // Enforce story_permission: authors with "friends" setting are only visible
  // to users who follow them (ensures correctness even for profile-view callers).
  const nonSelfAuthorIds = [...new Set(
    stories.map((s: any) => s.user_id as string).filter((id) => id !== userId)
  )];
  if (nonSelfAuthorIds.length > 0) {
    const { data: permRows } = await supabase
      .from("user_settings")
      .select("user_id, story_permission")
      .in("user_id", nonSelfAuthorIds);
    const storyPermMap = new Map<string, string>(
      (permRows ?? []).map((r: any) => [r.user_id as string, r.story_permission as string])
    );
    const followingSet = new Set(followingIds);
    stories = stories.filter((s: any) => {
      if (s.user_id === userId) return true;
      const perm = storyPermMap.get(s.user_id) ?? "everyone";
      if (perm === "friends") return followingSet.has(s.user_id);
      return true;
    });
  }

  res.json({ stories });
});

// ─── GET /api/stories/check ───────────────────────────────────────────────────
// query: { userId }  — lightweight own-story existence check (no follows lookup)
// Returns: { exists: boolean, storyId?, storyType?, textContent?, bgGradient?, caption? }
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

// ─── POST /api/stories/:storyId/react ─────────────────────────────────────────
// body: { userId, emoji }
// Upserts one reaction per viewer per story (latest emoji wins).
router.post("/:storyId/react", async (req, res) => {
  const { storyId } = req.params;
  const { userId, emoji } = req.body as { userId?: string; emoji?: string };

  if (!userId || !emoji || !storyId) {
    res.status(400).json({ error: "userId, emoji, and storyId are required" });
    return;
  }

  const supabase = makeSupabase();
  const { error } = await supabase
    .from("story_reactions")
    .upsert(
      { story_id: storyId, user_id: userId, emoji, created_at: new Date().toISOString() },
      { onConflict: "story_id,user_id" }
    );

  if (error) {
    req.log.error({ err: error }, "failed to upsert story reaction");
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// ─── GET /api/stories/:storyId/reactions ──────────────────────────────────────
// query: { userId }  — only accessible to the story owner
router.get("/:storyId/reactions", async (req, res) => {
  const { storyId } = req.params;
  const userId = req.query["userId"] as string | undefined;

  if (!userId || !storyId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const supabase = makeSupabase();

  const { data: storyRow } = await supabase
    .from("stories")
    .select("user_id")
    .eq("id", storyId)
    .single();

  if (!storyRow || storyRow.user_id !== userId) {
    res.status(403).json({ error: "Not the story owner" });
    return;
  }

  const { data, error } = await supabase
    .from("story_reactions")
    .select("id, emoji, created_at, profiles:user_id(id, username, avatar_url)")
    .eq("story_id", storyId)
    .order("created_at", { ascending: false });

  if (error) {
    req.log.error({ err: error }, "failed to fetch story reactions");
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ reactions: data ?? [] });
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
