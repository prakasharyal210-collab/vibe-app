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
  const { requesterId, receiverId, anniversaryDate } = req.body as {
    requesterId?: string;
    receiverId?: string;
    anniversaryDate?: string;
  };
  if (!requesterId || !receiverId) {
    res.status(400).json({ error: "requesterId and receiverId required" });
    return;
  }
  if (requesterId === receiverId) {
    res.status(400).json({ error: "Cannot send request to yourself" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: existing } = await sb
      .from("couple_links")
      .select("id, status")
      .or(
        `and(requester_id.eq.${requesterId},receiver_id.eq.${receiverId}),and(requester_id.eq.${receiverId},receiver_id.eq.${requesterId})`
      )
      .maybeSingle();

    if (existing) {
      res.status(409).json({ error: "Request already exists", status: (existing as any).status });
      return;
    }

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

    if (error) throw error;
    res.json({ success: true, couple: data });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple/request error");
    res.status(500).json({ error: "Failed to send couple request" });
  }
});

// POST /accept
router.post("/accept", async (req, res) => {
  const { coupleId, userId } = req.body as { coupleId?: string; userId?: string };
  if (!coupleId || !userId) {
    res.status(400).json({ error: "coupleId and userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: link, error: fetchErr } = await sb
      .from("couple_links")
      .select("*")
      .eq("id", coupleId)
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .single();

    if (fetchErr || !link) {
      res.status(404).json({ error: "Couple request not found" });
      return;
    }

    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("couple_links")
      .update({ status: "accepted", accepted_at: now })
      .eq("id", coupleId)
      .select()
      .single();

    if (error) throw error;

    await sb.from("profiles").update({ show_in_matching: false }).eq("id", (link as any).requester_id);
    await sb.from("profiles").update({ show_in_matching: false }).eq("id", userId);

    res.json({ success: true, couple: data });
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
    await sb.from("profiles").update({ show_in_matching: true }).eq("id", (link as any).requester_id);
    await sb.from("profiles").update({ show_in_matching: true }).eq("id", (link as any).receiver_id);

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
      const { data: partner } = await sb
        .from("profiles")
        .select("id, username, avatar_url, full_name")
        .eq("id", partnerId)
        .maybeSingle();

      res.json({ status: "coupled", couple: link, partner });
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
      res.json({ status: "pending_sent", pending: sent });
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

export default router;
