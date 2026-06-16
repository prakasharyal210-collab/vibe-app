import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

const router = Router();

// POST /api/vibe/swipe
// Body: { swiperId, targetId, direction: "left"|"right"|"super" }
// Returns: { recorded: boolean, match: boolean, blocked_by_privacy?: boolean }
router.post("/swipe", async (req, res) => {
  const { swiperId, targetId, direction } = req.body as {
    swiperId?: string;
    targetId?: string;
    direction?: "left" | "right" | "super";
  };
  if (!swiperId || !targetId || !direction) {
    res.status(400).json({ error: "swiperId, targetId, direction required" });
    return;
  }
  if (swiperId === targetId) {
    res.status(400).json({ error: "Cannot swipe yourself" });
    return;
  }

  const sb = makeSupabase();

  try {
    // 1. Privacy gate — right/super only
    if (direction !== "left") {
      const { data: targetProfile } = await sb
        .from("profiles")
        .select("vibe_request_privacy")
        .eq("id", targetId)
        .maybeSingle();

      const privacy = (targetProfile as any)?.vibe_request_privacy ?? "everyone";

      if (privacy === "nobody") {
        res.json({ recorded: false, match: false, blocked_by_privacy: true });
        return;
      }
      if (privacy === "followers_only") {
        const { data: followRow } = await sb
          .from("follows")
          .select("id")
          .eq("follower_id", swiperId)
          .eq("following_id", targetId)
          .maybeSingle();
        if (!followRow) {
          res.json({ recorded: false, match: false, blocked_by_privacy: true });
          return;
        }
      }
    }

    // 2. Upsert into vibe_swipes
    const { error: swipeErr } = await sb.from("vibe_swipes").upsert(
      {
        user_id: swiperId,
        target_id: targetId,
        direction,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,target_id" },
    );
    if (swipeErr) {
      req.log.error({ err: swipeErr.message }, "vibe_swipes upsert error");
    }

    // 3. Left swipes are done
    if (direction === "left") {
      res.json({ recorded: true, match: false });
      return;
    }

    // 4. Check for mutual right-swipe using vibe_swipes as source of truth
    const { data: mutualSwipe } = await sb
      .from("vibe_swipes")
      .select("id")
      .eq("user_id", targetId)
      .eq("target_id", swiperId)
      .in("direction", ["right", "super"])
      .maybeSingle();

    // 4b. No match yet — fetch target prefs and optionally send vibe_request notification
    if (!mutualSwipe) {
      // Fire-and-forget: check if target wants vibe_request notifications
      (async () => {
        try {
          const { data: tPrefs } = await sb
            .from("user_settings")
            .select("notif_push_enabled, notif_vibe_request")
            .eq("user_id", targetId)
            .maybeSingle();
          const pushOn = (tPrefs as any)?.notif_push_enabled !== false;
          const vibeReqOn = (tPrefs as any)?.notif_vibe_request !== false;
          if (!pushOn || !vibeReqOn) return;

          const { data: swiperProfile } = await sb
            .from("profiles")
            .select("username, display_name")
            .eq("id", swiperId)
            .maybeSingle();
          const swiperName = (swiperProfile as any)?.display_name ?? (swiperProfile as any)?.username ?? "Someone";

          await sb.from("notifications").insert({
            recipient_id: targetId,
            sender_id: swiperId,
            type: "vibe_request",
            message: `${swiperName} sent you a Vibe 💜`,
            is_read: false,
            created_at: new Date().toISOString(),
          });
        } catch {
          // non-critical — swipe itself already succeeded
        }
      })();

      res.json({ recorded: true, match: false });
      return;
    }

    // 5. MATCH — upsert both directions so lookups from either user work
    const now = new Date().toISOString();
    await sb.from("vibe_matches").upsert(
      [
        { sender_id: swiperId, receiver_id: targetId, status: "matched", created_at: now },
        { sender_id: targetId, receiver_id: swiperId, status: "matched", created_at: now },
      ],
      { onConflict: "sender_id,receiver_id" },
    );

    // 6. Fetch both display names + notification prefs in parallel
    const [profilesRes, prefsRes] = await Promise.all([
      sb.from("profiles").select("id, username, display_name").in("id", [swiperId, targetId]),
      sb.from("user_settings").select("user_id, notif_push_enabled, notif_vibe_match").in("user_id", [swiperId, targetId]),
    ]);

    const profiles = profilesRes.data as any[] | null;
    const prefs = prefsRes.data as any[] | null;

    const swiperP = profiles?.find((p: any) => p.id === swiperId);
    const targetP = profiles?.find((p: any) => p.id === targetId);
    const swiperName = swiperP?.display_name ?? swiperP?.username ?? "Someone";
    const targetName = targetP?.display_name ?? targetP?.username ?? "Someone";

    const swiperPrefs = prefs?.find((p: any) => p.user_id === swiperId);
    const targetPrefs = prefs?.find((p: any) => p.user_id === targetId);

    // 7. Insert vibe_match notifications, respecting each user's preferences
    const notifRows: object[] = [];
    const swiperWantsMatch = (swiperPrefs?.notif_push_enabled !== false) && (swiperPrefs?.notif_vibe_match !== false);
    const targetWantsMatch = (targetPrefs?.notif_push_enabled !== false) && (targetPrefs?.notif_vibe_match !== false);

    if (swiperWantsMatch) {
      notifRows.push({
        recipient_id: swiperId,
        sender_id: targetId,
        type: "vibe_match",
        message: `It's a match! You and ${targetName} can now message each other 💜`,
        is_read: false,
        created_at: now,
      });
    }
    if (targetWantsMatch) {
      notifRows.push({
        recipient_id: targetId,
        sender_id: swiperId,
        type: "vibe_match",
        message: `It's a match! You and ${swiperName} can now message each other 💜`,
        is_read: false,
        created_at: now,
      });
    }
    if (notifRows.length > 0) {
      await sb.from("notifications").insert(notifRows);
    }

    res.json({ recorded: true, match: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe-swipe exception");
    res.status(500).json({ error: "Failed to record swipe" });
  }
});

// GET /api/vibe/deck?userId=&lat=&lng=
// Returns filtered swipe-deck profiles honoring the viewer's vibe preferences:
//   vibe_age_min/max, vibe_max_distance_km, vibe_exclude_connections
// Also strips distance_km from profiles whose owner set vibe_show_distance = false
router.get("/deck", async (req, res) => {
  const { userId, lat, lng } = req.query as { userId?: string; lat?: string; lng?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const sb = makeSupabase();

  try {
    // 1. Fetch viewer's vibe discovery preferences
    const { data: settings } = await sb
      .from("user_settings")
      .select("vibe_age_min, vibe_age_max, vibe_max_distance_km, vibe_exclude_connections")
      .eq("user_id", userId)
      .maybeSingle();

    const ageMin: number       = (settings as any)?.vibe_age_min             ?? 18;
    const ageMax: number       = (settings as any)?.vibe_age_max             ?? 60;
    const radiusKm: number     = (settings as any)?.vibe_max_distance_km     ?? 100;
    const excludeConn: boolean = (settings as any)?.vibe_exclude_connections ?? false;

    req.log.info({ userId, ageMin, ageMax, radiusKm, excludeConn, lat, lng }, "vibe-deck: viewer prefs");

    // 2. Call get_vibe_matches (the RPC that actually exists in Supabase).
    //    get_nearby_users does not exist — using get_vibe_matches which has SECURITY DEFINER
    //    and is granted to authenticated + anon, so it bypasses RLS correctly.
    const { data: rpcData, error: rpcError } = await sb.rpc("get_vibe_matches", {
      p_user_id:         userId,
      p_interested_in:   [],     // no gender filter — show everyone
      p_looking_for:     null,   // no goal filter — show everyone
      p_age_min:         ageMin,
      p_age_max:         ageMax,
      p_max_distance_km: radiusKm,
    });

    if (rpcError) {
      req.log.error({ err: rpcError.message }, "vibe-deck: get_vibe_matches RPC error");
    }

    req.log.info({ rpcRows: Array.isArray(rpcData) ? rpcData.length : 0, rpcError: rpcError?.message ?? null }, "vibe-deck: RPC result");

    // get_vibe_matches returns `user_id` as the PK column — normalise to `id`
    let profiles: any[] = (Array.isArray(rpcData) ? rpcData : []).map((row: any) => ({
      ...row,
      id: row.user_id ?? row.id,
    }));

    req.log.info({ afterRpc: profiles.length }, "vibe-deck: candidates after RPC");

    // 3. Exclude follows / followers if requested (RPC already excludes swiped/matched users)
    if (excludeConn && profiles.length > 0) {
      const [followingRes, followersRes] = await Promise.all([
        sb.from("follows").select("following_id").eq("follower_id", userId),
        sb.from("follows").select("follower_id").eq("following_id", userId),
      ]);
      const connIds = new Set<string>([
        ...((followingRes.data ?? []).map((r: any) => r.following_id as string)),
        ...((followersRes.data ?? []).map((r: any) => r.follower_id as string)),
      ]);
      const beforeConn = profiles.length;
      profiles = profiles.filter((p: any) => !connIds.has(p.id as string));
      req.log.info({ beforeConn, afterConn: profiles.length }, "vibe-deck: after exclude-connections filter");
    }

    // 4. Strip distance_km from profiles whose owner hid their distance
    if (profiles.length > 0) {
      const ids = profiles.map((p: any) => p.id as string);
      const { data: distSettings } = await sb
        .from("user_settings")
        .select("user_id, vibe_show_distance")
        .in("user_id", ids);
      const hideSet = new Set<string>(
        ((distSettings ?? []) as any[])
          .filter((r: any) => r.vibe_show_distance === false)
          .map((r: any) => r.user_id as string),
      );
      profiles = profiles.map((p: any) => {
        if (hideSet.has(p.id as string)) {
          const { distance_km: _dropped, ...rest } = p;
          return rest;
        }
        return p;
      });
    }

    req.log.info({ finalCount: profiles.length }, "vibe-deck: returning profiles");
    res.json({ profiles });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe-deck exception");
    res.status(500).json({ error: "Failed to load deck" });
  }
});

// GET /api/vibe/swiped?userId=...
// Returns all target_ids this user has already swiped (any direction)
// Used by the swipe deck to exclude already-seen profiles
router.get("/swiped", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.json({ targetIds: [] });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data } = await sb
      .from("vibe_swipes")
      .select("target_id")
      .eq("user_id", userId);
    res.json({ targetIds: (data ?? []).map((r: any) => r.target_id) });
  } catch {
    res.json({ targetIds: [] });
  }
});

// GET /api/vibe/compatibility?userId=X&targetId=Y
// Returns { score: 0-100, factors: string[] }
router.get("/compatibility", async (req, res) => {
  const { userId, targetId } = req.query as { userId?: string; targetId?: string };
  if (!userId || !targetId) {
    res.status(400).json({ error: "userId and targetId required" });
    return;
  }
  if (userId === targetId) {
    res.json({ score: 100, factors: ["same user"] });
    return;
  }

  const sb = makeSupabase();
  try {
    const [followsRes, profilesRes, matchRes] = await Promise.all([
      sb.from("follows").select("follower_id, following_id")
        .or(`and(follower_id.eq.${userId},following_id.eq.${targetId}),and(follower_id.eq.${targetId},following_id.eq.${userId})`),
      sb.from("profiles").select("id, interests").in("id", [userId, targetId]),
      sb.from("vibe_matches").select("id")
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${userId})`)
        .maybeSingle(),
    ]);

    const follows: any[] = followsRes.data ?? [];
    const profiles: any[] = profilesRes.data ?? [];
    const matched = !!matchRes.data;

    const iFollowThem = follows.some((f) => f.follower_id === userId && f.following_id === targetId);
    const theyFollowMe = follows.some((f) => f.follower_id === targetId && f.following_id === userId);

    const myP = profiles.find((p) => p.id === userId);
    const theirP = profiles.find((p) => p.id === targetId);
    const myInterests: string[] = Array.isArray(myP?.interests) ? myP.interests : [];
    const theirInterests: string[] = Array.isArray(theirP?.interests) ? theirP.interests : [];
    const shared = myInterests.filter((i) => theirInterests.includes(i));
    const maxLen = Math.max(myInterests.length, theirInterests.length, 1);
    const interestScore = Math.round((shared.length / maxLen) * 40);

    let score = 10; // base
    const factors: string[] = [];
    if (iFollowThem && theyFollowMe) { score += 40; factors.push("mutual follows"); }
    else if (iFollowThem || theyFollowMe) { score += 10; factors.push("follows"); }
    score += interestScore;
    if (shared.length > 0) factors.push(`${shared.length} shared interest${shared.length > 1 ? "s" : ""}`);
    if (matched) { score += 20; factors.push("vibe match"); }

    res.json({ score: Math.min(100, score), factors });
  } catch (e: any) {
    req.log.error({ err: e?.message }, "compatibility error");
    res.json({ score: null, factors: [] });
  }
});

// POST /api/vibe/reset-deck
// Body: { userId }
// Deletes all vibe_swipes rows for this user so previously-seen profiles reappear.
// Must go through the API server (service-role key) — direct anon-key calls hang under RLS.
router.post("/reset-deck", async (req, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const sb = makeSupabase();
  try {
    const { error, count } = await sb
      .from("vibe_swipes")
      .delete({ count: "exact" })
      .eq("user_id", userId);

    if (error) {
      req.log.error({ err: error.message, userId }, "vibe reset-deck: delete error");
      res.status(500).json({ error: "Failed to reset deck" });
      return;
    }

    req.log.info({ userId, deletedRows: count ?? 0 }, "vibe reset-deck: swipe history cleared");
    res.json({ ok: true, deletedRows: count ?? 0 });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe reset-deck exception");
    res.status(500).json({ error: "Failed to reset deck" });
  }
});

export default router;
