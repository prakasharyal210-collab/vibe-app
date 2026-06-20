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

// DELETE /api/posts/:postId
// Body: { userId: string }
//
// Ownership check: rejects with 403 if userId !== post.user_id.
// Dependent-row cleanup: explicitly deletes child rows before the post so that
// any FK without ON DELETE CASCADE doesn't cause a constraint violation.
// Tables confirmed with CASCADE in migration scripts still benefit from this
// (the delete is a no-op if cascade already ran), and tables without it are
// handled explicitly.
router.delete("/:postId", async (req, res) => {
  const { postId } = req.params as { postId: string };
  const { userId } = req.body as { userId?: string };

  if (!postId || !userId) {
    res.status(400).json({ error: "postId and userId are required" });
    return;
  }

  const sb = makeSupabase();

  // ── 1. Fetch post and verify ownership ────────────────────────────────────
  const { data: post, error: fetchErr } = await sb
    .from("posts")
    .select("id, user_id")
    .eq("id", postId)
    .single();

  if (fetchErr || !post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  if (post.user_id !== userId) {
    res.status(403).json({ error: "Not authorized to delete this post" });
    return;
  }

  // ── 2. Explicit child-row cleanup (ordered so children precede parents) ──
  // comment_likes → cascade from comments, but delete explicitly first to be safe
  const { data: commentRows } = await sb
    .from("comments")
    .select("id")
    .eq("post_id", postId);
  const commentIds = (commentRows ?? []).map((r: any) => r.id as string);
  if (commentIds.length > 0) {
    try {
      await sb.from("comment_likes").delete().in("comment_id", commentIds);
    } catch {}
  }

  // Tables with post_id FK — delete in order, swallow errors for tables that
  // may not exist yet in the live DB or already have nothing to delete.
  const dependents = [
    "comments",
    "post_likes",
    "favourites",
    "post_tags",
    "post_hashtags",
    "post_shares",
    "post_analytics",
  ] as const;

  for (const table of dependents) {
    try {
      await (sb as any).from(table).delete().eq("post_id", postId);
    } catch {}
  }

  // ── 3. Delete the post ────────────────────────────────────────────────────
  const { error: deleteErr } = await sb.from("posts").delete().eq("id", postId);

  if (deleteErr) {
    req.log.error({ err: deleteErr.message }, "Failed to delete post");
    res.status(500).json({ error: "Failed to delete post", detail: deleteErr.message });
    return;
  }

  res.json({ success: true });
});

export default router;
