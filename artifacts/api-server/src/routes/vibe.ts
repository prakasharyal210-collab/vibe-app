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
          .select("follower_id")
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
            .select("notif_in_app, notif_vibe_request")
            .eq("user_id", targetId)
            .maybeSingle();
          const pushOn = (tPrefs as any)?.notif_in_app !== false;
          const vibeReqOn = (tPrefs as any)?.notif_vibe_request !== false;
          if (!pushOn || !vibeReqOn) return;

          // Dedup: skip if a vibe_request notification from this sender already exists.
          // Repeat right-swipes after Start Over would otherwise stack identical rows.
          const { data: existingNotif } = await sb
            .from("notifications")
            .select("id")
            .eq("type", "vibe_request")
            .eq("sender_id", swiperId)
            .eq("recipient_id", targetId)
            .maybeSingle();
          if (existingNotif) return;

          await sb.from("notifications").insert({
            recipient_id: targetId,
            sender_id: swiperId,
            type: "vibe_request",
            // Do NOT include sender name — the notification UI always prepends
            // the sender's username automatically, so adding it here doubles it.
            message: "sent you a Vibe 💜",
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

    // 6. Fetch both usernames + notification prefs in parallel
    const [profilesRes, prefsRes] = await Promise.all([
      sb.from("profiles").select("id, username").in("id", [swiperId, targetId]),
      sb.from("user_settings").select("user_id, notif_in_app, notif_vibe_match").in("user_id", [swiperId, targetId]),
    ]);

    const profiles = profilesRes.data as any[] | null;
    const prefs = prefsRes.data as any[] | null;

    const swiperP = profiles?.find((p: any) => p.id === swiperId);
    const targetP = profiles?.find((p: any) => p.id === targetId);
    const swiperName = swiperP?.username ?? "Someone";
    const targetName = targetP?.username ?? "Someone";

    const swiperPrefs = prefs?.find((p: any) => p.user_id === swiperId);
    const targetPrefs = prefs?.find((p: any) => p.user_id === targetId);

    // 7. Insert vibe_match notifications, respecting each user's preferences
    const notifRows: object[] = [];
    const swiperWantsMatch = (swiperPrefs?.notif_in_app !== false) && (swiperPrefs?.notif_vibe_match !== false);
    const targetWantsMatch = (targetPrefs?.notif_in_app !== false) && (targetPrefs?.notif_vibe_match !== false);

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

    // 8. Create a conversation for the matched pair.
    // Lexicographic UUID ordering means the same pair always maps to the same row.
    // The conversations table has a unique constraint on (user1_id, user2_id) so
    // concurrent upserts from this path and vibe-requests/send are both safe.
    const [user1Id, user2Id] = [swiperId, targetId].sort();
    await sb.from("conversations").upsert(
      { user1_id: user1Id, user2_id: user2Id, is_request: false, unread_count_1: 0, unread_count_2: 0 },
      { onConflict: "user1_id,user2_id" },
    );

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
    // 1. Fetch viewer's vibe prefs + goal filter in parallel
    const [settingsRes, profileRes] = await Promise.all([
      sb
        .from("user_settings")
        .select("vibe_age_min, vibe_age_max, vibe_max_distance_km, vibe_exclude_connections")
        .eq("user_id", userId)
        .maybeSingle(),
      sb
        .from("profiles")
        .select("vibe_goal_filter, vibe_filter_min_photos, vibe_filter_requires_bio")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    const settings = settingsRes.data as any;
    const ageMin: number       = settings?.vibe_age_min             ?? 18;
    const ageMax: number       = settings?.vibe_age_max             ?? 60;
    const radiusKm: number     = settings?.vibe_max_distance_km     ?? 999;
    const excludeConn: boolean = settings?.vibe_exclude_connections ?? false;

    // NULL or empty array = "open to all goals" (safe default — never over-restricts)
    const rawGoalFilter = (profileRes.data as any)?.vibe_goal_filter;
    const goalFilter: string[] | null =
      Array.isArray(rawGoalFilter) && rawGoalFilter.length > 0 ? rawGoalFilter : null;
    const vibeFilterMinPhotos: number   = (profileRes.data as any)?.vibe_filter_min_photos   ?? 0;
    const vibeFilterRequireBio: boolean = (profileRes.data as any)?.vibe_filter_requires_bio ?? false;

    req.log.info({ userId, ageMin, ageMax, radiusKm, excludeConn, goalFilter, vibeFilterMinPhotos, vibeFilterRequireBio, lat, lng }, "vibe-deck: viewer prefs");

    // 2. Call get_vibe_matches (the RPC that actually exists in Supabase).
    //    get_nearby_users does not exist — using get_vibe_matches which has SECURITY DEFINER
    //    and is granted to authenticated + anon, so it bypasses RLS correctly.
    const { data: rpcData, error: rpcError } = await sb.rpc("get_vibe_matches", {
      p_user_id:         userId,
      p_interested_in:   [],     // no gender filter — show everyone
      p_looking_for:     null,   // no goal pre-filter at RPC level — we apply it below for logging
      p_age_min:         ageMin,
      p_age_max:         ageMax,
      p_max_distance_km: radiusKm >= 999 ? null : radiusKm,
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

    // CRITICAL: coupled users must never appear in matching.
    // Bulletproof layer: even if show_in_matching was not set correctly, explicitly
    // exclude any candidate who has an accepted couple_link. Defense-in-depth.
    if (profiles.length > 0) {
      const candidateIds = profiles.map((p: any) => p.id as string);
      const orFilter = `requester_id.in.(${candidateIds.join(",")}),receiver_id.in.(${candidateIds.join(",")})`;
      const { data: coupledRows, error: coupledErr } = await sb
        .from("couple_links")
        .select("requester_id, receiver_id")
        .eq("status", "accepted")
        .or(orFilter);
      if (coupledErr) {
        req.log.error({ err: coupledErr.message }, "vibe-deck: couple exclusion query failed — filtering all show_in_matching=false as fallback");
        profiles = profiles.filter((p: any) => p.show_in_matching !== false);
      } else {
        const coupledIds = new Set<string>();
        for (const row of coupledRows ?? []) {
          coupledIds.add((row as any).requester_id as string);
          coupledIds.add((row as any).receiver_id as string);
        }
        if (coupledIds.size > 0) {
          const beforeCouple = profiles.length;
          profiles = profiles.filter((p: any) => !coupledIds.has(p.id as string));
          req.log.info({ beforeCouple, afterCouple: profiles.length, excludedCoupled: coupledIds.size }, "vibe-deck: after coupled-users exclusion");
        }
      }
    }

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

    // 4+5. Enrich candidates then apply goal filter.
    //       relationship_goals (array) is fetched here so the goal filter can check it.
    if (profiles.length > 0) {
      const ids = profiles.map((p: any) => p.id as string);
      const [distRes, richRes] = await Promise.all([
        sb.from("user_settings").select("user_id, vibe_show_distance").in("user_id", ids),
        sb.from("profiles").select("id, vibe_bio, vibe_photos, vibe_profile_photo_url, relationship_goals").in("id", ids),
      ]);

      const hideSet = new Set<string>(
        ((distRes.data ?? []) as any[])
          .filter((r: any) => r.vibe_show_distance === false)
          .map((r: any) => r.user_id as string),
      );
      const richMap = new Map<string, any>(
        ((richRes.data ?? []) as any[]).map((r: any) => [r.id as string, r]),
      );

      profiles = profiles.map((p: any) => {
        const rich = richMap.get(p.id as string);
        const enriched = rich
          ? { ...p, vibe_bio: rich.vibe_bio ?? null, vibe_photos: rich.vibe_photos ?? null, vibe_profile_photo_url: rich.vibe_profile_photo_url ?? null, relationship_goals: rich.relationship_goals ?? null }
          : p;
        if (hideSet.has((enriched as any).id as string)) {
          const { distance_km: _dropped, ...rest } = enriched as any;
          return rest;
        }
        return enriched;
      });

      // 5b. Goal filter — runs after enrichment so relationship_goals is available.
      //     Checks relationship_goals array first; falls back to legacy relationship_goal scalar.
      if (goalFilter && goalFilter.length > 0) {
        const beforeGoal = profiles.length;
        profiles = profiles.filter((p: any) => {
          const cGoals: string[] =
            Array.isArray(p.relationship_goals) && (p.relationship_goals as string[]).length > 0
              ? (p.relationship_goals as string[])
              : (p.relationship_goal != null ? [p.relationship_goal as string] : []);
          return cGoals.some((g) => goalFilter.includes(g));
        });
        req.log.info({ beforeGoal, afterGoal: profiles.length, goalFilter }, "vibe-deck: after goal filter");
      } else {
        req.log.info({ goalFilter: null, candidates: profiles.length }, "vibe-deck: goal filter inactive (show all)");
      }

      // 6. Apply viewer's deck quality filters (bio required + min vibe photos)
      if (vibeFilterRequireBio || vibeFilterMinPhotos > 0) {
        const before6 = profiles.length;
        if (vibeFilterRequireBio) {
          profiles = profiles.filter((p: any) => {
            const bio: string = ((p.vibe_bio ?? p.bio ?? "") as string);
            return bio.trim().length > 0;
          });
        }
        if (vibeFilterMinPhotos > 0) {
          profiles = profiles.filter((p: any) => {
            const photos: any[] = Array.isArray(p.vibe_photos) ? p.vibe_photos as any[] : [];
            return photos.length >= vibeFilterMinPhotos;
          });
        }
        req.log.info({ before6, after6: profiles.length, vibeFilterRequireBio, vibeFilterMinPhotos }, "vibe-deck: after quality filters");
      }
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

// GET /api/vibe/matches?userId=X
// Returns all mutual vibe matches for a user with matched profile details.
// Must go through the API server (service-role key) — direct anon-key calls hang under RLS.
router.get("/matches", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    // Fetch all rows where user is sender OR receiver.
    // vibe_matches uses created_at (not matched_at) — matched_at / compatibility_score don't exist.
    const [senderRes, receiverRes] = await Promise.all([
      sb
        .from("vibe_matches")
        .select("id, sender_id, receiver_id, created_at, status")
        .eq("sender_id", userId),
      sb
        .from("vibe_matches")
        .select("id, sender_id, receiver_id, created_at, status")
        .eq("receiver_id", userId),
    ]);

    if (senderRes.error) req.log.error({ err: senderRes.error.message }, "vibe-matches: sender query error");
    if (receiverRes.error) req.log.error({ err: receiverRes.error.message }, "vibe-matches: receiver query error");

    const rows: any[] = [
      ...(senderRes.data ?? []),
      ...(receiverRes.data ?? []),
    ];

    if (rows.length === 0) {
      res.json({ matches: [] });
      return;
    }

    // Deduplicate by otherId — vibe_matches stores BOTH directions (A→B and B→A),
    // so both senderRes and receiverRes contain a row for the same match.
    // Keep only the first occurrence of each other-user to avoid duplicates.
    const seenOthers = new Set<string>();
    const dedupedRows = rows.filter((r) => {
      const otherId = r.sender_id === userId ? r.receiver_id : r.sender_id;
      if (seenOthers.has(otherId)) return false;
      seenOthers.add(otherId);
      return true;
    });

    const otherIds = dedupedRows.map((r) =>
      r.sender_id === userId ? r.receiver_id : r.sender_id
    );

    const { data: profiles, error: profErr } = await sb
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio, age, gender, interests, is_verified, relationship_goal")
      .in("id", otherIds);

    if (profErr) {
      req.log.error({ err: profErr.message }, "vibe-matches: profile fetch error");
      res.status(500).json({ error: "Failed to fetch profiles" });
      return;
    }

    const profileMap = new Map<string, any>();
    for (const p of profiles ?? []) profileMap.set(p.id, p);

    const matches = dedupedRows.map((r) => {
      const otherId = r.sender_id === userId ? r.receiver_id : r.sender_id;
      const p = profileMap.get(otherId) ?? {};
      return {
        id: otherId,
        matchRowId: r.id,
        matchedAt: r.created_at ?? null,
        compatibilityScore: 0,
        username: p.username ?? "vibe_user",
        name: p.full_name ?? p.username ?? "Vibe User",
        avatarUrl: p.avatar_url ?? null,
        bio: p.bio ?? "",
        age: p.age ?? null,
        gender: p.gender ?? null,
        interests: p.interests ?? [],
        isVerified: p.is_verified ?? false,
        goal: p.relationship_goal ?? null,
      };
    });

    res.json({ matches });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe-matches exception");
    res.status(500).json({ error: "Failed to fetch matches" });
  }
});

// GET /api/vibe/by-intention?goal=X&userId=Y&limit=N
// Returns profiles matching a specific goal category, with show_in_matching = true.
// Three OR conditions so "All" users (relationship_goals IS NULL) appear in every tab:
//   1. relationship_goals array contains the goal
//   2. legacy relationship_goal scalar equals the goal
//   3. relationship_goals IS NULL (user chose "All" / open to every intention)
// Service-role key only — direct anon-key calls hang under RLS.
router.get("/by-intention", async (req, res) => {
  const { goal, userId, limit: limitStr } = req.query as {
    goal?: string;
    userId?: string;
    limit?: string;
  };
  if (!goal)   { res.status(400).json({ error: "goal required" });   return; }
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const limit = Math.min(parseInt(limitStr ?? "50", 10) || 50, 100);
  const sb = makeSupabase();

  // Primary query: checks relationship_goals array (new column) OR legacy scalar OR null (= "All").
  // If relationship_goals column doesn't exist yet (migration not run), fall back to legacy-only query.
  let data: any[] | null = null;
  let queryError: any = null;

  const orFilter = `relationship_goals.cs.{${goal}},relationship_goal.eq.${goal},relationship_goals.is.null`;
  console.log("[by-intention] ── PRIMARY QUERY ──");
  console.log("[by-intention] goal:", goal);
  console.log("[by-intention] userId (excluded):", userId);
  console.log("[by-intention] limit:", limit);
  console.log("[by-intention] .or filter:", orFilter);
  console.log("[by-intention] .eq show_in_matching = true");
  console.log("[by-intention] .neq id !=", userId);
  console.log("[by-intention] NO distance/location filter applied");

  { const r = await sb
      .from("profiles")
      .select(
        "id, username, avatar_url, vibe_photos, vibe_profile_photo_url, bio, age, gender, relationship_goal, relationship_goals, interests, show_in_matching, last_active"
      )
      .or(orFilter)
      .eq("show_in_matching", true)
      .neq("id", userId)
      .order("last_active", { ascending: false, nullsFirst: false })
      .limit(limit);
    data = r.data; queryError = r.error;
    console.log("[by-intention] PRIMARY path taken");
    console.log("[by-intention] error:", JSON.stringify(r.error));
    console.log("[by-intention] data:", JSON.stringify(r.data));
  }

  // Fallback: relationship_goals column missing (migration not yet run) → use legacy scalar only
  if (queryError && (queryError.code === "42703" || String(queryError.message).includes("column"))) {
    console.log("[by-intention] ── FALLBACK PATH (column missing) ──");
    req.log.warn({ goal }, "by-intention: relationship_goals column missing, using legacy fallback");
    const r2 = await sb
      .from("profiles")
      .select(
        "id, username, avatar_url, vibe_photos, vibe_profile_photo_url, bio, age, gender, relationship_goal, interests, show_in_matching, last_active"
      )
      .eq("relationship_goal", goal)
      .eq("show_in_matching", true)
      .neq("id", userId)
      .order("last_active", { ascending: false, nullsFirst: false })
      .limit(limit);
    console.log("[by-intention] FALLBACK error:", JSON.stringify(r2.error));
    console.log("[by-intention] FALLBACK data:", JSON.stringify(r2.data));
    if (r2.error) {
      req.log.error({ err: r2.error.message }, "by-intention fallback query error");
      res.status(500).json({ error: r2.error.message });
      return;
    }
    data = r2.data;
    queryError = null;
  }

  if (queryError) {
    req.log.error({ err: queryError.message }, "by-intention query error");
    res.status(500).json({ error: queryError.message });
    return;
  }

  // CRITICAL: coupled users must never appear in matching.
  // Bulletproof layer: explicitly exclude any candidate with an accepted couple_link,
  // regardless of their show_in_matching value.
  let candidates: any[] = data ?? [];
  if (candidates.length > 0) {
    const candidateIds = candidates.map((p: any) => p.id as string);
    const { data: coupledRows, error: coupledErr } = await sb
      .from("couple_links")
      .select("requester_id, receiver_id")
      .eq("status", "accepted")
      .or(`requester_id.in.(${candidateIds.join(",")}),receiver_id.in.(${candidateIds.join(",")})`);
    if (!coupledErr) {
      const coupledIds = new Set<string>();
      for (const row of coupledRows ?? []) {
        coupledIds.add((row as any).requester_id as string);
        coupledIds.add((row as any).receiver_id as string);
      }
      if (coupledIds.size > 0) {
        const beforeCouple = candidates.length;
        candidates = candidates.filter((p: any) => !coupledIds.has(p.id as string));
        req.log.info({ beforeCouple, afterCouple: candidates.length, excludedCoupled: coupledIds.size }, "by-intention: after coupled-users exclusion");
      }
    } else {
      req.log.error({ err: coupledErr.message }, "by-intention: couple exclusion query failed — proceeding with show_in_matching filter only");
    }
  }

  const users = (candidates).map((p: any) => ({
    id: p.id,
    username: p.username ?? null,
    name: p.full_name ?? p.username ?? "Vibe User",
    age: p.age ?? null,
    image: (p.vibe_profile_photo_url ?? (Array.isArray(p.vibe_photos) && (p.vibe_photos as string[]).length > 0
      ? (p.vibe_photos as string[])[0]
      : (p.avatar_url ?? `https://picsum.photos/seed/${p.id}/400/600`))),
    bio: p.bio ?? "",
    gender: p.gender ?? null,
    goal: p.relationship_goal ?? null,
    interests: p.interests ?? [],
    vibe: p.vibe_type ?? null,
    isOnline: p.last_active
      ? Date.now() - new Date(p.last_active).getTime() < 5 * 60 * 1000
      : false,
  }));

  res.json({ users });
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
    // Delete swipe rows AND match rows in parallel.
    // The get_vibe_matches RPC's `excluded` CTE checks BOTH vibe_swipes AND vibe_matches,
    // so clearing only vibe_swipes is not enough — matched users stay excluded.
    const [swipesRes, matchesSenderRes, matchesReceiverRes] = await Promise.all([
      sb.from("vibe_swipes").delete({ count: "exact" }).eq("user_id", userId),
      sb.from("vibe_matches").delete({ count: "exact" }).eq("sender_id", userId),
      sb.from("vibe_matches").delete({ count: "exact" }).eq("receiver_id", userId),
    ]);

    const firstError = swipesRes.error ?? matchesSenderRes.error ?? matchesReceiverRes.error;
    if (firstError) {
      req.log.error({ err: firstError.message, userId }, "vibe reset-deck: delete error");
      res.status(500).json({ error: "Failed to reset deck" });
      return;
    }

    const deletedSwipes   = swipesRes.count   ?? 0;
    const deletedMatches  = (matchesSenderRes.count ?? 0) + (matchesReceiverRes.count ?? 0);
    req.log.info({ userId, deletedSwipes, deletedMatches }, "vibe reset-deck: history cleared");
    res.json({ ok: true, deletedRows: deletedSwipes + deletedMatches, deletedSwipes, deletedMatches });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe reset-deck exception");
    res.status(500).json({ error: "Failed to reset deck" });
  }
});

// ─── GET /api/vibe/discover ───────────────────────────────────────────────────
// ?userId=...&interestedIn=a,b&lookingFor=...&ageMin=18&ageMax=99&maxDistanceKm=100
// Vibe discovery candidates via get_vibe_matches RPC (service-role key, no RLS hang).
router.get("/discover", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const interestedInStr = (req.query["interestedIn"] as string) ?? "";
  const interestedIn = interestedInStr ? interestedInStr.split(",").filter(Boolean) : [];
  const lookingFor = (req.query["lookingFor"] as string) || null;
  const ageMin = parseInt((req.query["ageMin"] as string) ?? "18", 10);
  const ageMax = parseInt((req.query["ageMax"] as string) ?? "99", 10);
  const maxDistanceKm = parseFloat((req.query["maxDistanceKm"] as string) ?? "100");

  const sb = makeSupabase();
  try {
    const { data, error } = await sb.rpc("get_vibe_matches", {
      p_user_id: userId,
      p_interested_in: interestedIn,
      p_looking_for: lookingFor,
      p_age_min: ageMin,
      p_age_max: ageMax,
      p_max_distance_km: maxDistanceKm,
    });
    if (!error && Array.isArray(data)) {
      res.json({ profiles: data });
      return;
    }
    req.log.warn({ error: error?.message }, "vibe/discover rpc error");
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe/discover exception");
  }
  res.json({ profiles: [] });
});

// GET /api/vibe/swipe-count?userId=
// Returns the number of vibe swipes the user has made in the last 24 hours.
router.get("/swipe-count", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.json({ count: 0 }); return; }
  const sb = makeSupabase();
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await sb
      .from("vibe_swipes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if (error) throw error;
    res.json({ count: count ?? 0 });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe/swipe-count error");
    res.json({ count: 0 });
  }
});

// GET /api/vibe/cooldown?userId=&limit=
// Returns the most recent N vibe_swipes for the user so the client can evaluate cooldown locally.
router.get("/cooldown", async (req, res) => {
  const { userId, limit: limitStr } = req.query as { userId?: string; limit?: string };
  if (!userId) { res.json({ swipes: [] }); return; }
  const limit = Math.min(parseInt(limitStr ?? "20", 10), 50);
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("vibe_swipes")
      .select("direction, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ swipes: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe/cooldown error");
    res.json({ swipes: [] });
  }
});

// GET /api/vibe/preferences?userId=
router.get("/preferences", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb.from("vibe_preferences").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    res.json({ preferences: data ?? null });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe/preferences get error");
    res.json({ preferences: null });
  }
});

// PUT /api/vibe/preferences
// body: { userId, gender, interestedIn, lookingFor, age, ageMin, ageMax, maxDistance }
router.put("/preferences", async (req, res) => {
  const { userId, gender, interestedIn, lookingFor, age, ageMin, ageMax, maxDistance } = req.body as {
    userId?: string; gender?: string; interestedIn?: string[]; lookingFor?: string;
    age?: number; ageMin?: number; ageMax?: number; maxDistance?: number;
  };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  try {
    await Promise.all([
      sb.from("vibe_preferences").upsert(
        { user_id: userId, gender, interested_in: interestedIn, looking_for: lookingFor,
          age, age_min: ageMin, age_max: ageMax, max_distance_km: maxDistance,
          updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      ),
      gender ? sb.from("profiles").update({ gender }).eq("id", userId) : Promise.resolve(),
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe/preferences put error");
    res.status(500).json({ error: "Failed to save preferences" });
  }
});

// GET /api/vibe/goals?userId=
router.get("/goals", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.json({ goals: [] }); return; }
  const sb = makeSupabase();
  try {
    const { data } = await sb.from("user_relationship_goals").select("goals").eq("user_id", userId).maybeSingle();
    res.json({ goals: (data as any)?.goals ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe/goals get error");
    res.json({ goals: [] });
  }
});

// POST /api/vibe/goals
// body: { userId, goals }
router.post("/goals", async (req, res) => {
  const { userId, goals } = req.body as { userId?: string; goals?: string[] };
  if (!userId || !Array.isArray(goals)) { res.status(400).json({ error: "userId and goals required" }); return; }
  const sb = makeSupabase();
  try {
    await sb.from("user_relationship_goals").upsert(
      { user_id: userId, goals, primary_goal: goals[0] ?? null, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "vibe/goals post error");
    res.status(500).json({ error: "Failed to save goals" });
  }
});

// POST /api/vibe/compat-score
// body: { userId, targetId, score }
router.post("/compat-score", async (req, res) => {
  const { userId, targetId, score } = req.body as { userId?: string; targetId?: string; score?: number };
  if (!userId || !targetId || score === undefined) { res.status(400).json({ error: "userId, targetId, score required" }); return; }
  const sb = makeSupabase();
  try {
    await sb.from("vibe_compat_scores").upsert(
      { user_id: userId, target_id: targetId, score, computed_at: new Date().toISOString() },
      { onConflict: "user_id,target_id" }
    );
    res.json({ ok: true });
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "vibe/compat-score upsert failed");
    res.json({ ok: true });
  }
});

export default router;

