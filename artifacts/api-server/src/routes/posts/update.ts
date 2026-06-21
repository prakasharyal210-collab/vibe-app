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

// PATCH /api/posts/:id
// Body: { userId: string, [field]: value, ... }
//
// Ownership check: rejects 403 if userId !== post.user_id.
// Whitelisted updatable fields:
//   is_archived      boolean   — archive / unarchive
//   allow_comments   boolean   — turn commenting on/off per-post
//   hide_like_count  boolean   — hide like count from other viewers
//   hide_share_count boolean   — hide share count from other viewers
//   caption          string    — edit caption text
//
// Only fields explicitly provided in the body are updated.
router.patch("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const {
    userId,
    is_archived,
    allow_comments,
    hide_like_count,
    hide_share_count,
    caption,
  } = req.body as {
    userId?: string;
    is_archived?: boolean;
    allow_comments?: boolean;
    hide_like_count?: boolean;
    hide_share_count?: boolean;
    caption?: string;
  };

  if (!id || !userId) {
    res.status(400).json({ error: "id and userId are required" });
    return;
  }

  const sb = makeSupabase();

  // ── Ownership check ────────────────────────────────────────────────────
  const { data: post, error: fetchErr } = await sb
    .from("posts")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (fetchErr || !post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  if (post.user_id !== userId) {
    res.status(403).json({ error: "Not authorized to update this post" });
    return;
  }

  // ── Build whitelisted update payload ───────────────────────────────────
  const updates: Record<string, unknown> = {};
  if (is_archived !== undefined)      updates["is_archived"]      = is_archived;
  if (allow_comments !== undefined)   updates["allow_comments"]   = allow_comments;
  if (hide_like_count !== undefined)  updates["hide_like_count"]  = hide_like_count;
  if (hide_share_count !== undefined) updates["hide_share_count"] = hide_share_count;
  if (caption !== undefined)          updates["caption"]           = caption.trim();

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updatable fields provided" });
    return;
  }

  // ── Apply update ───────────────────────────────────────────────────────
  const { data: updated, error: updateErr } = await sb
    .from("posts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) {
    req.log.error({ err: updateErr.message }, "Failed to update post");
    res.status(500).json({ error: "Failed to update post", detail: updateErr.message });
    return;
  }

  res.json({ success: true, post: updated });
});

export default router;
