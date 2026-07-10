import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Profile } from "@/lib/supabase";

// Lightweight on-device cache of the current user's OWN profile (stats + bio +
// avatar + first page of grid post metadata — no full images, those are
// already cached by expo-image's own disk cache). Lets the profile screen
// render instantly on open instead of showing a spinner while waiting on the
// network. Mirrors the pattern established in feedCache.ts.
const CACHE_PFX = "gundruk_profile_cache_v1:";
const CACHE_TTL = 48 * 60 * 60 * 1000; // 48h — beyond this, cached data is considered too stale to show
const MAX_CACHED_GRID_ITEMS = 21; // ~7 rows of 3 — enough for an instant first paint

// Deliberately loose/independent of the GridItem type defined in profile.tsx
// so this module has no dependency on screen-local types. Only the fields we
// actually cache are declared.
export interface CachedGridItem {
  id: string;
  image_url?: string;
  media_url?: string;
  thumbnail_url?: string;
  isReel?: boolean;
  is_video?: boolean;
  likes?: number;
  comments?: number;
  caption?: string;
  post_type?: "photo" | "video" | "poll" | "mood";
  visibility?: string;
  duration?: number;
  is_pinned?: boolean;
}

export interface CachedProfileData {
  profile: Partial<Profile>;
  gridItems: CachedGridItem[];
}

interface CachedProfileEntry extends CachedProfileData {
  savedAt: number;
}

function cacheKey(userId: string): string {
  return `${CACHE_PFX}${userId}`;
}

export async function getCachedProfile(userId: string): Promise<CachedProfileData | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedProfileEntry;
    if (!entry?.profile) return null;
    if (Date.now() - entry.savedAt > CACHE_TTL) return null;
    return { profile: entry.profile, gridItems: entry.gridItems ?? [] };
  } catch {
    return null;
  }
}

export async function setCachedProfile(userId: string, data: CachedProfileData): Promise<void> {
  if (!userId || !data.profile) return;
  try {
    const entry: CachedProfileEntry = {
      profile: data.profile,
      gridItems: data.gridItems.slice(0, MAX_CACHED_GRID_ITEMS),
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(entry));
  } catch {
    // Cache write failures are non-fatal — the profile still works, just without the instant-paint boost.
  }
}
