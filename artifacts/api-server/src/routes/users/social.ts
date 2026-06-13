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

// GET /api/users/social/follow-status?followerId=X&followingId=Y
router.get("/follow-status", async (req, res) => {
  const { followerId, followingId } = req.query as { followerId?: string; followingId?: string };
  if (!followerId || !followingId) {
    res.status(400).json({ error: "followerId and followingId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("follows")
      .select("follower_id")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ following: !!data });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "follow-status exception");
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/users/social/follow  body: { followerId, followingId }
router.post("/follow", async (req, res) => {
  const { followerId, followingId } = req.body as { followerId?: string; followingId?: string };
  if (!followerId || !followingId) {
    res.status(400).json({ error: "followerId and followingId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb
      .from("follows")
      .upsert({ follower_id: followerId, following_id: followingId }, { onConflict: "follower_id,following_id" });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Write a "follow" notification + push (non-blocking)
    void (async () => {
      const { error: ne } = await sb.from("notifications").insert({
        user_id: followingId,
        actor_id: followerId,
        type: "follow",
        message: "started following you",
        read: false,
      });
      if (ne) req.log.warn({ error: ne.message }, "follow notif insert failed");
      // Look up actor username for push body
      const { data: actor } = await sb.from("profiles").select("username").eq("id", followerId).maybeSingle();
      const actorName = actor?.username ?? "Someone";
      void sendPushToUser(sb, followingId, {
        title: "New Follower",
        body: `@${actorName} started following you`,
        data: { type: "follow", actorId: followerId },
      }, "notif_follows");
    })();

    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "follow exception");
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/users/social/follow  body: { followerId, followingId }
router.delete("/follow", async (req, res) => {
  const { followerId, followingId } = req.body as { followerId?: string; followingId?: string };
  if (!followerId || !followingId) {
    res.status(400).json({ error: "followerId and followingId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "unfollow exception");
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/users/social/conversation  body: { userId, otherId }
// Get or create a conversation between two users
router.post("/conversation", async (req, res) => {
  const { userId, otherId } = req.body as { userId?: string; otherId?: string };
  if (!userId || !otherId) {
    res.status(400).json({ error: "userId and otherId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    // Check existing conversation in either direction
    const { data: existing } = await sb
      .from("conversations")
      .select("id")
      .or(
        `and(user_id.eq.${userId},other_user_id.eq.${otherId}),and(user_id.eq.${otherId},other_user_id.eq.${userId})`
      )
      .maybeSingle();

    if (existing?.id) {
      res.json({ conversationId: existing.id });
      return;
    }

    // Create new conversation
    const { data: created, error } = await sb
      .from("conversations")
      .insert({
        user_id: userId,
        other_user_id: otherId,
        is_request: true,
        last_message: "",
        last_message_at: new Date().toISOString(),
        unread_count: 0,
      })
      .select("id")
      .single();

    if (error) {
      req.log.warn({ error: error.message }, "conversation create error — falling back to otherId");
      res.json({ conversationId: otherId });
      return;
    }

    res.json({ conversationId: created.id });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "conversation exception");
    res.json({ conversationId: otherId });
  }
});

// GET /api/users/social/followers/:username?viewerId=X
// Returns list of users who follow this user
router.get("/followers/:username", async (req, res) => {
  const { username } = req.params;
  const { viewerId } = req.query as { viewerId?: string };
  const sb = makeSupabase();
  try {
    // Resolve username → userId
    const { data: profile, error: profileErr } = await sb
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (profileErr || !profile) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const userId = profile.id;

    // Get all follower IDs
    const { data: followRows, error: followErr } = await sb
      .from("follows")
      .select("follower_id")
      .eq("following_id", userId);
    if (followErr) {
      res.status(500).json({ error: followErr.message });
      return;
    }
    const followerIds = (followRows ?? []).map((r: any) => r.follower_id);
    if (followerIds.length === 0) {
      res.json({ users: [] });
      return;
    }

    // Get profile info for each follower
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, username, full_name, avatar_url, is_verified")
      .in("id", followerIds);

    // For profiles with null username, fall back to auth.users metadata
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const noUsername = followerIds.filter((id) => !profileMap.get(id)?.username);
    for (const uid of noUsername) {
      try {
        const { data: authUser } = await sb.auth.admin.getUserById(uid);
        if (authUser?.user) {
          const u = authUser.user;
          const fallbackUsername = u.user_metadata?.username
            ?? u.email?.split("@")[0]
            ?? `user_${uid.slice(0, 6)}`;
          const existing = profileMap.get(uid) ?? { id: uid };
          profileMap.set(uid, {
            ...existing,
            username: fallbackUsername,
            full_name: u.user_metadata?.full_name ?? existing.full_name ?? null,
            avatar_url: existing.avatar_url ?? null,
            is_verified: existing.is_verified ?? false,
          });
        }
      } catch { /* skip */ }
    }

    // Check which ones the viewer already follows
    let viewerFollowingSet = new Set<string>();
    if (viewerId && followerIds.length > 0) {
      const { data: vf } = await sb
        .from("follows")
        .select("following_id")
        .eq("follower_id", viewerId)
        .in("following_id", followerIds);
      viewerFollowingSet = new Set((vf ?? []).map((r: any) => r.following_id));
    }

    const users = followerIds
      .map((id) => profileMap.get(id))
      .filter((p: any) => p?.username)
      .map((p: any) => ({
        id: p.id,
        username: p.username,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        is_verified: p.is_verified ?? false,
        viewer_is_following: viewerFollowingSet.has(p.id),
        is_self: viewerId ? p.id === viewerId : false,
      }));

    res.json({ users });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "followers exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/users/social/following/:username?viewerId=X
// Returns list of users this user follows
router.get("/following/:username", async (req, res) => {
  const { username } = req.params;
  const { viewerId } = req.query as { viewerId?: string };
  const sb = makeSupabase();
  try {
    // Resolve username → userId
    const { data: profile, error: profileErr } = await sb
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (profileErr || !profile) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const userId = profile.id;

    // Get all following IDs
    const { data: followRows, error: followErr } = await sb
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId);
    if (followErr) {
      res.status(500).json({ error: followErr.message });
      return;
    }
    const followingIds = (followRows ?? []).map((r: any) => r.following_id);
    if (followingIds.length === 0) {
      res.json({ users: [] });
      return;
    }

    // Get profile info for each followed user
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, username, full_name, avatar_url, is_verified")
      .in("id", followingIds);

    // Check which ones the viewer already follows
    let viewerFollowingSet = new Set<string>();
    if (viewerId && followingIds.length > 0) {
      const { data: vf } = await sb
        .from("follows")
        .select("following_id")
        .eq("follower_id", viewerId)
        .in("following_id", followingIds);
      viewerFollowingSet = new Set((vf ?? []).map((r: any) => r.following_id));
    }

    const users = (profiles ?? [])
      .filter((p: any) => p.username)
      .map((p: any) => ({
        id: p.id,
        username: p.username,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        is_verified: p.is_verified ?? false,
        viewer_is_following: viewerFollowingSet.has(p.id),
        is_self: viewerId ? p.id === viewerId : false,
      }));

    res.json({ users });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "following exception");
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/users/social/toggle-follow  body: { followerId, followingId }
// Atomically checks + flips follow state. Returns { isFollowing: boolean }.
router.post("/toggle-follow", async (req, res) => {
  const { followerId, followingId } = req.body as { followerId?: string; followingId?: string };
  if (!followerId || !followingId) {
    res.status(400).json({ error: "followerId and followingId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: existing } = await sb
      .from("follows")
      .select("follower_id")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .maybeSingle();

    if (existing) {
      await sb.from("follows").delete().eq("follower_id", followerId).eq("following_id", followingId);
      res.json({ isFollowing: false });
    } else {
      await sb.from("follows").upsert(
        { follower_id: followerId, following_id: followingId },
        { onConflict: "follower_id,following_id" }
      );
      // Send follow notification (non-blocking)
      void (async () => {
        const { error: ne } = await sb.from("notifications").insert({
          user_id: followingId, actor_id: followerId, type: "follow",
          message: "started following you", read: false,
        });
        if (ne) req.log.warn({ error: ne.message }, "follow notif failed");
        const { data: actor } = await sb.from("profiles").select("username").eq("id", followerId).maybeSingle();
        const actorName = actor?.username ?? "Someone";
        void sendPushToUser(sb, followingId, {
          title: "New Follower",
          body: `@${actorName} started following you`,
          data: { type: "follow", actorId: followerId },
        }, "notif_follows");
      })();
      res.json({ isFollowing: true });
    }
  } catch (err: any) {
    req.log.error({ err: err?.message }, "toggle-follow exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/users/social/following-ids?userId=
// Returns the flat list of user IDs that userId follows — fast lookup for
// pre-populating Follow/Unfollow buttons without loading full profiles.
router.get("/following-ids", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ followingIds: (data ?? []).map((r: any) => r.following_id) });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "following-ids exception");
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
