import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// POST /api/comments/like
// Toggle a comment like. Returns { liked: boolean, likes_count: number }
router.post("/like", async (req, res) => {
  const { userId, commentId } = req.body as { userId?: string; commentId?: string };
  if (!userId || !commentId) {
    res.status(400).json({ error: "userId and commentId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: existing } = await sb
      .from("comment_likes")
      .select("id")
      .eq("user_id", userId)
      .eq("comment_id", commentId)
      .maybeSingle();

    if (existing) {
      await sb.from("comment_likes").delete().eq("user_id", userId).eq("comment_id", commentId);
      const { data: c } = await sb.from("comments").select("likes_count").eq("id", commentId).maybeSingle();
      res.json({ liked: false, likes_count: c?.likes_count ?? 0 });
    } else {
      await sb.from("comment_likes").insert({ user_id: userId, comment_id: commentId });
      const { data: c } = await sb.from("comments").select("likes_count").eq("id", commentId).maybeSingle();
      res.json({ liked: true, likes_count: c?.likes_count ?? 0 });
    }
  } catch (err: any) {
    req.log.error({ err: err?.message }, "comment-like exception");
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/comments/liked?userId=&commentIds=id1,id2,...
// Returns set of comment IDs the user has liked
router.get("/liked", async (req, res) => {
  const { userId, commentIds } = req.query as { userId?: string; commentIds?: string };
  if (!userId || !commentIds) {
    res.json({ likedIds: [] });
    return;
  }
  const ids = commentIds.split(",").filter(Boolean);
  if (ids.length === 0) { res.json({ likedIds: [] }); return; }
  const sb = makeSupabase();
  try {
    const { data } = await sb
      .from("comment_likes")
      .select("comment_id")
      .eq("user_id", userId)
      .in("comment_id", ids);
    res.json({ likedIds: (data ?? []).map((r: any) => r.comment_id) });
  } catch {
    res.json({ likedIds: [] });
  }
});

export default router;
