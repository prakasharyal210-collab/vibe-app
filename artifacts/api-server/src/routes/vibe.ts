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

export default router;
