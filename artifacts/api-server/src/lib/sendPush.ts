import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

/**
 * Look up the target user's push token and notification preferences,
 * then send a single push notification via Expo's push API.
 *
 * Fires-and-forgets — callers should NOT await unless they need confirmation.
 */
export async function sendPushToUser(
  sb: SupabaseClient,
  userId: string,
  payload: PushPayload,
  /** Which category to check in user_settings before sending (e.g. "notif_follows") */
  settingsKey?: string,
): Promise<void> {
  try {
    // 1. Fetch push token + (optionally) the relevant settings flag in one round-trip
    const { data: profile } = await sb
      .from("profiles")
      .select("push_token")
      .eq("id", userId)
      .maybeSingle();

    const token: string | null = profile?.push_token ?? null;
    if (!token) return;

    // 2. Check per-category preference if a key was supplied
    if (settingsKey) {
      const { data: settings } = await sb
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      const row = settings as Record<string, unknown> | null;
      const pushEnabled = (row?.["notif_push_enabled"] ?? true) as boolean;
      const categoryEnabled = (row?.[settingsKey] ?? true) as boolean;
      if (!pushEnabled || !categoryEnabled) return;
    }

    // 3. Send via Expo push API
    const body = {
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: payload.sound ?? "default",
      ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
    };

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[sendPush] Expo API returned ${res.status}: ${text}`);
    }
  } catch (err: any) {
    console.warn("[sendPush] error:", err?.message ?? err);
  }
}
