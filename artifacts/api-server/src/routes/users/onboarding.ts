import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  return createClient(
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co",
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  );
}

// ─── GET /api/users/needs-onboarding ─────────────────────────────────────────
// ?userId=...
// Calls needs_onboarding RPC with service-role key (bypasses RLS).
router.get("/needs-onboarding", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb.rpc("needs_onboarding", { p_user_id: userId });
    if (error) req.log.warn({ error: error.message }, "needs_onboarding RPC warn");
    res.json({ needsOnboarding: !error ? !!data : false });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "needs-onboarding error");
    res.json({ needsOnboarding: false });
  }
});

// ─── POST /api/users/onboarding-interests ────────────────────────────────────
// Body: { userId, interests: string[] }
// Calls save_onboarding_interests RPC with service-role key.
router.post("/onboarding-interests", async (req, res) => {
  const { userId, interests } = req.body ?? {};
  if (!userId || !Array.isArray(interests)) {
    res.status(400).json({ error: "userId and interests[] required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb.rpc("save_onboarding_interests", {
      p_user_id: userId,
      p_interests: interests,
    });
    if (error) {
      req.log.warn({ error: error.message }, "save_onboarding_interests RPC warn — falling back to profile upsert");
      // Fallback: store as user_interests array on the profile row
      await sb
        .from("profiles")
        .update({ interests })
        .eq("id", userId);
    }
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "onboarding-interests error");
    res.json({ ok: false });
  }
});

// ─── GET /api/onboarding/suggested-follows ───────────────────────────────────
// ?userId=...&limit=15
// Suggests accounts for a new user to follow: seed persona accounts first
// (fixed UUID prefix a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a0*/1*, show_in_matching=false,
// legitimate content accounts — NOT dating profiles), then real users with
// meaningful post history. Excludes self and anyone already followed.
router.get("/suggested-follows", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  const limit = Math.min(Math.max(Number(req.query["limit"]) || 15, 1), 30);
  const sb = makeSupabase();
  try {
    let excludeIds = new Set<string>();
    if (userId) excludeIds.add(userId);
    if (userId) {
      const { data: following } = await sb
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId);
      for (const row of following ?? []) excludeIds.add((row as any).following_id);
    }

    // Seed personas: fixed UUID range a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01..a15
    const { data: personas, error: personaErr } = await sb
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio, account_category, posts_count, is_verified")
      .gte("id", "a0eebc99-0000-0000-0000-000000000000")
      .lte("id", "a0eebc99-ffff-ffff-ffff-ffffffffffff")
      .not("username", "is", null)
      .order("posts_count", { ascending: false });
    if (personaErr) req.log.warn({ error: personaErr.message }, "suggested-follows persona query warn");

    const personaPool = (personas ?? []).filter((p: any) => !excludeIds.has(p.id));

    // Real users with meaningful post history (excluding personas + already-followed)
    const { data: realUsers, error: realErr } = await sb
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio, account_category, posts_count, is_verified")
      .not("username", "is", null)
      .gt("posts_count", 3)
      .order("posts_count", { ascending: false })
      .limit(50);
    if (realErr) req.log.warn({ error: realErr.message }, "suggested-follows real-user query warn");

    const personaIds = new Set(personaPool.map((p: any) => p.id));
    const realPool = (realUsers ?? []).filter(
      (p: any) => !excludeIds.has(p.id) && !personaIds.has(p.id),
    );

    const combined = [...personaPool, ...realPool].slice(0, limit);

    const suggestions = combined.map((p: any) => ({
      id: p.id,
      username: p.username,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      bio: p.bio,
      category: p.account_category ?? null,
      posts_count: p.posts_count ?? 0,
      is_verified: p.is_verified ?? false,
    }));

    res.json({ suggestions });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "suggested-follows error");
    res.json({ suggestions: [] });
  }
});

export default router;
