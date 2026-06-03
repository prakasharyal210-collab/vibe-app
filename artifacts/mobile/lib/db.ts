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
}

export async function claimDailyReward(userId: string): Promise<DailyRewardResult> {
  try {
    const { data, error } = await supabase.rpc("claim_daily_reward", { p_user_id: userId });
    if (!error && data) return data as DailyRewardResult;
  } catch {}
  try {
    const { data: lastClaim } = await supabase
      .from("daily_rewards")
      .select("claimed_at")
      .eq("user_id", userId)
      .order("claimed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastDate = lastClaim?.claimed_at ? new Date(lastClaim.claimed_at) : null;
    const today = new Date();
    const alreadyClaimed = lastDate && lastDate.toDateString() === today.toDateString();
    if (alreadyClaimed) {
      return { claimed: false, coins_awarded: 0, new_balance: 0, message: "Already claimed today!" };
    }
    await supabase.from("daily_rewards").insert({ user_id: userId, coins_awarded: 50 });
    await supabase.from("wallet").upsert(
      { user_id: userId, coins: 50 },
      { onConflict: "user_id" },
    );
    return { claimed: true, coins_awarded: 50, new_balance: 50, message: "🎉 +50 coins claimed!" };
  } catch {}
  return { claimed: true, coins_awarded: 50, new_balance: 0, message: "🎉 +50 coins!" };
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

export async function getForYouFeed(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  try {
    const { data, error } = await supabase.rpc('get_for_you_feed', {
      p_user_id: userId, p_limit: limit, p_offset: offset,
    });
    if (!error && data && data.length > 0) return data as Post[];
  } catch {}
  const { data } = await supabase.from('posts').select('*, profiles(*)').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  return (data as Post[]) ?? [];
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
  try {
    const { data, error } = await supabase.rpc('get_friends_feed', {
      p_user_id: userId, p_limit: limit, p_offset: offset,
    });
    if (!error && data && data.length > 0) return data as Post[];
  } catch {}
  return [];
}

export async function getNearbyFeed(lat: number, lng: number, userId: string, limit = 20, offset = 0): Promise<Post[]> {
  try {
    const { data, error } = await supabase.rpc('get_nearby_feed', {
      p_lat: lat, p_lng: lng, p_user_id: userId, p_limit: limit, p_offset: offset,
    });
    if (!error && data && data.length > 0) return data as Post[];
  } catch {}
  const { data } = await supabase.from('posts').select('*, profiles(*)').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  return (data as Post[]) ?? [];
}

export async function getVibesFeed(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  try {
    const { data, error } = await supabase.rpc('get_vibes_feed', {
      p_user_id: userId, p_limit: limit, p_offset: offset,
    });
    if (!error && data && data.length > 0) return data as Post[];
  } catch {}
  const { data } = await supabase.from('posts').select('*, profiles(*)').order('likes_count', { ascending: false }).range(offset, offset + limit - 1);
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
  isReel: boolean;
  likes: number;
  comments: number;
  caption: string;
  duration?: number;
  created_at: string;
}

export function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#\w+/g);
  return matches ? matches.map((h) => h.slice(1)) : [];
}

export async function fetchProfilePosts(userId: string): Promise<ProfileGridItem[]> {
  const [postsRes, reelsRes] = await Promise.allSettled([
    supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('reels').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);
  const posts: ProfileGridItem[] =
    postsRes.status === 'fulfilled' && postsRes.value.data
      ? (postsRes.value.data as any[]).map((p) => ({
          id: p.id,
          image_url: p.image_url ?? p.media_url ?? '',
          isReel: false,
          likes: p.likes_count ?? 0,
          comments: p.comments_count ?? 0,
          caption: p.caption ?? '',
          created_at: p.created_at,
        }))
      : [];
  const reels: ProfileGridItem[] =
    reelsRes.status === 'fulfilled' && reelsRes.value.data
      ? (reelsRes.value.data as any[]).map((r) => ({
          id: `reel_${r.id}`,
          image_url: r.thumbnail_url ?? '',
          video_url: r.video_url,
          isReel: true,
          likes: r.likes_count ?? 0,
          comments: r.comments_count ?? 0,
          caption: r.caption ?? '',
          duration: r.duration,
          created_at: r.created_at,
        }))
      : [];
  return [...posts, ...reels].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function uploadPostMedia(
  userId: string,
  uri: string,
  caption: string
): Promise<{ id: string } | null> {
  try {
    const ext = (uri.split('.').pop() ?? 'jpg').split('?')[0];
    const path = `${userId}/${Date.now()}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error: upErr } = await supabase.storage.from('posts').upload(path, blob, { upsert: true });
    let mediaUrl = uri;
    if (!upErr) {
      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path);
      mediaUrl = urlData.publicUrl;
    }
    const { data, error } = await supabase
      .from('posts')
      .insert({ user_id: userId, image_url: mediaUrl, caption, hashtags: extractHashtags(caption), is_reel: false })
      .select('id')
      .single();
    if (error) return null;
    return { id: (data as any).id };
  } catch {
    return null;
  }
}

export async function uploadReelMedia(
  userId: string,
  uri: string,
  caption: string,
  duration?: number
): Promise<{ id: string } | null> {
  try {
    const ext = (uri.split('.').pop() ?? 'mp4').split('?')[0];
    const path = `${userId}/${Date.now()}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error: upErr } = await supabase.storage.from('reels').upload(path, blob, { upsert: true });
    let videoUrl = uri;
    if (!upErr) {
      const { data: urlData } = supabase.storage.from('reels').getPublicUrl(path);
      videoUrl = urlData.publicUrl;
    }
    const { data, error } = await supabase
      .from('reels')
      .insert({ user_id: userId, video_url: videoUrl, caption, hashtags: extractHashtags(caption), duration, is_public: true })
      .select('id')
      .single();
    if (error) return null;
    return { id: (data as any).id };
  } catch {
    return null;
  }
}
