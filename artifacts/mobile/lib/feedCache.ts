import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Post } from "@/lib/supabase";

// Lightweight on-device cache of feed JSON (post rows only — no images, those
// are already cached by expo-image's own disk cache). Lets the feed screen
// render instantly on app open instead of showing a blank/loading state while
// waiting for the first network response.
const CACHE_PFX = "gundruk_feed_cache_v2:";
const CACHE_TTL = 48 * 60 * 60 * 1000; // 48h — beyond this, cached data is considered too stale to show
const MAX_CACHED_POSTS = 20; // one page's worth is enough for an instant first paint

interface CachedFeedEntry {
  posts: Post[];
  savedAt: number;
}

function cacheKey(tab: string, userId: string): string {
  return `${CACHE_PFX}${tab}:${userId}`;
}

export async function getCachedFeed(tab: string, userId: string): Promise<Post[] | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(tab, userId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedFeedEntry;
    if (!entry?.posts?.length) return null;
    if (Date.now() - entry.savedAt > CACHE_TTL) return null;
    return entry.posts;
  } catch {
    return null;
  }
}

export async function setCachedFeed(tab: string, userId: string, posts: Post[]): Promise<void> {
  if (!userId || posts.length === 0) return;
  try {
    const entry: CachedFeedEntry = { posts: posts.slice(0, MAX_CACHED_POSTS), savedAt: Date.now() };
    await AsyncStorage.setItem(cacheKey(tab, userId), JSON.stringify(entry));
  } catch {
    // Cache write failures are non-fatal — the feed still works, just without the instant-paint boost.
  }
}
