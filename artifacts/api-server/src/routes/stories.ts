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

// ─── POST /api/stories/:storyId/view ──────────────────────────────────────────
// body: { userId }
// Upserts a view row — repeated opens update viewed_at but don't add duplicates.
// Story owners viewing their own story are not blocked here; the mobile client
// already skips the call for isOwn stories.
router.post("/:storyId/view", async (req, res) => {
  const { storyId } = req.params;
  const { userId } = req.body as { userId?: string };

  if (!userId || !storyId) {
    res.status(400).json({ error: "userId and storyId are required" });
    return;
  }

  const supabase = makeSupabase();
  const { error } = await supabase
    .from("story_views")
    .upsert(
      { story_id: storyId, viewer_id: userId, viewed_at: new Date().toISOString() },
      { onConflict: "story_id,viewer_id" }
    );

  if (error) {
    req.log.error({ err: error }, "failed to record story view");
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// ─── GET /api/stories/:storyId/insights ───────────────────────────────────────
// query: { userId }  — only accessible to the story owner.
// Returns viewers merged with their reaction emoji (if any).
router.get("/:storyId/insights", async (req, res) => {
  const { storyId } = req.params;
  const userId = req.query["userId"] as string | undefined;

  if (!userId || !storyId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const supabase = makeSupabase();

  // Verify ownership
  const { data: storyRow } = await supabase
    .from("stories")
    .select("user_id")
    .eq("id", storyId)
    .single();

  if (!storyRow || storyRow.user_id !== userId) {
    res.status(403).json({ error: "Not the story owner" });
    return;
  }

  // Fetch views and reactions in parallel
  const [viewsRes, reactionsRes] = await Promise.all([
    supabase
      .from("story_views")
      .select("viewer_id, viewed_at, profiles:viewer_id(id, username, avatar_url)")
      .eq("story_id", storyId)
      .order("viewed_at", { ascending: false }),
    supabase
      .from("story_reactions")
      .select("user_id, emoji")
      .eq("story_id", storyId),
  ]);

  if (viewsRes.error) {
    req.log.error({ err: viewsRes.error }, "failed to fetch story views");
    res.status(500).json({ error: viewsRes.error.message });
    return;
  }

  // Build reaction lookup: viewer_id → emoji
  const reactionMap = new Map<string, string>(
    (reactionsRes.data ?? []).map((r: any) => [r.user_id as string, r.emoji as string])
  );

  const viewers = (viewsRes.data ?? []).map((v: any) => ({
    viewer_id:  v.viewer_id as string,
    viewed_at:  v.viewed_at as string,
    username:   (v.profiles as any)?.username   ?? null,
    avatar_url: (v.profiles as any)?.avatar_url ?? null,
    reaction:   reactionMap.get(v.viewer_id as string) ?? null,
  }));

  res.json({
    viewers,
    view_count:     viewers.length,
    reaction_count: reactionMap.size,
  });
});

// ─── DELETE /api/stories/:storyId ─────────────────────────────────────────────
// GET /api/stories/active-user-ids
// Returns user_ids that have active (non-expired) stories excluding the caller.
router.get("/active-user-ids", async (req, res) => {
  const { userId, since } = req.query as { userId?: string; since?: string };
  const expiry = since ?? new Date().toISOString();
  const supabase = makeSupabase();
  try {
    let q = supabase.from("stories").select("user_id").gt("expires_at", expiry);
    if (userId) q = q.neq("user_id", userId);
    const { data } = await q;
    const userIds = [...new Set((data ?? []).map((s: any) => s.user_id as string))];
    res.json({ userIds });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "stories/active-user-ids error");
    res.json({ userIds: [] });
  }
});

// GET /api/stories/my?userId=
// Returns the user's own stories for the highlight picker.
router.get("/my", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.json({ stories: [] }); return; }
  const supabase = makeSupabase();
  try {
    const { data } = await supabase
      .from("stories")
      .select("id, media_url, caption, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    res.json({ stories: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "stories/my error");
    res.json({ stories: [] });
  }
});

// ── Story Highlights ──────────────────────────────────────────────────────────

// GET /api/stories/highlights?userId=
router.get("/highlights", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.json({ highlights: [] }); return; }
  const supabase = makeSupabase();
  try {
    const { data, error } = await supabase
      .from("story_highlights")
      .select("id, user_id, title, cover_url, stories_count, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ highlights: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "stories/highlights get error");
    res.json({ highlights: [] });
  }
});

// POST /api/stories/highlights
// body: { userId, title, coverUrl }
router.post("/highlights", async (req, res) => {
  const { userId, title, coverUrl } = req.body as { userId?: string; title?: string; coverUrl?: string };
  if (!userId || !title) { res.status(400).json({ error: "userId and title required" }); return; }
  const supabase = makeSupabase();
  try {
    const { data, error } = await supabase
      .from("story_highlights")
      .insert({ user_id: userId, title, cover_url: coverUrl ?? null })
      .select("id, user_id, title, cover_url, stories_count, created_at")
      .single();
    if (error) throw error;
    res.json({ highlight: data });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "stories/highlights post error");
    res.status(500).json({ error: "Failed to create highlight" });
  }
});

// DELETE /api/stories/highlights/:id
router.delete("/highlights/:id", async (req, res) => {
  const { id } = req.params;
  const supabase = makeSupabase();
  try {
    const { error } = await supabase.from("story_highlights").delete().eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "stories/highlights delete error");
    res.status(500).json({ error: "Failed to delete highlight" });
  }
});

// GET /api/stories/highlights/:id/stories
router.get("/highlights/:id/stories", async (req, res) => {
  const { id } = req.params;
  const supabase = makeSupabase();
  try {
    const { data, error } = await supabase
      .from("highlight_stories")
      .select("story_id, stories(id, media_url, caption, created_at)")
      .eq("highlight_id", id)
      .order("id", { ascending: true });
    if (error) throw error;
    const stories = (data ?? []).map((row: any) => row.stories).filter(Boolean);
    res.json({ stories });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "stories/highlights/:id/stories get error");
    res.json({ stories: [] });
  }
});

// POST /api/stories/highlights/:id/stories
// body: { storyId }
router.post("/highlights/:id/stories", async (req, res) => {
  const { id } = req.params;
  const { storyId } = req.body as { storyId?: string };
  if (!storyId) { res.status(400).json({ error: "storyId required" }); return; }
  const supabase = makeSupabase();
  try {
    const { error } = await supabase
      .from("highlight_stories")
      .upsert({ highlight_id: id, story_id: storyId }, { onConflict: "highlight_id,story_id" });
    res.json({ ok: !error });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "stories/highlights/:id/stories post error");
    res.status(500).json({ error: "Failed to add story to highlight" });
  }
});

// DELETE /api/stories/highlights/:id/stories/:storyId
router.delete("/highlights/:id/stories/:storyId", async (req, res) => {
  const { id, storyId } = req.params;
  const supabase = makeSupabase();
  try {
    const { error } = await supabase
      .from("highlight_stories")
      .delete()
      .eq("highlight_id", id)
      .eq("story_id", storyId);
    res.json({ ok: !error });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "stories/highlights/:id/stories/:storyId delete error");
    res.status(500).json({ error: "Failed to remove story from highlight" });
  }
});

// POST /api/stories/interaction
// body: { storyId, userId, interactionType, response }
router.post("/interaction", async (req, res) => {
  const { storyId, userId, interactionType, response } = req.body as {
    storyId?: string; userId?: string; interactionType?: string; response?: Record<string, unknown>;
  };
  if (!storyId || !userId || !interactionType) {
    res.status(400).json({ error: "storyId, userId, interactionType required" });
    return;
  }
  const supabase = makeSupabase();
  try {
    const { error } = await supabase.from("story_interactions").insert({
      story_id: storyId,
      user_id: userId,
      interaction_type: interactionType,
      response: response ?? {},
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "stories/interaction insert error");
    res.status(500).json({ error: "Failed to save interaction" });
  }
});

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
