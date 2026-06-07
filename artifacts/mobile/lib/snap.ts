import { supabase } from "./supabase";
import type { Message } from "./supabase";

export const SNAP_PREFIX = "__SNAP__:";

export interface SnapData {
  url: string;
  type: "photo" | "video";
  viewed: boolean;
  viewed_at?: string;
}

export function encodeSnap(data: SnapData): string {
  return SNAP_PREFIX + JSON.stringify(data);
}

export function parseSnap(text: string): SnapData | null {
  if (!text || !text.startsWith(SNAP_PREFIX)) return null;
  try {
    return JSON.parse(text.slice(SNAP_PREFIX.length)) as SnapData;
  } catch {
    return null;
  }
}

export function isSnap(text: string): boolean {
  return !!text && text.startsWith(SNAP_PREFIX);
}

export async function sendSnapMessage(
  senderId: string,
  receiverId: string,
  snapUrl: string,
  snapType: "photo" | "video" = "photo",
): Promise<Message | null> {
  const text = encodeSnap({ url: snapUrl, type: snapType, viewed: false });
  try {
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: senderId, receiver_id: receiverId, text })
      .select()
      .single();
    if (!error && data) return data as Message;
  } catch {}
  return null;
}

export async function markSnapViewed(messageId: string, currentText: string): Promise<void> {
  const snap = parseSnap(currentText);
  if (!snap || snap.viewed) return;
  const updated: SnapData = { ...snap, viewed: true, viewed_at: new Date().toISOString() };
  try {
    await supabase
      .from("messages")
      .update({ text: encodeSnap(updated) })
      .eq("id", messageId);
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
