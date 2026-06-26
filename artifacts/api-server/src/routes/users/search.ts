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

type SB = ReturnType<typeof makeSupabase>;

type PartnerInfo = { username: string; full_name: string | null; avatar_url: string | null } | null;

/** Look up the accepted couple partner for a given profile id. Returns null if not linked or on error. */
async function fetchPartner(sb: SB, profileId: string): Promise<PartnerInfo> {
  try {
    const linkQ = await sb
      .from("couple_links")
      .select("requester_id, receiver_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${profileId},receiver_id.eq.${profileId}`)
      .maybeSingle();
    if (!linkQ.data) return null;
    const partnerId =
      linkQ.data.requester_id === profileId
        ? linkQ.data.receiver_id
        : linkQ.data.requester_id;
    const pQ = await sb
      .from("profiles")
      .select("username, full_name, avatar_url")
      .eq("id", partnerId)
      .maybeSingle();
    return pQ.data ?? null;
  } catch {
    return null;
  }
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

  try {
    const sb = makeSupabase();

    // Build the base filter query FIRST, then add transform (order/limit).
    // Calling .or() after .limit() operates on a PostgrestTransformBuilder which
    // does not have .or() — this caused a runtime TypeError on Railway.
    let baseQuery = sb
      .from("profiles")
      .select("id, username, full_name, bio, avatar_url, followers_count, is_verified, is_private");

    if (q) {
      baseQuery = baseQuery.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);
    }

    const { data, error } = await baseQuery
      .order("followers_count", { ascending: false })
      .limit(limit);

    if (error) {
      req.log.error({ err: error.message, q }, "user-search db error");
      res.json({ profiles: [] });
      return;
    }
    res.json({ profiles: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message, q }, "user-search unexpected error");
    res.json({ profiles: [] });
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

  // PROFILE_COLS_FULL includes columns added by optional migrations. If those migrations have not
  // been run yet, PostgREST returns a 42703 "column does not exist" error. We fall back to
  // PROFILE_COLS_BASE so the route never returns 500 for a profile that actually exists.
  const PROFILE_COLS_FULL = "id, username, display_name, full_name, bio, avatar_url, cover_url, location, website, is_verified, is_private, vibe_status, relationship_status, zodiac_sign, pronouns, show_relationship";
  const PROFILE_COLS_BASE = "id, username, full_name, bio, avatar_url, cover_url, location, website, is_verified, is_private, zodiac_sign, pronouns";

  try {
    let selectCols = PROFILE_COLS_FULL;

    // Try exact match first, then fall back to case-insensitive match.
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

    // Partner badge — show_relationship defaults to true if column doesn't exist yet
    let partner: PartnerInfo = null;
    if (profile.show_relationship !== false) {
      partner = await fetchPartner(sb, profile.id);
    }

    res.json({
      profile: {
        ...profile,
        posts_count,
        followers_count,
        following_count,
        partner,
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
      .select("id, username, full_name, bio, avatar_url, cover_url, location, website, pronouns, is_verified, is_private, vibe_status, relationship_status, zodiac_sign, show_relationship")
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

    // Partner badge — show_relationship defaults to true if column doesn't exist yet
    let partner: PartnerInfo = null;
    if ((data as any).show_relationship !== false) {
      partner = await fetchPartner(sb, userId);
    }

    res.json({ profile: { ...(data as any), partner } });
  } catch (e: any) {
    req.log.error({ err: e?.message }, "profile by-id error");
    res.status(500).json({ error: "Profile load failed" });
  }
});

router.patch("/profile/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const body = req.body as Record<string, any>;
  const {
    relationship_status,
    bio, full_name, display_name, website, location, pronouns, vibe_status,
    username, avatar_url, zodiac_sign,
  } = body as Record<string, string | null | undefined>;

  // show_relationship is a boolean — handle separately from the string fields
  const show_relationship: boolean | undefined =
    typeof body.show_relationship === "boolean" ? body.show_relationship : undefined;

  if (
    relationship_status !== undefined &&
    relationship_status !== null &&
    !VALID_STATUSES.includes(relationship_status)
  ) {
    res.status(400).json({ error: "invalid relationship_status" });
    return;
  }

  const updates: Record<string, string | boolean | null> = {};
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
  if (show_relationship !== undefined) updates.show_relationship = show_relationship;

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

// GET /api/users/hashtags?query=
router.get("/hashtags", async (req, res) => {
  const { query = "" } = req.query as { query?: string };
  const sb = makeSupabase();
  try {
    let q = sb.from("hashtags").select("name, posts_count").order("posts_count", { ascending: false }).limit(20);
    if (query.trim()) q = q.ilike("name", `%${query.trim()}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ hashtags: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "users/hashtags error");
    res.json({ hashtags: [] });
  }
});

// GET /api/users/search-history?userId=
router.get("/search-history", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.json({ history: [] }); return; }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("search_history")
      .select("id, query, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ history: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "search-history get error");
    res.json({ history: [] });
  }
});

// POST /api/users/search-history
// body: { userId, query }
router.post("/search-history", async (req, res) => {
  const { userId, query } = req.body as { userId?: string; query?: string };
  if (!userId || !query?.trim()) { res.json({ ok: true }); return; }
  const sb = makeSupabase();
  try {
    await sb.from("search_history").upsert(
      { user_id: userId, query: query.trim() },
      { onConflict: "user_id,query" }
    );
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "search-history post error");
    res.json({ ok: true });
  }
});

// DELETE /api/users/search-history?userId=   — clear all history for user
// DELETE /api/users/search-history/:id        — delete one item by row id
router.delete("/search-history/:id", async (req, res) => {
  const { id } = req.params;
  const sb = makeSupabase();
  try {
    await sb.from("search_history").delete().eq("id", id);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "search-history delete-one error");
    res.json({ ok: true });
  }
});

router.delete("/search-history", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  try {
    await sb.from("search_history").delete().eq("user_id", userId);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "search-history clear error");
    res.json({ ok: true });
  }
});

// POST /api/users/tab-preference
// body: { userId, tab }
router.post("/tab-preference", async (req, res) => {
  const { userId, tab } = req.body as { userId?: string; tab?: string };
  if (!userId || !tab) { res.status(400).json({ error: "userId and tab required" }); return; }
  const sb = makeSupabase();
  try {
    await sb.from("user_tab_preferences").upsert(
      { user_id: userId, last_tab: tab, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "tab-preference upsert error");
    res.json({ ok: true });
  }
});

// GET /api/users/blocked?userId=
router.get("/blocked", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.json({ users: [] }); return; }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("blocks")
      .select("blocked_id, profiles!blocks_blocked_id_fkey(id, username, full_name, avatar_url)")
      .eq("blocker_id", userId);
    if (error) throw error;
    const users = (data ?? []).map((row: any) => {
      const p = row.profiles ?? {};
      return { id: row.blocked_id, username: p.username ?? "user", full_name: p.full_name, avatar_url: p.avatar_url };
    });
    res.json({ users });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "users/blocked get error");
    res.json({ users: [] });
  }
});

// GET /api/users/restricted?userId=
router.get("/restricted", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.json({ users: [] }); return; }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("restricted_users")
      .select("restricted_id, profiles!restricted_users_restricted_id_fkey(id, username, full_name, avatar_url)")
      .eq("restrictor_id", userId);
    if (error) throw error;
    const users = (data ?? []).map((row: any) => {
      const p = row.profiles ?? {};
      return { id: row.restricted_id, username: p.username ?? "user", full_name: p.full_name, avatar_url: p.avatar_url };
    });
    res.json({ users });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "users/restricted get error");
    res.json({ users: [] });
  }
});

// POST /api/jyotisha/save  (mounted under /users for simplicity)
// body: { userId, fullName, birthDate, birthTime, birthPlace, rashi, lagna, nakshatra, dasha }
router.post("/jyotisha/save", async (req, res) => {
  const { userId, fullName, birthDate, birthTime, birthPlace, rashi, lagna, nakshatra, dasha } = req.body as {
    userId?: string; fullName?: string; birthDate?: string; birthTime?: string;
    birthPlace?: string; rashi?: string; lagna?: string; nakshatra?: string; dasha?: string;
  };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  try {
    await Promise.all([
      fullName ? sb.from("profiles").update({ full_name: fullName }).eq("id", userId) : Promise.resolve(),
      sb.from("kundali_profiles").upsert({
        user_id: userId, birth_date: birthDate, birth_time: birthTime, birth_place: birthPlace,
        rashi, lagna, nakshatra, dasha_period: dasha,
      }, { onConflict: "user_id" }),
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "jyotisha/save error");
    res.status(500).json({ error: "Failed to save jyotisha profile" });
  }
});

export default router;
