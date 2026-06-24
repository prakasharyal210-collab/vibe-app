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

// GET /api/users/check-username?username=<name>&excludeUserId=<uuid>
// Returns { available: true } or { available: false, reason?: "invalid_format" }
router.get("/check-username", async (req, res) => {
  const raw = ((req.query["username"] as string) ?? "").trim();
  const excludeUserId = (req.query["excludeUserId"] as string | undefined)?.trim() || undefined;

  const FORMAT_RE = /^[a-zA-Z0-9_]{3,20}$/;
  if (!FORMAT_RE.test(raw)) {
    res.json({ available: false, reason: "invalid_format" });
    return;
  }

  const sb = makeSupabase();
  try {
    const base = sb.from("profiles").select("id").ilike("username", raw);
    const { data } = excludeUserId
      ? await base.neq("id", excludeUserId).maybeSingle()
      : await base.maybeSingle();
    res.json({ available: !data });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "check-username error");
    res.status(500).json({ error: "Check failed" });
  }
});

// GET /api/users/search?q=<query>&limit=20
router.get("/search", async (req, res) => {
  const q = ((req.query["q"] as string) ?? "").trim();
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const sb = makeSupabase();

  try {
    let query = sb
      .from("profiles")
      .select("id, username, full_name, bio, avatar_url, followers_count, is_verified, is_private")
      .order("followers_count", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ profiles: data ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: "Search failed" });
  }
});

// GET /api/users/profile/:username?viewer_id=<uuid>
// lookup profile by username with live stats; returns 404 if blocked in either direction
router.get("/profile/:username", async (req, res) => {
  const { username } = req.params;
  if (!username) { res.status(400).json({ error: "username required" }); return; }
  const viewerId = (req.query["viewer_id"] as string | undefined)?.trim() || undefined;
  const sb = makeSupabase();

  req.log.info({ username }, "profile lookup");

  // PROFILE_COLS_FULL includes columns added by optional migrations (vibe_status, relationship_status,
  // display_name). If those migrations have not been run yet, PostgREST returns a 42703 "column does
  // not exist" error. We fall back to PROFILE_COLS_BASE so the route never returns 500 for a profile
  // that actually exists — the mobile app would otherwise show "User not found".
  const PROFILE_COLS_FULL = "id, username, display_name, full_name, bio, avatar_url, cover_url, location, website, is_verified, is_private, vibe_status, relationship_status, zodiac_sign";
  const PROFILE_COLS_BASE = "id, username, full_name, bio, avatar_url, cover_url, location, website, is_verified, is_private";

  try {
    let selectCols = PROFILE_COLS_FULL;

    // Try exact match first, then fall back to case-insensitive match.
    // ilike without wildcards is equivalent to LOWER(col) = LOWER(val).
    // Use `any` so we can reassign after the migration-fallback block without TS complaining.
    let profile: any = null;
    let queryError: any = null;

    { const r = await sb.from("profiles").select(selectCols).eq("username", username).maybeSingle();
      profile = r.data; queryError = r.error; }

    // If a column is missing (migration not yet run) downgrade to the safe base column set and retry.
    if (queryError && (queryError.code === "42703" || String(queryError.message).includes("column"))) {
      selectCols = PROFILE_COLS_BASE;
      req.log.warn({ error: queryError.message }, "profile lookup: optional column missing, retrying with base cols");
      const r2 = await sb.from("profiles").select(selectCols).eq("username", username).maybeSingle();
      if (r2.error) {
        req.log.warn({ error: r2.error.message }, "profile lookup error (base fallback)");
        res.status(500).json({ error: r2.error.message });
        return;
      }
      profile = r2.data;
      queryError = null;
    }

    if (queryError) {
      req.log.warn({ error: queryError.message }, "profile lookup error");
      res.status(500).json({ error: queryError.message });
      return;
    }

    // If exact match found nothing, try case-insensitive (handles "Haceriz" → "haceriz")
    if (!profile) {
      const r3 = await sb.from("profiles").select(selectCols).ilike("username", username).maybeSingle();
      if (!r3.error && r3.data) {
        profile = r3.data as any;
        req.log.info({ username, matched: (r3.data as any).username }, "profile lookup: case-insensitive fallback matched");
      }
    }

    if (!profile) {
      req.log.info({ username }, "profile lookup: not found");
      res.status(404).json({ error: "not found" });
      return;
    }

    // Block visibility check — return 404 if either party has blocked the other
    if (viewerId && viewerId !== profile.id) {
      const [b1, b2] = await Promise.all([
        sb.from("blocks").select("id").eq("blocker_id", viewerId).eq("blocked_id", profile.id).maybeSingle(),
        sb.from("blocks").select("id").eq("blocker_id", profile.id).eq("blocked_id", viewerId).maybeSingle(),
      ]);
      if (b1.data || b2.data) {
        res.status(404).json({ error: "not found" });
        return;
      }
    }

    // Live COUNT queries run in parallel — not stale cached columns
    const [postsRes, reelsRes, followersRes, followingRes] = await Promise.allSettled([
      sb.from("posts").select("*", { count: "exact", head: true }).eq("user_id", profile.id),
      sb.from("reels").select("*", { count: "exact", head: true }).eq("user_id", profile.id),
      sb.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile.id),
      sb.from("follows").select("follower_id", { count: "exact", head: true }).eq("follower_id", profile.id),
    ]);

    const posts_count =
      (postsRes.status === "fulfilled" ? (postsRes.value.count ?? 0) : 0) +
      (reelsRes.status === "fulfilled" ? (reelsRes.value.count ?? 0) : 0);
    const followers_count = followersRes.status === "fulfilled" ? (followersRes.value.count ?? 0) : 0;
    const following_count = followingRes.status === "fulfilled" ? (followingRes.value.count ?? 0) : 0;

    res.json({
      profile: {
        ...profile,
        posts_count,
        followers_count,
        following_count,
      },
    });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "profile lookup exception");
    res.status(500).json({ error: "Profile lookup failed" });
  }
});

// PATCH /api/users/profile/:userId
// Updates mutable profile fields (uses service-role key to bypass RLS)
const VALID_STATUSES = [
  "Single", "In a Relationship", "Married", "Engaged",
  "It's Complicated", "Open Relationship", "Divorced", "Widowed",
];

// GET /api/users/profile/by-id/:userId — load own profile for edit-profile screen
// (avoids direct Supabase client calls which hang under RLS + anon key)
router.get("/profile/by-id/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("profiles")
      .select("id, username, full_name, bio, avatar_url, cover_url, location, website, pronouns, is_verified, is_private, vibe_status, relationship_status, zodiac_sign")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      // Optional columns may not exist yet — fall back to base set
      if (error.code === "42703" || String(error.message).includes("column")) {
        const { data: base, error: baseErr } = await sb
          .from("profiles")
          .select("id, username, full_name, bio, avatar_url, cover_url, location, website, pronouns, is_verified, is_private")
          .eq("id", userId)
          .maybeSingle();
        if (baseErr) { res.status(500).json({ error: baseErr.message }); return; }
        if (!base) { res.status(404).json({ error: "not found" }); return; }
        res.json({ profile: base });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) { res.status(404).json({ error: "not found" }); return; }
    res.json({ profile: data });
  } catch (e: any) {
    req.log.error({ err: e?.message }, "profile by-id error");
    res.status(500).json({ error: "Profile load failed" });
  }
});

router.patch("/profile/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const {
    relationship_status,
    bio, full_name, display_name, website, location, pronouns, vibe_status,
    username, avatar_url, zodiac_sign,
  } = req.body as Record<string, string | null | undefined>;

  if (
    relationship_status !== undefined &&
    relationship_status !== null &&
    !VALID_STATUSES.includes(relationship_status)
  ) {
    res.status(400).json({ error: "invalid relationship_status" });
    return;
  }

  const updates: Record<string, string | null> = {};
  if (relationship_status !== undefined) updates.relationship_status = relationship_status;
  if (bio !== undefined) updates.bio = bio;
  if (full_name !== undefined) updates.full_name = full_name;
  if (display_name !== undefined) updates.display_name = display_name;
  if (website !== undefined) updates.website = website;
  if (location !== undefined) updates.location = location;
  if (pronouns !== undefined) updates.pronouns = pronouns;
  if (vibe_status !== undefined) updates.vibe_status = vibe_status;
  if (username !== undefined) updates.username = username;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (zodiac_sign !== undefined) updates.zodiac_sign = zodiac_sign;

  if (Object.keys(updates).length === 0) { res.json({ ok: true }); return; }

  const sb = makeSupabase();
  try {
    const { error } = await sb.from("profiles").update(updates).eq("id", userId);
    if (error) {
      if (error.code === "23505" || String(error.message).includes("profiles_username_key")) {
        res.status(409).json({ error: "username_taken" });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  } catch (e: any) {
    req.log.error({ err: e?.message }, "profile patch error");
    res.status(500).json({ error: "Profile update failed" });
  }
});

export default router;
