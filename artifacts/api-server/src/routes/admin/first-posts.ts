import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "../../lib/sendPush";

const router = Router();

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

async function requireAdmin(
  userId: string | undefined,
  sb: ReturnType<typeof makeSupabase>,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await sb
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    return !!(data as any)?.is_admin;
  } catch {
    return false;
  }
}

async function generateSuggestedComment(caption: string): Promise<string> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || !caption?.trim()) return "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 80,
        messages: [
          {
            role: "user",
            content: `You are the founder of Gundruk, a dark-aesthetic Gen-Z social app. Draft ONE short, warm, personal comment for a brand-new user's very first post. Max 15 words. Be specific to the content. No hashtags. Sound human, not corporate.

Post caption: "${caption.slice(0, 300)}"`,
          },
        ],
      }),
    });
    const json = (await res.json()) as any;
    return (json?.content?.[0]?.text ?? "").trim();
  } catch {
    return "";
  }
}

// ─── GET /api/admin/first-posts ───────────────────────────────────────────────
// Returns first posts from the last 7 days with suggested founder comment,
// founder_commented flag, and welcome_bot_commented flag.
// Requires x-user-id header for a profile with is_admin = true.
router.get("/first-posts", async (req, res) => {
  const userId = req.headers["x-user-id"] as string | undefined;
  const sb = makeSupabase();

  if (!(await requireAdmin(userId, sb))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: posts, error } = await sb
      .from("posts")
      .select("id, caption, media_url, thumbnail_url, created_at, user_id")
      .eq("is_first_post", true)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!posts?.length) {
      res.json({ posts: [] });
      return;
    }

    // Enrich all posts in parallel: author profile + comment flags + AI suggestion
    const enriched = await Promise.all(
      (posts as any[]).map(async (post) => {
        // Author profile
        let authorUsername: string | null = null;
        let authorAvatarUrl: string | null = null;
        try {
          const { data: profile } = await sb
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", post.user_id)
            .maybeSingle();
          authorUsername = (profile as any)?.username ?? null;
          authorAvatarUrl = (profile as any)?.avatar_url ?? null;
        } catch {}

        // Comment flags
        let founderCommented = false;
        let welcomeBotCommented = false;
        try {
          const { data: comments } = await sb
            .from("comments")
            .select("user_id, text")
            .eq("post_id", post.id);
          for (const c of comments ?? []) {
            if ((c as any).user_id === userId) founderCommented = true;
            const cText: string = (c as any).text ?? "";
            if (cText.includes("Welcome to Gundruk")) welcomeBotCommented = true;
          }
        } catch {}

        // Claude Haiku suggested comment
        const suggestedComment = await generateSuggestedComment(post.caption ?? "");

        return {
          id: post.id as string,
          caption: (post.caption ?? "") as string,
          thumbnail_url: (post.thumbnail_url ?? post.media_url ?? null) as string | null,
          media_url: (post.media_url ?? null) as string | null,
          created_at: post.created_at as string,
          author_username: authorUsername,
          author_avatar_url: authorAvatarUrl,
          founder_commented: founderCommented,
          welcome_bot_commented: welcomeBotCommented,
          suggested_comment: suggestedComment,
        };
      }),
    );

    res.json({ posts: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch first posts" });
  }
});

// ─── POST /api/admin/first-posts/:postId/comment ─────────────────────────────
// Posts a comment on the given post AS the authenticated admin's own account.
// body: { text: string }
router.post("/first-posts/:postId/comment", async (req, res) => {
  const userId = req.headers["x-user-id"] as string | undefined;
  const sb = makeSupabase();

  if (!(await requireAdmin(userId, sb))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { postId } = req.params;
  const { text } = req.body as { text?: string };

  if (!text?.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const { data: comment, error: commentErr } = await sb
      .from("comments")
      .insert({
        post_id: postId,
        user_id: userId,
        content: text.trim(),
        created_at: new Date().toISOString(),
      })
      .select("id, post_id, user_id, text, created_at")
      .single();

    if (commentErr) {
      res.status(500).json({ error: commentErr.message });
      return;
    }

    // Increment comments_count
    try {
      const { data: pd } = await sb
        .from("posts")
        .select("comments_count, user_id")
        .eq("id", postId)
        .single();
      const newCount = ((pd as any)?.comments_count ?? 0) + 1;
      await sb.from("posts").update({ comments_count: newCount }).eq("id", postId);

      // Notify post author
      const postAuthorId = (pd as any)?.user_id as string | undefined;
      if (postAuthorId && postAuthorId !== userId) {
        const { data: adminProfile } = await sb
          .from("profiles")
          .select("username")
          .eq("id", userId)
          .maybeSingle();
        const adminName = (adminProfile as any)?.username ?? "Someone";
        void sendPushToUser(
          sb,
          postAuthorId,
          {
            title: "New comment",
            body: `@${adminName}: ${text.trim().slice(0, 60)}`,
            data: { type: "comment", postId },
          },
          "notif_comments",
        );
      }
    } catch {}

    res.json({ comment });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to post comment" });
  }
});

export default router;
