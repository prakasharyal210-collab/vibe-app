import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "../../lib/sendPush";

const router = Router();

function makeSupabase() {
  const url =
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
    "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// POST /api/users/setup
// Idempotent: creates profile + wallet + user_settings + vibe_scores rows
// for a newly registered user. Uses service-role key so it works even before
// the client's auth session is fully propagated.
router.post("/setup", async (req, res) => {
  const { userId, username, email } = req.body as {
    userId?: string;
    username?: string;
    email?: string;
  };
  if (!userId || !username) {
    res.status(400).json({ error: "userId and username required" });
    return;
  }
  const sb = makeSupabase();

  // Step 1: Run all upserts in parallel — each is idempotent (only inserts if missing).
  // ignoreDuplicates: true prevents overwriting user-editable data (bio, avatar, etc.) on
  // every re-login. The profiles upsert handles the case where NO row exists yet.
  const results = await Promise.allSettled([
    sb
      .from("profiles")
      .upsert(
        { id: userId, username, show_in_matching: true },
        { onConflict: "id", ignoreDuplicates: true }
      ),
    sb
      .from("wallet")
      .upsert(
        { user_id: userId, coins: 100, total_earnings: 0 },
        { onConflict: "user_id", ignoreDuplicates: true }
      ),
    sb
      .from("user_settings")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true }),
    sb
      .from("vibe_scores")
      .upsert(
        { user_id: userId, score: 100, level: 1 },
        { onConflict: "user_id", ignoreDuplicates: true }
      ),
  ]);

  const errors = results
    .filter((r) => r.status === "rejected")
    .map((r) => (r as PromiseRejectedResult).reason?.message ?? "unknown");

  if (errors.length) {
    req.log.warn({ errors }, "some setup upserts failed (non-fatal)");
  }

  // Step 2: If a Supabase trigger (on_auth_user_created) already created the profiles row
  // with just `id` and no username, the upsert above did nothing (ignoreDuplicates).
  // Fix it: update the row only where username is still null — safe to call on every login
  // because the WHERE clause is a no-op once username is set.
  const { error: fixErr } = await sb
    .from("profiles")
    .update({ username, show_in_matching: true })
    .eq("id", userId)
    .is("username", null);

  if (fixErr) {
    req.log.warn({ err: fixErr.message }, "profile username fix-up failed (non-fatal)");
  }

  res.json({ ok: true });
});

// PATCH /api/users/profile
// Update profile columns (show_in_matching, find_gundruk_mode, vibe_request_privacy, etc.)
// Body: { userId: string, ...profilePatch }
router.patch("/profile", async (req, res) => {
  const { userId, ...patch } = req.body as { userId?: string; [key: string]: unknown };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  // Strip any keys that shouldn't be user-patchable
  const ALLOWED_PROFILE_KEYS = new Set([
    "show_in_matching",
    "find_gundruk_mode",
    "vibe_request_privacy",
    "vibe_goal_filter",
    "display_name",
    "bio",
    "avatar_url",
    "website",
    "location",
    // Find Vibe Settings hub — new fields
    "vibe_bio",
    "vibe_photos",
    "vibe_filter_min_photos",
    "vibe_filter_requires_bio",
    "vibe_zodiac",
    "vibe_education",
    "vibe_family_plans",
    "vibe_communication",
    "vibe_love_style",
    "vibe_pets",
    "vibe_drinking",
    "vibe_smoking",
    "vibe_cannabis",
    "vibe_workout",
    "vibe_social_media",
    "vibe_open_to",
    "vibe_languages",
    "relationship_goals",
    "vibe_profile_photo_url",
  ]);
  const safe = Object.fromEntries(
    Object.entries(patch).filter(([k]) => ALLOWED_PROFILE_KEYS.has(k))
  );
  if (Object.keys(safe).length === 0) {
    res.status(400).json({ error: "No valid profile fields provided" });
    return;
  }
  const sb = makeSupabase();
  const { error } = await sb.from("profiles").update(safe).eq("id", userId);
  if (error) {
    req.log.error({ err: error.message }, "profile patch error");
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

// PATCH /api/users/settings
// Upsert user_settings columns (vibe_age_min/max, vibe_max_distance_km, etc.)
// Body: { userId: string, ...settingsPatch }
router.patch("/settings", async (req, res) => {
  const { userId, ...patch } = req.body as { userId?: string; [key: string]: unknown };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const ALLOWED_SETTINGS_KEYS = new Set([
    "vibe_age_min",
    "vibe_age_max",
    "vibe_max_distance_km",
    "vibe_show_distance",
    "vibe_exclude_connections",
    "comment_permission",
    "message_permission",
    "duet_permission",
    "liked_private",
    "saved_private",
  ]);
  const safe = Object.fromEntries(
    Object.entries(patch).filter(([k]) => ALLOWED_SETTINGS_KEYS.has(k))
  );
  if (Object.keys(safe).length === 0) {
    res.status(400).json({ error: "No valid settings fields provided" });
    return;
  }
  const sb = makeSupabase();
  const { error } = await sb
    .from("user_settings")
    .upsert(
      { user_id: userId, ...safe, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) {
    req.log.error({ err: error.message }, "settings patch error");
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

// POST /api/users/push-token
// Store (or update) a device's Expo push token for the given user.
router.post("/push-token", async (req, res) => {
  const { userId, token } = req.body as { userId?: string; token?: string };
  if (!userId || !token) {
    res.status(400).json({ error: "userId and token required" });
    return;
  }
  const sb = makeSupabase();
  try {
    await sb.from("profiles").update({ push_token: token }).eq("id", userId);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "push-token save error");
    res.status(500).json({ error: "Failed to save token" });
  }
});

// GET /api/users/vibe-profile/:userId
// Returns the Find Vibe profile fields for a user using the service-role key
// (bypasses RLS so the mobile client always gets the real saved values).
// NOTE: cannot use /profile/:userId — search.ts owns that path (looks up by username).
router.get("/vibe-profile/:userId", async (req, res) => {
  const { userId } = req.params as { userId: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  const { data, error } = await sb
    .from("profiles")
    .select([
      "show_in_matching","find_gundruk_mode","vibe_request_privacy","vibe_goal_filter",
      "vibe_bio","vibe_photos","vibe_profile_photo_url","vibe_filter_min_photos","vibe_filter_requires_bio",
      "vibe_zodiac","vibe_education","vibe_family_plans","vibe_communication",
      "vibe_love_style","vibe_pets","vibe_drinking","vibe_smoking","vibe_cannabis",
      "vibe_workout","vibe_social_media","vibe_open_to","vibe_languages",
      "relationship_goals",
    ].join(","))
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    req.log.error({ err: error.message }, "get profile error");
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ profile: data ?? null });
});

// GET /api/users/settings/:userId
// Returns the full user_settings row using the service-role key (bypasses RLS).
router.get("/settings/:userId", async (req, res) => {
  const { userId } = req.params as { userId: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  const { data, error } = await sb
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    req.log.error({ err: error.message }, "get settings error");
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ settings: data ?? null });
});

// GET /api/users/stats?userId=
// Returns live posts / followers / following counts via COUNT(*) with service-role key.
// Called from the profile screen instead of relying on denormalized counter columns
// (which are never maintained) or a username-based lookup (which requires a valid username).
router.get("/stats", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const [postsRes, reelsRes, followersRes, followingRes, postSumsRes] = await Promise.allSettled([
      sb.from("posts").select("*", { count: "exact", head: true }).eq("user_id", userId),
      sb.from("reels").select("*", { count: "exact", head: true }).eq("user_id", userId),
      sb.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", userId),
      sb.from("follows").select("follower_id", { count: "exact", head: true }).eq("follower_id", userId),
      // SUM(likes_count) + SUM(views_count) across ALL user's posts — used for profile stats panel.
      // Selects only the two integer columns so the payload is minimal even for large accounts.
      sb.from("posts").select("likes_count, views_count").eq("user_id", userId),
    ]);

    if (postsRes.status === "rejected") req.log.error({ err: (postsRes as any).reason?.message }, "[profile-stats] posts COUNT failed");
    if (reelsRes.status === "rejected") req.log.error({ err: (reelsRes as any).reason?.message }, "[profile-stats] reels COUNT failed");
    if (followersRes.status === "rejected") req.log.error({ err: (followersRes as any).reason?.message }, "[profile-stats] followers COUNT failed");
    if (followingRes.status === "rejected") req.log.error({ err: (followingRes as any).reason?.message }, "[profile-stats] following COUNT failed");
    if (postSumsRes.status === "rejected") req.log.error({ err: (postSumsRes as any).reason?.message }, "[profile-stats] post sums failed");

    const posts_count =
      (postsRes.status === "fulfilled" ? (postsRes.value.count ?? 0) : 0) +
      (reelsRes.status === "fulfilled" ? (reelsRes.value.count ?? 0) : 0);
    const followers_count = followersRes.status === "fulfilled" ? (followersRes.value.count ?? 0) : 0;
    const following_count = followingRes.status === "fulfilled" ? (followingRes.value.count ?? 0) : 0;

    const postSumsData: { likes_count: number | null; views_count: number | null }[] =
      postSumsRes.status === "fulfilled" ? ((postSumsRes.value.data as any) ?? []) : [];
    const total_likes = postSumsData.reduce((s, p) => s + (p.likes_count ?? 0), 0);
    const total_views = postSumsData.reduce((s, p) => s + (p.views_count ?? 0), 0);

    res.json({ posts_count, followers_count, following_count, total_likes, total_views });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "[profile-stats] exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/users/photos?userId=...
// Returns the list of media URLs from the user's posts plus their avatar.
// Used by the Find Vibe Settings photo picker so users can select which
// existing photos to show on their match card (no re-upload needed).
router.get("/photos", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const [postsRes, profileRes] = await Promise.all([
      sb
        .from("posts")
        .select("media_url")
        .eq("user_id", userId)
        .not("media_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(30),
      sb.from("profiles").select("avatar_url").eq("id", userId).maybeSingle(),
    ]);

    const photos: string[] = [];
    const avatar = (profileRes.data as any)?.avatar_url as string | undefined;
    if (avatar) photos.push(avatar);

    for (const row of (postsRes.data ?? []) as any[]) {
      const url = row.media_url as string | null;
      if (url && !photos.includes(url)) photos.push(url);
    }

    res.json({ photos });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "users/photos: query error");
    res.status(500).json({ error: "Failed to fetch photos" });
  }
});

export default router;
