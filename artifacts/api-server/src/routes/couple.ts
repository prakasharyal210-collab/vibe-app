import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

const router = Router();

// POST /request — send couple request
router.post("/request", async (req, res) => {
  req.log.info({ body: req.body, auth: req.headers["authorization"] ? "present" : "missing" }, "couple/request hit");
  const { requesterId, receiverId, anniversaryDate } = req.body as {
    requesterId?: string;
    receiverId?: string;
    anniversaryDate?: string;
  };
  if (!requesterId || !receiverId) {
    req.log.warn({ requesterId, receiverId }, "couple/request missing fields");
    res.status(400).json({ error: "requesterId and receiverId required" });
    return;
  }
  if (requesterId === receiverId) {
    res.status(400).json({ error: "Cannot send request to yourself" });
    return;
  }
  const sb = makeSupabase();
  try {
    // Guard: reject if sender OR receiver is already in an accepted couple.
    // Checks both requester_id and receiver_id columns because either user
    // can appear in either position.
    const { data: alreadyCoupled, error: coupledErr } = await sb
      .from("couple_links")
      .select("id, requester_id, receiver_id")
      .eq("status", "accepted")
      .or(
        `requester_id.eq.${requesterId},receiver_id.eq.${requesterId},` +
        `requester_id.eq.${receiverId},receiver_id.eq.${receiverId}`
      )
      .limit(1)
      .maybeSingle();
    if (coupledErr) {
      req.log.error({ err: coupledErr.message }, "couple/request: coupled-check query failed");
      throw coupledErr;
    }
    if (alreadyCoupled) {
      const senderCoupled =
        (alreadyCoupled as any).requester_id === requesterId ||
        (alreadyCoupled as any).receiver_id === requesterId;
      req.log.warn({ requesterId, receiverId, alreadyCoupled }, "couple/request blocked: user already in a couple");
      res.status(409).json({
        error: senderCoupled ? "You are already in a couple" : "This user is already in a couple",
      });
      return;
    }

    // Reject if a pending/accepted request already exists between these two users.
    const { data: existing, error: existErr } = await sb
      .from("couple_links")
      .select("id, status")
      .or(
        `and(requester_id.eq.${requesterId},receiver_id.eq.${receiverId}),` +
        `and(requester_id.eq.${receiverId},receiver_id.eq.${requesterId})`
      )
      .maybeSingle();
    if (existErr) {
      req.log.error({ err: existErr.message }, "couple/request: existing-check query failed");
      throw existErr;
    }
    if (existing) {
      req.log.info({ existing }, "couple/request already exists");
      res.status(409).json({ error: "Request already exists", status: (existing as any).status });
      return;
    }

    req.log.info({ requesterId, receiverId }, "couple/request inserting");
    const { data, error } = await sb
      .from("couple_links")
      .insert({
        requester_id: requesterId,
        receiver_id: receiverId,
        anniversary_date: anniversaryDate ?? null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      req.log.error({ supabaseError: error }, "couple/request insert failed");
      throw error;
    }
    req.log.info({ coupleId: (data as any)?.id }, "couple/request inserted OK");
    res.json({ success: true, couple: data });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/request error");
    res.status(500).json({ error: "Failed to send couple request" });
  }
});

// POST /accept
// Flow:
//   1. Fetch the pending link (verifies receiver + status=pending)
//   2. Guard: reject if EITHER user already has a different accepted couple
//   3. Accept: UPDATE status=accepted
//   4. Cleanup: set status=cancelled on ALL other pending rows touching either user
//   5. Profile: set show_in_matching=false + relationship_status for both partners
//   6. Fire-and-forget: notify outsiders whose requests were auto-cancelled
router.post("/accept", async (req, res) => {
  const { coupleId, userId } = req.body as { coupleId?: string; userId?: string };
  if (!coupleId || !userId) {
    res.status(400).json({ error: "coupleId and userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    // ── Step 1: fetch and verify the pending link ────────────────────────────
    const { data: link, error: fetchErr } = await sb
      .from("couple_links")
      .select("*")
      .eq("id", coupleId)
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .single();

    if (fetchErr || !link) {
      req.log.warn({ coupleId, userId, fetchErr }, "couple/accept: pending request not found");
      res.status(404).json({ error: "Couple request not found" });
      return;
    }

    const requesterId = (link as any).requester_id as string;

    // ── Step 2: guard — reject if either user already has an accepted couple ─
    // Excluding the row we are about to accept (neq coupleId) prevents a false
    // positive when the row is pending and we're the only accepted check.
    const { data: alreadyCoupled, error: guardErr } = await sb
      .from("couple_links")
      .select("id, requester_id, receiver_id")
      .eq("status", "accepted")
      .or(
        `requester_id.eq.${requesterId},receiver_id.eq.${requesterId},` +
        `requester_id.eq.${userId},receiver_id.eq.${userId}`
      )
      .neq("id", coupleId)
      .limit(1)
      .maybeSingle();

    if (guardErr) {
      req.log.error({ err: guardErr.message }, "couple/accept: guard query failed");
      throw guardErr;
    }
    if (alreadyCoupled) {
      req.log.warn({ coupleId, requesterId, userId, alreadyCoupled }, "couple/accept blocked: user already in a couple");
      res.status(409).json({ error: "This user is already in a couple" });
      return;
    }

    // ── Step 3: accept the link ──────────────────────────────────────────────
    const now = new Date().toISOString();
    const { data: accepted, error: acceptErr } = await sb
      .from("couple_links")
      .update({ status: "accepted", accepted_at: now })
      .eq("id", coupleId)
      .select()
      .single();

    if (acceptErr) {
      req.log.error({ err: acceptErr.message }, "couple/accept: update failed");
      throw acceptErr;
    }

    // ── Step 4: cleanup — cancel all other pending rows touching either user ─
    // Fetch first so we know who to notify, then cancel.
    const pendingFilter =
      `requester_id.eq.${requesterId},receiver_id.eq.${requesterId},` +
      `requester_id.eq.${userId},receiver_id.eq.${userId}`;

    const { data: cancelTargets, error: fetchCancelErr } = await sb
      .from("couple_links")
      .select("id, requester_id, receiver_id")
      .eq("status", "pending")
      .neq("id", coupleId)
      .or(pendingFilter);

    if (fetchCancelErr) {
      req.log.error({ err: fetchCancelErr.message }, "couple/accept: failed to fetch cancellation targets (non-fatal, continuing)");
    }

    const cancelRows = (cancelTargets ?? []) as { id: string; requester_id: string; receiver_id: string }[];

    if (cancelRows.length > 0) {
      const cancelIds = cancelRows.map((r) => r.id);
      const { error: cancelErr } = await sb
        .from("couple_links")
        .update({ status: "cancelled" })
        .in("id", cancelIds);

      if (cancelErr) {
        req.log.error({ err: cancelErr.message, cancelIds }, "couple/accept: failed to cancel other pending requests (non-fatal, continuing)");
      } else {
        req.log.info({ cancelIds, newCoupleId: coupleId, requesterId, receiverId: userId }, `couple/accept: cancelled ${cancelIds.length} other pending request(s)`);
      }
    }

    // ── Step 5: profile updates ──────────────────────────────────────────────
    // CRITICAL: coupled users must never appear in matching.
    // Set show_in_matching = false for BOTH partners immediately on accept.
    // Also sync relationship_status → "In a Relationship" so the profile pill stays consistent.
    const [reqUpdate, recUpdate] = await Promise.all([
      sb.from("profiles").update({ show_in_matching: false, relationship_status: "In a Relationship" }).eq("id", requesterId),
      sb.from("profiles").update({ show_in_matching: false, relationship_status: "In a Relationship" }).eq("id", userId),
    ]);
    if (reqUpdate.error) {
      req.log.error({ err: reqUpdate.error.message, userId: requesterId }, "couple/accept: failed to set show_in_matching=false for requester");
    } else {
      req.log.info({ userId: requesterId }, "couple/accept: show_in_matching=false + relationship_status=In a Relationship set for requester");
    }
    if (recUpdate.error) {
      req.log.error({ err: recUpdate.error.message, userId }, "couple/accept: failed to set show_in_matching=false for receiver");
    } else {
      req.log.info({ userId }, "couple/accept: show_in_matching=false + relationship_status=In a Relationship set for receiver");
    }

    // Respond before firing notifications so the UI isn't blocked.
    res.json({ success: true, couple: accepted });

    // ── Step 6: fire-and-forget — notify outsiders whose requests were cancelled
    // Each cancelled row has one "outsider" (person not in the new couple).
    // They get a notification explaining their request was closed.
    if (cancelRows.length > 0) {
      void (async () => {
        try {
          // Fetch display names for the newly-coupled users to personalise messages.
          const { data: profiles } = await sb
            .from("profiles")
            .select("id, full_name, username")
            .in("id", [requesterId, userId]);
          const nameMap = Object.fromEntries(
            ((profiles ?? []) as any[]).map((p: any) => [
              p.id as string,
              (p.full_name || p.username || "Someone") as string,
            ])
          );

          const notifRows = cancelRows
            .map((row) => {
              const ourUser = [requesterId, userId].includes(row.requester_id)
                ? row.requester_id
                : row.receiver_id;
              const outsider = ourUser === row.requester_id ? row.receiver_id : row.requester_id;
              if (!outsider) return null;
              return {
                recipient_id: outsider,
                sender_id: ourUser,
                type: "couple_request_cancelled",
                message: `Your couple request with ${nameMap[ourUser] ?? "someone"} was closed — they're now in a couple 💔`,
                is_read: false,
                created_at: new Date().toISOString(),
              };
            })
            .filter((n): n is NonNullable<typeof n> => n !== null);

          if (notifRows.length > 0) {
            const { error: notifErr } = await sb.from("notifications").insert(notifRows);
            if (notifErr) {
              req.log.warn({ err: notifErr.message }, "couple/accept: cancellation notifications insert failed (non-fatal)");
            } else {
              req.log.info({ count: notifRows.length }, "couple/accept: cancellation notifications sent");
            }
          }
        } catch (e: any) {
          req.log.warn({ err: e.message }, "couple/accept: cancellation notifications threw (non-fatal)");
        }
      })();
    }
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/accept error");
    res.status(500).json({ error: "Failed to accept request" });
  }
});

// POST /decline
router.post("/decline", async (req, res) => {
  const { coupleId, userId } = req.body as { coupleId?: string; userId?: string };
  if (!coupleId || !userId) {
    res.status(400).json({ error: "coupleId and userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { error } = await sb
      .from("couple_links")
      .update({ status: "declined" })
      .eq("id", coupleId)
      .eq("receiver_id", userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/decline error");
    res.status(500).json({ error: "Failed to decline" });
  }
});

// DELETE /unlink
router.delete("/unlink", async (req, res) => {
  const { coupleId, userId } = req.body as { coupleId?: string; userId?: string };
  if (!coupleId || !userId) {
    res.status(400).json({ error: "coupleId and userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: link } = await sb
      .from("couple_links")
      .select("requester_id, receiver_id")
      .eq("id", coupleId)
      .maybeSingle();

    if (!link) {
      res.status(404).json({ error: "Couple link not found" });
      return;
    }

    await sb.from("couple_links").delete().eq("id", coupleId);

    // CRITICAL: coupled users must never appear in matching.
    // Restore show_in_matching = true for BOTH partners on unlink so they re-enter the dating pool.
    // Also reset relationship_status → "Single" so the profile pill stays consistent.
    const [reqRestore, recRestore] = await Promise.all([
      sb.from("profiles").update({ show_in_matching: true, relationship_status: "Single" }).eq("id", (link as any).requester_id),
      sb.from("profiles").update({ show_in_matching: true, relationship_status: "Single" }).eq("id", (link as any).receiver_id),
    ]);
    if (reqRestore.error) {
      req.log.error({ err: reqRestore.error.message, userId: (link as any).requester_id }, "couple/unlink: failed to restore show_in_matching for requester");
    } else {
      req.log.info({ userId: (link as any).requester_id }, "couple/unlink: show_in_matching=true + relationship_status=Single restored for requester");
    }
    if (recRestore.error) {
      req.log.error({ err: recRestore.error.message, userId: (link as any).receiver_id }, "couple/unlink: failed to restore show_in_matching for receiver");
    } else {
      req.log.info({ userId: (link as any).receiver_id }, "couple/unlink: show_in_matching=true + relationship_status=Single restored for receiver");
    }

    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/unlink error");
    res.status(500).json({ error: "Failed to unlink" });
  }
});

// GET /status
router.get("/status", async (req, res) => {
  const userId = req.query["userId"] as string;
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: link } = await sb
      .from("couple_links")
      .select("*")
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq("status", "accepted")
      .order("accepted_at", { ascending: false })
      .maybeSingle();

    if (link) {
      const partnerId = (link as any).requester_id === userId ? (link as any).receiver_id : (link as any).requester_id;

      // Guard: a self-linked row (requester_id === receiver_id) is corrupt data.
      // Both sides would resolve to the same profile → "Prakash & Prakash" display.
      // Treat it as no couple rather than surfacing the bad data.
      if (partnerId === userId) {
        req.log.warn({ userId, coupleId: (link as any).id }, "couple/status: self-linked row detected, treating as none");
        res.json({ status: "none" });
        return;
      }

      const [{ data: partner }, { data: myProfile }] = await Promise.all([
        sb.from("profiles").select("id, username, avatar_url, full_name").eq("id", partnerId).maybeSingle(),
        sb.from("profiles").select("id, username, avatar_url, full_name").eq("id", userId).maybeSingle(),
      ]);

      res.json({ status: "coupled", couple: link, partner, myProfile });
      return;
    }

    const { data: pending } = await sb
      .from("couple_links")
      .select("*")
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (pending && (pending as any[]).length > 0) {
      const requesterIds = (pending as any[]).map((p) => p.requester_id);
      const { data: requesters } = await sb
        .from("profiles")
        .select("id, username, avatar_url, full_name")
        .in("id", requesterIds);

      const requestsWithProfiles = (pending as any[]).map((req) => ({
        ...req,
        requester: ((requesters ?? []) as any[]).find((r) => r.id === req.requester_id),
      }));

      res.json({ status: "pending_received", pendingRequests: requestsWithProfiles });
      return;
    }

    const { data: sent } = await sb
      .from("couple_links")
      .select("*")
      .eq("requester_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    if (sent) {
      const { data: receiver } = await sb
        .from("profiles")
        .select("id, username, avatar_url, full_name")
        .eq("id", (sent as any).receiver_id)
        .maybeSingle();
      res.json({ status: "pending_sent", pending: sent, receiver });
      return;
    }

    res.json({ status: "none" });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/status error");
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

// GET /stats
router.get("/stats", async (req, res) => {
  const coupleId = req.query["coupleId"] as string;
  if (!coupleId) {
    res.status(400).json({ error: "coupleId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: link, error } = await sb
      .from("couple_links")
      .select("accepted_at, anniversary_date")
      .eq("id", coupleId)
      .single();

    if (error || !link) {
      res.status(404).json({ error: "Couple not found" });
      return;
    }

    const start = new Date((link as any).accepted_at ?? new Date());
    const daysTogether = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
    res.json({ daysTogether, anniversaryDate: (link as any).anniversary_date });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/stats error");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// POST /nudge
router.post("/nudge", async (req, res) => {
  const { senderId, partnerId } = req.body as { senderId?: string; partnerId?: string };
  if (!senderId || !partnerId) {
    res.status(400).json({ error: "senderId and partnerId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    await sb.from("couple_nudges").insert({ sender_id: senderId, receiver_id: partnerId });
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/nudge error");
    res.status(500).json({ error: "Failed to send nudge" });
  }
});

// GET /photos
router.get("/photos", async (req, res) => {
  const coupleId = req.query["coupleId"] as string;
  if (!coupleId) {
    res.status(400).json({ error: "coupleId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("couple_photos")
      .select("*")
      .eq("couple_id", coupleId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ photos: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/photos GET error");
    res.status(500).json({ error: "Failed to fetch photos" });
  }
});

// POST /photos
router.post("/photos", async (req, res) => {
  const { coupleId, uploadedBy, url, caption } = req.body as {
    coupleId?: string;
    uploadedBy?: string;
    url?: string;
    caption?: string;
  };
  if (!coupleId || !uploadedBy || !url) {
    res.status(400).json({ error: "coupleId, uploadedBy, and url required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("couple_photos")
      .insert({ couple_id: coupleId, uploaded_by: uploadedBy, url, caption: caption ?? null })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, photo: data });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/photos POST error");
    res.status(500).json({ error: "Failed to upload photo" });
  }
});

// GET /bucketlist
router.get("/bucketlist", async (req, res) => {
  const coupleId = req.query["coupleId"] as string;
  if (!coupleId) {
    res.status(400).json({ error: "coupleId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("couple_bucketlist")
      .select("*")
      .eq("couple_id", coupleId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json({ items: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/bucketlist GET error");
    res.status(500).json({ error: "Failed to fetch bucket list" });
  }
});

// POST /bucketlist
router.post("/bucketlist", async (req, res) => {
  const { coupleId, title, createdBy } = req.body as {
    coupleId?: string;
    title?: string;
    createdBy?: string;
  };
  if (!coupleId || !title || !createdBy) {
    res.status(400).json({ error: "coupleId, title, and createdBy required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("couple_bucketlist")
      .insert({ couple_id: coupleId, title, created_by: createdBy, completed: false })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, item: data });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/bucketlist POST error");
    res.status(500).json({ error: "Failed to add item" });
  }
});

// PATCH /bucketlist/:id
router.patch("/bucketlist/:id", async (req, res) => {
  const { id } = req.params;
  const { completed } = req.body as { completed?: boolean };
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("couple_bucketlist")
      .update({ completed: !!completed })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, item: data });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/bucketlist PATCH error");
    res.status(500).json({ error: "Failed to update item" });
  }
});

// GET /notes
router.get("/notes", async (req, res) => {
  const coupleId = req.query["coupleId"] as string;
  if (!coupleId) {
    res.status(400).json({ error: "coupleId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("couple_notes")
      .select("*")
      .eq("couple_id", coupleId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json({ notes: data ?? [] });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/notes GET error");
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// POST /notes
router.post("/notes", async (req, res) => {
  const { coupleId, authorId, content } = req.body as {
    coupleId?: string;
    authorId?: string;
    content?: string;
  };
  if (!coupleId || !authorId || !content) {
    res.status(400).json({ error: "coupleId, authorId, and content required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data, error } = await sb
      .from("couple_notes")
      .insert({ couple_id: coupleId, author_id: authorId, content })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, note: data });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/notes POST error");
    res.status(500).json({ error: "Failed to add note" });
  }
});

// ── Competition routes ──────────────────────────────────────────────────────

function currentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

// POST /competition/enter
router.post("/competition/enter", async (req, res) => {
  const { coupleId, coupleName, coverPhotoUrl } = req.body as {
    coupleId?: string;
    coupleName?: string;
    coverPhotoUrl?: string;
  };
  if (!coupleId || !coupleName) {
    res.status(400).json({ error: "coupleId and coupleName required" });
    return;
  }
  const sb = makeSupabase();
  const { month, year } = currentMonthYear();
  try {
    const { data: existing } = await sb
      .from("couple_competitions")
      .select("id")
      .eq("couple_id", coupleId)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();

    if (existing) {
      res.status(409).json({ error: "Already entered this month" });
      return;
    }

    const { data, error } = await sb
      .from("couple_competitions")
      .insert({ couple_id: coupleId, couple_name: coupleName, cover_photo_url: coverPhotoUrl ?? null, month, year, vote_count: 0 })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, entry: data });
  } catch (err: any) {
    req.log.error({ err: err.message }, "competition/enter error");
    res.status(500).json({ error: "Failed to enter competition" });
  }
});

// GET /competition/leaderboard
router.get("/competition/leaderboard", async (req, res) => {
  const sb = makeSupabase();
  const { month, year } = currentMonthYear();
  try {
    const { data: entries, error } = await sb
      .from("couple_competitions")
      .select("*")
      .eq("month", month)
      .eq("year", year)
      .order("vote_count", { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!entries || (entries as any[]).length === 0) {
      res.json({ leaderboard: [], month, year });
      return;
    }

    const coupleIds = (entries as any[]).map((e) => e.couple_id);
    const { data: couples } = await sb
      .from("couple_links")
      .select("id, requester_id, receiver_id, accepted_at")
      .in("id", coupleIds);

    const allUserIds = (couples ?? []).flatMap((c: any) => [c.requester_id, c.receiver_id]);
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, username, avatar_url, full_name")
      .in("id", allUserIds);

    const profileMap = Object.fromEntries(((profiles ?? []) as any[]).map((p: any) => [p.id, p]));
    const coupleMap = Object.fromEntries(((couples ?? []) as any[]).map((c: any) => [c.id, c]));

    const leaderboard = (entries as any[]).map((e, i) => {
      const couple = coupleMap[e.couple_id];
      const daysTogether = couple?.accepted_at
        ? Math.floor((Date.now() - new Date(couple.accepted_at).getTime()) / 86400000)
        : 0;
      return {
        ...e,
        rank: i + 1,
        daysTogether,
        requester: couple ? profileMap[couple.requester_id] : null,
        receiver: couple ? profileMap[couple.receiver_id] : null,
      };
    });

    res.json({ leaderboard, month, year });
  } catch (err: any) {
    req.log.error({ err: err.message }, "competition/leaderboard error");
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// POST /competition/vote/:competitionId
router.post("/competition/vote/:competitionId", async (req, res) => {
  const { competitionId } = req.params;
  const { voterId } = req.body as { voterId?: string };
  if (!voterId) {
    res.status(400).json({ error: "voterId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: existing } = await sb
      .from("couple_competition_votes")
      .select("id")
      .eq("voter_id", voterId)
      .eq("competition_id", competitionId)
      .maybeSingle();

    if (existing) {
      res.status(409).json({ error: "Already voted" });
      return;
    }

    await sb.from("couple_competition_votes").insert({ voter_id: voterId, competition_id: competitionId });

    const { data: current } = await sb
      .from("couple_competitions")
      .select("vote_count")
      .eq("id", competitionId)
      .single();

    const newCount = ((current as any)?.vote_count ?? 0) + 1;
    await sb.from("couple_competitions").update({ vote_count: newCount }).eq("id", competitionId);

    res.json({ success: true, voteCount: newCount });
  } catch (err: any) {
    req.log.error({ err: err.message }, "competition/vote error");
    res.status(500).json({ error: "Failed to vote" });
  }
});

// DELETE /competition/vote/:competitionId
router.delete("/competition/vote/:competitionId", async (req, res) => {
  const { competitionId } = req.params;
  const { voterId } = req.body as { voterId?: string };
  if (!voterId) {
    res.status(400).json({ error: "voterId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    await sb
      .from("couple_competition_votes")
      .delete()
      .eq("voter_id", voterId)
      .eq("competition_id", competitionId);

    const { data: current } = await sb
      .from("couple_competitions")
      .select("vote_count")
      .eq("id", competitionId)
      .single();

    const newCount = Math.max(0, ((current as any)?.vote_count ?? 1) - 1);
    await sb.from("couple_competitions").update({ vote_count: newCount }).eq("id", competitionId);

    res.json({ success: true, voteCount: newCount });
  } catch (err: any) {
    req.log.error({ err: err.message }, "competition/unvote error");
    res.status(500).json({ error: "Failed to unvote" });
  }
});

// GET /competition/winners
router.get("/competition/winners", async (req, res) => {
  const sb = makeSupabase();
  try {
    const { data: winners, error } = await sb
      .from("couple_competition_winners")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .order("rank", { ascending: true })
      .limit(30);

    if (error) throw error;

    if (!winners || (winners as any[]).length === 0) {
      res.json({ winners: [] });
      return;
    }

    const coupleIds = [...new Set((winners as any[]).map((w) => w.couple_id))];
    const { data: entries } = await sb
      .from("couple_competitions")
      .select("couple_id, couple_name, cover_photo_url")
      .in("couple_id", coupleIds);

    const entryMap = Object.fromEntries(((entries ?? []) as any[]).map((e: any) => [e.couple_id, e]));

    const enriched = (winners as any[]).map((w) => ({
      ...w,
      couple_name: entryMap[w.couple_id]?.couple_name ?? "Unknown",
      cover_photo_url: entryMap[w.couple_id]?.cover_photo_url ?? null,
    }));

    res.json({ winners: enriched });
  } catch (err: any) {
    req.log.error({ err: err.message }, "competition/winners error");
    res.status(500).json({ error: "Failed to fetch winners" });
  }
});

// GET /competition/my-entry
router.get("/competition/my-entry", async (req, res) => {
  const coupleId = req.query["coupleId"] as string;
  const voterId = req.query["voterId"] as string;
  if (!coupleId) {
    res.status(400).json({ error: "coupleId required" });
    return;
  }
  const sb = makeSupabase();
  const { month, year } = currentMonthYear();
  try {
    const { data: entry } = await sb
      .from("couple_competitions")
      .select("*")
      .eq("couple_id", coupleId)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();

    if (!entry) {
      res.json({ entry: null, rank: null, userVotes: [] });
      return;
    }

    const { data: allEntries } = await sb
      .from("couple_competitions")
      .select("id, vote_count")
      .eq("month", month)
      .eq("year", year)
      .order("vote_count", { ascending: false });

    const rank = ((allEntries ?? []) as any[]).findIndex((e) => e.id === (entry as any).id) + 1;

    let userVotes: string[] = [];
    if (voterId) {
      const { data: votes } = await sb
        .from("couple_competition_votes")
        .select("competition_id")
        .eq("voter_id", voterId);
      userVotes = ((votes ?? []) as any[]).map((v) => v.competition_id);
    }

    res.json({ entry, rank, userVotes });
  } catch (err: any) {
    req.log.error({ err: err.message }, "competition/my-entry error");
    res.status(500).json({ error: "Failed to fetch entry" });
  }
});

export default router;

