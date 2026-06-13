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

// GET /api/users/search?q=<query>&limit=20
router.get("/search", async (req, res) => {
  const q = ((req.query["q"] as string) ?? "").trim();
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  const sb = makeSupabase();

  req.log.info({ q, limit }, "user search");

  try {
    const query = sb
      .from("profiles")
      .select("id, username, full_name, bio, avatar_url, followers_count, following_count, is_verified, is_private")
      .order("followers_count", { ascending: false })
      .limit(limit);

    const { data, error } = q
      ? await query.ilike("username", `%${q}%`)
      : await query;

    if (error) {
      req.log.warn({ error: error.message }, "profiles search error");
      // If ilike on username returns nothing or errors, try without the filter
      if (q) {
        const { data: fallback, error: fallbackError } = await sb
          .from("profiles")
          .select("id, username, full_name, bio, avatar_url, followers_count, following_count, is_verified, is_private")
          .or(`username.ilike.%${q}%,bio.ilike.%${q}%`)
          .order("followers_count", { ascending: false })
          .limit(limit);
        if (!fallbackError && fallback) {
          res.json({ profiles: fallback });
          return;
        }
      }
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ profiles: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "user search exception");
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
