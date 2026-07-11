// Client-side AsyncStorage cache for the Vibe swipe deck.
// Mirrors the pattern in feedCache.ts: stores the ranked/filtered profile list
// so the Find Vibe tab can render cards INSTANTLY on first open rather than
// waiting on the network every time.
//
// TTL is shorter than feedCache (5 min vs 48 h) because vibe deck contents
// change more frequently — new users register, swipes are recorded, preferences
// update. The cache is purely for the "instant first paint" experience; the
// network fetch still fires in the background and updates state when it lands.

import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PFX = "gundruk_vibe_deck_cache_v1:";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface CachedVibeProfile {
  id: string;
  name: string;
  age: number;
  image: string;
  bio?: string;
  vibe_bio?: string | null;
  vibe_photos?: string[] | null;
  interests?: string[];
  distance?: string;
  isOnline?: boolean;
  isVerified?: boolean;
  gender?: string;
  goal?: string;
  vibeScore?: number;
  matchInterests?: string[];
}

interface CachedVibeDeckEntry {
  profiles: CachedVibeProfile[];
  savedAt: number;
}

function cacheKey(userId: string): string {
  return `${CACHE_PFX}${userId}`;
}

export async function getCachedVibeDeck(userId: string): Promise<CachedVibeProfile[] | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedVibeDeckEntry;
    if (!entry?.profiles?.length) return null;
    if (Date.now() - entry.savedAt > CACHE_TTL) return null;
    return entry.profiles;
  } catch {
    return null;
  }
}

export async function setCachedVibeDeck(userId: string, profiles: CachedVibeProfile[]): Promise<void> {
  if (!userId || profiles.length === 0) return;
  try {
    const entry: CachedVibeDeckEntry = { profiles, savedAt: Date.now() };
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(entry));
  } catch {
    // Cache write failures are non-fatal — deck still works, just without the instant-paint boost.
  }
}
