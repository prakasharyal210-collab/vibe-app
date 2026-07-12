// Post-authentication preload: fires parallel fetches for the app's major data
// surfaces immediately after sign-in/sign-up, so Feed, Friends, and Profile
// all feel instant on first open rather than showing a loading spinner.
//
// IMPORTANT: every function here is fire-and-forget. Never await this in the
// auth flow — it must not block navigation or extend the sign-in round-trip.
// All cache writes are best-effort; failures are silently swallowed.

import { getCachedFeed, setCachedFeed } from "@/lib/feedCache";
import { getCachedProfile, setCachedProfile } from "@/lib/profileCache";
import { getCachedVibeDeck, setCachedVibeDeck, CachedVibeProfile } from "@/lib/vibeCache";
import { getCachedCouplePosts, setCachedCouplePosts } from "@/lib/coupleCache";
import { getForYouFeed, getFriendsFeed } from "@/lib/db";
import type { Post } from "@/lib/supabase";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

// ─── For You feed ─────────────────────────────────────────────────────────────
async function preloadForYouFeed(userId: string): Promise<void> {
  try {
    const existing = await getCachedFeed("foryou", userId);
    // Skip if we already have a fresh cache (e.g. returning user on second
    // app launch within 48h) — no need to hit the network redundantly.
    if (existing && existing.length > 0) return;

    const { posts } = await getForYouFeed(userId, 20, 0);
    if (posts.length > 0) await setCachedFeed("foryou", userId, posts);
  } catch {
    // Preload failures are non-fatal — feed fetches on its own on mount.
  }
}

// ─── Friends feed ─────────────────────────────────────────────────────────────
async function preloadFriendsFeed(userId: string): Promise<void> {
  try {
    const existing = await getCachedFeed("friends", userId);
    if (existing && existing.length > 0) return;

    const posts = await getFriendsFeed(userId, 20, 0);
    if (posts.length > 0) await setCachedFeed("friends", userId, posts);
  } catch {
    // Preload failures are non-fatal.
  }
}

// ─── Reels ────────────────────────────────────────────────────────────────────
// The reels tab has no client-side AsyncStorage cache yet (that's #3).  Firing
// this fetch warms the API server's 60s in-memory ranked pool so the reels tab
// gets a fast response when it mounts — no screen-side change needed to benefit.
async function preloadReels(userId: string): Promise<void> {
  try {
    await fetch(
      `${API_BASE}/feed/reels?userId=${encodeURIComponent(userId)}&limit=20`,
    );
  } catch {
    // Warming failure is non-fatal.
  }
}

// ─── Own profile ──────────────────────────────────────────────────────────────
async function preloadProfile(userId: string): Promise<void> {
  try {
    const existing = await getCachedProfile(userId);
    if (existing?.profile?.id) return;

    const [profileRes, statsRes] = await Promise.allSettled([
      fetch(`${API_BASE}/users/profile/by-id/${encodeURIComponent(userId)}`),
      fetch(`${API_BASE}/users/stats?userId=${encodeURIComponent(userId)}`),
    ]);

    const profileData =
      profileRes.status === "fulfilled" && profileRes.value.ok
        ? ((await profileRes.value.json()) as any)?.profile ?? null
        : null;

    const statsData =
      statsRes.status === "fulfilled" && statsRes.value.ok
        ? ((await statsRes.value.json()) as any)
        : null;

    if (!profileData && !statsData) return;

    const profile = {
      ...(profileData ?? {}),
      ...(statsData
        ? {
            posts_count: statsData.posts_count ?? profileData?.posts_count ?? 0,
            followers_count: statsData.followers_count ?? profileData?.followers_count ?? 0,
            following_count: statsData.following_count ?? profileData?.following_count ?? 0,
          }
        : {}),
    };

    await setCachedProfile(userId, { profile, gridItems: [] });
  } catch {
    // Preload failures are non-fatal.
  }
}

// ─── Vibe deck ────────────────────────────────────────────────────────────────
// Pre-fetches the user's nearby vibe swipe deck before they open the Find tab,
// storing results in AsyncStorage so the tab renders cards instantly on first
// open. TTL is 5 min (see vibeCache.ts) — stale cache is skipped automatically.
async function preloadVibeDeck(userId: string): Promise<void> {
  try {
    const existing = await getCachedVibeDeck(userId);
    if (existing && existing.length > 0) return;

    const res = await fetch(`${API_BASE}/vibe/deck?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return;
    const json = (await res.json()) as { profiles?: any[] };
    const profiles: CachedVibeProfile[] = (json.profiles ?? []).map((row: any) => ({
      id: row.id ?? row.user_id,
      name: row.full_name ?? row.name ?? row.username ?? "Vibe User",
      age: row.age ?? 24,
      image:
        row.vibe_profile_photo_url ??
        (Array.isArray(row.vibe_photos) && row.vibe_photos.length > 0
          ? row.vibe_photos[0]
          : null) ??
        row.avatar_url ??
        `https://picsum.photos/seed/${row.id ?? row.user_id}/400/600`,
      bio: row.bio ?? "",
      vibe_bio: row.vibe_bio ?? null,
      vibe_photos: Array.isArray(row.vibe_photos) && row.vibe_photos.length > 0 ? row.vibe_photos : null,
      interests: row.interests ?? [],
      distance: row.distance_km ? `${Math.round(row.distance_km as number)} km away` : undefined,
      isOnline: row.is_online ?? false,
      isVerified: row.is_verified ?? false,
      gender: row.gender,
      goal: row.looking_for,
      vibeScore: row.vibe_score ?? row.compatibility_score,
      matchInterests: row.shared_interests ?? [],
    }));

    if (profiles.length > 0) await setCachedVibeDeck(userId, profiles);
  } catch {
    // Preload failures are non-fatal — deck fetches on its own on tab focus.
  }
}

// ─── Confession Room (Couple Feed) ────────────────────────────────────────────
// Pre-fetches confession posts for coupled users so the room opens instantly.
// Strategy:
//   1. Check couple status to get coupleId (only coupled users have this).
//   2. If coupled and no fresh cache exists, fetch posts and persist them.
// TTL is 3 min (see coupleCache.ts). If the user is not coupled, exits fast.
async function preloadCoupleRoom(userId: string): Promise<void> {
  try {
    // Step 1: resolve coupleId from couple status endpoint
    const statusRes = await fetch(`${API_BASE}/couple/status?userId=${encodeURIComponent(userId)}`);
    if (!statusRes.ok) return;
    const statusJson = (await statusRes.json()) as { status?: string; couple?: { id?: string } };
    if (statusJson.status !== "coupled" || !statusJson.couple?.id) return;

    const coupleId = statusJson.couple.id;

    // Step 2: skip if we already have a fresh cache
    const existing = await getCachedCouplePosts(coupleId);
    if (existing && (existing.newPosts.length > 0 || existing.hotPosts.length > 0)) return;

    // Step 3: fetch posts and cache them
    const postsRes = await fetch(`${API_BASE}/couple-feed/posts?coupleId=${encodeURIComponent(coupleId)}`);
    if (!postsRes.ok) return;
    const postsJson = (await postsRes.json()) as { newPosts?: any[]; hotPosts?: any[] };
    const data = { newPosts: postsJson.newPosts ?? [], hotPosts: postsJson.hotPosts ?? [] };
    if (data.newPosts.length > 0 || data.hotPosts.length > 0) {
      await setCachedCouplePosts(coupleId, data);
    }
  } catch {
    // Preload failures are non-fatal.
  }
}

// ─── Public entry point ────────────────────────────────────────────────────────
// Call this fire-and-forget immediately after sign-in / sign-up succeeds.
// All fetches run in parallel so total wall-clock cost ≈ slowest single fetch.
export function preloadAfterAuth(userId: string): void {
  if (!userId) return;
  void Promise.all([
    preloadForYouFeed(userId),
    preloadFriendsFeed(userId),
    preloadReels(userId),
    preloadProfile(userId),
    preloadVibeDeck(userId),
    preloadCoupleRoom(userId),
  ]);
}
