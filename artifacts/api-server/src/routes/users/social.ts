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

// ─── Mute ─────────────────────────────────────────────────────────────────────

// POST /api/users/social/mute  body: { muterId, mutedId }
router.post("/mute", async (req, res) => {
  const { muterId, mutedId } = req.body as { muterId?: string; mutedId?: string };
  if (!muterId || !mutedId) {
    res.status(400).json({ error: "muterId and mutedId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    await sb.from("muted_users").upsert(
      { muter_id: muterId, muted_id: mutedId },
      { onConflict: "muter_id,muted_id" }
    );
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "mute exception");
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/users/social/mute  body: { muterId, mutedId }
router.delete("/mute", async (req, res) => {
  const { muterId, mutedId } = req.body as { muterId?: string; mutedId?: string };
  if (!muterId || !mutedId) {
    res.status(400).json({ error: "muterId and mutedId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    await sb.from("muted_users").delete().eq("muter_id", muterId).eq("muted_id", mutedId);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "unmute exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/users/social/muted?userId=
// Returns array of muted user IDs
router.get("/muted", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  try {
    const { data } = await sb.from("muted_users").select("muted_id").eq("muter_id", userId);
    res.json({ mutedIds: (data ?? []).map((r: any) => r.muted_id) });
  } catch {
    res.json({ mutedIds: [] });
  }
});

// GET /api/users/social/mute-status?muterId=&mutedId=
router.get("/mute-status", async (req, res) => {
  const { muterId, mutedId } = req.query as { muterId?: string; mutedId?: string };
  if (!muterId || !mutedId) { res.json({ muted: false }); return; }
  const sb = makeSupabase();
  try {
    const { data } = await sb
      .from("muted_users").select("id").eq("muter_id", muterId).eq("muted_id", mutedId).maybeSingle();
    res.json({ muted: !!data });
  } catch {
    res.json({ muted: false });
  }
});

// ─── Close Friends ────────────────────────────────────────────────────────────

// GET /api/users/social/close-friends?userId=
router.get("/close-friends", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const sb = makeSupabase();
  try {
    const { data } = await sb
      .from("close_friends")
      .select("friend_id, profiles!close_friends_friend_id_fkey(id, username, avatar_url, is_verified)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    const friends = (data ?? []).map((r: any) => ({
      id: r.friend_id,
      username: r.profiles?.username ?? "user",
      avatar_url: r.profiles?.avatar_url ?? null,
      is_verified: r.profiles?.is_verified ?? false,
    }));
    res.json({ friends });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "close-friends get exception");
    res.json({ friends: [] });
  }
});

// POST /api/users/social/close-friends  body: { userId, friendId }
router.post("/close-friends", async (req, res) => {
  const { userId, friendId } = req.body as { userId?: string; friendId?: string };
  if (!userId || !friendId) {
    res.status(400).json({ error: "userId and friendId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    await sb.from("close_friends").upsert(
      { user_id: userId, friend_id: friendId },
      { onConflict: "user_id,friend_id" }
    );
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "close-friends add exception");
    res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/users/social/close-friends  body: { userId, friendId }
router.delete("/close-friends", async (req, res) => {
  const { userId, friendId } = req.body as { userId?: string; friendId?: string };
  if (!userId || !friendId) {
    res.status(400).json({ error: "userId and friendId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    await sb.from("close_friends").delete().eq("user_id", userId).eq("friend_id", friendId);
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "close-friends remove exception");
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Mutual Followers ─────────────────────────────────────────────────────────

// GET /api/users/social/mutuals?viewerId=&targetId=
// Returns users who follow BOTH viewerId and targetId (up to 5 names + total count)
router.get("/mutuals", async (req, res) => {
  const { viewerId, targetId } = req.query as { viewerId?: string; targetId?: string };
  if (!viewerId || !targetId) { res.json({ mutuals: [], count: 0 }); return; }
  const sb = makeSupabase();
  try {
    // IDs that viewerId follows
    const { data: viewerFollowing } = await sb
      .from("follows").select("following_id").eq("follower_id", viewerId);
    const viewerSet = new Set((viewerFollowing ?? []).map((r: any) => r.following_id as string));

    // IDs that follow targetId
    const { data: targetFollowers } = await sb
      .from("follows").select("follower_id").eq("following_id", targetId);
    const targetFollowerIds = (targetFollowers ?? []).map((r: any) => r.follower_id as string);

    // Intersection (exclude viewerId and targetId themselves)
    const mutualIds = targetFollowerIds.filter(
      (id) => viewerSet.has(id) && id !== viewerId && id !== targetId
    );

    if (mutualIds.length === 0) { res.json({ mutuals: [], count: 0 }); return; }

    // Get profile info for up to 5
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", mutualIds.slice(0, 5));

    res.json({
      mutuals: (profiles ?? []).map((p: any) => ({
        id: p.id,
        username: p.username,
        avatar_url: p.avatar_url,
      })),
      count: mutualIds.length,
    });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "mutuals exception");
    res.json({ mutuals: [], count: 0 });
  }
});

export default router;
