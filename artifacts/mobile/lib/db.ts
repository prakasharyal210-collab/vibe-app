import { readAsStringAsync } from 'expo-file-system/legacy';
import {
  MOCK_COMMENTS,
  MOCK_CONVERSATIONS,
  MOCK_HASHTAGS,
  MOCK_NOTIFICATIONS,
  MOCK_SEARCH_ACCOUNTS,
  Comment,
  Conversation,
  Hashtag,
  Notification,
  Post,
  Profile,
  formatCount,
  supabase,
} from "./supabase";

// Read a local file URI as base64 string reliably on Android & iOS.
// fetch(uri) can hang indefinitely on Android content:// URIs.
async function localUriToBase64(uri: string): Promise<string> {
  return readAsStringAsync(uri, { encoding: 'base64' as any });
}

// Race any promise against a timeout so uploads never hang forever.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

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

// ─── Reel Comments ────────────────────────────────────────────────────────────

export async function fetchReelComments(reelId: string): Promise<Comment[]> {
  try {
    const { data: rpcData } = await supabase.rpc("get_reel_comments", { p_reel_id: reelId, p_user_id: null });
    if (rpcData && rpcData.length > 0) return rpcData as Comment[];
  } catch {}
  try {
    const { data, error } = await supabase
      .from("reel_comments")
      .select("*, profiles:user_id(id, username, avatar_url, is_verified)")
      .eq("reel_id", reelId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data && data.length > 0) return data as unknown as Comment[];
  } catch {}
  return MOCK_COMMENTS.slice(0, 5);
}

export async function addReelComment(
  reelId: string,
  userId: string,
  text: string,
): Promise<Comment | null> {
  try {
    const { data: rpcData } = await supabase.rpc("add_reel_comment", {
      p_user_id: userId,
      p_reel_id: reelId,
      p_content: text,
    });
    if (rpcData) return rpcData as Comment;
  } catch {}
  try {
    const { data, error } = await supabase
      .from("reel_comments")
      .insert({ reel_id: reelId, user_id: userId, text })
      .select("*, profiles:user_id(id, username, avatar_url, is_verified)")
      .single();
    if (!error && data) return data as unknown as Comment;
  } catch {}
  return null;
}

// ─── Search History ────────────────────────────────────────────────────────────

export interface SearchHistoryItem {
  id: string;
  query: string;
  created_at: string;
}

export async function loadSearchHistory(userId: string): Promise<SearchHistoryItem[]> {
  try {
    const { data, error } = await supabase
      .from("search_history")
      .select("id, query, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) return data as SearchHistoryItem[];
  } catch {}
  return [];
}

export async function saveSearchHistory(userId: string, query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  try {
    await supabase
      .from("search_history")
      .upsert({ user_id: userId, query: q }, { onConflict: "user_id,query" });
  } catch {}
}

export async function clearSearchHistory(userId: string): Promise<void> {
  try {
    await supabase.from("search_history").delete().eq("user_id", userId);
  } catch {}
}

export async function deleteSearchHistoryItem(id: string): Promise<void> {
  try {
    await supabase.from("search_history").delete().eq("id", id);
  } catch {}
}

// ─── Daily Reward ──────────────────────────────────────────────────────────────

export interface DailyRewardResult {
  claimed: boolean;
  coins_awarded: number;
  new_balance: number;
  message: string;
  streak: number;
}

export interface StreakInfo {
  streak: number;
  claimed_today: boolean;
  coins_today: number;
  next_reward: number;
}

export async function claimDailyReward(userId: string): Promise<DailyRewardResult> {
  try {
    const { data, error } = await supabase.rpc("claim_daily_reward", { p_user_id: userId });
    if (!error && data) return data as DailyRewardResult;
  } catch {}
  try {
    const { data: rows } = await supabase
      .from("daily_rewards")
      .select("claimed_at")
      .eq("user_id", userId)
      .order("claimed_at", { ascending: false })
      .limit(30);
    const today = new Date();
    const alreadyClaimed = rows && rows.length > 0 &&
      new Date(rows[0].claimed_at).toDateString() === today.toDateString();
    if (alreadyClaimed) {
      const streak = _calcStreak(rows ?? []);
      return { claimed: false, coins_awarded: 0, new_balance: 0, message: "Already claimed today!", streak };
    }
    await supabase.from("daily_rewards").insert({ user_id: userId, coins_awarded: 50 });
    await supabase.from("wallet").upsert(
      { user_id: userId, coins: 50 },
      { onConflict: "user_id" },
    );
    const streak = _calcStreak([{ claimed_at: today.toISOString() }, ...(rows ?? [])]);
    return { claimed: true, coins_awarded: 50, new_balance: 50, message: "🎉 +50 coins claimed!", streak };
  } catch {}
  return { claimed: true, coins_awarded: 50, new_balance: 0, message: "🎉 +50 coins!", streak: 1 };
}

function _calcStreak(rows: { claimed_at: string }[]): number {
  if (!rows.length) return 0;
  let streak = 0;
  let expected = new Date();
  expected.setHours(0, 0, 0, 0);
  for (const row of rows) {
    const d = new Date(row.claimed_at);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === expected.getTime()) {
      streak++;
      expected.setDate(expected.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export async function getStreakInfo(userId: string): Promise<StreakInfo> {
  try {
    const { data: rows } = await supabase
      .from("daily_rewards")
      .select("claimed_at, coins_awarded")
      .eq("user_id", userId)
      .order("claimed_at", { ascending: false })
      .limit(30);
    if (!rows) return { streak: 0, claimed_today: false, coins_today: 0, next_reward: 50 };
    const today = new Date();
    const claimed_today = rows.length > 0 &&
      new Date(rows[0].claimed_at).toDateString() === today.toDateString();
    const coins_today = claimed_today ? (rows[0] as any).coins_awarded ?? 50 : 0;
    const streak = _calcStreak(rows);
    const next_reward = streak >= 6 ? 100 : streak >= 2 ? 75 : 50;
    return { streak, claimed_today, coins_today, next_reward };
  } catch {
    return { streak: 0, claimed_today: false, coins_today: 0, next_reward: 50 };
  }
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
      .select("*, profiles:actor_id(username, avatar_url), posts:post_id(media_url)")
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
        post_image: n.posts?.media_url ?? undefined,
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
  message_permission: "everyone" | "friends" | "matches" | "nobody";
  duet_permission: "everyone" | "friends" | "nobody";
  liked_private: boolean;
  notif_likes: boolean;
  notif_comments: boolean;
  notif_follows: boolean;
  notif_live: boolean;
  notif_mentions: boolean;
  selected_theme?: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  private_account: false,
  comment_permission: "everyone",
  message_permission: "everyone",
  duet_permission: "everyone",
  liked_private: false,
  notif_likes: true,
  notif_comments: true,
  notif_follows: true,
  notif_live: true,
  notif_mentions: true,
  selected_theme: "classic",
};

export async function fetchUserSettings(userId: string): Promise<UserSettings> {
  try {
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) {
      const raw = data as any;
      const duet = raw.duet_permission;
      return {
        ...DEFAULT_SETTINGS,
        ...raw,
        duet_permission: typeof duet === "boolean" ? (duet ? "everyone" : "nobody") : (duet ?? "everyone"),
      } as UserSettings;
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

// ─── Blocked / Restricted Users ───────────────────────────────────────────────

export interface BlockedUser {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export async function getBlockedUsers(userId: string): Promise<BlockedUser[]> {
  try {
    const { data, error } = await supabase
      .from("blocks")
      .select("blocked_id, profiles!blocks_blocked_id_fkey(id, username, display_name, avatar_url)")
      .eq("blocker_id", userId);
    if (error || !data) return [];
    return (data as any[]).map((row: any) => {
      const p = row.profiles ?? {};
      return { id: row.blocked_id, username: p.username ?? "user", display_name: p.display_name, avatar_url: p.avatar_url };
    });
  } catch { return []; }
}

export interface RestrictedUser {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export async function getRestrictedUsers(userId: string): Promise<RestrictedUser[]> {
  try {
    const { data, error } = await supabase
      .from("restricted_users")
      .select("restricted_id, profiles!restricted_users_restricted_id_fkey(id, username, display_name, avatar_url)")
      .eq("restrictor_id", userId);
    if (error || !data) return [];
    return (data as any[]).map((row: any) => {
      const p = row.profiles ?? {};
      return { id: row.restricted_id, username: p.username ?? "user", display_name: p.display_name, avatar_url: p.avatar_url };
    });
  } catch { return []; }
}

export async function restrictUser(myId: string, theirId: string): Promise<void> {
  try {
    await supabase.from("restricted_users").upsert({ restrictor_id: myId, restricted_id: theirId }, { onConflict: "restrictor_id,restricted_id" });
  } catch {}
}

export async function unrestrictUser(myId: string, theirId: string): Promise<void> {
  try {
    await supabase.from("restricted_users").delete().eq("restrictor_id", myId).eq("restricted_id", theirId);
  } catch {}
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

// ─── Gundruk Privacy & Preference Settings ─────────────────────────────────────

export interface GundrukProfile {
  show_in_matching: boolean;
  find_gundruk_mode: string;
  vibe_request_privacy: string;
}

export async function getGundrukProfile(userId: string): Promise<GundrukProfile> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("show_in_matching, find_gundruk_mode, vibe_request_privacy")
      .eq("id", userId)
      .maybeSingle();
    if (!error && data) {
      const raw = data as any;
      return {
        show_in_matching: raw.show_in_matching ?? false,
        find_gundruk_mode: raw.find_gundruk_mode ?? "dating",
        vibe_request_privacy: raw.vibe_request_privacy ?? "everyone",
      };
    }
  } catch {}
  // Default: locked until user consciously sets up Find Vibe
  return { show_in_matching: false, find_gundruk_mode: "dating", vibe_request_privacy: "everyone" };
}

export async function saveGundrukProfile(userId: string, patch: Partial<GundrukProfile>): Promise<void> {
  try {
    await supabase.from("profiles").update(patch as any).eq("id", userId);
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

export type StoryEntry = {
  id: string;
  username: string;
  image: string;
  hasNew: boolean;
  isOwn?: boolean;
  isOnline?: boolean;
  userId?: string;
  hasExistingStory?: boolean;
};

const MOCK_FRIEND_STORIES: StoryEntry[] = [
  { id: "fs1", username: "luna_sky",     image: "https://picsum.photos/seed/fs1/200/200", hasNew: true,  isOnline: true,  userId: "u1" },
  { id: "fs2", username: "marcus_vibe",  image: "https://picsum.photos/seed/fs2/200/200", hasNew: true,  isOnline: false, userId: "u2" },
  { id: "fs3", username: "zoe.creates",  image: "https://picsum.photos/seed/fs3/200/200", hasNew: false, isOnline: true,  userId: "u3" },
  { id: "fs4", username: "kai_fit",      image: "https://picsum.photos/seed/fs4/200/200", hasNew: true,  isOnline: false, userId: "u4" },
  { id: "fs5", username: "nadia_off",    image: "https://picsum.photos/seed/fs5/200/200", hasNew: false, isOnline: true,  userId: "u5" },
  { id: "fs6", username: "alex.w",       image: "https://picsum.photos/seed/fs6/200/200", hasNew: true,  isOnline: true,  userId: "u6" },
];

export async function fetchActiveStories(myUserId?: string): Promise<StoryEntry[]> {
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
        userId: s.user_id,
      }));
    }
  } catch {}
  return [];
}

export async function fetchFriendStories(myUserId: string): Promise<StoryEntry[]> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get my own story (if any)
    const { data: myStoryData } = await supabase
      .from("stories")
      .select("id, media_url, profiles:user_id(username)")
      .eq("user_id", myUserId)
      .gt("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1);

    const myStory = myStoryData?.[0];
    const ownEntry: StoryEntry = {
      id: myStory?.id ?? "own_placeholder",
      username: (myStory as any)?.profiles?.username ?? "you",
      image: (myStory as any)?.media_url ?? "",
      hasNew: false,
      isOwn: true,
      userId: myUserId,
      hasExistingStory: !!myStory,
    };

    // Find mutual followers (people I follow AND who follow me back)
    const [{ data: followingData }, { data: followersData }] = await Promise.all([
      supabase.from("follows").select("followed_id").eq("follower_id", myUserId),
      supabase.from("follows").select("follower_id").eq("followed_id", myUserId),
    ]);

    const followingSet = new Set((followingData ?? []).map((f: any) => f.followed_id));
    const mutualIds = (followersData ?? [])
      .map((f: any) => f.follower_id)
      .filter((id: string) => followingSet.has(id));

    if (mutualIds.length === 0) return [ownEntry, ...MOCK_FRIEND_STORIES];

    // Fetch stories from mutual friends
    const { data: storiesData, error } = await supabase
      .from("stories")
      .select("*, profiles:user_id(id, username, avatar_url)")
      .in("user_id", mutualIds)
      .gt("created_at", cutoff)
      .order("created_at", { ascending: false });

    if (error || !storiesData || storiesData.length === 0) return [ownEntry, ...MOCK_FRIEND_STORIES];

    // Deduplicate: one entry per user (most recent story)
    const seenUsers = new Set<string>();
    const uniqueStories = storiesData.filter((s: any) => {
      if (seenUsers.has(s.user_id)) return false;
      seenUsers.add(s.user_id);
      return true;
    });

    // Sort: unseen first, then newest
    uniqueStories.sort((a: any, b: any) => {
      if (!a.viewed && b.viewed) return -1;
      if (a.viewed && !b.viewed) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const friendEntries: StoryEntry[] = uniqueStories.map((s: any) => ({
      id: s.id,
      username: s.profiles?.username ?? "user",
      image: s.media_url ?? `https://picsum.photos/seed/${s.id}/200/200`,
      hasNew: !s.viewed,
      isOwn: false,
      userId: s.user_id,
      isOnline: false,
    }));

    return [ownEntry, ...friendEntries];
  } catch {
    const ownEntry: StoryEntry = {
      id: "own_placeholder",
      username: "you",
      image: "",
      hasNew: false,
      isOwn: true,
      userId: myUserId,
      hasExistingStory: false,
    };
    return [ownEntry, ...MOCK_FRIEND_STORIES];
  }
}

// ─── Conversations / Messages ─────────────────────────────────────────────────

export async function fetchConversations(userId: string): Promise<Conversation[]> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select(
        "*, sender:sender_id(id, username, avatar_url), receiver:receiver_id(id, username, avatar_url)"
      )
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data && data.length > 0) {
      const seen = new Set<string>();
      const convos: Conversation[] = [];
      for (const msg of data as any[]) {
        const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
        const otherUser = msg.sender_id === userId ? msg.receiver : msg.sender;
        if (!seen.has(otherId) && otherUser) {
          seen.add(otherId);
          convos.push({
            id: `conv_${otherId}`,
            other_user: {
              id: otherId,
              username: otherUser.username,
              avatar_url: otherUser.avatar_url,
            },
            last_message: msg.text,
            last_message_at: msg.created_at,
            unread_count: 0,
          });
        }
      }
      if (convos.length > 0) return convos;
    }
  } catch {}
  return MOCK_CONVERSATIONS;
}

export async function fetchMessages(myId: string, otherId: string): Promise<import("./supabase").Message[]> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`
      )
      .order("created_at", { ascending: true })
      .limit(100);
    if (!error && data && data.length > 0) return data as import("./supabase").Message[];
  } catch {}
  return [];
}

export async function sendMessageToUser(
  senderId: string,
  receiverId: string,
  text: string
): Promise<import("./supabase").Message | null> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: senderId, receiver_id: receiverId, text })
      .select()
      .single();
    if (!error && data) return data as import("./supabase").Message;
  } catch {}
  return null;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchProfiles(query: string): Promise<Profile[]> {
  if (!query.trim()) return MOCK_SEARCH_ACCOUNTS;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, bio, avatar_url, followers_count, is_verified")
      .or(`username.ilike.%${query}%,bio.ilike.%${query}%`)
      .order("followers_count", { ascending: false })
      .limit(20);
    if (!error && data && data.length > 0) return data as Profile[];
  } catch {}
  return MOCK_SEARCH_ACCOUNTS.filter(
    (a) =>
      a.username.toLowerCase().includes(query.toLowerCase()) ||
      a.bio?.toLowerCase().includes(query.toLowerCase())
  );
}

export async function searchHashtags(query: string): Promise<Hashtag[]> {
  if (!query.trim()) return MOCK_HASHTAGS;
  try {
    const { data, error } = await supabase
      .from("hashtags")
      .select("name, posts_count")
      .ilike("name", `%${query}%`)
      .order("posts_count", { ascending: false })
      .limit(20);
    if (!error && data && data.length > 0) {
      return data.map((h: any) => ({
        tag: h.name,
        count: formatCount(h.posts_count ?? 0) + " posts",
        image: `https://picsum.photos/seed/${h.name}/300/200`,
      }));
    }
  } catch {}
  return MOCK_HASHTAGS.filter((h) =>
    h.tag.toLowerCase().includes(query.toLowerCase())
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function fetchUserProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (!error && data) return data as Profile;
  } catch {}
  return null;
}

export async function updateUserProfile(
  userId: string,
  patch: Partial<Profile>
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", userId);
  } catch {}
}

// ─── Realtime helpers ─────────────────────────────────────────────────────────

export function subscribeToMessages(
  userId: string,
  onNew: (msg: any) => void
) {
  return supabase
    .channel(`messages:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${userId}`,
      },
      (payload) => onNew(payload.new)
    )
    .subscribe();
}

export function subscribeToNotifications(
  userId: string,
  onNew: (notif: any) => void
) {
  return supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onNew(payload.new)
    )
    .subscribe();
}

// ─── Supabase RPC Functions ────────────────────────────────────────────────────

export async function getPersonalizedFeed(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  try {
    const { data, error } = await supabase.rpc('get_personalized_feed', {
      p_user_id: userId,
      p_limit: limit,
      p_offset: offset,
    });
    if (!error && data && data.length > 0) return data as Post[];
  } catch {}
  const { data: fallback } = await supabase
    .from('posts')
    .select('*, profiles(*)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  return (fallback as Post[]) ?? [];
}

export async function trackUserInterest(
  userId: string,
  hashtag: string,
  interactionType: 'like' | 'comment' | 'share' | 'view'
): Promise<void> {
  try {
    await supabase.rpc('track_user_interest', {
      p_user_id: userId,
      p_hashtag: hashtag,
      p_interaction_type: interactionType,
    });
  } catch {}
}

export async function updateVibeScore(userId: string, points: number, reason: string): Promise<void> {
  try {
    await supabase.rpc('update_vibe_score', {
      p_user_id: userId,
      p_points: points,
      p_reason: reason,
    });
  } catch {}
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  coins: number;
}

export async function checkAchievements(userId: string): Promise<Achievement[]> {
  try {
    const { data, error } = await supabase.rpc('check_achievements', { p_user_id: userId });
    if (!error && Array.isArray(data) && data.length > 0) return data as Achievement[];
  } catch {}
  return [];
}

export async function detectSpam(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('detect_spam', { p_user_id: userId });
    if (!error) return !!data;
  } catch {}
  return false;
}

export async function updateCreatorAnalytics(userId: string): Promise<void> {
  try {
    await supabase.rpc('update_creator_analytics', { p_user_id: userId });
  } catch {}
}

export interface LeaderboardEntry {
  id: string;
  user_id: string;
  period: string;
  rank: number;
  score: number;
  profiles?: { username: string; avatar_url?: string };
}

export async function fetchLeaderboard(period = 'weekly'): Promise<LeaderboardEntry[]> {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*, profiles(username, avatar_url)')
      .eq('period', period)
      .order('rank', { ascending: true })
      .limit(10);
    if (!error && data && data.length > 0) return data as LeaderboardEntry[];
  } catch {}
  return [];
}

// ─── Onboarding & Feed Tab RPCs ───────────────────────────────────────────────

export async function needsOnboarding(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('needs_onboarding', { p_user_id: userId });
    if (!error) return !!data;
  } catch {}
  return false;
}

export async function saveOnboardingInterests(userId: string, interests: string[]): Promise<void> {
  try {
    await supabase.rpc('save_onboarding_interests', {
      p_user_id: userId,
      p_interests: interests,
    });
  } catch {}
}

// Interleave fresh recent posts into a base feed every N slots so new users go viral.
function viralBoostFeed(base: Post[], fresh: Post[], everyN = 3): Post[] {
  const seenIds = new Set(base.map((p) => p.id));
  const queue = fresh.filter((p) => !seenIds.has(p.id));
  const result: Post[] = [];
  let qi = 0;
  for (let i = 0; i < base.length; i++) {
    result.push(base[i]);
    if ((i + 1) % everyN === 0 && qi < queue.length) {
      result.push(queue[qi++]);
    }
  }
  while (qi < queue.length) result.push(queue[qi++]);
  return result;
}

async function fetchFreshPosts(limit = 20): Promise<Post[]> {
  try {
    const { data } = await supabase
      .from('posts')
      .select('*, profiles!user_id(*)')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data as Post[]) ?? [];
  } catch {
    return [];
  }
}

export async function getForYouFeed(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  // Fetch fresh posts in parallel with the RPC for viral boost
  const [rpcResult, fresh] = await Promise.allSettled([
    supabase.rpc('get_for_you_feed', { p_user_id: userId, p_limit: limit, p_offset: offset }),
    fetchFreshPosts(limit),
  ]);
  const freshPosts = rpcResult.status === 'fulfilled' && !rpcResult.value.error && rpcResult.value.data?.length
    ? rpcResult.value.data as Post[]
    : null;
  const freshFallback = fresh.status === 'fulfilled' ? fresh.value : [];
  if (freshPosts && freshPosts.length > 0) {
    return viralBoostFeed(freshPosts, freshFallback);
  }
  // Fallback: just return fresh recent posts sorted by date
  return freshFallback;
}

export async function getFollowingFeed(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  try {
    const { data, error } = await supabase.rpc('get_following_feed', {
      p_user_id: userId, p_limit: limit, p_offset: offset,
    });
    if (!error && data && data.length > 0) return data as Post[];
  } catch {}
  return [];
}

export async function getFriendsFeed(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  // Fetch friends feed and fresh posts in parallel
  const [rpcResult, fresh] = await Promise.allSettled([
    supabase.rpc('get_friends_feed', { p_user_id: userId, p_limit: limit, p_offset: offset }),
    fetchFreshPosts(limit),
  ]);
  const friendsPosts = rpcResult.status === 'fulfilled' && !rpcResult.value.error && rpcResult.value.data?.length
    ? rpcResult.value.data as Post[]
    : null;
  const freshFallback = fresh.status === 'fulfilled' ? fresh.value : [];
  if (friendsPosts && friendsPosts.length > 0) {
    // Friends content + viral boost injection every 3rd slot
    return viralBoostFeed(friendsPosts, freshFallback);
  }
  // No friends yet — show fresh content from everyone so the tab is never empty
  return freshFallback;
}

export async function getNearbyFeed(lat: number, lng: number, userId: string, limit = 20, offset = 0): Promise<Post[]> {
  try {
    const { data, error } = await supabase.rpc('get_nearby_feed', {
      p_lat: lat, p_lng: lng, p_user_id: userId, p_limit: limit, p_offset: offset,
    });
    if (!error && data && data.length > 0) return data as Post[];
  } catch {}
  const { data } = await supabase.from('posts').select('*, profiles(*)').or('visibility.eq.public,visibility.is.null').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  return (data as Post[]) ?? [];
}

export async function getVibesFeed(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  try {
    const { data, error } = await supabase.rpc('get_vibes_feed', {
      p_user_id: userId, p_limit: limit, p_offset: offset,
    });
    if (!error && data && data.length > 0) return data as Post[];
  } catch {}
  const { data } = await supabase.from('posts').select('*, profiles(*)').or('visibility.eq.public,visibility.is.null').order('likes_count', { ascending: false }).range(offset, offset + limit - 1);
  return (data as Post[]) ?? [];
}

export async function markPostSeen(userId: string, postId: string): Promise<void> {
  try {
    await supabase.rpc('mark_post_seen', { p_user_id: userId, p_post_id: postId });
  } catch {}
}

export async function saveTabPreference(userId: string, tab: string): Promise<void> {
  try {
    await supabase.from('user_tab_preferences').upsert(
      { user_id: userId, last_tab: tab, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  } catch {}
}

// ── Profile Grid ──────────────────────────────────────────────────────────────
export interface ProfileGridItem {
  id: string;
  image_url: string;
  video_url?: string;
  is_video?: boolean;
  isReel: boolean;
  likes: number;
  comments: number;
  caption: string;
  duration?: number;
  created_at: string;
  is_pinned?: boolean;
  visibility?: string;
}

function isVideoMediaUrl(url: string): boolean {
  const u = (url ?? "").toLowerCase().split("?")[0] ?? "";
  return u.endsWith(".mp4") || u.endsWith(".mov") || u.endsWith(".webm") || u.endsWith(".m4v");
}

export function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#\w+/g);
  return matches ? matches.map((h) => h.slice(1)) : [];
}

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

export async function fetchProfilePosts(userId: string, viewerId?: string): Promise<ProfileGridItem[]> {
  try {
    // Route through API server (service role) to bypass RLS on posts/reels tables
    const url = viewerId
      ? `${API_BASE}/posts/user/${userId}?viewerId=${encodeURIComponent(viewerId)}`
      : `${API_BASE}/posts/user/${userId}`;
    const res = await fetch(url);
    if (res.ok) {
      const { posts: rawPosts, reels: rawReels } = await res.json() as {
        posts: any[];
        reels: any[];
      };
      const posts: ProfileGridItem[] = rawPosts.map((p: any) => {
        const mediaUrl = p.media_url ?? p.image_url ?? '';
        const isVid = isVideoMediaUrl(mediaUrl);
        return {
          id: p.id,
          image_url: mediaUrl,
          video_url: isVid ? mediaUrl : undefined,
          is_video: isVid,
          isReel: false,
          likes: p.likes_count ?? 0,
          comments: p.comments_count ?? 0,
          caption: p.caption ?? '',
          created_at: p.created_at,
          is_pinned: p.is_pinned ?? false,
          visibility: p.visibility ?? 'public',
        };
      });
      const reels: ProfileGridItem[] = rawReels.map((r: any) => ({
        id: `reel_${r.id}`,
        image_url: r.thumbnail_url ?? '',
        video_url: r.video_url,
        isReel: true,
        likes: r.likes_count ?? 0,
        comments: r.comments_count ?? 0,
        caption: r.caption ?? '',
        duration: r.duration,
        created_at: r.created_at,
        is_pinned: false,
      }));
      const pinned = posts.filter((p) => p.is_pinned);
      const rest = [...posts.filter((p) => !p.is_pinned), ...reels].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return [...pinned, ...rest];
    }
  } catch (err) {
    console.log('fetchProfilePosts API error:', err);
  }
  return [];
}

export async function uploadPostMedia(
  userId: string,
  uri: string,
  caption: string,
  options?: {
    location?: string;
    taggedUsers?: string[];
    filterId?: string;
    commentsEnabled?: boolean;
    downloadsEnabled?: boolean;
    visibility?: string;
  }
): Promise<{ id: string; mediaUrl: string } | null> {
  try {
    const cleanUri = uri.split('?')[0];
    const ext = (cleanUri.split('.').pop() ?? 'jpg').toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';

    // Read file as base64 for upload
    let imageBase64: string | undefined;
    try {
      imageBase64 = await withTimeout(localUriToBase64(uri), 20_000, 'file read');
    } catch (readErr) {
      console.log('File read failed (posting without image):', readErr);
    }

    // Send to API server — service role key handles storage + DB insert, bypassing RLS
    const res = await withTimeout(
      fetch(`${API_BASE}/posts/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, imageBase64, mimeType, ext, caption, options: { ...options, visibility: options?.visibility ?? 'public' } }),
      }),
      60_000,
      'post create API'
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      throw new Error(`Post create API ${res.status}: ${errText}`);
    }

    const result = await res.json() as { id: string; mediaUrl: string };
    return result;
  } catch (err) {
    console.log('uploadPostMedia error:', err);
    return null;
  }
}

export async function uploadReelMedia(
  userId: string,
  uri: string,
  caption: string,
  duration?: number
): Promise<{ id: string; videoUrl: string } | null> {
  try {
    const cleanUri = uri.split('?')[0];
    const ext = (cleanUri.split('.').pop() ?? 'mp4').toLowerCase();
    const mimeType = ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4';

    // Read video as base64 for upload
    let videoBase64: string | undefined;
    try {
      videoBase64 = await withTimeout(localUriToBase64(uri), 30_000, 'reel file read');
    } catch (readErr) {
      console.log('Reel file read failed (posting without video):', readErr);
    }

    // Send to API server — service role key handles storage + DB insert, bypassing RLS
    const res = await withTimeout(
      fetch(`${API_BASE}/reels/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, videoBase64, mimeType, ext, caption, duration }),
      }),
      120_000,
      'reel create API'
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      throw new Error(`Reel create API ${res.status}: ${errText}`);
    }

    const result = await res.json() as { id: string; videoUrl: string };
    return result;
  } catch (err) {
    console.log('uploadReelMedia error:', err);
    return null;
  }
}

// ─── Relationship Goals ───────────────────────────────────────────────────────

export const RELATIONSHIP_GOALS = [
  { value: "long_term",        label: "Long-term partner",  shortLabel: "Long-term",     emoji: "🌹", count: "3K",   color: "#EC4899" },
  { value: "serious",          label: "Serious commitment", shortLabel: "Serious",       emoji: "💍", count: "2K",   color: "#EF4444" },
  { value: "friendship_first", label: "Friendship first",   shortLabel: "Friends first", emoji: "💜", count: "3.5K", color: "#7C3AED" },
  { value: "friendship",       label: "New friends",        shortLabel: "Friends",       emoji: "🤝", count: "5K",   color: "#8B5CF6" },
  { value: "activity",         label: "Activity partner",   shortLabel: "Activity",      emoji: "🏃", count: "2.5K", color: "#10B981" },
  { value: "travel",           label: "Travel buddy",       shortLabel: "Travel",        emoji: "✈️", count: "1.5K", color: "#3B82F6" },
  { value: "gaming",           label: "Gaming buddy",       shortLabel: "Gaming",        emoji: "🎮", count: "1.2K", color: "#A855F7" },
  { value: "language",         label: "Language partner",   shortLabel: "Language",      emoji: "🗣️", count: "800",  color: "#06B6D4" },
  { value: "networking",       label: "Networking",         shortLabel: "Networking",    emoji: "💼", count: "2K",   color: "#64748B" },
  { value: "short_term",       label: "Short-term fun",     shortLabel: "Short-term",    emoji: "🍭", count: "1K",   color: "#F59E0B" },
  { value: "tonight",          label: "Free tonight",       shortLabel: "Tonight",       emoji: "🌙", count: "1K",   color: "#F97316" },
  { value: "figuring",         label: "Still figuring out", shortLabel: "Figuring out",  emoji: "🤔", count: "4K",   color: "#9CA3AF" },
] as const;

export type RelGoalValue = typeof RELATIONSHIP_GOALS[number]["value"];

export function getGoalInfo(value?: string | null): { emoji: string; shortLabel: string; label: string; color: string } | null {
  if (!value || value === "all") return null;
  const found = (RELATIONSHIP_GOALS as readonly { value: string; label: string; shortLabel: string; emoji: string; color: string }[]).find((g) => g.value === value);
  if (found) return found;
  const compat: Record<string, { emoji: string; shortLabel: string; label: string; color: string }> = {
    dating:     { emoji: "💕", shortLabel: "Dating",     label: "Dating",      color: "#EC4899" },
    vibing:     { emoji: "✨", shortLabel: "Vibing",     label: "Just vibing", color: "#F97316" },
  };
  return compat[value] ?? null;
}

// ─── Vibe Preferences ─────────────────────────────────────────────────────────

export interface VibePrefsRow {
  gender: string;
  interested_in: string[];
  looking_for: string;
  age: number;
  age_min: number;
  age_max: number;
  max_distance_km: number;
}

export async function updateVibePreferences(
  userId: string,
  prefs: {
    gender: string;
    interestedIn: string[];
    lookingFor: string;
    goals?: string[];
    age: number;
    ageMin: number;
    ageMax: number;
    maxDistance: number;
  }
): Promise<void> {
  try {
    await supabase.from('vibe_preferences').upsert(
      {
        user_id: userId,
        gender: prefs.gender,
        interested_in: prefs.interestedIn,
        looking_for: prefs.lookingFor,
        age: prefs.age,
        age_min: prefs.ageMin,
        age_max: prefs.ageMax,
        max_distance_km: prefs.maxDistance,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    await supabase.from('profiles').update({ gender: prefs.gender }).eq('id', userId);
    if (prefs.goals?.length) {
      saveUserGoals(userId, prefs.goals).catch(() => {});
    }
  } catch {
  }
}

export async function getVibePreferences(userId: string): Promise<VibePrefsRow | null> {
  try {
    const { data, error } = await supabase
      .from('vibe_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return data as VibePrefsRow;
  } catch {
    return null;
  }
}

export async function saveUserGoals(userId: string, goals: string[]): Promise<void> {
  try {
    await supabase.from("user_relationship_goals").upsert(
      { user_id: userId, goals, primary_goal: goals[0] ?? null, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  } catch {}
}

export async function getUserGoals(userId: string): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("user_relationship_goals")
      .select("goals")
      .eq("user_id", userId)
      .maybeSingle();
    return (data as any)?.goals ?? [];
  } catch {}
  return [];
}

// ─── Vibe Requests (Gender-based Matching) ────────────────────────────────────

export type VibeRequestResult = 'matched' | 'pending';

export async function sendVibeRequest(
  senderId: string,
  receiverId: string
): Promise<VibeRequestResult> {
  try {
    const { data: existing } = await supabase
      .from('vibe_requests')
      .select('id')
      .eq('sender_id', receiverId)
      .eq('receiver_id', senderId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      await supabase
        .from('vibe_requests')
        .update({ status: 'matched', matched_at: new Date().toISOString() })
        .eq('id', (existing as any).id);
      // vibe_matches uses sender_id / receiver_id (not user_id / matched_user_id)
      await supabase.from('vibe_matches').upsert(
        { sender_id: senderId, receiver_id: receiverId, status: 'matched' },
        { onConflict: 'sender_id,receiver_id' }
      );
      return 'matched';
    }

    await supabase.from('vibe_requests').upsert(
      { sender_id: senderId, receiver_id: receiverId, status: 'pending', created_at: new Date().toISOString() },
      { onConflict: 'sender_id,receiver_id' }
    );
    return 'pending';
  } catch {
    return Math.random() < 0.3 ? 'matched' : 'pending';
  }
}

// ─── Vibe Match Profiles ───────────────────────────────────────────────────────

export interface VibeMatchProfile {
  id: string;
  name: string;
  age: number;
  image: string;
  bio: string;
  interests: string[];
  distance?: string;
  vibe?: string;
  matchInterests?: string[];
  vibeScore?: number;
  gender?: string;
  goal?: string;
  isOnline?: boolean;
  isVerified?: boolean;
  matchedAt?: string;
  username?: string;
  sharedInterests?: string[];
  sameGoal?: boolean;
  unreadCount?: number;
  lastMessage?: string;
}

const MOCK_MATCH_PROFILES: VibeMatchProfile[] = [
  { id: "p1", name: "Ariana", age: 24, image: "https://picsum.photos/seed/find1/400/600", bio: "Photographer & world traveler.", interests: ["Photography", "Travel", "Coffee", "Yoga"], distance: "0.3 km", matchInterests: ["Photography", "Travel", "Coffee"], vibeScore: 847, gender: "woman", goal: "dating", isOnline: true },
  { id: "p2", name: "Marcus", age: 27, image: "https://picsum.photos/seed/find2/400/600", bio: "Music producer & dog dad.", interests: ["Music", "Dogs", "Running", "Gaming"], distance: "0.8 km", matchInterests: ["Music"], vibeScore: 612, gender: "man", goal: "friendship", isOnline: false },
  { id: "p3", name: "Zoey", age: 23, image: "https://picsum.photos/seed/find3/400/600", bio: "Artist. Indie music, vintage fashion, late night drives.", interests: ["Art", "Music", "Fashion", "Coffee"], distance: "1.2 km", matchInterests: ["Art", "Music", "Coffee"], vibeScore: 931, gender: "woman", goal: "vibing", isOnline: true },
  { id: "p4", name: "Jay", age: 26, image: "https://picsum.photos/seed/find4/400/600", bio: "Foodie and fitness nerd. Weekend hiker. ENFJ.", interests: ["Fitness", "Food", "Hiking", "Travel"], distance: "2.1 km", matchInterests: ["Travel"], vibeScore: 488, gender: "nonbinary", goal: "friendship", isOnline: false },
  { id: "p5", name: "Sofia", age: 25, image: "https://picsum.photos/seed/find5/400/600", bio: "Actress & content creator. Big INTJ energy.", interests: ["Acting", "Photography", "Art", "Travel"], distance: "3.4 km", matchInterests: ["Photography", "Art", "Travel"], vibeScore: 773, gender: "woman", goal: "networking", isOnline: true },
  { id: "v1", name: "Kai", age: 28, image: "https://picsum.photos/seed/vibe1/400/600", bio: "Adventure is my love language.", interests: ["Travel", "Photography", "Camping", "Music"], vibe: "Adventurer", matchInterests: ["Travel", "Photography", "Music"], vibeScore: 894, gender: "man", goal: "dating", isOnline: true },
  { id: "v2", name: "Mia", age: 22, image: "https://picsum.photos/seed/vibe2/400/600", bio: "Digital artist. Drawing fandoms by day, gaming by night.", interests: ["Art", "Gaming", "Coffee", "Music"], vibe: "Creator", matchInterests: ["Art", "Coffee", "Music"], vibeScore: 756, gender: "woman", goal: "vibing", isOnline: false },
];

export async function getVibeMatches(
  userId: string,
  filters?: { interestedIn?: string[]; lookingFor?: string; ageMin?: number; ageMax?: number; maxDistanceKm?: number }
): Promise<VibeMatchProfile[]> {
  try {
    const { data, error } = await supabase.rpc('get_vibe_matches', {
      p_user_id: userId,
      p_interested_in: filters?.interestedIn ?? [],
      p_looking_for: filters?.lookingFor ?? null,
      p_age_min: filters?.ageMin ?? 18,
      p_age_max: filters?.ageMax ?? 99,
      p_max_distance_km: filters?.maxDistanceKm ?? 100,
    });
    if (error || !data || (data as any[]).length === 0) return MOCK_MATCH_PROFILES;
    return (data as any[]).map((p: any) => ({
      id: p.user_id ?? p.id,
      name: p.display_name ?? p.username ?? 'Vibe User',
      age: p.age ?? 25,
      image: p.avatar_url ?? `https://picsum.photos/seed/${p.id}/400/600`,
      bio: p.bio ?? '',
      interests: p.interests ?? [],
      distance: p.distance_km ? `${(p.distance_km as number).toFixed(1)} km` : undefined,
      vibe: p.vibe_type,
      matchInterests: p.shared_interests ?? [],
      vibeScore: p.vibe_score ?? 0,
      gender: p.gender,
      goal: p.looking_for,
      isOnline: p.is_online ?? false,
      isVerified: p.is_verified ?? false,
    }));
  } catch {
    return MOCK_MATCH_PROFILES;
  }
}

const MOCK_MY_MATCHES: VibeMatchProfile[] = [
  { id: "m1", name: "Ariana", age: 24, image: "https://picsum.photos/seed/match1/400/400", bio: "Photographer & world traveler ✈️ Coffee addict.", interests: ["Photography", "Travel", "Coffee", "Yoga"], isOnline: true, gender: "woman", vibeScore: 847, goal: "dating", matchedAt: "2h ago", username: "ariana.vibes", sharedInterests: ["Photography", "Travel"], sameGoal: true, unreadCount: 3, lastMessage: "Hey! Can't wait to meet 💜" },
  { id: "m2", name: "Zoey", age: 23, image: "https://picsum.photos/seed/match2/400/400", bio: "Artist. Indie music, vintage fashion, late night drives.", interests: ["Art", "Music", "Fashion", "Coffee"], isOnline: false, gender: "woman", vibeScore: 931, goal: "vibing", matchedAt: "1d ago", username: "zoey.creates", sharedInterests: ["Music", "Coffee"], sameGoal: false, unreadCount: 0, lastMessage: "That playlist you shared is 🔥" },
  { id: "m3", name: "Kai", age: 28, image: "https://picsum.photos/seed/match3/400/400", bio: "Adventure is my love language. Hiker, camper, dreamer.", interests: ["Travel", "Photography", "Camping", "Music"], isOnline: true, gender: "man", vibeScore: 712, goal: "friendship", matchedAt: "3d ago", username: "kai.adventures", sharedInterests: ["Travel", "Photography"], sameGoal: true, unreadCount: 0 },
];

function matchTimeStr(isoOrNull: string | null | undefined): string {
  if (!isoOrNull) return "recently";
  try {
    const secs = Math.floor((Date.now() - new Date(isoOrNull).getTime()) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  } catch { return "recently"; }
}

function mapRpcMatch(row: any): VibeMatchProfile {
  const shared = Array.isArray(row.shared_interests) ? row.shared_interests : [];
  return {
    id: row.other_user_id ?? row.matched_user_id ?? row.id,
    name: row.full_name ?? row.display_name ?? row.username ?? 'Vibe User',
    username: row.username,
    age: row.age ?? 25,
    image: row.avatar_url ?? `https://picsum.photos/seed/${row.other_user_id}/400/400`,
    bio: row.bio ?? '',
    interests: Array.isArray(row.interests) ? row.interests : [],
    gender: row.gender,
    isOnline: row.is_online ?? false,
    isVerified: row.is_verified ?? false,
    vibeScore: row.vibe_score ?? 0,
    goal: row.looking_for ?? row.goal,
    matchedAt: matchTimeStr(row.matched_at),
    sharedInterests: shared,
    sameGoal: row.same_goal ?? false,
    unreadCount: row.unread_count ?? 0,
    lastMessage: row.last_message ?? undefined,
  };
}

export async function getMyVibeMatches(userId: string): Promise<VibeMatchProfile[]> {
  // Try the RPC first — it returns richer data (shared interests, unread counts, etc.)
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_my_vibe_matches', {
      p_user_id: userId,
      p_limit: 50,
    });
    if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
      return (rpcData as any[]).map(mapRpcMatch);
    }
  } catch {}

  // Fallback: direct query
  try {
    const { data, error } = await supabase
      .from('vibe_matches')
      .select(`matched_user_id, matched_at, profiles!vibe_matches_matched_user_id_fkey(id, display_name, username, avatar_url, bio, age, gender, interests, is_online, vibe_score, looking_for)`)
      .eq('user_id', userId)
      .eq('status', 'matched')
      .order('matched_at', { ascending: false })
      .limit(50);

    if (error || !data || (data as any[]).length === 0) return MOCK_MY_MATCHES;

    return (data as any[]).map((row: any) => {
      const p = row.profiles ?? {};
      return {
        id: row.matched_user_id,
        name: p.display_name ?? p.username ?? 'Vibe User',
        username: p.username,
        age: p.age ?? 25,
        image: p.avatar_url ?? `https://picsum.photos/seed/${row.matched_user_id}/400/400`,
        bio: p.bio ?? '',
        interests: Array.isArray(p.interests) ? p.interests : [],
        gender: p.gender,
        isOnline: p.is_online ?? false,
        vibeScore: p.vibe_score ?? 0,
        goal: p.looking_for,
        matchedAt: matchTimeStr(row.matched_at),
        sharedInterests: [],
        sameGoal: false,
        unreadCount: 0,
      };
    });
  } catch {
    return MOCK_MY_MATCHES;
  }
}

export async function getOrCreateConversation(userId: string, otherId: string): Promise<string | null> {
  try {
    const { data } = await supabase.rpc('get_or_create_conversation', {
      p_user1_id: userId,
      p_user2_id: otherId,
      p_is_match: true,
    });
    return data as string | null;
  } catch {
    return null;
  }
}

// ─── Block / Report ───────────────────────────────────────────────────────────

export async function blockUser(myId: string, theirId: string): Promise<void> {
  try {
    await supabase.rpc("block_user", { p_blocker_id: myId, p_blocked_id: theirId });
  } catch {}
  try {
    await supabase.from("blocks").upsert({ blocker_id: myId, blocked_id: theirId }, { onConflict: "blocker_id,blocked_id" });
    await supabase.from("follows").delete().or(`and(follower_id.eq.${myId},following_id.eq.${theirId}),and(follower_id.eq.${theirId},following_id.eq.${myId})`);
    await supabase.from("vibe_matches").delete().or(`and(user_id.eq.${myId},matched_user_id.eq.${theirId}),and(user_id.eq.${theirId},matched_user_id.eq.${myId})`);
  } catch {}
}

export async function unblockUser(myId: string, theirId: string): Promise<void> {
  try {
    await supabase.rpc("unblock_user", { p_blocker_id: myId, p_blocked_id: theirId });
  } catch {}
  try {
    await supabase.from("blocks").delete().eq("blocker_id", myId).eq("blocked_id", theirId);
  } catch {}
}

export async function reportContent(
  myId: string,
  contentId: string,
  contentType: "user" | "post" | "comment" | "story",
  reason: string,
): Promise<void> {
  try {
    await supabase.rpc("report_content", { p_reporter_id: myId, p_content_id: contentId, p_content_type: contentType, p_reason: reason });
  } catch {}
  try {
    await supabase.from("content_reports").insert({ reporter_id: myId, content_id: contentId, content_type: contentType, reason });
  } catch {}
}

export async function isUserBlocked(myId: string, theirId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("blocks")
      .select("id")
      .eq("blocker_id", myId)
      .eq("blocked_id", theirId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function amIBlockedBy(myId: string, theirId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("blocks")
      .select("id")
      .eq("blocker_id", theirId)
      .eq("blocked_id", myId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function fetchMessageRequests(userId: string): Promise<Conversation[]> {
  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("*, other_user:profiles!conversations_other_user_id_fkey(id, username, avatar_url)")
      .eq("user_id", userId)
      .eq("is_request", true)
      .order("last_message_at", { ascending: false });
    if (!error && data && data.length > 0) {
      return (data as any[]).map((row: any) => ({
        id: row.id,
        other_user: { id: row.other_user?.id ?? "", username: row.other_user?.username ?? "User", avatar_url: row.other_user?.avatar_url },
        last_message: row.last_message ?? "",
        last_message_at: row.last_message_at ?? row.created_at ?? "",
        unread_count: row.unread_count ?? 1,
      }));
    }
  } catch {}
  return [];
}

export async function acceptMessageRequest(conversationId: string): Promise<void> {
  try {
    await supabase.from("conversations").update({ is_request: false }).eq("id", conversationId);
  } catch {}
}

export async function deleteConversation(conversationId: string): Promise<void> {
  try {
    await supabase.from("conversations").delete().eq("id", conversationId);
  } catch {}
}

// ─── Profile Stats ─────────────────────────────────────────────────────────────

export interface ProfileStats {
  posts_count: number;
  followers_count: number;
  following_count: number;
}

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  try {
    const { data, error } = await supabase.rpc("get_profile_stats", { p_user_id: userId });
    if (!error && data) return data as ProfileStats;
  } catch {}
  try {
    const [postsRes, followersRes, followingRes] = await Promise.all([
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
    ]);
    return {
      posts_count: postsRes.count ?? 0,
      followers_count: followersRes.count ?? 0,
      following_count: followingRes.count ?? 0,
    };
  } catch {
    return { posts_count: 0, followers_count: 0, following_count: 0 };
  }
}

// ─── Social Connections / Find Friends ────────────────────────────────────────

export interface SocialMatchUser {
  id: string;
  username: string;
  avatar_url?: string;
  bio?: string;
  followers_count?: number;
  is_verified?: boolean;
  matchedName?: string;
}

const MOCK_SOCIAL_SUGGESTED: SocialMatchUser[] = [
  { id: "ss1", username: "luna_sky", bio: "Photographer & traveler ✨", followers_count: 124000, is_verified: true },
  { id: "ss2", username: "marcus_vibe", bio: "Music producer 🎵 Dog dad", followers_count: 89000 },
  { id: "ss3", username: "zoe.creates", bio: "Artist & content creator 🎨", followers_count: 204000, is_verified: true },
  { id: "ss4", username: "kai_adventures", bio: "Adventure is my middle name 🏔️", followers_count: 56000 },
  { id: "ss5", username: "nadia.official", bio: "Actress & creator 🎬", followers_count: 432000, is_verified: true },
  { id: "ss6", username: "alex.w", bio: "Music & art 🎵", followers_count: 67800 },
];

export async function findUsersByEmails(
  emails: string[],
  myUserId: string,
): Promise<SocialMatchUser[]> {
  if (!emails.length) return [];
  try {
    const { data, error } = await supabase.rpc("find_users_by_contacts", {
      p_emails: emails.slice(0, 100),
      p_user_id: myUserId,
    });
    if (!error && data?.length) return data as SocialMatchUser[];
  } catch {}
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, bio, followers_count, is_verified")
      .in("email", emails.slice(0, 50))
      .neq("id", myUserId)
      .limit(30);
    if (data?.length) return data as SocialMatchUser[];
  } catch {}
  return [];
}

export async function searchVibeUsers(
  query: string,
  myUserId: string,
  limit = 20,
): Promise<SocialMatchUser[]> {
  const q = query.replace(/^@/, "").toLowerCase().trim();
  if (!q || q.length < 2) return [];
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, bio, followers_count, is_verified")
      .ilike("username", `%${q}%`)
      .neq("id", myUserId)
      .order("followers_count", { ascending: false })
      .limit(limit);
    if (data?.length) return data as SocialMatchUser[];
  } catch {}
  return [];
}

export async function getSuggestedUsersForFindFriends(
  userId: string,
  limit = 15,
): Promise<SocialMatchUser[]> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, bio, followers_count, is_verified")
      .neq("id", userId)
      .order("followers_count", { ascending: false })
      .limit(limit);
    if (data?.length) return data as SocialMatchUser[];
  } catch {}
  return MOCK_SOCIAL_SUGGESTED;
}

export async function toggleFollowUser(myId: string, otherId: string): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", myId)
      .eq("following_id", otherId)
      .maybeSingle();
    if (existing) {
      await supabase.from("follows").delete().eq("follower_id", myId).eq("following_id", otherId);
      return false;
    } else {
      await supabase.from("follows").insert({ follower_id: myId, following_id: otherId });
      return true;
    }
  } catch {}
  return false;
}

// ─── Public Profile Lookup ────────────────────────────────────────────────────

export interface PublicProfile {
  id: string;
  username: string;
  bio?: string;
  avatar_url?: string;
  cover_url?: string;
  location?: string;
  website?: string;
  is_verified?: boolean;
  is_private?: boolean;
  followers_count?: number;
  following_count?: number;
  posts_count?: number;
}

export async function lookupProfileByUsername(username: string): Promise<PublicProfile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, bio, avatar_url, cover_url, location, website, is_verified, is_private, followers_count, following_count, posts_count")
      .eq("username", username)
      .maybeSingle();
    if (!error && data) return data as PublicProfile;
  } catch {}
  return null;
}

export async function checkIsFollowing(followerId: string, followingId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .maybeSingle();
    return !!data;
  } catch {}
  return false;
}

export async function ensureUserSetup(userId: string, username: string, email?: string): Promise<void> {
  try {
    const { data: existing } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (!existing) {
      await supabase.from("profiles").insert({ id: userId, username, email });
    }
  } catch {}
  try {
    const { data: wallet } = await supabase.from("wallet").select("id").eq("user_id", userId).maybeSingle();
    if (!wallet) {
      await supabase.from("wallet").insert({ user_id: userId, coins: 100, total_earnings: 0 });
    }
  } catch {}
  try {
    const { data: settings } = await supabase.from("user_settings").select("id").eq("user_id", userId).maybeSingle();
    if (!settings) {
      await supabase.from("user_settings").insert({ user_id: userId });
    }
  } catch {}
  try {
    const { data: vs } = await supabase.from("vibe_scores").select("id").eq("user_id", userId).maybeSingle();
    if (!vs) {
      await supabase.from("vibe_scores").insert({ user_id: userId, score: 100, level: 1 });
    }
  } catch {}
}

// ─── Nearby Users ──────────────────────────────────────────────────────────────

export async function getNearbyUsers(
  userId: string,
  lat: number | undefined,
  lng: number | undefined,
  radiusKm = 50,
): Promise<VibeMatchProfile[]> {
  try {
    const { data, error } = await supabase.rpc("get_nearby_users", {
      p_user_id: userId,
      p_lat: lat,
      p_lng: lng,
      p_radius_km: radiusKm,
    });
    if (!error && data && (data as any[]).length > 0) {
      return (data as any[]).map((row: any) => ({
        id: row.id,
        name: row.display_name ?? row.username ?? "Vibe User",
        age: row.age ?? 24,
        image: row.avatar_url ?? `https://picsum.photos/seed/${row.id}/400/600`,
        bio: row.bio ?? "",
        interests: row.interests ?? [],
        distance: row.distance_km ? `${Math.round(row.distance_km)} km away` : undefined,
        isOnline: row.is_online ?? false,
        gender: row.gender,
      }));
    }
  } catch {}
  return MOCK_MATCH_PROFILES.map((p, i) => ({
    ...p,
    distance: `${(i + 1) * 2 + Math.floor(Math.random() * 3)} km away`,
  }));
}

export async function joinVibeRoom(userId: string, roomId: string): Promise<void> {
  try {
    void supabase.from("vibe_room_members").upsert(
      { user_id: userId, room_id: roomId, joined_at: new Date().toISOString() },
      { onConflict: "user_id,room_id" }
    );
  } catch {}
}

export interface VibeRoomMessage {
  id: string;
  room_id: string;
  user_id: string;
  text: string;
  created_at: string;
  profiles?: { display_name?: string; username?: string; avatar_url?: string };
}

export async function getRoomMessages(roomId: string): Promise<VibeRoomMessage[]> {
  try {
    const { data, error } = await supabase
      .from("vibe_room_messages")
      .select("id, room_id, user_id, text, created_at, profiles(display_name, username, avatar_url)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error || !data) return [];
    return data as VibeRoomMessage[];
  } catch {
    return [];
  }
}

export async function sendRoomMessage(userId: string, roomId: string, text: string): Promise<void> {
  try {
    void supabase.from("vibe_room_messages").insert({ user_id: userId, room_id: roomId, text, created_at: new Date().toISOString() });
  } catch {}
}

// ─── Snap Conversations ───────────────────────────────────────────────────────

export interface SnapConversation {
  other_user: Profile;
  message_id: string;
  message_text: string;
  is_incoming: boolean;
  created_at: string;
}

export async function fetchSnapConversations(userId: string): Promise<SnapConversation[]> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*, sender:sender_id(id, username, avatar_url), receiver:receiver_id(id, username, avatar_url)")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .like("text", "__SNAP__%")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    const seen = new Map<string, SnapConversation>();
    for (const msg of data as any[]) {
      const isIncoming = msg.receiver_id === userId;
      const otherId = isIncoming ? msg.sender_id : msg.receiver_id;
      const otherUser = isIncoming ? msg.sender : msg.receiver;
      if (!otherUser || seen.has(otherId)) continue;
      seen.set(otherId, {
        other_user: { id: otherId, username: otherUser.username, avatar_url: otherUser.avatar_url },
        message_id: msg.id,
        message_text: msg.text,
        is_incoming: isIncoming,
        created_at: msg.created_at,
      });
    }
    return Array.from(seen.values());
  } catch { return []; }
}

// ─── Vibe Swipe Tracking & Anti-Abuse ─────────────────────────────────────────

export const FREE_DAILY_SWIPE_LIMIT = 100;
export const COOLDOWN_CONSECUTIVE_LEFTS = 20;
export const COOLDOWN_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Record a swipe (left / right / super) in vibe_swipes.
 * No-op if the table doesn't exist yet — app falls back gracefully.
 */
export async function recordVibeSwipe(
  userId: string,
  targetId: string,
  direction: 'left' | 'right' | 'super',
): Promise<void> {
  try {
    await supabase.from('vibe_swipes').upsert(
      { user_id: userId, target_id: targetId, direction, created_at: new Date().toISOString() },
      { onConflict: 'user_id,target_id' },
    );
  } catch {}
}

/**
 * Return how many swipes this user has done in the last 24 hours.
 */
export async function getDailySwipeCount(userId: string): Promise<number> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('vibe_swipes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since);
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ── Story Highlights ──────────────────────────────────────────────────────────

export interface StoryHighlight {
  id: string;
  user_id: string;
  title: string;
  cover_image_url?: string;
  story_ids: string[];
  created_at: string;
}

export async function fetchHighlights(userId: string): Promise<StoryHighlight[]> {
  try {
    const { data, error } = await supabase
      .from('story_highlights')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (!error && data) return data as StoryHighlight[];
  } catch {}
  return [];
}

export async function createHighlight(
  userId: string,
  title: string,
  coverImageUrl?: string,
): Promise<StoryHighlight | null> {
  try {
    const { data, error } = await supabase
      .from('story_highlights')
      .insert({ user_id: userId, title, cover_image_url: coverImageUrl ?? null, story_ids: [] })
      .select()
      .single();
    if (!error && data) return data as StoryHighlight;
  } catch {}
  return null;
}

export async function deleteHighlight(highlightId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('story_highlights')
      .delete()
      .eq('id', highlightId);
    return !error;
  } catch {
    return false;
  }
}

// ── Pinned Posts ──────────────────────────────────────────────────────────────

export async function togglePinPost(postId: string, isPinned: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('posts')
      .update({ is_pinned: isPinned })
      .eq('id', postId);
    return !error;
  } catch {
    return false;
  }
}

export async function getPinnedCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('posts')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_pinned', true);
    return (!error && count !== null) ? count : 0;
  } catch {
    return 0;
  }
}

// ── Story Interactions ────────────────────────────────────────────────────────

export async function saveStoryInteraction(
  storyId: string,
  userId: string,
  interactionType: string,
  response: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { error } = await supabase.from('story_interactions').insert({
      story_id: storyId,
      user_id: userId,
      interaction_type: interactionType,
      response,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Check whether the user is currently in a consecutive-left-swipe cooldown.
 * Returns true when the last 20 swipes were all left AND the 20th happened
 * less than COOLDOWN_DURATION_MS ago.
 */
export async function checkConsecutiveLeftCooldown(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('vibe_swipes')
      .select('direction, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(COOLDOWN_CONSECUTIVE_LEFTS);

    if (!data || data.length < COOLDOWN_CONSECUTIVE_LEFTS) return false;
    if (!data.every((s: any) => s.direction === 'left')) return false;

    // 20th-most-recent swipe triggers the cooldown window
    const oldest = new Date(data[COOLDOWN_CONSECUTIVE_LEFTS - 1].created_at).getTime();
    return Date.now() - oldest < COOLDOWN_DURATION_MS;
  } catch {
    return false;
  }
}

/**
 * Persist a computed compatibility score for a user–target pair.
 */
export async function saveVibeScore(
  userId: string,
  targetId: string,
  score: number,
): Promise<void> {
  try {
    await supabase.from('vibe_compat_scores').upsert(
      { user_id: userId, target_id: targetId, score, computed_at: new Date().toISOString() },
      { onConflict: 'user_id,target_id' },
    );
  } catch {}
}
