import * as FileSystem from "expo-file-system";
import { Message } from "./supabase";

const API_BASE = `${process.env["EXPO_PUBLIC_API_URL"] ?? ""}/api`;

export interface SnapData {
  url: string;
  type: "photo" | "video";
  viewed: boolean;
  viewed_at?: string;
}

const SNAP_PREFIX = "__SNAP__:";

export function encodeSnap(data: SnapData): string {
  return SNAP_PREFIX + JSON.stringify(data);
}

export function parseSnap(text: string | undefined | null): SnapData | null {
  if (!text?.startsWith(SNAP_PREFIX)) return null;
  try {
    return JSON.parse(text.slice(SNAP_PREFIX.length)) as SnapData;
  } catch {
    return null;
  }
}

export function isSnap(text: string | undefined | null): boolean {
  return typeof text === "string" && text.startsWith(SNAP_PREFIX);
}

// Send a snap — writes to the dedicated snaps table using real columns
// (media_url, media_type) so snaps never bleed into the Messages tab.
export async function sendSnapMessage(
  senderId: string,
  receiverId: string,
  snapUrl: string,
  snapType: "photo" | "video" = "photo",
  duration?: number,
): Promise<Message | null> {
  try {
    const res = await fetch(`${API_BASE}/snaps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, receiverId, mediaUrl: snapUrl, mediaType: snapType, duration }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { snap?: Record<string, unknown> };
    const snap = json.snap;
    if (!snap) return null;
    // Build message text in __SNAP__ format for callers that use parseSnap()
    const encodedText = encodeSnap({ url: snapUrl, type: snapType, viewed: false });
    return {
      id: snap["id"] as string,
      sender_id: snap["sender_id"] as string,
      receiver_id: snap["receiver_id"] as string,
      text: encodedText,
      created_at: snap["created_at"] as string,
    } as unknown as Message;
  } catch {
    return null;
  }
}

// Mark a snap as viewed.
// New snaps table: PATCH /api/snaps/:id — server sets viewed_at = NOW().
// Legacy snaps in messages table: PATCH /api/messages/:id with re-encoded content.
export async function markSnapViewed(messageId: string, currentText: string): Promise<void> {
  const snap = parseSnap(currentText);
  if (!snap || snap.viewed) return;
  const headers = { "Content-Type": "application/json" };
  try {
    const res = await fetch(`${API_BASE}/snaps/${encodeURIComponent(messageId)}`, {
      method: "PATCH", headers, body: JSON.stringify({}),
    });
    if (!res.ok) {
      // Legacy snap stored in messages table — fall back to re-encoding
      const updated: SnapData = { ...snap, viewed: true, viewed_at: new Date().toISOString() };
      await fetch(`${API_BASE}/messages/${encodeURIComponent(messageId)}`, {
        method: "PATCH", headers, body: JSON.stringify({ content: encodeSnap(updated) }),
      });
    }
  } catch {}
}

// Detect MIME type from a local file URI extension.
function detectMime(uri: string): string {
  if (/\.mp4(\?|$)/i.test(uri) || /\.m4v(\?|$)/i.test(uri)) return "video/mp4";
  if (/\.mov(\?|$)/i.test(uri)) return "video/quicktime";
  if (/\.webm(\?|$)/i.test(uri)) return "video/webm";
  if (/\.png(\?|$)/i.test(uri)) return "image/png";
  return "image/jpeg";
}

// Upload snap media through the API server (service-role key bypasses RLS +
// avoids the Android Supabase client hang). Works for both photo and video snaps.
export async function uploadSnapToStorage(
  uri: string,
  userId: string,
  mimeType?: string,
): Promise<string | null> {
  const resolvedMime = mimeType ?? detectMime(uri);
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64" as any,
    });
    const res = await fetch(`${API_BASE}/storage/snap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, userId, mimeType: resolvedMime }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { url?: string };
    return json.url ?? null;
  } catch {
    return null;
  }
}
