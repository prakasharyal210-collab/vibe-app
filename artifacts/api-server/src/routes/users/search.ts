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
    const baseQuery = sb
      .from("profiles")
      .select("id, username, full_name, bio, avatar_url, followers_count, following_count, is_verified, is_private")
      .order("followers_count", { ascending: false })
      .limit(limit);

    const { data, error } = q
      ? await baseQuery.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      : await baseQuery;

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

// GET /api/users/profile/:username — lookup profile by username with live stats
router.get("/profile/:username", async (req, res) => {
  const { username } = req.params;
  if (!username) { res.status(400).json({ error: "username required" }); return; }
  const sb = makeSupabase();

  req.log.info({ username }, "profile lookup");

  try {
    const { data: profile, error } = await sb
      .from("profiles")
      .select("id, username, full_name, bio, avatar_url, cover_url, location, website, is_verified, is_private")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      req.log.warn({ error: error.message }, "profile lookup error");
      res.status(500).json({ error: error.message });
      return;
    }
    if (!profile) {
      res.status(404).json({ error: "not found" });
      return;
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
