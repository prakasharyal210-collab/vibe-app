// Client-side AsyncStorage cache for Confession Room posts.
// Keyed by coupleId. TTL is 3 minutes — short enough that new posts
// appear quickly on pull-to-refresh, long enough to avoid a loading
// spinner on every tab re-focus.
//
// Stored shape mirrors the /api/couple-feed/posts response:
//   { newPosts: Post[], hotPosts: Post[] }

import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const KEY_PREFIX = "couple_cache_v1_";

export interface CachedCouplePosts {
  newPosts: any[];
  hotPosts: any[];
}

interface CacheEntry {
  data: CachedCouplePosts;
  cachedAt: number;
}

function cacheKey(coupleId: string): string {
  return `${KEY_PREFIX}${coupleId}`;
}

export async function getCachedCouplePosts(coupleId: string): Promise<CachedCouplePosts | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(coupleId));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCachedCouplePosts(
  coupleId: string,
  data: CachedCouplePosts,
): Promise<void> {
  try {
    const entry: CacheEntry = { data, cachedAt: Date.now() };
    await AsyncStorage.setItem(cacheKey(coupleId), JSON.stringify(entry));
  } catch {
    // cache write failures are non-fatal
  }
}
