import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

function makeSupabase() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key);
}

const router = Router();

// ── helpers ───────────────────────────────────────────────────────────────────

async function getCoupleForUser(sb: ReturnType<typeof makeSupabase>, userId: string) {
  const { data, error } = await sb
    .from("couple_links")
    .select("id, requester_id, receiver_id")
    .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq("status", "accepted")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; requester_id: string; receiver_id: string } | null;
}

async function getCoupleById(sb: ReturnType<typeof makeSupabase>, coupleId: string) {
  const { data, error } = await sb
    .from("couple_links")
    .select("id, requester_id, receiver_id")
    .eq("id", coupleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; requester_id: string; receiver_id: string } | null;
}

async function getProfileNames(sb: ReturnType<typeof makeSupabase>, ids: string[]) {
  if (ids.length === 0) return {} as Record<string, string>;
  const { data } = await sb
    .from("profiles")
    .select("id, full_name, username")
    .in("id", ids);
  const map: Record<string, string> = {};
  for (const p of (data ?? []) as any[]) {
    map[p.id as string] = ((p.full_name || p.username || "Someone") as string);
  }
  return map;
}

function coupleName(names: Record<string, string>, couple: { requester_id: string; receiver_id: string }) {
  const a = names[couple.requester_id] ?? "?";
  const b = names[couple.receiver_id] ?? "?";
  return `${a} & ${b}`;
}

async function maybeExpireBattles(sb: ReturnType<typeof makeSupabase>, battleIds: string[]) {
  if (battleIds.length === 0) return;
  await sb
    .from("couple_battles")
    .update({ status: "expired" })
    .in("id", battleIds)
    .in("status", ["pending", "active"])
    .lt("expires_at", new Date().toISOString());
}

async function computeAndFinalise(
  sb: ReturnType<typeof makeSupabase>,
  battleId: string,
  questionIds: string[],
  challengerCouple: { id: string; requester_id: string; receiver_id: string },
  opponentCouple: { id: string; requester_id: string; receiver_id: string }
): Promise<boolean> {
  const allUsers = [
    challengerCouple.requester_id, challengerCouple.receiver_id,
    opponentCouple.requester_id,   opponentCouple.receiver_id,
  ];
  const { data: answers } = await sb
    .from("battle_answers")
    .select("user_id, question_id, answer")
    .eq("battle_id", battleId);
  const ans = (answers ?? []) as { user_id: string; question_id: string; answer: string }[];

  const totalExpected = allUsers.length * questionIds.length;
  if (ans.length < totalExpected) return false;

  const lookup = new Map<string, string>();
  for (const a of ans) lookup.set(`${a.user_id}:${a.question_id}`, a.answer);

  let challengerScore = 0;
  let opponentScore = 0;
  for (const qId of questionIds) {
    const ca = lookup.get(`${challengerCouple.requester_id}:${qId}`);
    const cb = lookup.get(`${challengerCouple.receiver_id}:${qId}`);
    if (ca && cb && ca === cb) challengerScore++;
    const oa = lookup.get(`${opponentCouple.requester_id}:${qId}`);
    const ob = lookup.get(`${opponentCouple.receiver_id}:${qId}`);
    if (oa && ob && oa === ob) opponentScore++;
  }

  let winner: string | null = null;
  if (challengerScore > opponentScore) winner = challengerCouple.id;
  else if (opponentScore > challengerScore) winner = opponentCouple.id;

  await sb
    .from("couple_battles")
    .update({
      status: "completed",
      winner_couple_id: winner,
      completed_at: new Date().toISOString(),
    })
    .eq("id", battleId);

  return true;
}

async function sendNotifications(
  sb: ReturnType<typeof makeSupabase>,
  userIds: string[],
  senderId: string,
  type: string,
  message: string
) {
  if (userIds.length === 0) return;
  const rows = userIds.map((uid) => ({
    recipient_id: uid,
    sender_id: senderId,
    type,
    message,
    is_read: false,
    created_at: new Date().toISOString(),
  }));
  await sb.from("notifications").insert(rows);
}

// ── POST /couple-games/challenge ─────────────────────────────────────────────
// Body: { challengerUserId, opponentCoupleId }
router.post("/challenge", async (req, res) => {
  const { challengerUserId, opponentCoupleId } = req.body as {
    challengerUserId?: string;
    opponentCoupleId?: string;
  };
  if (!challengerUserId || !opponentCoupleId) {
    res.status(400).json({ error: "challengerUserId and opponentCoupleId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const challengerCouple = await getCoupleForUser(sb, challengerUserId);
    if (!challengerCouple) {
      res.status(403).json({ error: "You must be in a couple to challenge another" });
      return;
    }
    if (challengerCouple.id === opponentCoupleId) {
      res.status(400).json({ error: "Cannot challenge your own couple" });
      return;
    }
    const opponentCouple = await getCoupleById(sb, opponentCoupleId);
    if (!opponentCouple) {
      res.status(404).json({ error: "Opponent couple not found" });
      return;
    }

    const { data: existingBattle } = await sb
      .from("couple_battles")
      .select("id, status")
      .or(
        `and(challenger_couple_id.eq.${challengerCouple.id},opponent_couple_id.eq.${opponentCoupleId}),` +
        `and(challenger_couple_id.eq.${opponentCoupleId},opponent_couple_id.eq.${challengerCouple.id})`
      )
      .in("status", ["pending", "active"])
      .maybeSingle();
    if (existingBattle) {
      res.status(409).json({ error: "An active battle already exists with this couple", battleId: existingBattle.id });
      return;
    }

    const { data: questions, error: qErr } = await sb
      .from("game_questions")
      .select("id")
      .eq("active", true);
    if (qErr || !questions || questions.length < 10) {
      res.status(500).json({ error: "Not enough questions available" });
      return;
    }
    const shuffled = (questions as { id: string }[]).sort(() => Math.random() - 0.5);
    const questionIds = shuffled.slice(0, 10).map((q) => q.id);

    const { data: battle, error: bErr } = await sb
      .from("couple_battles")
      .insert({
        challenger_couple_id: challengerCouple.id,
        opponent_couple_id: opponentCoupleId,
        question_ids: questionIds,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (bErr) throw new Error(bErr.message);

    void (async () => {
      try {
        const names = await getProfileNames(sb, [challengerUserId]);
        const senderName = names[challengerUserId] ?? "A couple";
        await sendNotifications(
          sb,
          [opponentCouple.requester_id, opponentCouple.receiver_id],
          challengerUserId,
          "couple_game_challenge",
          `${senderName} challenged you to a Couple Quiz Battle! ⚔️`
        );
      } catch {}
    })();

    res.json({ success: true, battle });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-games/challenge error");
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

// ── POST /couple-games/battles/:battleId/respond ─────────────────────────────
// Body: { userId, accept: boolean }
router.post("/battles/:battleId/respond", async (req, res) => {
  const { battleId } = req.params;
  const { userId, accept } = req.body as { userId?: string; accept?: boolean };
  if (!userId || accept === undefined) {
    res.status(400).json({ error: "userId and accept required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: battle, error: bErr } = await sb
      .from("couple_battles")
      .select("id, challenger_couple_id, opponent_couple_id, status")
      .eq("id", battleId)
      .maybeSingle();
    if (bErr || !battle) {
      res.status(404).json({ error: "Battle not found" });
      return;
    }
    const b = battle as any;
    if (b.status !== "pending") {
      res.status(400).json({ error: `Battle is already ${b.status}` });
      return;
    }
    const opponentCouple = await getCoupleById(sb, b.opponent_couple_id);
    if (!opponentCouple) {
      res.status(404).json({ error: "Opponent couple not found" });
      return;
    }
    if (opponentCouple.requester_id !== userId && opponentCouple.receiver_id !== userId) {
      res.status(403).json({ error: "Only the opponent couple can respond to this challenge" });
      return;
    }
    const newStatus = accept ? "active" : "declined";
    await sb.from("couple_battles").update({ status: newStatus }).eq("id", battleId);

    void (async () => {
      try {
        const challengerCouple = await getCoupleById(sb, b.challenger_couple_id);
        if (!challengerCouple) return;
        const names = await getProfileNames(sb, [userId]);
        const responderName = names[userId] ?? "Your opponent";
        const msg = accept
          ? `${responderName} accepted your Couple Quiz Battle! Time to answer ⚔️`
          : `${responderName} declined your Couple Quiz Battle challenge`;
        await sendNotifications(
          sb,
          [challengerCouple.requester_id, challengerCouple.receiver_id],
          userId,
          "couple_game_response",
          msg
        );
      } catch {}
    })();

    res.json({ success: true, status: newStatus });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-games/respond error");
    res.status(500).json({ error: "Failed to respond to battle" });
  }
});

// ── GET /couple-games/battles?userId= ────────────────────────────────────────
router.get("/battles", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const myCouple = await getCoupleForUser(sb, userId);
    if (!myCouple) {
      res.json({ battles: [] });
      return;
    }
    const coupleId = myCouple.id;

    await maybeExpireBattles(sb, []);

    const { data: rawBattles, error: bErr } = await sb
      .from("couple_battles")
      .select("*")
      .or(`challenger_couple_id.eq.${coupleId},opponent_couple_id.eq.${coupleId}`)
      .order("created_at", { ascending: false });
    if (bErr) throw new Error(bErr.message);

    const battles = (rawBattles ?? []) as any[];

    const expiredIds = battles
      .filter((b) => ["pending", "active"].includes(b.status) && new Date(b.expires_at) < new Date())
      .map((b) => b.id as string);
    if (expiredIds.length > 0) {
      await maybeExpireBattles(sb, expiredIds);
      for (const b of battles) {
        if (expiredIds.includes(b.id)) b.status = "expired";
      }
    }

    const allCoupleIds = [...new Set(battles.flatMap((b) => [b.challenger_couple_id, b.opponent_couple_id]))];
    const coupleDetails: Record<string, { requester_id: string; receiver_id: string }> = {};
    for (const cid of allCoupleIds) {
      const c = await getCoupleById(sb, cid);
      if (c) coupleDetails[cid] = c;
    }

    const allUserIds = [
      ...new Set(Object.values(coupleDetails).flatMap((c) => [c.requester_id, c.receiver_id])),
    ];
    const names = await getProfileNames(sb, allUserIds);

    const { data: myAnswers } = await sb
      .from("battle_answers")
      .select("battle_id, question_id")
      .eq("user_id", userId);
    const myAnswerCountByBattle: Record<string, number> = {};
    for (const a of (myAnswers ?? []) as any[]) {
      myAnswerCountByBattle[a.battle_id] = (myAnswerCountByBattle[a.battle_id] ?? 0) + 1;
    }

    const enriched = battles.map((b) => {
      const challengerC = coupleDetails[b.challenger_couple_id];
      const opponentC = coupleDetails[b.opponent_couple_id];
      const iAmChallenger = b.challenger_couple_id === coupleId;
      const opponentCoupleData = iAmChallenger ? opponentC : challengerC;
      return {
        id: b.id,
        status: b.status,
        game_type: b.game_type,
        iAmChallenger,
        isMyTurn: b.status === "active" && (myAnswerCountByBattle[b.id] ?? 0) < (b.question_ids?.length ?? 10),
        opponentCoupleName: opponentCoupleData ? coupleName(names, opponentCoupleData) : "Unknown couple",
        opponentCoupleId: iAmChallenger ? b.opponent_couple_id : b.challenger_couple_id,
        myAnswerCount: myAnswerCountByBattle[b.id] ?? 0,
        totalQuestions: b.question_ids?.length ?? 10,
        winner_couple_id: b.winner_couple_id,
        iWon: b.winner_couple_id === coupleId,
        isTie: b.status === "completed" && b.winner_couple_id === null,
        created_at: b.created_at,
        expires_at: b.expires_at,
        completed_at: b.completed_at,
      };
    });

    res.json({ battles: enriched, myCoupleId: coupleId });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-games/battles list error");
    res.status(500).json({ error: "Failed to load battles" });
  }
});

// ── GET /couple-games/battles/:battleId/questions?userId= ────────────────────
router.get("/battles/:battleId/questions", async (req, res) => {
  const { battleId } = req.params;
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: battle, error: bErr } = await sb
      .from("couple_battles")
      .select("id, question_ids, challenger_couple_id, opponent_couple_id, status, expires_at")
      .eq("id", battleId)
      .maybeSingle();
    if (bErr || !battle) {
      res.status(404).json({ error: "Battle not found" });
      return;
    }
    const b = battle as any;
    if (new Date(b.expires_at) < new Date() && ["pending", "active"].includes(b.status)) {
      await sb.from("couple_battles").update({ status: "expired" }).eq("id", battleId);
      res.status(410).json({ error: "Battle has expired" });
      return;
    }

    const [chalC, oppC] = await Promise.all([
      getCoupleById(sb, b.challenger_couple_id),
      getCoupleById(sb, b.opponent_couple_id),
    ]);
    const allUsers = [
      chalC?.requester_id, chalC?.receiver_id,
      oppC?.requester_id,  oppC?.receiver_id,
    ].filter(Boolean);
    if (!allUsers.includes(userId)) {
      res.status(403).json({ error: "You are not part of this battle" });
      return;
    }

    const questionIds: string[] = b.question_ids ?? [];
    const { data: questions, error: qErr } = await sb
      .from("game_questions")
      .select("id, text, option_a, option_b")
      .in("id", questionIds);
    if (qErr) throw new Error(qErr.message);

    const orderedQuestions = questionIds
      .map((qid) => (questions as any[]).find((q) => q.id === qid))
      .filter(Boolean);

    const { data: myAnswers } = await sb
      .from("battle_answers")
      .select("question_id, answer")
      .eq("battle_id", battleId)
      .eq("user_id", userId);
    const myAnswerMap: Record<string, string> = {};
    for (const a of (myAnswers ?? []) as any[]) {
      myAnswerMap[a.question_id] = a.answer;
    }

    res.json({
      questions: orderedQuestions,
      myAnswers: myAnswerMap,
      status: b.status,
    });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-games/questions error");
    res.status(500).json({ error: "Failed to load questions" });
  }
});

// ── POST /couple-games/battles/:battleId/answers ─────────────────────────────
// Body: { userId, questionId, answer: 'A' | 'B' }
router.post("/battles/:battleId/answers", async (req, res) => {
  const { battleId } = req.params;
  const { userId, questionId, answer } = req.body as {
    userId?: string;
    questionId?: string;
    answer?: string;
  };
  if (!userId || !questionId || !answer) {
    res.status(400).json({ error: "userId, questionId, and answer required" });
    return;
  }
  if (answer !== "A" && answer !== "B") {
    res.status(400).json({ error: "answer must be 'A' or 'B'" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: battle, error: bErr } = await sb
      .from("couple_battles")
      .select("id, question_ids, challenger_couple_id, opponent_couple_id, status, expires_at")
      .eq("id", battleId)
      .maybeSingle();
    if (bErr || !battle) {
      res.status(404).json({ error: "Battle not found" });
      return;
    }
    const b = battle as any;
    if (b.status === "declined" || b.status === "completed") {
      res.status(400).json({ error: `Battle is already ${b.status}` });
      return;
    }
    if (b.status === "pending" || b.status === "expired") {
      res.status(400).json({ error: `Battle is ${b.status} — cannot submit answers yet` });
      return;
    }
    if (new Date(b.expires_at) < new Date()) {
      await sb.from("couple_battles").update({ status: "expired" }).eq("id", battleId);
      res.status(410).json({ error: "Battle has expired" });
      return;
    }

    const [chalC, oppC] = await Promise.all([
      getCoupleById(sb, b.challenger_couple_id),
      getCoupleById(sb, b.opponent_couple_id),
    ]);
    const allUsers = [
      chalC?.requester_id, chalC?.receiver_id,
      oppC?.requester_id,  oppC?.receiver_id,
    ].filter(Boolean);
    if (!allUsers.includes(userId)) {
      res.status(403).json({ error: "You are not part of this battle" });
      return;
    }

    const questionIds: string[] = b.question_ids ?? [];
    if (!questionIds.includes(questionId)) {
      res.status(400).json({ error: "Question is not part of this battle" });
      return;
    }

    const { error: upsertErr } = await sb
      .from("battle_answers")
      .upsert(
        { battle_id: battleId, user_id: userId, question_id: questionId, answer },
        { onConflict: "battle_id,user_id,question_id" }
      );
    if (upsertErr) throw new Error(upsertErr.message);

    let completed = false;
    if (chalC && oppC) {
      completed = await computeAndFinalise(sb, battleId, questionIds, chalC, oppC);
    }

    if (completed) {
      void (async () => {
        try {
          const { data: finalBattle } = await sb
            .from("couple_battles")
            .select("winner_couple_id")
            .eq("id", battleId)
            .maybeSingle();
          const winnerId = (finalBattle as any)?.winner_couple_id as string | null;
          const allNotifUsers = allUsers.filter((u): u is string => Boolean(u));
          const notifMsg = winnerId
            ? `Your Couple Quiz Battle is complete! See who won 🏆`
            : `Your Couple Quiz Battle ended in a tie! Check the results 🤝`;
          await sendNotifications(sb, allNotifUsers, userId, "couple_game_completed", notifMsg);
        } catch {}
      })();
    } else {
      void (async () => {
        try {
          const { data: allAnswers } = await sb
            .from("battle_answers")
            .select("user_id")
            .eq("battle_id", battleId);
          const answeredUsers = new Set((allAnswers ?? []).map((a: any) => a.user_id as string));
          const justFinished = answeredUsers.has(userId);
          if (justFinished) {
            const questionIds2: string[] = b.question_ids ?? [];
            const { data: myCount } = await sb
              .from("battle_answers")
              .select("id")
              .eq("battle_id", battleId)
              .eq("user_id", userId);
            const myDone = (myCount ?? []).length >= questionIds2.length;
            if (myDone) {
              const chalUsers = [chalC?.requester_id, chalC?.receiver_id].filter(Boolean) as string[];
              const oppUsers  = [oppC?.requester_id,  oppC?.receiver_id].filter(Boolean) as string[];
              const myGroup   = chalUsers.includes(userId) ? chalUsers : oppUsers;
              const theirGroup = chalUsers.includes(userId) ? oppUsers : chalUsers;
              const notifyIds = theirGroup.filter((u) => !answeredUsers.has(u) || true);
              const names = await getProfileNames(sb, [userId]);
              const notifMsg = `${names[userId] ?? "Your opponent"} finished answering — your turn in the Quiz Battle! ⚔️`;
              await sendNotifications(sb, notifyIds, userId, "couple_game_turn", notifMsg);
              void myGroup;
            }
          }
        } catch {}
      })();
    }

    res.json({ success: true, completed });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-games/answers error");
    res.status(500).json({ error: "Failed to submit answer" });
  }
});

// ── GET /couple-games/battles/:battleId/results?userId= ──────────────────────
router.get("/battles/:battleId/results", async (req, res) => {
  const { battleId } = req.params;
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const { data: battle, error: bErr } = await sb
      .from("couple_battles")
      .select("*")
      .eq("id", battleId)
      .maybeSingle();
    if (bErr || !battle) {
      res.status(404).json({ error: "Battle not found" });
      return;
    }
    const b = battle as any;
    if (b.status !== "completed" && b.status !== "expired" && b.status !== "declined") {
      res.status(400).json({ error: "Results not available yet", status: b.status });
      return;
    }

    const [chalC, oppC] = await Promise.all([
      getCoupleById(sb, b.challenger_couple_id),
      getCoupleById(sb, b.opponent_couple_id),
    ]);
    if (!chalC || !oppC) {
      res.status(500).json({ error: "Couple data missing" });
      return;
    }

    const allUsers = [chalC.requester_id, chalC.receiver_id, oppC.requester_id, oppC.receiver_id];
    if (!allUsers.includes(userId)) {
      res.status(403).json({ error: "You are not part of this battle" });
      return;
    }

    const iAmChallenger = [chalC.requester_id, chalC.receiver_id].includes(userId);
    const myCouple = iAmChallenger ? chalC : oppC;
    const theirCouple = iAmChallenger ? oppC : chalC;

    const questionIds: string[] = b.question_ids ?? [];
    const [questionsRes, answersRes] = await Promise.all([
      sb.from("game_questions").select("id, text, option_a, option_b").in("id", questionIds),
      sb.from("battle_answers").select("user_id, question_id, answer").eq("battle_id", battleId),
    ]);

    const questions = (questionsRes.data ?? []) as any[];
    const answers = (answersRes.data ?? []) as { user_id: string; question_id: string; answer: string }[];

    const lookup = new Map<string, string>();
    for (const a of answers) lookup.set(`${a.user_id}:${a.question_id}`, a.answer);

    let myScore = 0;
    let theirScore = 0;
    const perQuestion = questionIds.map((qid) => {
      const q = questions.find((x: any) => x.id === qid);
      const myA = lookup.get(`${myCouple.requester_id}:${qid}`);
      const myB = lookup.get(`${myCouple.receiver_id}:${qid}`);
      const theirA = lookup.get(`${theirCouple.requester_id}:${qid}`);
      const theirB = lookup.get(`${theirCouple.receiver_id}:${qid}`);
      const myMatch = Boolean(myA && myB && myA === myB);
      const theirMatch = Boolean(theirA && theirB && theirA === theirB);
      if (myMatch) myScore++;
      if (theirMatch) theirScore++;
      return {
        questionId: qid,
        text: q?.text ?? "",
        option_a: q?.option_a ?? "Me",
        option_b: q?.option_b ?? "My partner",
        myAnswer_requester: myA ?? null,
        myAnswer_receiver: myB ?? null,
        myMatched: myMatch,
      };
    });

    const names = await getProfileNames(sb, [
      myCouple.requester_id, myCouple.receiver_id,
      theirCouple.requester_id, theirCouple.receiver_id,
    ]);

    res.json({
      status: b.status,
      myScore,
      theirScore,
      totalQuestions: questionIds.length,
      iWon: b.winner_couple_id === myCouple.id,
      isTie: b.status === "completed" && b.winner_couple_id === null,
      myCoupleName: coupleName(names, myCouple),
      theirCoupleName: coupleName(names, theirCouple),
      perQuestion,
      completedAt: b.completed_at,
    });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-games/results error");
    res.status(500).json({ error: "Failed to load results" });
  }
});

// ── GET /couple-games/couples/search?q=&userId= ───────────────────────────────
router.get("/couples/search", async (req, res) => {
  const { q, userId } = req.query as { q?: string; userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const sb = makeSupabase();
  try {
    const myCouple = await getCoupleForUser(sb, userId);
    // Only apply exclude when we have a real UUID — passing "" to .neq on a UUID
    // column causes a Postgres cast error and silently returns null data.
    const excludeId = myCouple?.id ?? null;

    req.log.info({ userId, q, excludeId }, "couple-games/search: params");

    const searchTerm = (q ?? "").trim().toLowerCase();

    // Step 1: Find profiles matching the search term (or all if no term).
    let profileQuery = sb
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .neq("id", userId)
      .limit(50);
    if (searchTerm) {
      profileQuery = profileQuery.or(`username.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`);
    }
    const { data: matchedProfiles, error: pErr } = await profileQuery;
    req.log.info({ matched: matchedProfiles?.length ?? 0, pErr: pErr?.message ?? null }, "couple-games/search: profiles query");

    if (!matchedProfiles || matchedProfiles.length === 0) {
      res.json({ couples: [] });
      return;
    }

    // Step 2: Find accepted couple_links where at least one partner matched.
    const profileIds = (matchedProfiles as any[]).map((p) => p.id as string);
    const orFilter = profileIds.map((id) => `requester_id.eq.${id},receiver_id.eq.${id}`).join(",");

    let coupleQuery = sb
      .from("couple_links")
      .select("id, requester_id, receiver_id")
      .or(orFilter)
      .eq("status", "accepted");
    if (excludeId) {
      coupleQuery = coupleQuery.neq("id", excludeId);
    }
    const { data: coupleLinks, error: clErr } = await coupleQuery;
    req.log.info({ coupleLinksCount: coupleLinks?.length ?? 0, clErr: clErr?.message ?? null }, "couple-games/search: couple_links query");

    if (!coupleLinks || coupleLinks.length === 0) {
      res.json({ couples: [] });
      return;
    }

    // Step 3: Collect ALL user IDs from found couples — not just the search-matched ones.
    // This ensures the partner who didn't match the search term is still resolved.
    const allUserIds = [
      ...new Set(
        (coupleLinks as any[]).flatMap((l) => [l.requester_id as string, l.receiver_id as string])
      ),
    ];

    // Build initial nameMap from the already-fetched profiles.
    const nameMap: Record<string, any> = {};
    for (const p of (matchedProfiles as any[])) nameMap[p.id as string] = p;

    // Fetch any partner profiles that weren't in the search results.
    const missing = allUserIds.filter((id) => !nameMap[id]);
    if (missing.length > 0) {
      const { data: extraProfiles } = await sb
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .in("id", missing);
      for (const p of (extraProfiles ?? []) as any[]) nameMap[p.id as string] = p;
    }

    req.log.info({ nameMapSize: Object.keys(nameMap).length, missing: missing.length }, "couple-games/search: profile resolution");

    // Step 4: Build couple result list.
    const seen = new Set<string>();
    const couples: {
      coupleId: string;
      partner1: { id: string; name: string; username: string; avatar_url: string | null };
      partner2: { id: string; name: string; username: string; avatar_url: string | null };
    }[] = [];

    for (const link of coupleLinks as any[]) {
      if (seen.has(link.id as string)) continue;
      seen.add(link.id as string);

      const r1 = nameMap[link.requester_id as string] ?? { id: link.requester_id, full_name: null, username: null, avatar_url: null };
      const r2 = nameMap[link.receiver_id as string]  ?? { id: link.receiver_id,  full_name: null, username: null, avatar_url: null };

      couples.push({
        coupleId: link.id,
        partner1: {
          id: link.requester_id,
          name: r1.full_name || r1.username || "Unknown",
          username: r1.username || "",
          avatar_url: r1.avatar_url ?? null,
        },
        partner2: {
          id: link.receiver_id,
          name: r2.full_name || r2.username || "Unknown",
          username: r2.username || "",
          avatar_url: r2.avatar_url ?? null,
        },
      });
    }

    req.log.info({ couplesReturned: couples.length }, "couple-games/search: done");
    res.json({ couples });
  } catch (err: any) {
    req.log.error({ err: err.message }, "couple-games/couples search error");
    res.status(500).json({ error: "Failed to search couples" });
  }
});

export default router;
