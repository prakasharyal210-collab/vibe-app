import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = process.env["EXPO_PUBLIC_API_URL"] ?? "";
const CACHE_PFX = "gundruk_ai_v1:";
const CACHE_TTL = 60 * 60 * 1000;

interface CacheEntry { result: string; exp: number }

async function getCached(key: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PFX + key);
    if (!raw) return null;
    const e: CacheEntry = JSON.parse(raw);
    if (e.exp > Date.now()) return e.result;
    void AsyncStorage.removeItem(CACHE_PFX + key);
    return null;
  } catch { return null; }
}

async function setCached(key: string, result: string) {
  try {
    await AsyncStorage.setItem(CACHE_PFX + key, JSON.stringify({ result, exp: Date.now() + CACHE_TTL }));
  } catch {}
}

export async function callAI(
  type: string,
  payload?: Record<string, unknown>,
  options?: {
    messages?: Array<{ role: string; content: string }>;
    noCache?: boolean;
  }
): Promise<string | null> {
  const p = payload ?? {};
  const cacheKey = options?.noCache ? null : `${type}:${JSON.stringify(p)}`;

  if (cacheKey) {
    const hit = await getCached(cacheKey);
    if (hit) return hit;
  }

  try {
    const res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload: p, messages: options?.messages }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { result?: string };
    const result = data.result ?? null;
    if (result && cacheKey) await setCached(cacheKey, result);
    return result;
  } catch { return null; }
}

export function parseAIJson<T>(result: string | null, fallback: T): T {
  if (!result) return fallback;
  try {
    const m = result.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) return fallback;
    return JSON.parse(m[0]) as T;
  } catch { return fallback; }
}
