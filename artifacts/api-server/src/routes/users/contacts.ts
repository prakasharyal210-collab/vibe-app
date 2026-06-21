import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  return createClient(
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co",
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  );
}

// ─── POST /api/users/find-by-contacts ────────────────────────────────────────
// Body: { emails: string[], userId: string }
// Calls find_users_by_contacts RPC with service-role key (bypasses RLS).
router.post("/find-by-contacts", async (req, res) => {
  const { emails, userId } = req.body ?? {};
  if (!userId || !Array.isArray(emails)) {
    res.status(400).json({ error: "userId and emails[] required" });
    return;
  }
  if (!emails.length) {
    res.json({ users: [] });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb.rpc("find_users_by_contacts", {
      p_emails: emails.slice(0, 100),
      p_user_id: userId,
    });
    if (!error && data?.length) {
      res.json({ users: data });
      return;
    }
    if (error) req.log.warn({ error: error.message }, "find_users_by_contacts RPC warn — falling back to email lookup");
    // Fallback: direct email lookup on profiles
    const { data: fallback } = await sb
      .from("profiles")
      .select("id, username, avatar_url, bio, followers_count, is_verified")
      .in("email", emails.slice(0, 50))
      .neq("id", userId)
      .limit(30);
    res.json({ users: fallback ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "find-by-contacts error");
    res.json({ users: [] });
  }
});

export default router;
