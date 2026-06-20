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

// Send a snap — writes to the dedicated snaps table (NOT messages) so snaps
// can never bleed into the Messages tab.
export async function sendSnapMessage(
  senderId: string,
  receiverId: string,
  snapUrl: string,
  snapType: "photo" | "video" = "photo",
): Promise<Message | null> {
  const content = encodeSnap({ url: snapUrl, type: snapType, viewed: false });
  try {
    const res = await fetch(`${API_BASE}/snaps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, receiverId, content }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { snap?: Record<string, unknown> };
    const snap = json.snap;
    if (!snap) return null;
    // Return in Message shape for callers that expect it
    return {
      id: snap["id"] as string,
      sender_id: snap["sender_id"] as string,
      receiver_id: snap["receiver_id"] as string,
      text: snap["content"] as string,
      created_at: snap["created_at"] as string,
    } as unknown as Message;
  } catch {
    return null;
  }
}

// Mark a snap as viewed.
// Tries the new snaps table first (PATCH /api/snaps/:id).
// Falls back to the legacy messages table for old snaps sent before the migration.
export async function markSnapViewed(messageId: string, currentText: string): Promise<void> {
  const snap = parseSnap(currentText);
  if (!snap || snap.viewed) return;
  const updated: SnapData = { ...snap, viewed: true, viewed_at: new Date().toISOString() };
  const body = JSON.stringify({ content: encodeSnap(updated) });
  const headers = { "Content-Type": "application/json" };
  try {
    const res = await fetch(`${API_BASE}/snaps/${encodeURIComponent(messageId)}`, {
      method: "PATCH", headers, body,
    });
    if (!res.ok) {
      // Legacy snap stored in messages table — fall back
      await fetch(`${API_BASE}/messages/${encodeURIComponent(messageId)}`, {
        method: "PATCH", headers, body,
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
