import { createClient } from "@supabase/supabase-js";

export interface ModerationResult {
  safe: boolean;
  reason: string;
  scores?: Record<string, unknown>;
}

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

const SIGHTENGINE_MODELS_IMAGE = "nudity,offensive,gore,weapons,violence,hate-symbols";
const SIGHTENGINE_MODELS_VIDEO = "nudity,offensive,gore,weapons,violence";
const THRESHOLD = 0.5;

// ── Image content scan via Sightengine ────────────────────────────────────────
export async function checkImageContent(mediaUrl: string): Promise<ModerationResult> {
  const apiUser = process.env["SIGHTENGINE_API_USER"];
  const apiSecret = process.env["SIGHTENGINE_API_SECRET"];
  if (!apiUser || !apiSecret) return { safe: true, reason: "" };

  try {
    const params = new URLSearchParams({
      url: mediaUrl,
      models: SIGHTENGINE_MODELS_IMAGE,
      api_user: apiUser,
      api_secret: apiSecret,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json() as Record<string, any>;
    if (data["status"] !== "success") return { safe: true, reason: "" };

    const scores: Record<string, unknown> = {
      nudity_raw: (data["nudity"]?.["raw"] as number) ?? 0,
      nudity_partial: (data["nudity"]?.["partial"] as number) ?? 0,
      offensive_prob: (data["offensive"]?.["prob"] as number) ?? 0,
      gore_prob: (data["gore"]?.["prob"] as number) ?? 0,
      weapon_prob: (data["weapon"]?.["prob"] as number) ?? 0,
      violence_prob: (data["violence"]?.["prob"] as number) ?? 0,
    };

    const n_raw = scores["nudity_raw"] as number;
    const n_partial = scores["nudity_partial"] as number;
    const off = scores["offensive_prob"] as number;
    const gore = scores["gore_prob"] as number;
    const weapon = scores["weapon_prob"] as number;
    const violence = scores["violence_prob"] as number;

    if (n_raw > THRESHOLD || n_partial > THRESHOLD) return { safe: false, reason: "nudity", scores };
    if (off > THRESHOLD) return { safe: false, reason: "offensive content", scores };
    if (gore > THRESHOLD) return { safe: false, reason: "gore", scores };
    if (weapon > THRESHOLD) return { safe: false, reason: "weapons", scores };
    if (violence > THRESHOLD) return { safe: false, reason: "violence", scores };

    return { safe: true, reason: "", scores };
  } catch {
    return { safe: true, reason: "" };
  }
}

// ── Video content scan via Sightengine ────────────────────────────────────────
export async function checkVideoContent(mediaUrl: string): Promise<ModerationResult> {
  const apiUser = process.env["SIGHTENGINE_API_USER"];
  const apiSecret = process.env["SIGHTENGINE_API_SECRET"];
  if (!apiUser || !apiSecret) return { safe: true, reason: "" };

  try {
    const params = new URLSearchParams({
      stream_url: mediaUrl,
      models: SIGHTENGINE_MODELS_VIDEO,
      api_user: apiUser,
      api_secret: apiSecret,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(`https://api.sightengine.com/1.0/video/check-sync.json?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json() as Record<string, any>;
    if (data["status"] !== "success") return { safe: true, reason: "" };

    const frames: any[] = (data["data"]?.["frames"] as any[]) ?? [];
    for (const frame of frames) {
      const s: Record<string, unknown> = {
        nudity_raw: (frame["nudity"]?.["raw"] as number) ?? 0,
        nudity_partial: (frame["nudity"]?.["partial"] as number) ?? 0,
        offensive_prob: (frame["offensive"]?.["prob"] as number) ?? 0,
        gore_prob: (frame["gore"]?.["prob"] as number) ?? 0,
        weapon_prob: (frame["weapon"]?.["prob"] as number) ?? 0,
        violence_prob: (frame["violence"]?.["prob"] as number) ?? 0,
        frame_offset: frame["offset"] as number,
      };
      if ((s["nudity_raw"] as number) > THRESHOLD || (s["nudity_partial"] as number) > THRESHOLD) return { safe: false, reason: "nudity", scores: s };
      if ((s["offensive_prob"] as number) > THRESHOLD) return { safe: false, reason: "offensive content", scores: s };
      if ((s["gore_prob"] as number) > THRESHOLD) return { safe: false, reason: "gore", scores: s };
      if ((s["weapon_prob"] as number) > THRESHOLD) return { safe: false, reason: "weapons", scores: s };
      if ((s["violence_prob"] as number) > THRESHOLD) return { safe: false, reason: "violence", scores: s };
    }

    return { safe: true, reason: "", scores: { frames_checked: frames.length } };
  } catch {
    return { safe: true, reason: "" };
  }
}

// ── Caption / comment text moderation ─────────────────────────────────────────
const BLOCKED_PHRASES: string[] = [
  "rape", "kill yourself", "kys", "suicide", "bomb", "terrorist",
  "child porn", "cp", "nigger", "faggot", "whore",
];

function normalizeForFilter(text: string): string {
  return text.toLowerCase()
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
    .replace(/4/g, "a").replace(/5/g, "s").replace(/\$/g, "s")
    .replace(/@/g, "a").replace(/!/g, "i");
}

export async function checkCaptionText(text: string): Promise<ModerationResult> {
  if (!text?.trim()) return { safe: true, reason: "" };

  const normalized = normalizeForFilter(text);
  for (const phrase of BLOCKED_PHRASES) {
    if (normalized.includes(phrase)) {
      return { safe: false, reason: `blocked keyword: ${phrase}` };
    }
  }

  const perspectiveKey = process.env["PERSPECTIVE_API_KEY"];
  if (perspectiveKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(
        `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${perspectiveKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comment: { text },
            requestedAttributes: { TOXICITY: {}, THREAT: {}, INSULT: {}, IDENTITY_ATTACK: {} },
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timer);

      const data = await res.json() as Record<string, any>;
      const attr = data["attributeScores"] as Record<string, any> | undefined;
      if (attr) {
        const toxicity: number = attr["TOXICITY"]?.["summaryScore"]?.["value"] ?? 0;
        const threat: number = attr["THREAT"]?.["summaryScore"]?.["value"] ?? 0;
        const insult: number = attr["INSULT"]?.["summaryScore"]?.["value"] ?? 0;
        const identityAttack: number = attr["IDENTITY_ATTACK"]?.["summaryScore"]?.["value"] ?? 0;
        if (toxicity > 0.7) return { safe: false, reason: "toxicity" };
        if (threat > 0.7) return { safe: false, reason: "threat" };
        if (insult > 0.7) return { safe: false, reason: "insult" };
        if (identityAttack > 0.7) return { safe: false, reason: "hate speech" };
      }
    } catch {
      // Perspective API failure — fail open (don't block upload)
    }
  }

  return { safe: true, reason: "" };
}

// ── Log rejection to content_moderation_log ───────────────────────────────────
export async function logRejection(
  userId: string,
  mediaUrl: string | null,
  contentType: "image" | "video" | "caption" | "comment",
  rejectionReason: string,
  scores?: Record<string, unknown>,
): Promise<void> {
  try {
    const sb = makeSupabase();
    await sb.from("content_moderation_log").insert({
      user_id: userId,
      media_url: mediaUrl,
      content_type: contentType,
      rejection_reason: rejectionReason,
      scores: scores ?? null,
    });
  } catch {
    // Non-fatal — logging failure must never block the 400 rejection response
  }
}
