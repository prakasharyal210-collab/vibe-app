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

// GET /api/sounds/trending?limit=20
// Returns music-category video posts ranked by likes_count — the "Trending Sounds" list.
// Service-role key bypasses RLS (same pattern as feed routes).
router.get("/trending", async (req, res) => {
  const limit = Math.min(
    parseInt((req.query["limit"] as string) ?? "20", 10) || 20,
    50,
  );
  const sb = makeSupabase();

  try {
    const { data, error } = await sb
      .from("posts")
      .select(
        "id, media_url, thumbnail_url, caption, likes_count, user_id, profiles!user_id(username, avatar_url)",
      )
      .in("category", ["music", "dance"])
      .eq("is_video", true)
      .or("visibility.eq.public,visibility.is.null")
      .order("likes_count", { ascending: false })
      .limit(limit);

    if (error) {
      req.log.error({ err: error.message }, "sounds/trending error");
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ sounds: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "sounds/trending exception");
    res.status(500).json({ error: "Failed to load trending sounds" });
  }
});

export default router;
