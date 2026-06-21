import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url =
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
    "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// POST /api/storage/snap
// Accepts base64-encoded image from mobile, uploads to Supabase "snaps" bucket
// using service role key (bypasses RLS + avoids Android Supabase client hang).
// Body: { base64: string, userId: string, mimeType?: string }
router.post("/snap", async (req, res) => {
  const { base64, userId, mimeType = "image/jpeg" } = req.body as {
    base64?: string;
    userId?: string;
    mimeType?: string;
  };

  if (!base64 || !userId) {
    return res.status(400).json({ error: "base64 and userId are required" });
  }

  const sb = makeSupabase();
  const ext = mimeType.includes("png") ? "png"
    : mimeType.includes("quicktime") || mimeType === "video/mov" ? "mov"
    : mimeType.includes("webm") ? "webm"
    : mimeType.startsWith("video/") ? "mp4"
    : "jpg";
  const fileName = `${userId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(base64, "base64");

  const { error } = await sb.storage
    .from("snaps")
    .upload(fileName, buffer, { contentType: mimeType, upsert: false });

  if (error) {
    req.log.warn({ err: error.message }, "Snap upload failed");
    return res.status(500).json({ error: error.message });
  }

  const { data: urlData } = sb.storage.from("snaps").getPublicUrl(fileName);
  return res.json({ url: urlData.publicUrl });
});

// POST /api/storage/avatar
// Accepts base64-encoded image from mobile, uploads to Supabase "avatars" bucket
// using service role key (bypasses RLS + avoids Android content:// URI fetch failure).
// Body: { base64: string, userId: string, mimeType?: string }
router.post("/avatar", async (req, res) => {
  const { base64, userId, mimeType = "image/jpeg" } = req.body as {
    base64?: string;
    userId?: string;
    mimeType?: string;
  };

  if (!base64 || !userId) {
    return res.status(400).json({ error: "base64 and userId are required" });
  }

  const sb = makeSupabase();
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const path = `${userId}/avatar.${ext}`;
  const buffer = Buffer.from(base64, "base64");

  const { error } = await sb.storage
    .from("avatars")
    .upload(path, buffer, { contentType: mimeType, upsert: true });

  if (error) {
    req.log.warn({ err: error.message }, "Avatar upload failed");
    return res.status(500).json({ error: error.message });
  }

  const { data: urlData } = sb.storage.from("avatars").getPublicUrl(path);
  return res.json({ url: `${urlData.publicUrl}?t=${Date.now()}` });
});

export default router;
