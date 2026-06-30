import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "../lib/sendPush";

const router = Router();

// Cached per-process: skip bump_affinity RPC once we know it's not deployed.
let bumpAffinityRpcAvailable = true;

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

const DELTAS: Record<string, number> = {
  like:           0.3,
  unlike:        -0.1,
  comment:        0.5,
  save:           0.7,
  share:          0.4,
  watch_complete: 0.4,
  skip:          -0.2,
  hide:          -1.5,
};

// POST /api/engage
// Records affinity signals for the personalization engine.
// body: { userId, creatorId, action, contentId?, contentType? }
//   contentId   — optional post/reel UUID; enables category affinity tracking
//   contentType — "post" | "reel" (required when contentId is provided)
router.post("/", async (req, res) => {
  const { userId, creatorId, action, contentId, contentType } = req.body as {
    userId?:      string;
    creatorId?:   string;
    action?:      string;
    contentId?:   string;
    contentType?: "post" | "reel";
  };

  if (!userId || !creatorId || !action) {
    res.status(400).json({ error: "userId, creatorId, action required" });
    return;
  }
  if (userId === creatorId) { res.json({ ok: true }); return; }

  const delta = DELTAS[action];
  if (delta === undefined) {
    res.status(400).json({ error: `Unknown action: ${action}` });
    return;
  }

  const sb = makeSupabase();

  // Fire-and-forget like notifications + push
  if (action === "like" && contentId && contentType === "post") {
    void (async () => {
      try {
        // Dedup: don't spam if user un-likes then re-likes (one notification per user+post)
        const { data: existing } = await sb
          .from("notifications")
          .select("id")
          .eq("recipient_id", creatorId)
          .eq("sender_id", userId!)
          .eq("type", action)
          .eq("post_id", contentId)
          .maybeSingle();

        if (!existing) {
          // Fetch post thumbnail to show in notification row
          const { data: postData } = await sb
            .from("posts")
            .select("media_url, image_url")
            .eq("id", contentId)
            .maybeSingle();
          const thumbnailUrl =
            (postData as any)?.media_url ||
            (postData as any)?.image_url ||
            null;

          await sb.from("notifications").insert({
            recipient_id: creatorId,
            sender_id: userId,
            type: action,
            message: "liked your post",
            post_id: contentId,
            thumbnail_url: thumbnailUrl,
            is_read: false,
          });
        }
      } catch {}

      // Push notification gated by per-category preference
      const { data: actor } = await sb.from("profiles").select("username").eq("id", userId!).maybeSingle();
      const name = actor?.username ?? "Someone";
      void sendPushToUser(sb, creatorId, {
        title: "New Like",
        body: `@${name} liked your post`,
        data: { type: action, actorId: userId, postId: contentId },
      }, "notif_likes");
    })();
  }

  // ── Atomic affinity bump via bump_affinity RPC (single round trip per key) ──
  // Falls back to legacy SELECT+UPSERT if the RPC hasn't been deployed yet.
  async function bumpAffinity(key: string, d: number): Promise<void> {
    if (bumpAffinityRpcAvailable) {
      const { error } = await sb.rpc("bump_affinity", {
        p_user_id: userId,
        p_key:     key,
        p_delta:   d,
      });
      if (!error) return;

      // Mark unavailable so subsequent calls skip the wasted round trip.
      bumpAffinityRpcAvailable = false;
      req.log.info({ err: error.message }, "bump_affinity RPC unavailable — run performance-indexes.sql in Supabase to activate 1-query path");
    }

    // Fallback: read-modify-write (2 round trips instead of 1)
    const { data: row } = await sb
      .from("user_interests")
      .select("weight")
      .eq("user_id", userId!)
      .eq("interest_key", key)
      .maybeSingle();

    const current = (row?.weight as number | null) ?? 0;
    const next    = Math.min(10, Math.max(-5, current + d));

    await sb.from("user_interests").upsert(
      { user_id: userId!, interest_key: key, weight: next, updated_at: new Date().toISOString() },
      { onConflict: "user_id,interest_key" }
    );
  }

  try {
    // 1. Creator affinity — always, first (await so we can respond quickly)
    await bumpAffinity(`creator:${creatorId}`, delta);

    // 2. Category affinity — positive signals only, fire-and-forget (non-blocking)
    //    Fetches content categories then bumps all matching keys in parallel.
    //    Not awaited so the response returns immediately after creator bump.
    if (contentId && contentType && delta > 0) {
      void (async () => {
        try {
          const table = contentType === "reel" ? "reels" : "posts";
          const { data: content } = await sb
            .from(table)
            .select("categories")
            .eq("id", contentId)
            .maybeSingle();

          const categories: string[] = (content as any)?.categories ?? [];
          if (categories.length > 0) {
            await Promise.all(
              categories.map((cat) => bumpAffinity(`category:${cat}`, delta))
            );
            req.log.debug({ categories, action, contentId }, "category affinities bumped");
          }
        } catch (catErr: any) {
          req.log.warn({ err: catErr?.message }, "category affinity bump failed (non-fatal)");
        }
      })();
    }

    res.json({ ok: true });
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "engage upsert failed (migration needed?)");
    res.json({ ok: true });
  }
});

export default router;
