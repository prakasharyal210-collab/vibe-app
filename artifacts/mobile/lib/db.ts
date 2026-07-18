import { captureException } from './sentry';
import { readAsStringAsync, getInfoAsync } from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Image as RNImage } from 'react-native';
import {
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

// Module-level post cache shared between the feed and the post detail screen.
// The feed populates it as posts load; post/[id].tsx reads from it for instant
// initial render — no spinner, no blank screen while the background API fetch runs.
// Capped at 500 entries (FIFO) to avoid unbounded memory growth.
const MAX_POST_CACHE = 500;
export const feedPostCache = new Map<string, Post>();
export function putFeedPost(post: Post) {
  if (!post?.id) return;
  if (feedPostCache.size >= MAX_POST_CACHE) {
    const firstKey = feedPostCache.keys().next().value;
    if (firstKey) feedPostCache.delete(firstKey);
  }
  feedPostCache.set(post.id, post);
}

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

function parseUTCMs(dateStr: string): number {
  let s = dateStr.replace(" ", "T");
  if (!s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s)) s += "Z";
  return new Date(s).getTime();
}

function timeAgoShort(dateStr: string): string {
  const diff = Math.floor((Date.now() - parseUTCMs(dateStr)) / 1000);
  if (diff < 5) return "just now";
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

export interface CommentsPage {
  comments: Comment[];
  cursor: string | null;
}

export async function fetchComments(postId: string, before?: string | null): Promise<CommentsPage> {
  // Route through API server (service-role key) — direct Supabase anon-key calls
  // hang forever under RLS and never resolve, leaving the spinner stuck.
  try {
    const cursorParam = before ? `&before=${encodeURIComponent(before)}` : "";
    const res = await fetch(`${API_BASE}/comments?postId=${encodeURIComponent(postId)}${cursorParam}`);
    if (res.ok) {
      const json = await res.json();
      return { comments: (json.comments ?? []) as Comment[], cursor: json.cursor ?? null };
    }
  } catch {}
  return { comments: [], cursor: null };
}

export async function addComment(
  postId: string,
  userId: string,
  text: string,
  parentCommentId?: string,
): Promise<Comment | null> {
  // Client-side profanity check for instant feedback
  const { checkProfanity } = await import("./profanityFilter");
  const check = checkProfanity(text);
  if (!check.ok) throw new Error(check.reason);

  const res = await fetch(`${API_BASE}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, postId, text, contentType: "post", parentCommentId }),
  });
  if (res.status === 422) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Comment violates community guidelines.");
  }
  if (res.status === 403) {
    throw new Error("You cannot comment on this post.");
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return (data?.comment as Comment) ?? null;
}

// ─── Reel Comments ────────────────────────────────────────────────────────────

export async function fetchReelComments(reelId: string, before?: string | null): Promise<CommentsPage> {
  // Route through API server (service-role key) — direct anon-key calls hang under RLS.
  try {
    const cursorParam = before ? `&before=${encodeURIComponent(before)}` : "";
    const res = await fetch(`${API_BASE}/comments?reelId=${encodeURIComponent(reelId)}${cursorParam}`);
    if (res.ok) {
      const json = await res.json();
      return { comments: (json.comments ?? []) as Comment[], cursor: json.cursor ?? null };
    }
  } catch {}
  return { comments: [], cursor: null };
}

export async function addReelComment(
  reelId: string,
  userId: string,
  text: string,
  parentCommentId?: string,
): Promise<Comment | null> {
  // Client-side profanity check for instant feedback
  const { checkProfanity } = await import("./profanityFilter");
  const check = checkProfanity(text);
  if (!check.ok) throw new Error(check.reason);

  const res = await fetch(`${API_BASE}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, reelId, text, contentType: "reel", parentCommentId }),
  });
  if (res.status === 422) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Comment violates community guidelines.");
  }
  if (res.status === 403) {
    throw new Error("You cannot comment on this reel.");
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return (data?.comment as Comment) ?? null;
}

// ─── Search History ────────────────────────────────────────────────────────────

export interface SearchHistoryItem {
  id: string;
  query: string;
  created_at: string;
}

const SEARCH_API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/users";

export async function loadSearchHistory(userId: string): Promise<SearchHistoryItem[]> {
  try {
    const res = await fetch(`${SEARCH_API}/search-history?userId=${encodeURIComponent(userId)}`);
    const json = await res.json() as any;
    return (json.history ?? []) as SearchHistoryItem[];
  } catch {}
  return [];
}

export async function saveSearchHistory(userId: string, query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  try {
    await fetch(`${SEARCH_API}/search-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, query: q }),
    });
  } catch {}
}

export async function clearSearchHistory(userId: string): Promise<void> {
  try {
    await fetch(`${SEARCH_API}/search-history?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
  } catch {}
}

export async function deleteSearchHistoryItem(id: string): Promise<void> {
  try {
    await fetch(`${SEARCH_API}/search-history/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {}
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export async function checkLiked(postId: string, userId: string): Promise<boolean> {
  // Reads from post_likes via the API server (service-role key bypasses RLS).
  // The old direct-to-supabase path read from the "likes" table which is a
  // different table than what the API server writes to — always returned false.
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(
      `${apiUrl}/posts/like-status?postId=${encodeURIComponent(postId)}&userId=${encodeURIComponent(userId)}`
    );
    if (!res.ok) return false;
    const json = await res.json() as { liked?: boolean };
    return !!json.liked;
  } catch {
    return false;
  }
}

export async function toggleLike(
  postId: string,
  userId: string,
  nowLiked: boolean,
  creatorId?: string,
): Promise<{ liked: boolean; likesCount: number }> {
  // Routes through the API server (service-role key, bypasses RLS) so the like
  // is reliably written to post_likes and posts.likes_count is updated atomically.
  // The old path wrote directly to the "likes" table via anon key — blocked by RLS.
  const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  try {
    const res = await fetch(`${apiUrl}/posts/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, userId }),
    });
    if (res.ok) {
      const json = await res.json() as { liked: boolean; likesCount: number };
      if (creatorId && creatorId !== userId) {
        recordEngagement(userId, creatorId, json.liked ? "like" : "unlike", postId, "post").catch(() => {});
      }
      return json;
    }
  } catch {}
  // Fallback if the API server is unreachable — return best-guess state so the
  // caller can keep the optimistic value (likesCount: -1 = "don't overwrite").
  if (creatorId && creatorId !== userId) {
    recordEngagement(userId, creatorId, nowLiked ? "like" : "unlike", postId, "post").catch(() => {});
  }
  return { liked: nowLiked, likesCount: -1 };
}

// ─── Reel Likes — routed through API server (service-role key bypasses RLS) ──
// Direct supabase client calls on reel_likes hang under anon-key RLS.

const REELS_API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/reels";

export async function checkReelLiked(reelId: string, userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${REELS_API}/liked?userId=${encodeURIComponent(userId)}&reelId=${encodeURIComponent(reelId)}`);
    if (!res.ok) return false;
    const json = await res.json() as { liked: boolean };
    return json.liked ?? false;
  } catch {
    return false;
  }
}

// Like-only (idempotent): never unlikes, never double-counts. Used by double-tap.
export async function likeReelOnly(reelId: string, userId: string): Promise<{ liked: boolean; likes: number }> {
  const res = await fetch(`${REELS_API}/like-only`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, reelId }),
  });
  if (!res.ok) throw new Error("likeReelOnly failed");
  return res.json() as Promise<{ liked: boolean; likes: number }>;
}

// Returns { liked: boolean, likes: number } — the server-side toggled state.
export async function toggleReelLike(reelId: string, userId: string): Promise<{ liked: boolean; likes: number }> {
  const res = await fetch(`${REELS_API}/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, reelId }),
  });
  if (!res.ok) throw new Error("toggleReelLike failed");
  return res.json() as Promise<{ liked: boolean; likes: number }>;
}

// ─── Favourites — all calls routed through API server (service-role key bypasses RLS) ──
// Direct anon-key calls on the favourites table are silently blocked by RLS.

const FAVOURITES_API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/posts";

export async function checkFavourited(postId: string, userId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${FAVOURITES_API}/like-status?postId=${encodeURIComponent(postId)}&userId=${encodeURIComponent(userId)}`
    );
    if (!res.ok) return false;
    const json = await res.json() as { liked: boolean; saved: boolean };
    return json.saved ?? false;
  } catch {
    return false;
  }
}

export async function toggleFavourite(
  postId: string,
  userId: string,
  _nowFavourited: boolean,
): Promise<void> {
  // The server endpoint is a true toggle (checks current DB state itself),
  // so we ignore the client-side hint (_nowFavourited) and let the server decide.
  try {
    await fetch(`${FAVOURITES_API}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, userId }),
    });
  } catch {}
}

export async function fetchFavouritedPosts(userId: string): Promise<Post[]> {
  try {
    const res = await fetch(`${FAVOURITES_API}/saved?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    const json = await res.json() as { posts: any[] };
    return (json.posts ?? []) as Post[];
  } catch {
    return [];
  }
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
// All notification reads/writes go through the API server (service role) to
// bypass Supabase RLS on the notifications table — direct anon client hangs
// on Android and falls back to mock data.

export async function fetchNotifications(userId: string, scope: "social" | "vibe" = "social"): Promise<Notification[]> {
  try {
    const res = await fetch(`${API_BASE}/users/notifications/${encodeURIComponent(userId)}?scope=${scope}`);
    if (res.ok) {
      const { notifications } = await res.json() as { notifications: Notification[] };
      return notifications ?? [];
    }
  } catch {}
  return [];
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/users/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
  } catch {}
}

export async function markAllNotificationsRead(userId: string, scope: "social" | "vibe" = "social"): Promise<void> {
  try {
    await fetch(`${API_BASE}/users/notifications/read-all/${encodeURIComponent(userId)}?scope=${scope}`, { method: "PATCH" });
  } catch {}
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  try {
    // scope=social ensures vibe notifications never inflate the main bell badge
    const res = await fetch(`${API_BASE}/users/notifications/${encodeURIComponent(userId)}?scope=social`);
    if (res.ok) {
      const { notifications } = await res.json() as { notifications: Array<{ read: boolean }> };
      return (notifications ?? []).filter((n) => !n.read).length;
    }
  } catch {}
  return 0;
}

// ─── User Settings ────────────────────────────────────────────────────────────

export interface UserSettings {
  private_account: boolean;
  post_view_permission: "everyone" | "followers";
  who_can_comment: "everyone" | "followers" | "following" | "friends" | "nobody";
  mention_permission: "everyone" | "followers" | "nobody";
  who_can_message: "everyone" | "followers" | "friends" | "matches" | "nobody";
  duet_permission: "everyone" | "friends" | "nobody";
  liked_private: boolean;
  activity_visibility: boolean;
  story_permission: "everyone" | "friends";
  story_reply_permission: "everyone" | "friends" | "off";
  // ── Find Vibe discovery ─────────────────────────────────────────────────────
  vibe_age_min: number;
  vibe_age_max: number;
  vibe_max_distance_km: number;
  vibe_show_distance: boolean;
  vibe_exclude_connections: boolean;
  // ── Push master ────────────────────────────────────────────────────────────
  notif_push_enabled: boolean;
  notif_in_app: boolean;
  // ── Interactions ───────────────────────────────────────────────────────────
  notif_likes: boolean;
  notif_comments: boolean;
  notif_follows: boolean;
  notif_tags: boolean;
  notif_comment_likes: boolean;
  // ── Messages ───────────────────────────────────────────────────────────────
  notif_messages: boolean;
  notif_dm: boolean;
  notif_dm_previews: boolean;
  notif_dm_requests: boolean;
  notif_activity_status: boolean;
  // ── Find Vibe ──────────────────────────────────────────────────────────────
  notif_vibe_match: boolean;
  notif_vibe_request: boolean;
  // ── Misc ───────────────────────────────────────────────────────────────────
  notif_live: boolean;
  notif_mentions: boolean;
  // ── Post Suggestions ───────────────────────────────────────────────────────
  notif_post_following: boolean;
  notif_post_recommended: boolean;
  selected_theme?: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  private_account: false,
  post_view_permission: "everyone",
  who_can_comment: "everyone",
  mention_permission: "everyone",
  who_can_message: "everyone",
  duet_permission: "everyone",
  liked_private: false,
  activity_visibility: true,
  story_permission: "everyone",
  story_reply_permission: "everyone",
  vibe_age_min: 18,
  vibe_age_max: 60,
  vibe_max_distance_km: 999,
  vibe_show_distance: true,
  vibe_exclude_connections: false,
  notif_push_enabled: true,
  notif_in_app: true,
  notif_likes: true,
  notif_comments: true,
  notif_follows: true,
  notif_tags: true,
  notif_comment_likes: true,
  notif_messages: true,
  notif_dm: true,
  notif_dm_previews: true,
  notif_dm_requests: true,
  notif_activity_status: true,
  notif_vibe_match: true,
  notif_vibe_request: true,
  notif_live: true,
  notif_mentions: true,
  notif_post_following: true,
  notif_post_recommended: true,
  selected_theme: "classic",
};

export async function fetchUserSettings(userId: string): Promise<UserSettings> {
  try {
    const apiUrl = process.env["EXPO_PUBLIC_API_URL"] ?? "";
    const res = await fetch(`${apiUrl}/api/users/settings/${userId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { settings: any };
    const raw = json.settings;
    if (!raw) return DEFAULT_SETTINGS;
    const duet = raw.duet_permission;
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      duet_permission: typeof duet === "boolean" ? (duet ? "everyone" : "nobody") : (duet ?? "everyone"),
    } as UserSettings;
  } catch {}
  return DEFAULT_SETTINGS;
}

// ─── Blocked / Restricted Users ───────────────────────────────────────────────

export interface BlockedUser {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
}

export async function getBlockedUsers(userId: string): Promise<BlockedUser[]> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/users/blocked?userId=${encodeURIComponent(userId)}`);
    const json = await res.json() as any;
    return (json.users ?? []) as BlockedUser[];
  } catch { return []; }
}

export interface RestrictedUser {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
}

export async function getRestrictedUsers(userId: string): Promise<RestrictedUser[]> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/users/restricted?userId=${encodeURIComponent(userId)}`);
    const json = await res.json() as any;
    return (json.users ?? []) as RestrictedUser[];
  } catch { return []; }
}

export async function restrictUser(myId: string, theirId: string): Promise<void> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    await fetch(`${apiUrl}/moderation/restrict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ myId, theirId }),
    });
  } catch {}
}

export async function unrestrictUser(myId: string, theirId: string): Promise<void> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    await fetch(`${apiUrl}/moderation/restrict`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ myId, theirId }),
    });
  } catch {}
}

export async function saveUserSettings(
  userId: string,
  patch: Partial<UserSettings>,
): Promise<void> {
  try {
    const apiUrl = process.env["EXPO_PUBLIC_API_URL"] ?? "";
    const res = await fetch(`${apiUrl}/api/users/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...patch }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("[saveUserSettings] api error", err);
    }
  } catch (e) {
    console.warn("[saveUserSettings] fetch failed", e);
  }
}

// ─── Gundruk Privacy & Preference Settings ─────────────────────────────────────

export interface GundrukProfile {
  show_in_matching: boolean;
  find_gundruk_mode: string;
  vibe_request_privacy: string;
  vibe_goal_filter: string[] | null;          // NULL = open to all goals (default)
  vibe_bio: string | null;                    // shown only on match card, separate from main bio
  vibe_photos: string[] | null;               // URL refs from existing storage
  vibe_profile_photo_url: string | null;      // dedicated primary Find Vibe card photo (replaces gallery[0] as hero)
  vibe_filter_min_photos: number;             // deck filter: only show candidates with ≥ N photos
  vibe_filter_requires_bio: boolean;          // deck filter: exclude candidates with no bio
  vibe_prompts: Array<{ question: string; answer: string }> | null;
  vibe_zodiac: string | null;
  vibe_education: string | null;
  vibe_family_plans: string | null;
  vibe_communication: string | null;
  vibe_love_style: string | null;
  vibe_pets: string | null;
  vibe_drinking: string | null;
  vibe_smoking: string | null;
  vibe_cannabis: string | null;
  vibe_workout: string | null;
  vibe_social_media: string | null;
  vibe_open_to: string[] | null;
  vibe_languages: string[] | null;
  relationship_goals: string[] | null;         // multi-intent "what I'm looking for" — NULL = All
}

const GUNDRUK_PROFILE_DEFAULTS: GundrukProfile = {
  show_in_matching: false, find_gundruk_mode: "dating", vibe_request_privacy: "everyone",
  vibe_goal_filter: null, vibe_bio: null, vibe_photos: null, vibe_profile_photo_url: null,
  vibe_filter_min_photos: 0, vibe_filter_requires_bio: false, vibe_prompts: null,
  vibe_zodiac: null, vibe_education: null, vibe_family_plans: null,
  vibe_communication: null, vibe_love_style: null, vibe_pets: null,
  vibe_drinking: null, vibe_smoking: null, vibe_cannabis: null,
  vibe_workout: null, vibe_social_media: null, vibe_open_to: null, vibe_languages: null,
  relationship_goals: null,
};

export async function getGundrukProfile(userId: string): Promise<GundrukProfile> {
  try {
    const apiUrl = process.env["EXPO_PUBLIC_API_URL"] ?? "";
    const res = await fetch(`${apiUrl}/api/users/vibe-profile/${userId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} from vibe-profile`);
    const json = await res.json() as { profile: any };
    const r = json.profile;
    if (!r) return GUNDRUK_PROFILE_DEFAULTS;
    const arr = (v: any) => Array.isArray(v) && v.length > 0 ? v : null;
    return {
      show_in_matching:          r.show_in_matching          ?? false,
      find_gundruk_mode:         r.find_gundruk_mode         ?? "dating",
      vibe_request_privacy:      r.vibe_request_privacy      ?? "everyone",
      vibe_goal_filter:          arr(r.vibe_goal_filter),
      vibe_bio:                  r.vibe_bio                  ?? null,
      vibe_photos:               arr(r.vibe_photos),
      vibe_profile_photo_url:    r.vibe_profile_photo_url    ?? null,
      vibe_filter_min_photos:    r.vibe_filter_min_photos    ?? 0,
      vibe_filter_requires_bio:  r.vibe_filter_requires_bio  ?? false,
      vibe_prompts:              Array.isArray(r.vibe_prompts) && r.vibe_prompts.length > 0 ? r.vibe_prompts : null,
      vibe_zodiac:               r.vibe_zodiac               ?? null,
      vibe_education:            r.vibe_education            ?? null,
      vibe_family_plans:         r.vibe_family_plans         ?? null,
      vibe_communication:        r.vibe_communication        ?? null,
      vibe_love_style:           r.vibe_love_style           ?? null,
      vibe_pets:                 r.vibe_pets                 ?? null,
      vibe_drinking:             r.vibe_drinking             ?? null,
      vibe_smoking:              r.vibe_smoking              ?? null,
      vibe_cannabis:             r.vibe_cannabis             ?? null,
      vibe_workout:              r.vibe_workout              ?? null,
      vibe_social_media:         r.vibe_social_media         ?? null,
      vibe_open_to:              arr(r.vibe_open_to),
      vibe_languages:            arr(r.vibe_languages),
      relationship_goals:        arr(r.relationship_goals),
    };
  } catch {}
  return GUNDRUK_PROFILE_DEFAULTS;
}

export async function saveGundrukProfile(userId: string, patch: Partial<GundrukProfile>): Promise<void> {
  try {
    const apiUrl = process.env["EXPO_PUBLIC_API_URL"] ?? "";
    const res = await fetch(`${apiUrl}/api/users/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...patch }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("[saveGundrukProfile] api error", err);
    }
  } catch (e) {
    console.warn("[saveGundrukProfile] fetch failed", e);
  }
}

// ─── Live Streams ─────────────────────────────────────────────────────────────

export async function createLiveStream(
  userId: string,
  title: string,
): Promise<string | null> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/live/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title }),
    });
    const json = await res.json() as any;
    return (json.streamId ?? null) as string | null;
  } catch {}
  return null;
}

export async function endLiveStream(
  streamId: string,
  viewerCount: number,
  coinsEarned: number,
): Promise<void> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    await fetch(`${apiUrl}/live/stream/${encodeURIComponent(streamId)}/end`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewerCount, coinsEarned }),
    });
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
  storyType?: string;
  textContent?: string;
  bgGradient?: string;
  caption?: string;
  created_at?: string;
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

export async function fetchFriendStories(
  myUserId: string,
  myUsername?: string,
): Promise<StoryEntry[]> {
  const ownPlaceholder: StoryEntry = {
    id: "own_placeholder",
    username: myUsername ?? "you",
    image: "",
    hasNew: false,
    isOwn: true,
    userId: myUserId,
    hasExistingStory: false,
  };

  try {
    // Route through API server — avoids Android Supabase direct-client hang
    const res = await fetch(
      `${API_BASE}/stories?userId=${encodeURIComponent(myUserId)}`,
    );
    if (!res.ok) return [ownPlaceholder];

    const json = (await res.json()) as { stories: any[] };
    const storiesData: any[] = json.stories ?? [];

    // Own story (if posted in the last 24 h)
    const myStory = storiesData.find((s) => s.user_id === myUserId);
    const ownEntry: StoryEntry = {
      ...ownPlaceholder,
      id: myStory?.id ?? "own_placeholder",
      username: myStory?.profiles?.username ?? myUsername ?? "you",
      image: myStory?.media_url ?? "",
      hasExistingStory: !!myStory,
      storyType: myStory?.story_type ?? undefined,
      textContent: myStory?.text_content ?? undefined,
      bgGradient: myStory?.bg_gradient ?? undefined,
      caption: myStory?.caption ?? undefined,
      created_at: myStory?.created_at ?? undefined,
    };

    // Followed accounts — one entry per user, deduplicated
    const seenUsers = new Set<string>();
    const friendEntries: StoryEntry[] = [];
    for (const s of storiesData) {
      if (s.user_id === myUserId) continue;
      if (seenUsers.has(s.user_id)) continue;
      seenUsers.add(s.user_id);
      friendEntries.push({
        id: s.id,
        username: s.profiles?.username ?? "user",
        image: s.media_url ?? "",
        hasNew: !s.viewed,
        isOwn: false,
        userId: s.user_id,
        isOnline: false,
        storyType: s.story_type ?? undefined,
        textContent: s.text_content ?? undefined,
        bgGradient: s.bg_gradient ?? undefined,
        caption: s.caption ?? undefined,
        created_at: s.created_at ?? undefined,
      });
    }

    return [ownEntry, ...friendEntries];
  } catch {
    return [ownPlaceholder];
  }
}

// ─── Conversations / Messages ─────────────────────────────────────────────────

export async function fetchConversations(userId: string): Promise<Conversation[]> {
  // Route through API server — bypasses RLS + avoids Android Supabase client hang
  try {
    const url = `${API_BASE}/messages/conversations?userId=${encodeURIComponent(userId)}`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const convos: Conversation[] = json.conversations ?? [];
      if (convos.length > 0) return convos;
    }
  } catch {}
  return [];
}

export async function fetchMessages(myId: string, otherId: string): Promise<import("./supabase").Message[]> {
  // Route through API server — bypasses RLS + avoids Android Supabase client hang
  try {
    const params = new URLSearchParams({ myId, otherId, limit: "100" });
    const res = await fetch(`${API_BASE}/messages?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      return (json.messages ?? []) as import("./supabase").Message[];
    }
  } catch {}
  return [];
}

export async function markMessagesRead(myId: string, otherId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/messages/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ myId, otherId }),
    });
  } catch {}
}

export async function getOtherUserActivity(userId: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/messages/activity?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.lastActiveAt as string | null) ?? null;
  } catch {
    return null;
  }
}

// Upload a photo from local URI to the media bucket via the API server.
// Used for gallery photos in chat (persistent, not ephemeral unlike snaps).
export async function uploadChatPhoto(
  uri: string,
  mimeType: string,
  userId: string,
): Promise<string | null> {
  try {
    const base64 = await readAsStringAsync(uri, { encoding: "base64" as any });
    const res = await fetch(`${API_BASE}/storage/chat-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, userId, mimeType }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { url?: string };
    return json.url ?? null;
  } catch {
    return null;
  }
}

export async function sendMessageToUser(
  senderId: string,
  receiverId: string,
  text: string,
  shareOpts?: { contentType: "post" | "reel" | "confession"; contentId: string },
  replyToMessageId?: string,
  messageType?: "photo",
): Promise<import("./supabase").Message | null> {
  // Route through API server — bypasses RLS + avoids Android Supabase client hang
  try {
    const body: Record<string, unknown> = { senderId, receiverId, text };
    if (shareOpts) {
      body["shared_content_type"] = shareOpts.contentType;
      body["shared_content_id"] = shareOpts.contentId;
    }
    if (replyToMessageId) {
      body["reply_to_message_id"] = replyToMessageId;
    }
    if (messageType) {
      body["message_type"] = messageType;
    }
    const res = await fetch(`${API_BASE}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      return json.message as import("./supabase").Message;
    }
    // Surface the server's error message so callers can show it to the user.
    let serverMsg = "Failed to send message";
    try {
      const errJson = await res.json();
      if (errJson?.error) serverMsg = errJson.error;
    } catch {}
    throw new Error(serverMsg);
  } catch (err) {
    // Re-throw errors we deliberately threw above; swallow only network-level failures.
    if (err instanceof Error && err.message !== "Failed to fetch") throw err;
    throw err;
  }
}

export async function reactToMessage(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<{ reacted: boolean; emoji: string }> {
  const res = await fetch(`${API_BASE}/messages/react`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, userId, emoji }),
  });
  if (!res.ok) throw new Error("react failed");
  return res.json();
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchProfiles(query: string, viewerId?: string): Promise<Profile[]> {
  const q = query.trim();
  console.log('[searchProfiles] querying API for:', JSON.stringify(q));

  try {
    const params = new URLSearchParams({ q, limit: "20" });
    if (viewerId) params.set("viewer_id", viewerId);
    const url = `${API_BASE}/users/search?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn('[searchProfiles] API error', res.status, text);
      return [];
    }
    const json = await res.json();
    const profiles: Profile[] = json.profiles ?? [];
    console.log('[searchProfiles] API returned', profiles.length, 'profiles');
    return profiles;
  } catch (e: any) {
    console.warn('[searchProfiles] fetch exception:', String(e));
    return [];
  }
}

export async function searchHashtags(query: string): Promise<Hashtag[]> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/users/hashtags?query=${encodeURIComponent(query.trim())}`);
    const json = await res.json() as any;
    const data: any[] = json.hashtags ?? [];
    if (data.length > 0) {
      return data.map((h: any) => ({
        tag: h.name,
        count: formatCount(h.posts_count ?? 0) + " posts",
        image: `https://picsum.photos/seed/${h.name}/300/200`,
      }));
    }
  } catch {}
  if (!query.trim()) return MOCK_HASHTAGS;
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
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return supabase
    .channel(`messages:${userId}:${suffix}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${userId}`,
      },
      (payload) => { try { onNew(payload.new); } catch { /* never crash */ } }
    )
    .subscribe();
}

export function subscribeToNotifications(
  userId: string,
  onNew: (notif: any) => void
) {
  // filter uses recipient_id (actual column name, not user_id)
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return supabase
    .channel(`notifications:${userId}:${suffix}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      },
      (payload) => { try { onNew(payload.new); } catch { /* never crash */ } }
    )
    .subscribe();
}

// ─── Supabase RPC Functions ────────────────────────────────────────────────────

export async function getPersonalizedFeed(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  try {
    const res = await fetch(`${apiUrl}/feed/personalized?userId=${encodeURIComponent(userId)}&limit=${limit}&offset=${offset}`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) return json.data as Post[];
    }
  } catch {}
  return [];
}

export async function trackUserInterest(
  userId: string,
  hashtag: string,
  interactionType: 'like' | 'comment' | 'share' | 'view'
): Promise<void> {
  const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  try {
    await fetch(`${apiUrl}/analytics/track-interest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, hashtag, interactionType }),
    });
  } catch {}
}

export async function updateVibeScore(userId: string, points: number, reason: string): Promise<void> {
  const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  try {
    await fetch(`${apiUrl}/analytics/vibe-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, points, reason }),
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
  const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  try {
    const res = await fetch(`${apiUrl}/rewards/achievements?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.achievements)) return json.achievements as Achievement[];
    }
  } catch {}
  return [];
}

export async function detectSpam(userId: string): Promise<boolean> {
  const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  try {
    const res = await fetch(`${apiUrl}/analytics/spam-check?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const json = await res.json();
      return !!json.isSpam;
    }
  } catch {}
  return false;
}

export async function updateCreatorAnalytics(userId: string): Promise<void> {
  const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  try {
    await fetch(`${apiUrl}/analytics/creator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
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
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/rewards/leaderboard?period=${encodeURIComponent(period)}`);
    const json = await res.json() as any;
    const data: any[] = json.entries ?? [];
    if (data.length > 0) return data as LeaderboardEntry[];
  } catch {}
  return [];
}

// ─── Onboarding & Feed Tab RPCs ───────────────────────────────────────────────

export async function needsOnboarding(userId: string): Promise<boolean> {
  const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  try {
    const res = await fetch(`${apiUrl}/users/needs-onboarding?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const json = await res.json();
      return !!json.needsOnboarding;
    }
  } catch {}
  return false;
}

export async function saveOnboardingInterests(userId: string, interests: string[]): Promise<void> {
  const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  try {
    await fetch(`${apiUrl}/users/onboarding-interests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, interests }),
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

/** Wrap any Supabase RPC call so it never hangs Promise.allSettled indefinitely.
 *  Accepts PromiseLike (which PostgrestFilterBuilder satisfies) and wraps it
 *  in Promise.resolve() so Promise.race() gets a real Promise. */
function rpcWithTimeout(
  call: PromiseLike<{ data: any; error: any }>,
  ms = 10000
): Promise<{ data: any; error: any }> {
  return Promise.race([
    Promise.resolve(call),
    new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'rpc timeout' } }), ms)
    ),
  ]);
}

async function fetchFreshPosts(limit = 20): Promise<Post[]> {
  // Wrap in a 4s timeout — the direct anon-key posts query hangs when RLS
  // evaluates a valid JOIN (profiles!user_id). RPCs use SECURITY DEFINER and
  // settle independently; this timeout lets Promise.allSettled() in callers
  // resolve on the RPC results without waiting for a hung Supabase fetch.
  const timeoutGuard = new Promise<Post[]>((resolve) =>
    setTimeout(() => { console.log('[fetchFreshPosts] timeout — RLS hang, returning []'); resolve([]); }, 4000)
  );
  const query = (async (): Promise<Post[]> => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles!user_id(*)')
        .or('visibility.eq.public,visibility.is.null')
        .order('score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!error) {
        console.log('[fetchFreshPosts] primary ok, rows:', data?.length ?? 0);
        return (data as Post[]) ?? [];
      }
      console.log('[fetchFreshPosts] primary error:', error.message, '— trying fallback');
      const { data: fallback, error: fbErr } = await supabase
        .from('posts')
        .select('*, profiles!user_id(*)')
        .order('score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      console.log('[fetchFreshPosts] fallback:', fbErr?.message ?? 'ok', 'rows:', fallback?.length ?? 0);
      return (fallback as Post[]) ?? [];
    } catch (e: any) {
      console.log('[fetchFreshPosts] threw:', e?.message);
      return [];
    }
  })();
  return Promise.race([query, timeoutGuard]);
}

export async function logWatchEvent(
  reelId: string,
  watchDuration: number,
  videoDuration: number,
  userId?: string
): Promise<void> {
  if (!reelId || watchDuration <= 0) return;
  // Strip the 'reel_' prefix if present; skip post-based reel IDs
  let dbReelId = reelId;
  if (reelId.startsWith('post_')) return;
  if (reelId.startsWith('reel_')) dbReelId = reelId.slice(5);

  try {
    await fetch(`${API_BASE}/reels/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reelId: dbReelId, watchDuration, videoDuration }),
    });
  } catch {
    // fire-and-forget — never block the UI
  }
}

// ─── Personalization / Engagement Tracking ────────────────────────────────────

/**
 * Record a social-graph affinity signal for the recommendation engine.
 * Fire-and-forget — never awaited in UI paths.
 * Requires `scripts/personalization-migration.sql` to be run in Supabase.
 */
export async function recordEngagement(
  userId: string,
  creatorId: string,
  action: "like" | "unlike" | "comment" | "save" | "share" | "watch_complete" | "skip" | "hide",
  contentId?: string,
  contentType?: "post" | "reel",
): Promise<void> {
  try {
    await fetch(`${API_BASE}/engage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, creatorId, action, contentId, contentType }),
    });
  } catch {
    // fire-and-forget — never block UI
  }
}

/**
 * Session-level diversity pass — limits any single creator to `maxPerCreator`
 * posts in the first `windowSize` positions.  Overflow posts are appended at
 * the end so nothing is lost, just re-ordered.
 */
function applyDiversity(posts: Post[], maxPerCreator = 2): Post[] {
  const creatorCount = new Map<string, number>();
  const primary: Post[] = [];
  const overflow: Post[] = [];

  for (const post of posts) {
    const cid = (post as any).user_id ?? (post as any).username ?? "";
    const n = creatorCount.get(cid) ?? 0;
    if (n < maxPerCreator) {
      primary.push(post);
      creatorCount.set(cid, n + 1);
    } else {
      overflow.push(post);
    }
  }
  return [...primary, ...overflow];
}

export async function getForYouFeed(
  userId: string | undefined,
  limit = 20,
  offset = 0,
  contentType: "all" | "photo" | "video" = "all",
  sortOrder: "newest" | "most_liked" | "most_viewed" = "newest",
  category?: string,
  feedType?: string,
): Promise<{ posts: Post[]; looped: boolean }> {
  const t0 = Date.now();
  console.log('[getForYouFeed] start userId:', userId?.slice(0, 8), 'offset:', offset, 'limit:', limit, 'contentType:', contentType, 'sort:', sortOrder);
  try {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (userId) params.set("userId", userId);
    if (contentType !== "all") params.set("content_type", contentType);
    if (sortOrder !== "newest") params.set("sort", sortOrder);
    if (category) params.set("category", category);
    if (feedType) params.set("type", feedType);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/feed/foryou?${params}`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      const body = await res.json();
      let posts = (body.data ?? []) as Post[];
      // Belt-and-suspenders: enforce content-type contract on the client so a
      // misconfigured DB row (is_video null/wrong) can never leak through.
      if (contentType === "video") posts = posts.filter((p: any) => p.is_video === true);
      else if (contentType === "photo") posts = posts.filter((p: any) => p.is_video !== true);
      const looped = body.looped === true;
      console.log('[getForYouFeed] ok source:', body.source, 'looped:', looped, 'rows after filter:', posts.length, 'ms:', Date.now() - t0);
      if (posts.length > 0) {
        return { posts: applyDiversity(posts), looped };
      }
    } else {
      console.log('[getForYouFeed] http error:', res.status, 'ms:', Date.now() - t0);
    }
  } catch (e: any) {
    console.log('[getForYouFeed] threw:', e?.message, 'ms:', Date.now() - t0);
    // Re-throw so loadTabData's catch block handles it — it leaves hasMore=true
    // so the user can scroll to retry instead of silently ending pagination.
    throw e;
  }
  // Reached only when the server returned an OK response with 0 posts
  // (legitimate end of feed) or a non-OK status. hasMore=false is correct here.
  return { posts: [], looped: false };
}

export async function getFollowingFeed(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  try {
    const params = new URLSearchParams({ userId, limit: String(limit), offset: String(offset) });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/feed/following?${params}`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      const body = await res.json();
      return (body.data ?? []) as Post[];
    }
  } catch {}
  return [];
}

export async function getFriendsFeed(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  const t0 = Date.now();
  console.log('[getFriendsFeed] start userId:', userId?.slice(0, 8), 'offset:', offset, 'limit:', limit);
  try {
    const params = new URLSearchParams({
      userId,
      limit: String(limit),
      offset: String(offset),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/feed/friends?${params}`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const ms = Date.now() - t0;
    if (res.ok) {
      const body = await res.json();
      const posts = (body.data ?? []) as Post[];
      console.log('[getFriendsFeed] ok source:', body.source, 'rows:', posts.length, 'ms:', ms);
      return posts;
    }
    console.log('[getFriendsFeed] http error:', res.status, 'ms:', ms);
  } catch (e: any) {
    console.log('[getFriendsFeed] threw:', e?.message, 'ms:', Date.now() - t0);
  }
  return [];
}

export async function getNearbyFeed(lat: number, lng: number, userId: string, limit = 20, offset = 0): Promise<Post[]> {
  try {
    const params = new URLSearchParams({
      userId, lat: String(lat), lng: String(lng), limit: String(limit), offset: String(offset),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/feed/nearby?${params}`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      const body = await res.json();
      return (body.data ?? []) as Post[];
    }
  } catch {}
  return [];
}

export async function getVibesFeed(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  try {
    const params = new URLSearchParams({ userId, limit: String(limit), offset: String(offset) });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/feed/vibes?${params}`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      const body = await res.json();
      return (body.data ?? []) as Post[];
    }
  } catch {}
  return [];
}

export async function markPostSeen(userId: string, postId: string): Promise<void> {
  try {
    fetch(`${API_BASE}/feed/seen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postId }),
    }).catch(() => {});
  } catch {}
}

export async function saveTabPreference(userId: string, tab: string): Promise<void> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    await fetch(`${apiUrl}/users/tab-preference`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, tab }),
    });
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
  views: number;
  comments: number;
  caption: string;
  duration?: number;
  created_at: string;
  is_pinned?: boolean;
  visibility?: string;
  post_type?: "photo" | "video" | "poll" | "mood";
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
        // Trust the DB is_video flag first; fall back to URL extension detection
        // so posts whose media_url lacks a recognised extension still get treated
        // as videos (no broken <Image> rendering a raw .mp4 URL as black).
        const isVid = !!(p.is_video || isVideoMediaUrl(mediaUrl));
        // For video posts, prefer the stored thumbnail (a static JPEG) over the
        // raw video URL — Image components can't render video URLs.
        const thumbUrl: string | undefined = p.thumbnail_url ?? undefined;
        return {
          id: p.id,
          // When thumbnail_url is null leave image_url as "" (falsy) rather than
          // the raw video URL.  React Native <Image> can't decode video bytes, so
          // passing the .mp4 URL produces a solid black tile.  An empty string
          // lets the caller detect the gap and use VideoGridCell instead.
          image_url: isVid ? (thumbUrl ?? "") : mediaUrl,
          video_url: isVid ? mediaUrl : undefined,
          is_video: isVid,
          isReel: false,
          likes: p.likes_count ?? 0,
          views: p.views_count ?? 0,
          comments: p.comments_count ?? 0,
          caption: p.caption ?? '',
          created_at: p.created_at,
          is_pinned: p.is_pinned ?? false,
          visibility: p.visibility ?? 'public',
          post_type: p.post_type ?? undefined,
        };
      });
      const reels: ProfileGridItem[] = rawReels.map((r: any) => ({
        id: `reel_${r.id}`,
        image_url: r.thumbnail_url ?? '',
        video_url: r.video_url,
        isReel: true,
        likes: r.likes_count ?? 0,
        views: r.views_count ?? 0,
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

export interface PollPostItem {
  id: string;
  caption: string;
  likes: number;
  comments: number;
  created_at: string;
  poll: null | {
    id: string;
    question: string | null;
    ends_at: string;
    options: { id: string; label: string; position: number; votes: number }[];
    totalVotes: number;
    viewerVote: string | null;
  };
}

export async function fetchUserPolls(userId: string, viewerId?: string): Promise<PollPostItem[]> {
  try {
    const url = viewerId
      ? `${API_BASE}/posts/user/${encodeURIComponent(userId)}/polls?viewerId=${encodeURIComponent(viewerId)}`
      : `${API_BASE}/posts/user/${encodeURIComponent(userId)}/polls`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json() as { polls?: any[] };
    return (json.polls ?? []).map((p: any) => ({
      id: p.id as string,
      caption: (p.caption as string) ?? "",
      likes: (p.likes_count as number) ?? 0,
      comments: (p.comments_count as number) ?? 0,
      created_at: p.created_at as string,
      poll: p.poll ?? null,
    }));
  } catch {
    return [];
  }
}

export async function createTextPost(
  userId: string,
  caption: string,
  poll?: { question?: string; options: string[]; duration_hours: number },
): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/posts/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, caption, poll }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error as string);
  return { id: data.id as string };
}

export async function createMoodPost(userId: string, caption: string): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/posts/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, caption, postType: "mood" }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error as string);
  return { id: data.id as string };
}

export async function uploadPostMedia(
  userId: string,
  uri: string,
  caption: string,
  options?: {
    postType?: "photo" | "video";
    location?: string;
    taggedUsers?: string[];
    filterId?: string;
    commentsEnabled?: boolean;
    downloadsEnabled?: boolean;
    visibility?: string;
    category?: string;
    coupleId?: string;
    isCouplePost?: boolean;
    poll?: { question?: string; options: string[]; duration_hours: number };
  }
): Promise<{ id: string; mediaUrl: string }> {
  const cleanUri = uri.split('?')[0];
  const rawExt = (cleanUri.split('.').pop() ?? 'jpg').toLowerCase();
  const isGif = rawExt === 'gif';
  const isVideo = ['mp4', 'mov', 'webm', 'm4v'].includes(rawExt);

  // ── File-size guard ───────────────────────────────────────────────────────
  // Encoding large files as base64-in-JSON blocks the JS thread and exceeds
  // the server's 50 MB body limit. Reject early with a clear message.
  try {
    const info = await getInfoAsync(uri);
    const sizeMB = ((info as any).size ?? 0) / (1024 * 1024);
    const limitMB = isVideo ? 100 : 30;
    if (sizeMB > limitMB) {
      throw new Error(
        `${isVideo ? 'Video' : 'Photo'} is too large (${sizeMB.toFixed(0)} MB). ` +
        `Please choose a ${isVideo ? `shorter clip (under ${limitMB} MB)` : 'smaller photo'}.`
      );
    }
  } catch (sizeErr: any) {
    // If the error is our own size-limit message, re-throw it
    if (sizeErr?.message?.includes('too large')) throw sizeErr;
    // Otherwise getInfoAsync failed (file access issue) — fall through and let upload attempt
    console.error('[post-upload] getInfoAsync failed:', sizeErr);
  }

  try {
    // ── Video path ────────────────────────────────────────────────────────
    if (isVideo) {
      const videoExt = rawExt === 'mov' ? 'mov' : rawExt === 'webm' ? 'webm' : 'mp4';
      const videoMime = rawExt === 'mov' ? 'video/quicktime' : rawExt === 'webm' ? 'video/webm' : 'video/mp4';

      // Generate thumbnail from the local file's first frame so the profile grid
      // can show a static image instead of trying to load the remote video at render time.
      let thumbnailBase64: string | undefined;
      let videoWidth: number | undefined;
      let videoHeight: number | undefined;
      try {
        const { uri: rawThumbUri } = await withTimeout(
          VideoThumbnails.getThumbnailAsync(uri, { time: 0 }),
          10_000,
          'video post thumbnail gen'
        );
        const compressedThumb = await withTimeout(
          ImageManipulator.manipulateAsync(
            rawThumbUri,
            [{ resize: { width: 720 } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
          ),
          8_000,
          'video post thumbnail compress'
        );
        thumbnailBase64 = await withTimeout(localUriToBase64(compressedThumb.uri), 8_000, 'video post thumbnail read');
        // Thumbnail's dimensions approximate the video's own aspect ratio —
        // stored so PostCard can size the container before the video loads.
        videoWidth = compressedThumb.width;
        videoHeight = compressedThumb.height;
      } catch {
        // Thumbnail generation failed — post will upload without a static thumbnail.
        // The profile grid will fall back to the visible gradient + play-icon placeholder.
      }

      let videoBase64: string | undefined;
      try {
        videoBase64 = await withTimeout(localUriToBase64(uri), 20_000, 'video file read');
      } catch (readErr) {
        console.error('[post-upload] video base64 read failed:', readErr);
        // Continue — server will create a post without media rather than hang
      }

      const vRes = await withTimeout(
        fetch(`${API_BASE}/posts/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            imageBase64: videoBase64,
            thumbnailBase64,
            mimeType: videoMime,
            ext: videoExt,
            postType: options?.postType ?? "video",
            caption,
            width: videoWidth,
            height: videoHeight,
            options: { ...options, visibility: options?.visibility ?? 'public' },
            coupleId: options?.coupleId,
            isCouplePost: options?.isCouplePost,
            poll: options?.poll,
          }),
        }),
        25_000,
        'post create API (video)'
      );

      if (!vRes.ok) {
        const errText = await vRes.text().catch(() => 'unknown');
        throw new Error(`Post upload failed (${vRes.status}): ${errText}`);
      }
      return await vRes.json() as { id: string; mediaUrl: string };
    }

    // ── Photo path ────────────────────────────────────────────────────────
    // Compress + resize before upload (skip for GIFs — manipulator strips animation)
    // Also captures the final width/height so the server can store the real
    // aspect ratio on the post — PostCard can then size its container correctly
    // on the very first render instead of guessing and resizing after onLoad.
    let uploadUri = uri;
    let mediaWidth: number | undefined;
    let mediaHeight: number | undefined;
    if (!isGif) {
      try {
        const result = await withTimeout(
          ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 1080 } }],
            { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
          ),
          15_000,
          'image compress'
        );
        uploadUri = result.uri;
        mediaWidth = result.width;
        mediaHeight = result.height;
      } catch {
        // Compression failed — fall back to original
      }
    } else {
      // GIFs skip the manipulator (which would strip animation), so read
      // dimensions via a lightweight probe instead.
      try {
        const size = await withTimeout(
          new Promise<{ width: number; height: number }>((resolve, reject) => {
            RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
          }),
          5_000,
          'gif size probe'
        );
        mediaWidth = size.width;
        mediaHeight = size.height;
      } catch {
        // Size probe failed — post still uploads, PostCard falls back to onLoad detection
      }
    }

    const ext = isGif ? 'gif' : 'jpg';
    const mimeType = isGif ? 'image/gif' : 'image/jpeg';

    let imageBase64: string | undefined;
    try {
      imageBase64 = await withTimeout(localUriToBase64(uploadUri), 15_000, 'photo file read');
    } catch (readErr) {
      console.error('[post-upload] photo base64 read failed:', readErr);
      // Continue without image
    }

    const res = await withTimeout(
      fetch(`${API_BASE}/posts/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          imageBase64,
          mimeType,
          ext,
          postType: options?.postType ?? "photo",
          caption,
          width: mediaWidth,
          height: mediaHeight,
          options: { ...options, visibility: options?.visibility ?? 'public' },
          coupleId: options?.coupleId,
          isCouplePost: options?.isCouplePost,
          poll: options?.poll,
        }),
      }),
      25_000,
      'post create API'
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      throw new Error(`Post upload failed (${res.status}): ${errText}`);
    }

    return await res.json() as { id: string; mediaUrl: string };
  } catch (err) {
    console.error('[post-upload] uploadPostMedia failed:', err);
    throw err; // Re-throw so the caller (PostPage) can reset the UI and show an error
  }
}

// ── Reel resolution enforcement ───────────────────────────────────────────────
// Portrait minimum: 1080 × 1920.  Landscape minimum: 1920 × 1080.
// Square is treated as portrait (short side must be ≥ 1080, long side ≥ 1920).
export const REEL_MIN_RESOLUTION = { short: 1080, long: 1920 } as const;

/**
 * Probes the video's encoded pixel dimensions via VideoThumbnails (runs locally,
 * no network request, no base64 read — fast and bandwidth-free).
 * Returns null when probing fails (corrupt file, very short clip, etc.) — in that
 * case callers should fail-open and let the server validate instead.
 */
export async function checkReelVideoResolution(
  uri: string
): Promise<{ ok: boolean; width: number; height: number } | null> {
  try {
    const { width, height } = await VideoThumbnails.getThumbnailAsync(uri, { time: 500 });
    if (!width || !height) return null;
    const isPortrait = height >= width;
    const ok = isPortrait
      ? width >= REEL_MIN_RESOLUTION.short && height >= REEL_MIN_RESOLUTION.long
      : width >= REEL_MIN_RESOLUTION.long && height >= REEL_MIN_RESOLUTION.short;
    return { ok, width, height };
  } catch {
    // Probe failed (e.g. very short clip, unsupported codec) — fail open
    return null;
  }
}

export async function uploadReelMedia(
  userId: string,
  uri: string,
  caption: string,
  duration?: number,
  visibility?: string,
  originalSoundPostId?: string | null,
  originalSoundUsername?: string | null,
  coupleOptions?: { coupleId?: string; isCouplePost?: boolean },
  videoDimensions?: { width: number; height: number }
): Promise<{ id: string; videoUrl: string; thumbnailUrl?: string } | null> {
  try {
    const cleanUri = uri.split('?')[0];
    const ext = (cleanUri.split('.').pop() ?? 'mp4').toLowerCase();
    const mimeType = ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4';

    // Generate thumbnail from video frame at 1 s and compress it
    let thumbnailBase64: string | undefined;
    try {
      const { uri: rawThumbUri } = await withTimeout(
        VideoThumbnails.getThumbnailAsync(uri, { time: 1000 }),
        10_000,
        'thumbnail gen'
      );
      const compressed = await withTimeout(
        ImageManipulator.manipulateAsync(
          rawThumbUri,
          [{ resize: { width: 720 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        ),
        10_000,
        'thumbnail compress'
      );
      thumbnailBase64 = await withTimeout(localUriToBase64(compressed.uri), 10_000, 'thumbnail read');
    } catch {
      // Thumbnail gen failed — reel will upload without it
    }

    // Read video as base64 for upload
    let videoBase64: string | undefined;
    try {
      videoBase64 = await withTimeout(localUriToBase64(uri), 30_000, 'reel file read');
    } catch {
      // File read failed — uploading without video data
    }

    // Send to API server — service role key handles storage + DB insert, bypassing RLS
    const res = await withTimeout(
      fetch(`${API_BASE}/reels/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, videoBase64, thumbnailBase64, mimeType, ext, caption, duration, visibility, originalSoundPostId: originalSoundPostId ?? null, originalSoundUsername: originalSoundUsername ?? null, coupleId: coupleOptions?.coupleId, isCouplePost: coupleOptions?.isCouplePost, videoWidth: videoDimensions?.width, videoHeight: videoDimensions?.height }),
      }),
      120_000,
      'reel create API'
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      throw new Error(`Reel create API ${res.status}: ${errText}`);
    }

    const result = await res.json() as { id: string; videoUrl: string; thumbnailUrl?: string };
    return result;
  } catch (err) {
    // Silent failure — caller checks null
    return null;
  }
}

// ─── Relationship Goals ───────────────────────────────────────────────────────

// NOTE: count values are placeholder copy — they are NOT live DB counts.
// Before launch, either drive these from a real COUNT(*) per goal or remove the
// count pill entirely. Showing "3K people" then finding 0 results looks broken.
export const RELATIONSHIP_GOALS = [
  { value: "long_term",        label: "Long-term partner",  shortLabel: "Long-term",     emoji: "🌹", count: "—", color: "#EC4899" },
  { value: "serious",          label: "Serious commitment", shortLabel: "Serious",       emoji: "💍", count: "—", color: "#EF4444" },
  { value: "friendship_first", label: "Friendship first",   shortLabel: "Friends first", emoji: "💜", count: "—", color: "#7C3AED" },
  { value: "friendship",       label: "New friends",        shortLabel: "Friends",       emoji: "🤝", count: "—", color: "#8B5CF6" },
  { value: "activity",         label: "Activity partner",   shortLabel: "Activity",      emoji: "🏃", count: "—", color: "#10B981" },
  { value: "travel",           label: "Travel buddy",       shortLabel: "Travel",        emoji: "✈️", count: "—", color: "#3B82F6" },
  { value: "gaming",           label: "Gaming buddy",       shortLabel: "Gaming",        emoji: "🎮", count: "—", color: "#A855F7" },
  { value: "language",         label: "Language partner",   shortLabel: "Language",      emoji: "🗣️", count: "—", color: "#06B6D4" },
  { value: "networking",       label: "Networking",         shortLabel: "Networking",    emoji: "💼", count: "—", color: "#64748B" },
  { value: "short_term",       label: "Short-term fun",     shortLabel: "Short-term",    emoji: "🍭", count: "—", color: "#F59E0B" },
  { value: "tonight",          label: "Free tonight",       shortLabel: "Tonight",       emoji: "🌙", count: "—", color: "#F97316" },
  { value: "figuring",         label: "Still figuring out", shortLabel: "Figuring out",  emoji: "🤔", count: "—", color: "#9CA3AF" },
] as const;

export type RelGoalValue = typeof RELATIONSHIP_GOALS[number]["value"];

// GET /api/vibe/by-intention — service-role key, never hangs under RLS
export async function getUsersByIntention(
  userId: string,
  goal: string,
): Promise<VibeMatchProfile[]> {
  try {
    const apiUrl = process.env["EXPO_PUBLIC_API_URL"] ?? "";
    const url = `${apiUrl}/api/vibe/by-intention?goal=${encodeURIComponent(goal)}&userId=${encodeURIComponent(userId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const json = await res.json();
    return ((json.users ?? []) as any[]).map((p: any) => ({
      id: p.id,
      name: p.name ?? p.full_name ?? p.username ?? "Vibe User",
      age: p.age ?? 25,
      image: p.image ?? p.avatar_url ?? `https://picsum.photos/seed/${p.id}/400/600`,
      bio: p.bio ?? "",
      interests: p.interests ?? [],
      gender: p.gender ?? undefined,
      goal: p.goal ?? undefined,
      vibe: p.vibe ?? undefined,
      isOnline: p.isOnline ?? false,
      vibeScore: 0,
      matchInterests: [],
    }));
  } catch {
    return [];
  }
}

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
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    await fetch(`${apiUrl}/vibe/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        gender: prefs.gender,
        interestedIn: prefs.interestedIn,
        lookingFor: prefs.lookingFor,
        age: prefs.age,
        ageMin: prefs.ageMin,
        ageMax: prefs.ageMax,
        maxDistance: prefs.maxDistance,
      }),
    });
    if (prefs.goals?.length) {
      saveUserGoals(userId, prefs.goals).catch(() => {});
    }
  } catch {}
}

export async function getVibePreferences(userId: string): Promise<VibePrefsRow | null> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/vibe/preferences?userId=${encodeURIComponent(userId)}`);
    const json = await res.json() as any;
    return (json.preferences ?? null) as VibePrefsRow | null;
  } catch {
    return null;
  }
}

export async function saveUserGoals(userId: string, goals: string[]): Promise<void> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    await fetch(`${apiUrl}/vibe/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, goals }),
    });
  } catch {}
}

export async function getUserGoals(userId: string): Promise<string[]> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/vibe/goals?userId=${encodeURIComponent(userId)}`);
    const json = await res.json() as any;
    return (json.goals ?? []) as string[];
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
    const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiBase}/vibe-requests/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, receiverId }),
    });
    if (res.ok) {
      const body = await res.json() as { result?: string };
      return (body.result === "matched" ? "matched" : "pending") as VibeRequestResult;
    }
  } catch {}
  return "pending";
}

// ─── Vibe Match Profiles ───────────────────────────────────────────────────────

export interface VibeMatchProfile {
  id: string;
  name: string;
  age: number;
  image: string;       // primary card image (first vibe_photo or avatar)
  bio: string;         // main profile bio (never shown on match card directly)
  vibe_bio?: string;   // Find Vibe-only bio shown on the match card; separate from main bio
  vibe_photos?: string[] | null; // Find Vibe card photos (URL refs from storage)
  vibe_prompts?: Array<{ question: string; answer: string }> | null;
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
  // Lifestyle fields surfaced on the detail view
  vibe_zodiac?: string | null;
  vibe_education?: string | null;
  vibe_family_plans?: string | null;
  vibe_communication?: string | null;
  vibe_love_style?: string | null;
  vibe_pets?: string | null;
  vibe_drinking?: string | null;
  vibe_smoking?: string | null;
  vibe_cannabis?: string | null;
  vibe_workout?: string | null;
  vibe_open_to?: string[] | null;
  vibe_languages?: string[] | null;
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
    const params = new URLSearchParams({
      userId,
      interestedIn: (filters?.interestedIn ?? []).join(","),
      lookingFor: filters?.lookingFor ?? "",
      ageMin: String(filters?.ageMin ?? 18),
      ageMax: String(filters?.ageMax ?? 99),
      maxDistanceKm: String(filters?.maxDistanceKm ?? 100),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/vibe/discover?${params}`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return [];
    const json = await res.json();
    return (json.profiles ?? []).map((p: any) => ({
      id: p.user_id ?? p.id,
      name: p.full_name ?? p.username ?? 'Vibe User',
      age: p.age ?? 25,
      image: p.avatar_url ?? `https://picsum.photos/seed/${p.user_id ?? p.id}/400/600`,
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
    return [];
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
    name: row.full_name ?? row.username ?? 'Vibe User',
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
  // Routes through the API server (service-role key) to bypass RLS.
  // Direct supabase.rpc() / .from() calls with the anon key hang forever under RLS.
  try {
    const res = await fetch(`${API_BASE}/vibe/matches?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    const json = await res.json() as { matches?: any[] };
    return (json.matches ?? []).map((m: any) => ({
      id: m.id,
      name: m.name ?? m.username ?? 'Vibe User',
      username: m.username,
      age: m.age ?? undefined,
      image: m.avatarUrl ?? `https://picsum.photos/seed/${m.id}/400/400`,
      bio: m.bio ?? '',
      interests: Array.isArray(m.interests) ? m.interests : [],
      gender: m.gender ?? undefined,
      isOnline: false,
      isVerified: m.isVerified ?? false,
      vibeScore: m.compatibilityScore ?? 0,
      goal: m.goal ?? undefined,
      matchedAt: matchTimeStr(m.matchedAt),
      sharedInterests: [],
      sameGoal: false,
      unreadCount: 0,
    }));
  } catch {
    return [];
  }
}

export async function getOrCreateConversation(userId: string, otherId: string): Promise<string | null> {
  try {
    const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiBase}/users/social/conversation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, otherId }),
    });
    if (res.ok) {
      const body = await res.json() as { conversationId?: string };
      return body.conversationId ?? null;
    }
  } catch {}
  return null;
}

// ─── Block / Report ───────────────────────────────────────────────────────────

export async function blockUser(myId: string, theirId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/moderation/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockerId: myId, blockedId: theirId }),
    });
  } catch {}
}

export async function unblockUser(myId: string, theirId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/moderation/block`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockerId: myId, blockedId: theirId }),
    });
  } catch {}
}

export async function reportContent(
  myId: string,
  contentId: string,
  contentType: "user" | "post" | "comment" | "story" | "reel",
  reason: string,
  details?: string,
): Promise<void> {
  try {
    await fetch(`${API_BASE}/moderation/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reporterId: myId,
        targetType: contentType === "story" ? "post" : contentType,
        targetId: contentId,
        reason,
        details,
      }),
    });
  } catch {}
}

// Fetches both block directions in one API call (service-role, avoids Android hang)
async function fetchBlockStatus(myId: string, theirId: string): Promise<{ iBlockedThem: boolean; theyBlockedMe: boolean }> {
  try {
    const res = await fetch(
      `${API_BASE}/users/social/block-status?myId=${encodeURIComponent(myId)}&theirId=${encodeURIComponent(theirId)}`
    );
    if (!res.ok) return { iBlockedThem: false, theyBlockedMe: false };
    return await res.json();
  } catch {
    return { iBlockedThem: false, theyBlockedMe: false };
  }
}

export async function isUserBlocked(myId: string, theirId: string): Promise<boolean> {
  const { iBlockedThem } = await fetchBlockStatus(myId, theirId);
  return iBlockedThem;
}

export async function amIBlockedBy(myId: string, theirId: string): Promise<boolean> {
  const { theyBlockedMe } = await fetchBlockStatus(myId, theirId);
  return theyBlockedMe;
}

export async function fetchMessageRequests(userId: string): Promise<Conversation[]> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/messages/requests?userId=${encodeURIComponent(userId)}`);
    const json = await res.json() as any;
    const rows: any[] = json.conversations ?? [];
    return rows.map((row: any) => {
      const isUser1 = row.user1_id === userId;
      const otherUser = isUser1 ? row.user2 : row.user1;
      const unreadCount = isUser1
        ? (row.unread_count_1 ?? 0)
        : (row.unread_count_2 ?? 0);
      return {
        id: row.id,
        other_user: {
          id: otherUser?.id ?? "",
          username: otherUser?.username ?? "User",
          avatar_url: otherUser?.avatar_url,
        },
        last_message: row.last_message ?? "",
        last_message_at: row.last_message_at ?? row.created_at ?? "",
        unread_count: unreadCount,
      };
    });
  } catch {}
  return [];
}

export async function acceptMessageRequest(conversationId: string): Promise<void> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    await fetch(`${apiUrl}/messages/conversations/${encodeURIComponent(conversationId)}/accept`, { method: "PATCH" });
  } catch {}
}

export async function deleteConversation(conversationId: string): Promise<void> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    await fetch(`${apiUrl}/messages/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/users/stats?userId=${encodeURIComponent(userId)}`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      const data = await res.json();
      return {
        posts_count: data.posts_count ?? 0,
        followers_count: data.followers_count ?? 0,
        following_count: data.following_count ?? 0,
      };
    }
  } catch {}
  return { posts_count: 0, followers_count: 0, following_count: 0 };
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
  const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  try {
    const res = await fetch(`${apiUrl}/users/find-by-contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails, userId: myUserId }),
    });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.users)) return json.users as SocialMatchUser[];
    }
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
  // Route through API server — bypasses RLS + avoids Android Supabase hang
  try {
    const params = new URLSearchParams({ q, limit: String(limit), viewer_id: myUserId });
    const res = await fetch(`${API_BASE}/users/search?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      return ((json.profiles ?? []) as any[])
        .filter((p: any) => p.id !== myUserId)
        .map((p: any) => ({
          id: p.id,
          username: p.username,
          avatar_url: p.avatar_url,
          bio: p.bio,
          followers_count: p.followers_count,
          is_verified: p.is_verified,
        }));
    }
  } catch {}
  return [];
}

export async function getSuggestedUsersForFindFriends(
  userId: string,
  limit = 15,
): Promise<SocialMatchUser[]> {
  // Route through API server — bypasses RLS + avoids Android Supabase hang
  try {
    const params = new URLSearchParams({ q: "", limit: String(limit), viewer_id: userId });
    const res = await fetch(`${API_BASE}/users/search?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      const profiles = ((json.profiles ?? []) as any[]).filter((p: any) => p.id !== userId);
      if (profiles.length > 0) {
        return profiles.map((p: any) => ({
          id: p.id,
          username: p.username,
          avatar_url: p.avatar_url,
          bio: p.bio,
          followers_count: p.followers_count,
          is_verified: p.is_verified,
        }));
      }
    }
  } catch {}
  return MOCK_SOCIAL_SUGGESTED;
}

export interface SuggestedFollowAccount {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  category?: string | null;
  posts_count?: number;
  is_verified?: boolean;
}

// Powers both the post-signup onboarding follow screen and the
// "Discover people" empty-state screen — one shared suggestion pool.
export async function getOnboardingSuggestedFollows(
  userId: string,
  limit = 15,
): Promise<SuggestedFollowAccount[]> {
  try {
    const params = new URLSearchParams({ userId, limit: String(limit) });
    const res = await fetch(`${API_BASE}/onboarding/suggested-follows?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.suggestions)) return json.suggestions as SuggestedFollowAccount[];
    }
  } catch {}
  return [];
}

export async function toggleFollowUser(myId: string, otherId: string): Promise<boolean> {
  // Route through API server — bypasses RLS + avoids Android Supabase hang
  try {
    const res = await fetch(`${API_BASE}/users/social/toggle-follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followerId: myId, followingId: otherId }),
    });
    if (res.ok) {
      const json = await res.json();
      return json.isFollowing as boolean;
    }
  } catch {}
  return false;
}

// ─── Public Profile Lookup ────────────────────────────────────────────────────

export interface PublicProfile {
  id: string;
  username: string;
  display_name?: string;
  full_name?: string;
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
  vibe_status?: string;
  relationship_status?: string;
  zodiac_sign?: string;
  pronouns?: string;
  show_relationship?: boolean;
  is_vibe_gated?: boolean;
}

export async function lookupProfileByUsername(username: string, viewerId?: string): Promise<PublicProfile | null> {
  try {
    const base = `${API_BASE}/users/profile/${encodeURIComponent(username)}`;
    const url = viewerId ? `${base}?viewer_id=${encodeURIComponent(viewerId)}` : base;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn('[lookupProfileByUsername] API error', res.status);
      return null;
    }
    const json = await res.json();
    return json.profile as PublicProfile;
  } catch (e) {
    console.warn('[lookupProfileByUsername] fetch exception:', String(e));
    return null;
  }
}

export async function checkIsFollowing(followerId: string, followingId: string): Promise<boolean> {
  try {
    const url = `${API_BASE}/users/social/follow-status?followerId=${encodeURIComponent(followerId)}&followingId=${encodeURIComponent(followingId)}`;
    const res = await fetch(url);
    if (!res.ok) return false;
    const json = await res.json();
    return !!json.following;
  } catch {
    return false;
  }
}

export async function ensureUserSetup(userId: string, username: string, email?: string): Promise<void> {
  // Route through API server (service-role) — all 4 upserts in one call,
  // bypasses RLS + avoids the Android Supabase direct-client hang on INSERT.
  // Retries with backoff before giving up — a swallowed failure here leaves
  // the user with no profiles/wallet/user_settings/vibe_scores row at all.
  const backoffsMs = [0, 1500, 4000];
  let lastError: unknown = null;
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt < backoffsMs.length; attempt++) {
    const delay = backoffsMs[attempt];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const res = await fetch(`${API_BASE}/users/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, username, email }),
      });
      if (res.ok) return;
      lastStatus = res.status;
      lastError = new Error(`/users/setup responded ${res.status}`);
    } catch (e) {
      lastError = e;
    }
  }

  // All attempts failed — this must never fail silently again.
  console.error("[ensureUserSetup] failed after retries", { userId, username, lastStatus, lastError });
  captureException(
    lastError instanceof Error
      ? lastError
      : new Error(`ensureUserSetup failed after retries for userId=${userId}`)
  );
}

// ─── Nearby Users ──────────────────────────────────────────────────────────────

// ── Suggested Accounts ("People You May Know") ────────────────────────────────
export interface SuggestedAccount {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  followers_count: number;
  is_verified: boolean;
  mutual_count: number;
}

export async function fetchSuggestedAccounts(userId: string, limit = 10): Promise<SuggestedAccount[]> {
  try {
    const params = new URLSearchParams({ viewer_id: userId, q: "", limit: String(limit) });
    const res = await fetch(`${API_BASE}/users/search?${params.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.profiles ?? []) as SuggestedAccount[];
  } catch {
    return [];
  }
}

export async function getNearbyUsers(
  userId: string,
  lat: number | undefined,
  lng: number | undefined,
  _radiusKm = 50,
): Promise<VibeMatchProfile[]> {
  try {
    const params = new URLSearchParams({ userId });
    if (lat !== undefined) params.set("lat", String(lat));
    if (lng !== undefined) params.set("lng", String(lng));
    const res = await fetch(`${API_BASE}/vibe/deck?${params.toString()}`);
    if (res.ok) {
      const json = await res.json() as { profiles?: any[] };
      const data: any[] = json.profiles ?? [];
      return data.map((row: any) => {
        const vibePhotos: string[] | null =
          Array.isArray(row.vibe_photos) && row.vibe_photos.length > 0 ? row.vibe_photos : null;
        return {
          id: row.id ?? row.user_id,
          name: row.full_name ?? row.username ?? "Vibe User",
          age: row.age ?? 24,
          // vibe_profile_photo_url takes priority; fall back to first gallery photo, then avatar
          image: row.vibe_profile_photo_url ?? (vibePhotos?.[0]) ?? row.avatar_url ?? `https://picsum.photos/seed/${row.id ?? row.user_id}/400/600`,
          bio: row.bio ?? "",
          vibe_bio: row.vibe_bio ?? null,
          vibe_photos: vibePhotos,
          vibe_prompts: Array.isArray(row.vibe_prompts) ? row.vibe_prompts : null,
          interests: row.interests ?? [],
          distance: row.distance_km ? `${Math.round(row.distance_km as number)} km away` : undefined,
          isOnline: row.is_online ?? false,
          isVerified: row.is_verified ?? false,
          gender: row.gender,
          goal: row.looking_for,
          vibeScore: row.vibe_score ?? row.compatibility_score,
          matchInterests: row.shared_interests ?? [],
          vibe_zodiac: row.vibe_zodiac ?? null,
          vibe_education: row.vibe_education ?? null,
          vibe_family_plans: row.vibe_family_plans ?? null,
          vibe_communication: row.vibe_communication ?? null,
          vibe_love_style: row.vibe_love_style ?? null,
          vibe_pets: row.vibe_pets ?? null,
          vibe_drinking: row.vibe_drinking ?? null,
          vibe_smoking: row.vibe_smoking ?? null,
          vibe_cannabis: row.vibe_cannabis ?? null,
          vibe_workout: row.vibe_workout ?? null,
          vibe_open_to: Array.isArray(row.vibe_open_to) ? row.vibe_open_to : null,
          vibe_languages: Array.isArray(row.vibe_languages) ? row.vibe_languages : null,
        };
      });
    }
  } catch {}
  return [];
}

// ─── Vibe Rooms — all writes/reads go through the API server (service-role key)
// Direct Supabase client calls hang indefinitely under RLS with the anon key.

const ROOMS_API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/vibe-rooms";

export async function checkRoomJoined(userId: string, roomId: string): Promise<boolean> {
  try {
    const res = await fetch(`${ROOMS_API}/joined?userId=${encodeURIComponent(userId)}&roomId=${encodeURIComponent(roomId)}`);
    if (!res.ok) return false;
    const json = await res.json() as { joined: boolean };
    return json.joined ?? false;
  } catch {
    return false;
  }
}

export async function joinVibeRoom(userId: string, roomId: string): Promise<{ memberCount: number }> {
  const res = await fetch(`${ROOMS_API}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, roomId }),
  });
  if (!res.ok) throw new Error("Failed to join room");
  return res.json() as Promise<{ memberCount: number }>;
}

export interface VibeRoomMessage {
  id: string;
  room_id: string;
  user_id: string;
  text: string;
  created_at: string;
  profiles?: { full_name?: string; username?: string; avatar_url?: string };
}

export async function getRoomMessages(roomId: string): Promise<VibeRoomMessage[]> {
  try {
    const res = await fetch(`${ROOMS_API}/${encodeURIComponent(roomId)}/messages`);
    if (!res.ok) return [];
    const json = await res.json() as { messages: VibeRoomMessage[] };
    return json.messages ?? [];
  } catch {
    return [];
  }
}

export async function sendRoomMessage(userId: string, roomId: string, text: string): Promise<void> {
  const res = await fetch(`${ROOMS_API}/${encodeURIComponent(roomId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, text }),
  });
  if (!res.ok) throw new Error("Failed to send message");
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
    // Fetch from BOTH sources in parallel:
    //   1. /api/snaps        — new dedicated snaps table (snaps sent after migration)
    //   2. /api/messages/snaps — legacy snaps stored in the messages table
    // Merge and dedupe by other_user.id so each conversation partner appears once.
    const param = `userId=${encodeURIComponent(userId)}`;
    const [newRes, legacyRes] = await Promise.allSettled([
      fetch(`${API_BASE}/snaps?${param}`).then((r) => r.ok ? r.json() as Promise<{ snapConvos?: SnapConversation[] }> : { snapConvos: [] }),
      fetch(`${API_BASE}/messages/snaps?${param}`).then((r) => r.ok ? r.json() as Promise<{ snapConvos?: SnapConversation[] }> : { snapConvos: [] }),
    ]);
    const newConvos: SnapConversation[] =
      newRes.status === "fulfilled" ? (newRes.value.snapConvos ?? []) : [];
    const legacyConvos: SnapConversation[] =
      legacyRes.status === "fulfilled" ? (legacyRes.value.snapConvos ?? []) : [];

    // Prefer newer snaps table entries; fall back to legacy for users not yet in new table
    const seen = new Set<string>();
    const merged: SnapConversation[] = [];
    for (const c of [...newConvos, ...legacyConvos]) {
      if (!seen.has(c.other_user.id)) {
        seen.add(c.other_user.id);
        merged.push(c);
      }
    }
    return merged;
  } catch { return []; }
}

// ─── Vibe Swipe Tracking & Anti-Abuse ─────────────────────────────────────────

export const FREE_DAILY_SWIPE_LIMIT = 100;
export const COOLDOWN_CONSECUTIVE_LEFTS = 20;
export const COOLDOWN_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Record a swipe and check for a mutual match — proxied through the API server
 * so the service-role key is used (bypasses RLS on vibe_swipes).
 * Returns "matched" if both users right-swiped each other, "pending" otherwise.
 */
export async function vibeSwipe(
  swiperId: string,
  targetId: string,
  direction: 'left' | 'right' | 'super',
): Promise<'matched' | 'pending' | 'recorded'> {
  try {
    const res = await fetch(`${API_BASE}/vibe/swipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ swiperId, targetId, direction }),
    });
    if (!res.ok) return 'recorded';
    const json = await res.json();
    return json.match ? 'matched' : 'pending';
  } catch {
    return 'recorded';
  }
}

/**
 * Returns all target IDs the user has already swiped on (any direction).
 * Used to exclude seen profiles from the swipe deck.
 */
export async function resetVibeDeck(userId: string): Promise<{ ok: boolean; deletedRows: number }> {
  try {
    const res = await fetch(`${API_BASE}/vibe/reset-deck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) return { ok: false, deletedRows: 0 };
    const json = await res.json() as { ok?: boolean; deletedRows?: number };
    return { ok: json.ok ?? false, deletedRows: json.deletedRows ?? 0 };
  } catch {
    return { ok: false, deletedRows: 0 };
  }
}

export async function getSwipedIds(userId: string): Promise<Set<string>> {
  try {
    const res = await fetch(`${API_BASE}/vibe/swiped?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return new Set();
    const json = await res.json();
    return new Set<string>(json.targetIds ?? []);
  } catch {
    return new Set();
  }
}

/**
 * @deprecated Use vibeSwipe() instead — this proxies through the API server
 * to bypass RLS. Kept for backward compatibility.
 */
export async function recordVibeSwipe(
  userId: string,
  targetId: string,
  direction: 'left' | 'right' | 'super',
): Promise<void> {
  await vibeSwipe(userId, targetId, direction).catch(() => {});
}

/**
 * Return how many swipes this user has done in the last 24 hours.
 */
export async function getDailySwipeCount(userId: string): Promise<number> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/vibe/swipe-count?userId=${encodeURIComponent(userId)}`);
    const json = await res.json() as any;
    return (json.count ?? 0) as number;
  } catch {
    return 0;
  }
}

// ── Story Highlights ──────────────────────────────────────────────────────────

export interface StoryHighlight {
  id: string;
  user_id: string;
  title: string;
  cover_url?: string;
  stories_count: number;
  created_at: string;
}

export async function fetchHighlights(userId: string): Promise<StoryHighlight[]> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/stories/highlights?userId=${encodeURIComponent(userId)}`);
    const json = await res.json() as any;
    return (json.highlights ?? []) as StoryHighlight[];
  } catch {}
  return [];
}

export async function createHighlight(
  userId: string,
  title: string,
  coverUrl?: string,
): Promise<StoryHighlight | null> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/stories/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title, coverUrl }),
    });
    const json = await res.json() as any;
    return (json.highlight ?? null) as StoryHighlight | null;
  } catch {}
  return null;
}

export async function deleteHighlight(highlightId: string): Promise<boolean> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/stories/highlights/${encodeURIComponent(highlightId)}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Highlight Stories (join table) ───────────────────────────────────────────

export interface HighlightStory {
  id: string;
  media_url: string;
  caption?: string | null;
  created_at: string;
}

/** Fetch all stories pinned to a highlight via highlight_stories join table */
export async function fetchHighlightStories(highlightId: string): Promise<HighlightStory[]> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/stories/highlights/${encodeURIComponent(highlightId)}/stories`);
    const json = await res.json() as any;
    return (json.stories ?? []) as HighlightStory[];
  } catch {}
  return [];
}

/** Add a story to a highlight (idempotent — silently ignores duplicates) */
export async function addStoryToHighlight(highlightId: string, storyId: string): Promise<boolean> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/stories/highlights/${encodeURIComponent(highlightId)}/stories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId }),
    });
    return res.ok;
  } catch {}
  return false;
}

/** Remove a story from a highlight */
export async function removeStoryFromHighlight(highlightId: string, storyId: string): Promise<boolean> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(
      `${apiUrl}/stories/highlights/${encodeURIComponent(highlightId)}/stories/${encodeURIComponent(storyId)}`,
      { method: "DELETE" }
    );
    return res.ok;
  } catch {}
  return false;
}

/** Fetch this user's own stories (story archive for the highlight picker) */
export async function fetchMyStories(userId: string): Promise<HighlightStory[]> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/stories/my?userId=${encodeURIComponent(userId)}`);
    const json = await res.json() as any;
    return (json.stories ?? []) as HighlightStory[];
  } catch {}
  return [];
}

// ── Pinned Posts ──────────────────────────────────────────────────────────────

export async function togglePinPost(postId: string, isPinned: boolean): Promise<boolean> {
  try {
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/posts/${encodeURIComponent(postId)}/pin`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPinned }),
    });
    return res.ok;
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
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(`${apiUrl}/stories/interaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId, userId, interactionType, response }),
    });
    return res.ok;
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
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await fetch(
      `${apiUrl}/vibe/cooldown?userId=${encodeURIComponent(userId)}&limit=${COOLDOWN_CONSECUTIVE_LEFTS}`
    );
    const json = await res.json() as any;
    if (!json.swipes || json.swipes.length < COOLDOWN_CONSECUTIVE_LEFTS) return false;
    if (!json.swipes.every((s: any) => s.direction === 'left')) return false;
    const oldest = new Date(json.swipes[COOLDOWN_CONSECUTIVE_LEFTS - 1].created_at).getTime();
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
    const apiUrl = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    await fetch(`${apiUrl}/vibe/compat-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, targetId, score }),
    });
  } catch {}
}

// ─── Stories ─────────────────────────────────────────────────────────────────

export async function createStory(opts: {
  userId: string;
  mediaUrl?: string;
  caption?: string;
  bgGradient?: string;
  textContent?: string;
  storyType?: "text" | "image" | "video";
  audience?: string;
}): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/stories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: opts.userId,
        mediaUrl: opts.mediaUrl,
        caption: opts.caption,
        bgGradient: opts.bgGradient,
        textContent: opts.textContent,
        storyType: opts.storyType ?? "text",
        audience: opts.audience ?? "Everyone",
      }),
    });
  } catch (err) {
    console.error("[createStory] network error:", err);
    throw new Error("network");
  }
  if (!res.ok) {
    let errMsg = `Server error (${res.status})`;
    try { const b = await res.json(); errMsg = (b as any).error ?? errMsg; } catch {}
    console.error("[createStory] API error", res.status, errMsg);
    throw new Error(errMsg);
  }
  const data = await res.json() as { id: string };
  return data.id;
}

export async function createFeedPost(opts: {
  userId: string;
  caption?: string;
  mediaUri?: string;
  visibility?: string;
}): Promise<string | null> {
  try {
    if (opts.mediaUri) {
      const result = await uploadPostMedia(opts.userId, opts.mediaUri, opts.caption ?? "", { visibility: opts.visibility ?? "public" });
      return result?.id ?? null;
    }
    // Text-only post
    const API_BASE_LOCAL = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    const res = await withTimeout(
      fetch(`${API_BASE_LOCAL}/posts/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: opts.userId, caption: opts.caption, options: { visibility: opts.visibility ?? "public" } }),
      }),
      30_000,
      "create feed post API",
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string };
    return data.id;
  } catch {
    return null;
  }
}

export async function uploadStoryMedia(
  userId: string,
  uri: string,
  caption?: string,
  storyType: "image" | "video" = "image",
  audience = "Everyone",
): Promise<string> {
  const cleanUri = uri.split("?")[0];
  const ext = (cleanUri.split(".").pop() ?? "jpg").toLowerCase();
  const mimeType =
    storyType === "video"
      ? ext === "mov"
        ? "video/quicktime"
        : "video/mp4"
      : ext === "png"
        ? "image/png"
        : "image/jpeg";

  let imageBase64: string | undefined;
  try {
    imageBase64 = await withTimeout(localUriToBase64(uri), 25_000, "story file read");
  } catch (readErr) {
    console.error("[uploadStoryMedia] file read failed:", readErr);
    throw new Error("network");
  }

  let res: Response;
  try {
    res = await withTimeout(
      fetch(`${API_BASE}/stories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          imageBase64,
          mimeType,
          ext,
          caption,
          storyType,
          audience,
        }),
      }),
      60_000,
      "story media create API",
    );
  } catch (err) {
    console.error("[uploadStoryMedia] network error:", err);
    throw new Error("network");
  }

  if (!res.ok) {
    let errMsg = `Server error (${res.status})`;
    try { const b = await res.json(); errMsg = (b as any).error ?? errMsg; } catch {}
    console.error("[uploadStoryMedia] API error", res.status, errMsg);
    throw new Error(errMsg);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}
