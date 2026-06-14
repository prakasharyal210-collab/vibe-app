import { Message, supabase } from "./supabase";

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

// Send a snap — routes through API server (avoids Android hang + uses correct "content" column)
export async function sendSnapMessage(
  senderId: string,
  receiverId: string,
  snapUrl: string,
  snapType: "photo" | "video" = "photo",
): Promise<Message | null> {
  const text = encodeSnap({ url: snapUrl, type: snapType, viewed: false });
  try {
    const res = await fetch(`${API_BASE}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, receiverId, text }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.message as Message;
  } catch {
    return null;
  }
}

// Mark a snap as viewed — routes through API server (PATCH /api/messages/:id)
export async function markSnapViewed(messageId: string, currentText: string): Promise<void> {
  const snap = parseSnap(currentText);
  if (!snap || snap.viewed) return;
  const updated: SnapData = { ...snap, viewed: true, viewed_at: new Date().toISOString() };
  try {
    await fetch(`${API_BASE}/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: encodeSnap(updated) }),
    });
  } catch {}
}

export async function uploadSnapToStorage(uri: string, userId: string): Promise<string | null> {
  try {
    const fileName = `${userId}/${Date.now()}.jpg`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage
      .from("snaps")
      .upload(fileName, blob, { contentType: "image/jpeg", upsert: false });
    if (error) return null;
    const { data: urlData } = supabase.storage.from("snaps").getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch {
    return null;
  }
}
