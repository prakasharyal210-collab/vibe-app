import { MOCK_COMMENTS, MOCK_NOTIFICATIONS, Post, Comment, Notification, supabase } from "./supabase";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgoShort(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function notifText(type: string, message?: string): string {
  if (message) return message;
  switch (type) {
    case "like": return "liked your post";
    case "comment": return "commented on your post";
    case "follow": return "started following you";
    case "vibe": return "sent you a vibe ✨";
    case "mention": return "mentioned you in a comment";
    default: return "interacted with you";
  }
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function fetchComments(postId: string): Promise<Comment[]> {
  try {
    const { data, error } = await supabase
      .from("comments")
      .select("*, profiles:user_id(id, username, avatar_url, is_verified)")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data && data.length > 0) return data as unknown as Comment[];
  } catch {}
  const filtered = MOCK_COMMENTS.filter((c) => c.post_id === postId);
  return filtered.length > 0 ? filtered : MOCK_COMMENTS.slice(0, 5);
}

export async function addComment(
  postId: string,
  userId: string,
  text: string,
): Promise<Comment | null> {
  try {
    const { data, error } = await supabase
      .from("comments")
      .insert({ post_id: postId, user_id: userId, text })
      .select("*, profiles:user_id(id, username, avatar_url, is_verified)")
      .single();
    if (!error && data) return data as unknown as Comment;
  } catch {}
  return null;
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export async function checkLiked(postId: string, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function toggleLike(
  postId: string,
  userId: string,
  nowLiked: boolean,
): Promise<void> {
  try {
    if (nowLiked) {
      await supabase.from("likes").insert({ post_id: postId, user_id: userId });
    } else {
      await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
    }
  } catch {}
}

// ─── Reposts ──────────────────────────────────────────────────────────────────

export async function checkReposted(postId: string, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("reposts")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function toggleRepost(
  postId: string,
  userId: string,
  nowReposted: boolean,
): Promise<void> {
  try {
    if (nowReposted) {
      await supabase.from("reposts").insert({ post_id: postId, user_id: userId });
    } else {
      await supabase.from("reposts").delete().eq("post_id", postId).eq("user_id", userId);
    }
  } catch {}
}

export async function fetchRepostedPosts(userId: string): Promise<Post[]> {
  try {
    const { data, error } = await supabase
      .from("reposts")
      .select("posts(*, profiles:user_id(*))")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error && data && data.length > 0) {
      return (data as any[]).map((r) => r.posts).filter(Boolean) as Post[];
    }
  } catch {}
  return [];
}

// ─── Favourites ───────────────────────────────────────────────────────────────

export async function checkFavourited(postId: string, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("favourites")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function toggleFavourite(
  postId: string,
  userId: string,
  nowFavourited: boolean,
): Promise<void> {
  try {
    if (nowFavourited) {
      await supabase.from("favourites").insert({ post_id: postId, user_id: userId });
    } else {
      await supabase.from("favourites").delete().eq("post_id", postId).eq("user_id", userId);
    }
  } catch {}
}

export async function fetchFavouritedPosts(userId: string): Promise<Post[]> {
  try {
    const { data, error } = await supabase
      .from("favourites")
      .select("posts(*, profiles:user_id(*))")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error && data && data.length > 0) {
      return (data as any[]).map((r) => r.posts).filter(Boolean) as Post[];
    }
  } catch {}
  return [];
}

export async function fetchLikedPosts(userId: string): Promise<Post[]> {
  try {
    const { data, error } = await supabase
      .from("likes")
      .select("posts(*, profiles:user_id(*))")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error && data && data.length > 0) {
      return (data as any[]).map((r) => r.posts).filter(Boolean) as Post[];
    }
  } catch {}
  return [];
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*, profiles:actor_id(username, avatar_url), posts:post_id(image_url)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error && data && data.length > 0) {
      return data.map((n: any) => ({
        id: n.id,
        type: n.type as Notification["type"],
        username: n.profiles?.username ?? "user",
        text: notifText(n.type, n.message),
        time: timeAgoShort(n.created_at),
        read: n.read ?? false,
        post_image: n.posts?.image_url ?? undefined,
      }));
    }
  } catch {}
  return MOCK_NOTIFICATIONS;
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  } catch {}
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  try {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
  } catch {}
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  try {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ─── User Settings ────────────────────────────────────────────────────────────

export interface UserSettings {
  private_account: boolean;
  comment_permission: "everyone" | "friends" | "nobody";
  message_permission: "everyone" | "friends" | "nobody";
  duet_permission: boolean;
  liked_private: boolean;
  notif_likes: boolean;
  notif_comments: boolean;
  notif_follows: boolean;
  notif_live: boolean;
  notif_mentions: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  private_account: false,
  comment_permission: "everyone",
  message_permission: "everyone",
  duet_permission: true,
  liked_private: false,
  notif_likes: true,
  notif_comments: true,
  notif_follows: true,
  notif_live: true,
  notif_mentions: true,
};

export async function fetchUserSettings(userId: string): Promise<UserSettings> {
  try {
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) return { ...DEFAULT_SETTINGS, ...data } as UserSettings;
  } catch {}
  return DEFAULT_SETTINGS;
}

export async function saveUserSettings(
  userId: string,
  patch: Partial<UserSettings>,
): Promise<void> {
  try {
    await supabase
      .from("user_settings")
      .upsert(
        { user_id: userId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  } catch {}
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export interface WalletData {
  coins: number;
  total_earnings: number;
}

export interface WalletTransaction {
  id: string;
  icon: string;
  label: string;
  username: string;
  coins: number;
  time: string;
}

export async function fetchWallet(userId: string): Promise<WalletData> {
  try {
    const { data, error } = await supabase
      .from("wallet")
      .select("coins, total_earnings")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) return data as WalletData;
  } catch {}
  return { coins: 1846, total_earnings: 2670 };
}

export async function fetchWalletTransactions(userId: string): Promise<WalletTransaction[]> {
  try {
    const { data, error } = await supabase
      .from("gifts")
      .select("*, profiles:sender_id(username)")
      .eq("receiver_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error && data && data.length > 0) {
      return data.map((g: any) => ({
        id: g.id,
        icon:
          g.gift_type === "diamond"
            ? "💎"
            : g.gift_type === "rose"
              ? "🌹"
              : g.gift_type === "lion"
                ? "🦁"
                : g.gift_type === "rocket"
                  ? "🚀"
                  : g.gift_type === "star"
                    ? "⭐"
                    : "🎁",
        label: `Live Gift — ${g.gift_type ? g.gift_type.charAt(0).toUpperCase() + g.gift_type.slice(1) : "Gift"}`,
        username: g.profiles?.username ?? "user",
        coins: g.coins ?? 0,
        time: timeAgoShort(g.created_at),
      }));
    }
  } catch {}
  return [];
}

// ─── Live Streams ─────────────────────────────────────────────────────────────

export async function createLiveStream(
  userId: string,
  title: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("live_streams")
      .insert({
        user_id: userId,
        title,
        status: "live",
        started_at: new Date().toISOString(),
        viewer_count: 0,
        coins_earned: 0,
      })
      .select("id")
      .single();
    if (!error && data) return (data as any).id;
  } catch {}
  return null;
}

export async function endLiveStream(
  streamId: string,
  viewerCount: number,
  coinsEarned: number,
): Promise<void> {
  try {
    await supabase
      .from("live_streams")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        viewer_count: viewerCount,
        coins_earned: coinsEarned,
      })
      .eq("id", streamId);
  } catch {}
}

// ─── Vibe Matches ─────────────────────────────────────────────────────────────

export async function createVibeMatch(
  senderId: string,
  receiverProfileId: string,
): Promise<void> {
  try {
    await supabase
      .from("vibe_matches")
      .upsert(
        {
          user_id: senderId,
          matched_user_id: receiverProfileId,
          status: "pending",
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,matched_user_id" },
      );
  } catch {}
}

// ─── Stories ──────────────────────────────────────────────────────────────────

export async function fetchActiveStories(myUserId?: string): Promise<
  Array<{ id: string; username: string; image: string; hasNew: boolean; isOwn?: boolean }>
> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("stories")
      .select("*, profiles:user_id(id, username, avatar_url)")
      .gt("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data && data.length > 0) {
      return data.map((s: any) => ({
        id: s.id,
        username: s.profiles?.username ?? "user",
        image: s.media_url ?? `https://picsum.photos/seed/${s.id}/200/200`,
        hasNew: !s.viewed,
        isOwn: s.user_id === myUserId,
      }));
    }
  } catch {}
  return [];
}
