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

// GET /api/users/search?q=<query>&limit=20&viewer_id=<uuid>
//   viewer_id present + empty q  → personalized suggestions via get_suggested_accounts RPC
//   viewer_id present + non-empty q → keyword search with mutual-followers tiebreaker via search_accounts_ranked RPC
//   no viewer_id                 → plain follower-count-ordered search (existing behaviour)
router.get("/search", async (req, res) => {
  const q        = ((req.query["q"]         as string) ?? "").trim();
  const viewerId = ((req.query["viewer_id"] as string) ?? "").trim();
  const limit    = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const sb       = makeSupabase();

  req.log.info({ q, viewerId: viewerId || "(none)", limit }, "user search");

  try {
    // ── Personalised path (viewer_id provided) ──────────────────────────────
    if (viewerId) {
      if (!q) {
        // Empty query → suggested accounts ranked by mutual followers
        const { data, error } = await sb.rpc("get_suggested_accounts", {
          p_user_id: viewerId,
          p_limit:   limit,
        });
        if (!error && data) {
          res.json({ profiles: data });
          return;
        }
        req.log.warn({ error: error?.message }, "get_suggested_accounts RPC failed; falling back");
      } else {
        // Non-empty query → keyword search with mutual-followers tiebreaker
        const { data, error } = await sb.rpc("search_accounts_ranked", {
          p_user_id: viewerId,
          p_query:   q,
          p_limit:   limit,
        });
        if (!error && data) {
          res.json({ profiles: data });
          return;
        }
        req.log.warn({ error: error?.message }, "search_accounts_ranked RPC failed; falling back");
      }
    }

    // ── Fallback: plain followers-ordered search (no viewer_id or RPC failed) ──

    // Collect blocked IDs in both directions so we can exclude them
    let excludeIds: string[] = [];
    if (viewerId) {
      const [myBlocks, blockedByMe] = await Promise.all([
        sb.from("blocks").select("blocked_id").eq("blocker_id", viewerId),
        sb.from("blocks").select("blocker_id").eq("blocked_id", viewerId),
      ]);
      excludeIds = [
        ...(myBlocks.data ?? []).map((r: any) => r.blocked_id as string),
        ...(blockedByMe.data ?? []).map((r: any) => r.blocker_id as string),
      ];
    }

    let query = sb
      .from("profiles")
      .select("id, username, full_name, bio, avatar_url, followers_count, following_count, is_verified, is_private")
      .order("followers_count", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);
    }
    if (excludeIds.length > 0) {
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }

    const { data, error } = await query;

    if (error) {
      req.log.warn({ error: error.message }, "profiles search fallback error");
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ profiles: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "user search exception");
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

  try {
    // Try exact match first, then fall back to case-insensitive match.
    // ilike without wildcards is equivalent to LOWER(col) = LOWER(val).
    let { data: profile, error } = await sb
      .from("profiles")
      .select("id, username, full_name, bio, avatar_url, cover_url, location, website, is_verified, is_private")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      req.log.warn({ error: error.message }, "profile lookup error");
      res.status(500).json({ error: error.message });
      return;
    }

    // If exact match found nothing, try case-insensitive (handles "Haceriz" → "haceriz")
    if (!profile) {
      const { data: ilikeProfile, error: ilikeError } = await sb
        .from("profiles")
        .select("id, username, full_name, bio, avatar_url, cover_url, location, website, is_verified, is_private")
        .ilike("username", username)
        .maybeSingle();
      if (!ilikeError && ilikeProfile) {
        profile = ilikeProfile;
        req.log.info({ username, matched: ilikeProfile.username }, "profile lookup: case-insensitive fallback matched");
      }
    }

    if (!profile) {
      // DEBUG: sample the profiles table to confirm API can read it at all
      const { data: sample, error: sampleErr } = await sb
        .from("profiles")
        .select("id, username")
        .limit(5);
      req.log.warn({
        username,
        sampleCount: sample?.length ?? 0,
        sampleUsernames: sample?.map((r: any) => r.username) ?? [],
        sampleError: sampleErr?.message,
      }, "profile lookup: not found — debug sample");
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

export default router;
