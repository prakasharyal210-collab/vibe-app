import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

async function requireAdmin(userId: string | undefined, sb: ReturnType<typeof makeSupabase>): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await sb.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
    return !!(data as any)?.is_admin;
  } catch {
    return false;
  }
}

// ─── GET /api/admin/reports ────────────────────────────────────────────────────
// Returns all reports ordered by created_at DESC with full detail.
// Requires x-user-id header for a profile with is_admin = true.
router.get("/reports", async (req, res) => {
  const userId = req.headers["x-user-id"] as string | undefined;
  const sb = makeSupabase();

  if (!(await requireAdmin(userId, sb))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const { data: reports, error } = await sb
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const rows = reports ?? [];

    // Enrich each report with reporter username and reported content snippet
    const enriched = await Promise.all(
      rows.map(async (report: any) => {
        let reporterUsername: string | null = null;
        let contentSnippet: string | null = null;
        let contentOwnerUsername: string | null = null;
        let contentOwnerId: string | null = null;

        // Fetch reporter username
        try {
          const { data: reporter } = await sb
            .from("profiles")
            .select("username")
            .eq("id", report.reporter_id)
            .maybeSingle();
          reporterUsername = (reporter as any)?.username ?? null;
        } catch {}

        // Fetch reported content
        const targetType: string = report.target_type ?? report.content_type ?? "";
        const targetId: string = report.target_id ?? report.content_id ?? "";
        if (targetId) {
          try {
            if (targetType === "post") {
              const { data: post } = await sb
                .from("posts")
                .select("caption, media_url, user_id")
                .eq("id", targetId)
                .maybeSingle();
              contentSnippet = (post as any)?.caption ?? null;
              contentOwnerId = (post as any)?.user_id ?? null;
            } else if (targetType === "reel") {
              const { data: reel } = await sb
                .from("reels")
                .select("caption, video_url, user_id")
                .eq("id", targetId)
                .maybeSingle();
              contentSnippet = (reel as any)?.caption ?? null;
              contentOwnerId = (reel as any)?.user_id ?? null;
            } else if (targetType === "comment") {
              const { data: comment } = await sb
                .from("comments")
                .select("content, user_id")
                .eq("id", targetId)
                .maybeSingle();
              contentSnippet = (comment as any)?.content ?? null;
              contentOwnerId = (comment as any)?.user_id ?? null;
            } else if (targetType === "user") {
              const { data: profile } = await sb
                .from("profiles")
                .select("username, full_name")
                .eq("id", targetId)
                .maybeSingle();
              contentSnippet = (profile as any)?.username ?? null;
              contentOwnerId = targetId;
            }

            // Fetch content owner username
            if (contentOwnerId) {
              const { data: owner } = await sb
                .from("profiles")
                .select("username")
                .eq("id", contentOwnerId)
                .maybeSingle();
              contentOwnerUsername = (owner as any)?.username ?? null;
            }
          } catch {}
        }

        return {
          ...report,
          reporter_username: reporterUsername,
          content_snippet: contentSnippet,
          content_owner_username: contentOwnerUsername,
          content_owner_id: contentOwnerId,
        };
      }),
    );

    res.json({ reports: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch reports" });
  }
});

// ─── PATCH /api/admin/reports/:reportId ───────────────────────────────────────
// Update report status. If actioned, deletes the reported content.
// Optionally suspend the content owner by setting is_suspended = true on profiles.
router.patch("/reports/:reportId", async (req, res) => {
  const userId = req.headers["x-user-id"] as string | undefined;
  const sb = makeSupabase();

  if (!(await requireAdmin(userId, sb))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { reportId } = req.params;
  const { status, suspendUser } = req.body as {
    status?: "actioned" | "dismissed";
    suspendUser?: boolean;
  };

  if (!status || !["actioned", "dismissed"].includes(status)) {
    res.status(400).json({ error: "status must be 'actioned' or 'dismissed'" });
    return;
  }

  try {
    // Fetch the report first
    const { data: report, error: fetchErr } = await sb
      .from("reports")
      .select("*")
      .eq("id", reportId)
      .maybeSingle();

    if (fetchErr || !report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const r = report as any;
    const targetType: string = r.target_type ?? r.content_type ?? "";
    const targetId: string = r.target_id ?? r.content_id ?? "";
    let contentOwnerId: string | null = null;

    // If actioned: delete the reported content
    if (status === "actioned" && targetId) {
      if (targetType === "post") {
        const { data: post } = await sb.from("posts").select("user_id, media_url").eq("id", targetId).maybeSingle();
        contentOwnerId = (post as any)?.user_id ?? null;
        await sb.from("posts").delete().eq("id", targetId);
      } else if (targetType === "reel") {
        const { data: reel } = await sb.from("reels").select("user_id, video_url").eq("id", targetId).maybeSingle();
        contentOwnerId = (reel as any)?.user_id ?? null;
        await sb.from("reels").delete().eq("id", targetId);
      } else if (targetType === "comment") {
        const { data: comment } = await sb.from("comments").select("user_id").eq("id", targetId).maybeSingle();
        contentOwnerId = (comment as any)?.user_id ?? null;
        await sb.from("comments").delete().eq("id", targetId);
      } else if (targetType === "user") {
        contentOwnerId = targetId;
      }

      // Optionally suspend the content owner
      if (suspendUser && contentOwnerId) {
        await sb.from("profiles").update({ is_suspended: true }).eq("id", contentOwnerId);
      }
    }

    // Update report status
    await sb.from("reports").update({
      status,
      reviewed_at: new Date().toISOString(),
      actioned_by: userId ?? null,
    }).eq("id", reportId);

    res.json({ ok: true, contentDeleted: status === "actioned" && !!targetId, userSuspended: !!(suspendUser && contentOwnerId) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update report" });
  }
});

export default router;
