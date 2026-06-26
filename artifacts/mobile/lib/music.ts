import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

export type MusicCategory =
  | "Trending"
  | "Hip Hop"
  | "Pop"
  | "Chill"
  | "Energy"
  | "Sad"
  | "Dance"
  | "Love";

export interface Track {
  id: string;
  title: string;
  artist: string;
  durationSecs: number;
  previewUrl: string;
  coverUrl?: string;
  coverColor: string;
  category: MusicCategory;
  usedInReels: number;
  bpm: number;
  trimStart: number;
  isFromJamendo?: boolean;
  isDeezer?: boolean;
  chartPosition?: number;
}

export interface DeezerCountryOption {
  code: string;
  label: string;
  flag: string;
}

export const DEEZER_COUNTRIES: DeezerCountryOption[] = [
  { code: "0",  label: "Global",     flag: "🌍" },
  { code: "US", label: "USA",        flag: "🇺🇸" },
  { code: "IN", label: "India",      flag: "🇮🇳" },
  { code: "NP", label: "Nepal",      flag: "🇳🇵" },
  { code: "GB", label: "UK",         flag: "🇬🇧" },
  { code: "KR", label: "K-Pop",      flag: "🇰🇷" },
  { code: "BR", label: "Brazil",     flag: "🇧🇷" },
  { code: "ES", label: "Latin",      flag: "🇪🇸" },
  { code: "NG", label: "Afrobeats",  flag: "🇳🇬" },
  { code: "JP", label: "Japan",      flag: "🇯🇵" },
  { code: "PK", label: "Pakistan",   flag: "🇵🇰" },
  { code: "BD", label: "Bangladesh", flag: "🇧🇩" },
];

const JAMENDO_CLIENT_ID = "b6747d04";
const JAMENDO_BASE = "https://api.jamendo.com/v3.0/tracks/";
const FAVORITES_KEY = "vibe_music_favorites";
const CACHE_TTL = 10 * 60 * 1000;

const memCache = new Map<string, { data: Track[]; ts: number }>();

const JAMENDO_TAGS: Record<MusicCategory, string | null> = {
  Trending: null,
  "Hip Hop": "hiphop",
  Pop: "pop",
  Chill: "chillout",
  Energy: "energetic",
  Sad: "sad",
  Dance: "dance",
  Love: "love",
};

const COVER_COLORS: Record<MusicCategory, string> = {
  Trending: "#F97316",
  "Hip Hop": "#EF4444",
  Pop: "#EC4899",
  Chill: "#059669",
  Energy: "#DC2626",
  Sad: "#4338CA",
  Dance: "#DB2777",
  Love: "#E11D48",
};

interface JamendoTrack {
  id: string;
  name: string;
  artist_name: string;
  album_image: string;
  audio: string;
  audiodownload: string;
  duration: number;
  popularity: number;
}

function jamendoToTrack(jt: JamendoTrack, category: MusicCategory): Track {
  return {
    id: `jamendo_${jt.id}`,
    title: jt.name,
    artist: jt.artist_name,
    durationSecs: jt.duration,
    previewUrl: jt.audio,
    coverUrl: jt.album_image || undefined,
    coverColor: COVER_COLORS[category],
    category,
    usedInReels: Math.max(0, Math.round((jt.popularity || 0) * 80)),
    bpm: 0,
    trimStart: 0,
    isFromJamendo: true,
  };
}

export async function fetchTracksFromJamendo(category: MusicCategory): Promise<Track[]> {
  const cacheKey = `jamendo_cat_${category}`;

  const mem = memCache.get(cacheKey);
  if (mem && Date.now() - mem.ts < CACHE_TTL) return mem.data;

  try {
    const stored = await AsyncStorage.getItem(cacheKey);
    if (stored) {
      const parsed = JSON.parse(stored) as { data: Track[]; ts: number };
      if (Date.now() - parsed.ts < CACHE_TTL) {
        memCache.set(cacheKey, parsed);
        return parsed.data;
      }
    }
  } catch {}

  try {
    const tag = JAMENDO_TAGS[category];
    let url = `${JAMENDO_BASE}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=20&order=popularity_total&include=musicinfo`;
    if (tag) url += `&tags=${tag}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Jamendo ${res.status}`);
    const json = await res.json() as { results?: JamendoTrack[] };
    const results = json.results ?? [];
    const tracks = results.map((jt) => jamendoToTrack(jt, category));

    const entry = { data: tracks, ts: Date.now() };
    memCache.set(cacheKey, entry);
    AsyncStorage.setItem(cacheKey, JSON.stringify(entry)).catch(() => {});
    return tracks;
  } catch {
    return getTracksByCategory(category);
  }
}

export async function searchTracksOnJamendo(query: string): Promise<Track[]> {
  if (!query.trim()) return [];
  const cacheKey = `jamendo_search_${query.toLowerCase().trim()}`;

  const mem = memCache.get(cacheKey);
  if (mem && Date.now() - mem.ts < CACHE_TTL) return mem.data;

  try {
    const url = `${JAMENDO_BASE}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=20&namesearch=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Jamendo ${res.status}`);
    const json = await res.json() as { results?: JamendoTrack[] };
    const results = json.results ?? [];
    const tracks = results.map((jt) => jamendoToTrack(jt, "Trending"));

    memCache.set(cacheKey, { data: tracks, ts: Date.now() });
    return tracks;
  } catch {
    return searchTracks(query);
  }
}

export async function saveTrackToSupabase(track: Track, category: string): Promise<void> {
  try {
    const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    await fetch(`${apiBase}/music/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: track.id,
        title: track.title,
        artist: track.artist,
        coverUrl: track.coverUrl ?? null,
        audioUrl: track.previewUrl,
        duration: track.durationSecs,
        category,
      }),
    });
  } catch {}
}

export async function fetchTrendingSounds(limit = 20): Promise<Track[]> {
  return fetchTracksFromJamendo("Trending");
}

// ─── Deezer chart fetcher (via backend proxy to avoid CORS) ───────────────────

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

const CACHE_TTL_DEEZER = 60 * 60 * 1000;

interface DeezerApiTrack {
  id: number;
  title: string;
  artist: { name: string; picture_medium: string };
  album: { title: string; cover_medium: string };
  preview: string;
  duration: number;
  rank: number;
  position: number;
}

function deezerToTrack(dt: DeezerApiTrack, position: number): Track {
  return {
    id: `deezer_${dt.id}`,
    title: dt.title,
    artist: dt.artist.name,
    durationSecs: dt.duration,
    previewUrl: dt.preview ?? "",
    coverUrl: dt.album.cover_medium || dt.artist.picture_medium || undefined,
    coverColor: "#F97316",
    category: "Trending",
    usedInReels: Math.round(dt.rank / 1000),
    bpm: 0,
    trimStart: 0,
    isDeezer: true,
    chartPosition: position,
  };
}

export async function fetchDeezerChart(countryCode: string): Promise<Track[]> {
  const cacheKey = `deezer_trending_${countryCode}`;

  const mem = memCache.get(cacheKey);
  if (mem && Date.now() - mem.ts < CACHE_TTL_DEEZER) return mem.data;

  try {
    const stored = await AsyncStorage.getItem(cacheKey);
    if (stored) {
      const parsed = JSON.parse(stored) as { data: Track[]; ts: number };
      if (Date.now() - parsed.ts < CACHE_TTL_DEEZER) {
        memCache.set(cacheKey, parsed);
        return parsed.data;
      }
    }
  } catch {}

  try {
    const url = `${API_BASE}/music/trending?country=${encodeURIComponent(countryCode)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`Proxy ${res.status}`);
    const json = await res.json() as { tracks?: DeezerApiTrack[] };
    const rawTracks = json.tracks ?? [];
    const tracks = rawTracks.map((dt, i) => deezerToTrack(dt, i + 1));
    if (tracks.length === 0) throw new Error("Empty response");

    const entry = { data: tracks, ts: Date.now() };
    memCache.set(cacheKey, entry);
    AsyncStorage.setItem(cacheKey, JSON.stringify(entry)).catch(() => {});
    return tracks;
  } catch {
    return [];
  }
}

export const MUSIC_CATEGORIES: { key: MusicCategory; icon: string }[] = [
  { key: "Trending", icon: "trending-up-outline" },
  { key: "Hip Hop", icon: "headset-outline" },
  { key: "Pop", icon: "musical-notes-outline" },
  { key: "Chill", icon: "leaf-outline" },
  { key: "Energy", icon: "flash-outline" },
  { key: "Sad", icon: "sad-outline" },
  { key: "Dance", icon: "disc-outline" },
  { key: "Love", icon: "heart-outline" },
];

export const TRACKS: Track[] = [
  { id: "t1", title: "Golden Hour", artist: "Solar Waves", durationSecs: 180, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", coverColor: "#F97316", category: "Trending", usedInReels: 482900, bpm: 96, trimStart: 0 },
  { id: "t2", title: "Purple Rain", artist: "Neon Heights", durationSecs: 210, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", coverColor: "#7C3AED", category: "Trending", usedInReels: 391200, bpm: 110, trimStart: 15 },
  { id: "t3", title: "Midnight Drive", artist: "City Lights", durationSecs: 195, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", coverColor: "#3B82F6", category: "Trending", usedInReels: 284500, bpm: 88, trimStart: 8 },
  { id: "t4", title: "Bounce", artist: "King Creed", durationSecs: 165, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", coverColor: "#EF4444", category: "Hip Hop", usedInReels: 177800, bpm: 130, trimStart: 0 },
  { id: "t5", title: "Street Anthem", artist: "Blaze MC", durationSecs: 200, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", coverColor: "#1F2937", category: "Hip Hop", usedInReels: 143200, bpm: 95, trimStart: 12 },
  { id: "t6", title: "Ride or Die", artist: "Double G", durationSecs: 220, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", coverColor: "#92400E", category: "Hip Hop", usedInReels: 98400, bpm: 105, trimStart: 0 },
  { id: "t7", title: "Summer Crush", artist: "Lola Sky", durationSecs: 188, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3", coverColor: "#EC4899", category: "Pop", usedInReels: 310400, bpm: 120, trimStart: 5 },
  { id: "t8", title: "Shine On", artist: "Mia Bliss", durationSecs: 175, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3", coverColor: "#FBBF24", category: "Pop", usedInReels: 265700, bpm: 125, trimStart: 10 },
  { id: "t9", title: "Ocean Eyes", artist: "Nova Bell", durationSecs: 195, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3", coverColor: "#06B6D4", category: "Pop", usedInReels: 198300, bpm: 100, trimStart: 0 },
  { id: "t10", title: "Lo-fi Sunday", artist: "Mellow Tape", durationSecs: 240, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3", coverColor: "#059669", category: "Chill", usedInReels: 229100, bpm: 75, trimStart: 0 },
  { id: "t11", title: "Coffee Mornings", artist: "Soft Pillow", durationSecs: 210, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3", coverColor: "#92400E", category: "Chill", usedInReels: 187600, bpm: 70, trimStart: 20 },
  { id: "t12", title: "Rainy Day", artist: "Blue Dream", durationSecs: 225, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3", coverColor: "#475569", category: "Chill", usedInReels: 142000, bpm: 65, trimStart: 0 },
  { id: "t13", title: "Rocket Fuel", artist: "Thunder Drop", durationSecs: 170, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3", coverColor: "#DC2626", category: "Energy", usedInReels: 256800, bpm: 145, trimStart: 0 },
  { id: "t14", title: "Overdrive", artist: "Voltage", durationSecs: 155, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3", coverColor: "#D97706", category: "Energy", usedInReels: 189300, bpm: 155, trimStart: 5 },
  { id: "t15", title: "Last Night", artist: "Hollow Moon", durationSecs: 235, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3", coverColor: "#4338CA", category: "Sad", usedInReels: 314200, bpm: 72, trimStart: 10 },
  { id: "t16", title: "Fading Out", artist: "Glass Soul", durationSecs: 215, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3", coverColor: "#374151", category: "Sad", usedInReels: 241500, bpm: 68, trimStart: 0 },
  { id: "t17", title: "Move It", artist: "Pulse Crew", durationSecs: 190, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-17.mp3", coverColor: "#DB2777", category: "Dance", usedInReels: 278400, bpm: 128, trimStart: 0 },
  { id: "t18", title: "Dance Floor", artist: "Party Animals", durationSecs: 190, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", coverColor: "#DB2777", category: "Dance", usedInReels: 193700, bpm: 135, trimStart: 30 },
  { id: "t19", title: "Falling For You", artist: "Rose & Rain", durationSecs: 200, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", coverColor: "#E11D48", category: "Love", usedInReels: 367800, bpm: 85, trimStart: 0 },
  { id: "t20", title: "You & Me", artist: "Starlight Duo", durationSecs: 222, previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", coverColor: "#BE185D", category: "Love", usedInReels: 288600, bpm: 90, trimStart: 15 },
];

export function formatCount(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(0) + "K";
  return String(n);
}

export function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function searchTracks(query: string): Track[] {
  const q = query.toLowerCase().trim();
  if (!q) return TRACKS;
  return TRACKS.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
  );
}

export function getTracksByCategory(cat: MusicCategory): Track[] {
  if (cat === "Trending") {
    return [...TRACKS].sort((a, b) => b.usedInReels - a.usedInReels).slice(0, 10);
  }
  return TRACKS.filter((t) => t.category === cat);
}

export async function getFavoriteIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function toggleFavorite(id: string): Promise<string[]> {
  const favs = await getFavoriteIds();
  const updated = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  return updated;
}

export async function getFavoriteTracks(): Promise<Track[]> {
  const ids = await getFavoriteIds();
  return TRACKS.filter((t) => ids.includes(t.id));
}
