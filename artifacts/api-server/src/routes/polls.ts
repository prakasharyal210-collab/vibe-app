import { Router } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase(): SupabaseClient {
  const url =
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
    "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

// ── Shared batch enrichment ────────────────────────────────────────────────────
// Fetches poll data for a set of rows and merges it under `row.poll`.
// parentIdField controls which FK column to match against: post_id (regular posts)
// or confession_post_id (couple-feed posts).

export async function enrichWithPolls(
  supabase: SupabaseClient,
  rows: any[],
  viewerUserId?: string,
  parentIdField: "post_id" | "confession_post_id" = "post_id",
): Promise<any[]> {
  if (!rows.length) return rows;

  const ids = rows.map((r) => r.id as string).filter(Boolean);
  if (!ids.length) return rows;

  const { data: polls } = await supabase
    .from("polls")
    .select("id, question, ends_at, post_id, confession_post_id")
    .in(parentIdField, ids);

  if (!polls?.length) return rows.map((r) => ({ ...r, poll: null }));

  const pollIds = (polls as any[]).map((p) => p.id as string);

  const [optionsRes, votesRes, myVotesRes] = await Promise.all([
    supabase
      .from("poll_options")
      .select("id, poll_id, label, position")
      .in("poll_id", pollIds)
      .order("position"),
    supabase
      .from("poll_votes")
      .select("poll_id, option_id")
      .in("poll_id", pollIds),
    viewerUserId
      ? supabase
          .from("poll_votes")
          .select("poll_id, option_id")
          .in("poll_id", pollIds)
          .eq("user_id", viewerUserId)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const options = (optionsRes.data ?? []) as any[];
  const votes = (votesRes.data ?? []) as any[];
  const myVotes = ((myVotesRes as any).data ?? []) as any[];

  const optsByPoll = new Map<string, any[]>();
  for (const o of options) {
    const arr = optsByPoll.get(o.poll_id as string) ?? [];
    arr.push(o);
    optsByPoll.set(o.poll_id as string, arr);
  }

  const voteCountByOption = new Map<string, number>();
  const voteTotalByPoll = new Map<string, number>();
  for (const v of votes) {
    voteCountByOption.set(v.option_id as string, (voteCountByOption.get(v.option_id as string) ?? 0) + 1);
    voteTotalByPoll.set(v.poll_id as string, (voteTotalByPoll.get(v.poll_id as string) ?? 0) + 1);
  }

  const myVoteByPoll = new Map<string, string>();
  for (const v of myVotes) {
    myVoteByPoll.set(v.poll_id as string, v.option_id as string);
  }

  const pollByParentId = new Map<string, any>();
  for (const p of polls as any[]) {
    const parentId = p[parentIdField] as string;
    const opts = optsByPoll.get(p.id as string) ?? [];
    pollByParentId.set(parentId, {
      id: p.id,
      question: p.question,
      ends_at: p.ends_at,
      options: opts.map((o: any) => ({
        id: o.id,
        label: o.label,
        position: o.position,
        votes: voteCountByOption.get(o.id as string) ?? 0,
      })),
      totalVotes: voteTotalByPoll.get(p.id as string) ?? 0,
      viewerVote: myVoteByPoll.get(p.id as string) ?? null,
    });
  }

  return rows.map((row) => ({
    ...row,
    poll: pollByParentId.get(row.id as string) ?? null,
  }));
}

// ── POST /api/polls/:pollId/vote ───────────────────────────────────────────────
// Body: { optionId: string, userId: string }
// Returns: { success: true, poll: { id, options, totalVotes, viewerVote } }

router.post("/:pollId/vote", async (req, res) => {
  const { pollId } = req.params;
  const { optionId, userId } = req.body as {
    optionId?: string;
    userId?: string;
  };

  if (!pollId || !optionId || !userId) {
    res.status(400).json({ error: "pollId, optionId, and userId are required" });
    return;
  }

  const sb = makeSupabase();

  // Verify poll exists and is still open
  const { data: poll } = await sb
    .from("polls")
    .select("id, ends_at")
    .eq("id", pollId)
    .maybeSingle();

  if (!poll) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }
  if (new Date((poll as any).ends_at) < new Date()) {
    res.status(400).json({ error: "This poll has ended" });
    return;
  }

  // Verify option belongs to this poll
  const { data: option } = await sb
    .from("poll_options")
    .select("id")
    .eq("id", optionId)
    .eq("poll_id", pollId)
    .maybeSingle();

  if (!option) {
    res.status(400).json({ error: "Option not found for this poll" });
    return;
  }

  // Upsert — UNIQUE(poll_id, user_id) means existing row gets option_id updated
  const { error: voteErr } = await sb
    .from("poll_votes")
    .upsert(
      { poll_id: pollId, option_id: optionId, user_id: userId },
      { onConflict: "poll_id,user_id" },
    );

  if (voteErr) {
    req.log.error({ err: voteErr.message }, "poll vote upsert error");
    res.status(500).json({ error: voteErr.message });
    return;
  }

  // Return fresh counts
  const [optionsRes, votesRes] = await Promise.all([
    sb.from("poll_options").select("id, label, position").eq("poll_id", pollId).order("position"),
    sb.from("poll_votes").select("option_id").eq("poll_id", pollId),
  ]);

  const opts = (optionsRes.data ?? []) as any[];
  const votes = (votesRes.data ?? []) as any[];

  const voteCountByOption = new Map<string, number>();
  for (const v of votes) {
    voteCountByOption.set(v.option_id as string, (voteCountByOption.get(v.option_id as string) ?? 0) + 1);
  }

  res.json({
    success: true,
    poll: {
      id: pollId,
      options: opts.map((o: any) => ({
        id: o.id,
        label: o.label,
        position: o.position,
        votes: voteCountByOption.get(o.id as string) ?? 0,
      })),
      totalVotes: votes.length,
      viewerVote: optionId,
    },
  });
});

export default router;
