import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  BattleQuestion,
  BattleResults,
  PerQuestionResult,
  getBattleQuestions,
  getBattleResults,
  respondToBattle,
  submitAnswer,
} from "@/lib/coupleGamesApi";

const P = {
  bg: "#000000",
  card: "#141414",
  iconTile: "#1f1f1f",
  text: "#ffffff",
  muted: "#888888",
  chevron: "#555555",
  border: "rgba(255,255,255,0.08)",
  accent: "#c084fc",
  accentDim: "rgba(192,132,252,0.15)",
  success: "#4ade80",
  successDim: "rgba(74,222,128,0.15)",
  danger: "#f87171",
  dangerDim: "rgba(248,113,113,0.12)",
  warning: "#fbbf24",
};

type Screen = "loading" | "respond" | "questions" | "results" | "error";

export default function BattleScreen() {
  const insets = useSafeAreaInsets();
  const { battleId, userId, myCoupleId } = useLocalSearchParams<{
    battleId: string;
    userId: string;
    myCoupleId: string;
  }>();

  const [screen, setScreen] = useState<Screen>("loading");
  const [error, setError] = useState("");

  const [status, setStatus]         = useState<string>("");
  const [iAmChallenger, setIAmChallenger] = useState(false);
  const [questions, setQuestions]   = useState<BattleQuestion[]>([]);
  const [answers, setAnswers]       = useState<Record<string, "A" | "B">>({});
  const [saving, setSaving]         = useState<Record<string, boolean>>({});

  const [results, setResults] = useState<BattleResults | null>(null);

  const [responding, setResponding] = useState(false);

  const load = useCallback(async () => {
    if (!battleId || !userId) return;
    setScreen("loading");
    try {
      const qData = await getBattleQuestions(battleId, userId);
      setStatus(qData.status);
      setAnswers(qData.myAnswers ?? {});

      if (qData.status === "pending") {
        const answeredCount = Object.keys(qData.myAnswers ?? {}).length;
        const isOpponent = answeredCount === 0;
        setIAmChallenger(!isOpponent);
        setScreen("respond");
        return;
      }

      if (qData.status === "active") {
        setQuestions(qData.questions);
        setScreen("questions");
        return;
      }

      const r = await getBattleResults(battleId, userId);
      setResults(r);
      setScreen("results");
    } catch (e: any) {
      setError(e.message ?? "Failed to load battle");
      setScreen("error");
    }
  }, [battleId, userId]);

  useEffect(() => { load(); }, [load]);

  const handleRespond = async (accept: boolean) => {
    if (!battleId || !userId) return;
    setResponding(true);
    try {
      await respondToBattle(battleId, userId, accept);
      if (accept) {
        const qData = await getBattleQuestions(battleId, userId);
        setStatus("active");
        setQuestions(qData.questions);
        setAnswers(qData.myAnswers ?? {});
        setScreen("questions");
      } else {
        router.back();
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to respond");
    } finally {
      setResponding(false);
    }
  };

  const handleAnswer = async (questionId: string, answer: "A" | "B") => {
    if (!battleId || !userId) return;
    setSaving((prev) => ({ ...prev, [questionId]: true }));
    const prev = answers[questionId];
    setAnswers((a) => ({ ...a, [questionId]: answer }));
    try {
      const res = await submitAnswer(battleId, userId, questionId, answer);
      if (res.completed) {
        const r = await getBattleResults(battleId, userId);
        setResults(r);
        setScreen("results");
      }
    } catch {
      setAnswers((a) => {
        const next = { ...a };
        if (prev === undefined) delete next[questionId];
        else next[questionId] = prev;
        return next;
      });
    } finally {
      setSaving((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const answeredCount = Object.keys(answers).length;
  const totalCount = questions.length;
  const allDone = totalCount > 0 && answeredCount >= totalCount;

  if (screen === "loading") {
    return (
      <View style={[s.container, { paddingTop: insets.top }, s.center]}>
        <ActivityIndicator color={P.accent} size="large" />
      </View>
    );
  }

  if (screen === "error") {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <Header title="Battle" />
        <View style={s.center}>
          <Text style={s.errorEmoji}>😕</Text>
          <Text style={s.errorTitle}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load}>
            <Text style={s.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === "respond") {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <Header title="Challenge Received!" />
        <View style={s.center}>
          <Text style={{ fontSize: 52, marginBottom: 16 }}>⚔️</Text>
          <Text style={s.respondTitle}>You've been challenged!</Text>
          <Text style={s.respondSub}>
            Answer 10 questions about your relationship and see who's most in sync.
          </Text>
          {error !== "" && <Text style={s.errorSmall}>{error}</Text>}
          <TouchableOpacity
            style={s.acceptBtn}
            onPress={() => handleRespond(true)}
            disabled={responding}
            activeOpacity={0.8}
          >
            {responding ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.acceptBtnText}>Accept Challenge</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.declineBtn}
            onPress={() => handleRespond(false)}
            disabled={responding}
            activeOpacity={0.8}
          >
            <Text style={s.declineBtnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === "questions") {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <Header title={allDone ? "Waiting for others…" : `${answeredCount}/${totalCount} answered`} />
        <ScrollView contentContainerStyle={s.questionsList} showsVerticalScrollIndicator={false}>
          {allDone && (
            <View style={s.waitingBanner}>
              <Text style={s.waitingEmoji}>⏳</Text>
              <Text style={s.waitingText}>
                You're done! Waiting for all players to finish. Results will appear automatically.
              </Text>
            </View>
          )}
          {questions.map((q, i) => {
            const myAnswer = answers[q.id];
            const isSaving = saving[q.id];
            return (
              <View key={q.id} style={s.questionCard}>
                <Text style={s.questionNum}>Q{i + 1}</Text>
                <Text style={s.questionText}>{q.text}</Text>
                <View style={s.optionRow}>
                  <TouchableOpacity
                    style={[
                      s.optionBtn,
                      myAnswer === "A" && s.optionSelected,
                    ]}
                    onPress={() => handleAnswer(q.id, "A")}
                    disabled={isSaving}
                    activeOpacity={0.7}
                  >
                    {isSaving && myAnswer === "A" ? (
                      <ActivityIndicator size="small" color={P.accent} />
                    ) : (
                      <Text style={[s.optionText, myAnswer === "A" && s.optionTextSelected]}>
                        {q.option_a}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      s.optionBtn,
                      myAnswer === "B" && s.optionSelected,
                    ]}
                    onPress={() => handleAnswer(q.id, "B")}
                    disabled={isSaving}
                    activeOpacity={0.7}
                  >
                    {isSaving && myAnswer === "B" ? (
                      <ActivityIndicator size="small" color={P.accent} />
                    ) : (
                      <Text style={[s.optionText, myAnswer === "B" && s.optionTextSelected]}>
                        {q.option_b}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  if (screen === "results" && results) {
    const didWin = results.iWon;
    const isTie  = results.isTie;
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <Header title="Results" />
        <ScrollView contentContainerStyle={s.resultsList} showsVerticalScrollIndicator={false}>
          <View style={s.scoreBanner}>
            <View style={s.scoreBlock}>
              <Text style={s.scoreName}>{results.myCoupleName}</Text>
              <Text style={s.scoreNum}>{results.myScore}</Text>
              <Text style={s.scoreLabel}>/{results.totalQuestions} in sync</Text>
            </View>
            <Text style={s.scoreVs}>VS</Text>
            <View style={s.scoreBlock}>
              <Text style={s.scoreName}>{results.theirCoupleName}</Text>
              <Text style={s.scoreNum}>{results.theirScore}</Text>
              <Text style={s.scoreLabel}>/{results.totalQuestions} in sync</Text>
            </View>
          </View>

          <View style={[
            s.outcomeChip,
            didWin ? s.outcomeWon : isTie ? s.outcomeTie : s.outcomeLost,
          ]}>
            <Text style={s.outcomeText}>
              {didWin ? "🏆 You won!" : isTie ? "🤝 It's a tie!" : "Better luck next time 💪"}
            </Text>
          </View>

          <Text style={s.sectionLabel}>YOUR COUPLE'S ANSWERS</Text>
          {results.perQuestion.map((pq: PerQuestionResult, i: number) => (
            <View key={pq.questionId} style={[s.resultRow, pq.myMatched ? s.resultMatch : s.resultMiss]}>
              <View style={s.resultIcon}>
                {pq.myMatched
                  ? <Ionicons name="checkmark-circle" size={20} color={P.success} />
                  : <Ionicons name="close-circle" size={20} color={P.danger} />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.resultQ}>Q{i + 1}. {pq.text}</Text>
                <Text style={s.resultA}>
                  {pq.myAnswer_requester
                    ? `You: ${pq.myAnswer_requester === "A" ? pq.option_a : pq.option_b}`
                    : "No answer"}
                  {"  ·  "}
                  {pq.myAnswer_receiver
                    ? `Partner: ${pq.myAnswer_receiver === "A" ? pq.option_a : pq.option_b}`
                    : "No answer"}
                </Text>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={s.rematachBtn}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <Ionicons name="refresh" size={16} color={P.accent} />
            <Text style={s.rematchText}>Challenge Another Couple</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return null;
}

function Header({ title }: { title: string }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
        <Ionicons name="chevron-back" size={22} color={P.text} />
      </TouchableOpacity>
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: P.text, flex: 1, textAlign: "center" },

  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorTitle: { fontFamily: "Poppins_400Regular", fontSize: 15, color: P.muted, textAlign: "center", marginBottom: 20 },
  errorSmall: { fontFamily: "Poppins_400Regular", fontSize: 13, color: P.danger, marginBottom: 12, textAlign: "center" },
  retryBtn: {
    backgroundColor: P.card,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: P.border,
  },
  retryText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: P.text },

  respondTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: P.text, marginBottom: 10, textAlign: "center" },
  respondSub: { fontFamily: "Poppins_400Regular", fontSize: 14, color: P.muted, textAlign: "center", marginBottom: 28 },
  acceptBtn: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginBottom: 12,
    width: "100%",
    alignItems: "center",
  },
  acceptBtnText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#000000" },
  declineBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderWidth: 1,
    borderColor: P.border,
    width: "100%",
    alignItems: "center",
  },
  declineBtnText: { fontFamily: "Poppins_400Regular", fontSize: 15, color: P.muted },

  questionsList: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 },
  waitingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: P.accentDim,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.25)",
  },
  waitingEmoji: { fontSize: 22 },
  waitingText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 13, color: P.accent },
  questionCard: {
    backgroundColor: P.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: P.border,
  },
  questionNum: { fontFamily: "Poppins_700Bold", fontSize: 11, color: P.accent, letterSpacing: 1, marginBottom: 6 },
  questionText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: P.text, marginBottom: 14, lineHeight: 22 },
  optionRow: { flexDirection: "row", gap: 10 },
  optionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: P.iconTile,
    alignItems: "center",
    borderWidth: 1,
    borderColor: P.border,
    minHeight: 44,
    justifyContent: "center",
  },
  optionSelected: {
    backgroundColor: P.accentDim,
    borderColor: P.accent,
  },
  optionText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: P.muted },
  optionTextSelected: { color: P.accent },

  resultsList: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 },
  scoreBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: P.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: P.border,
  },
  scoreBlock: { flex: 1, alignItems: "center" },
  scoreName: { fontFamily: "Poppins_400Regular", fontSize: 12, color: P.muted, marginBottom: 6, textAlign: "center" },
  scoreNum: { fontFamily: "Poppins_700Bold", fontSize: 36, color: P.text },
  scoreLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: P.muted },
  scoreVs: { fontFamily: "Poppins_700Bold", fontSize: 14, color: P.muted, paddingHorizontal: 12 },
  outcomeChip: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
  },
  outcomeWon: { backgroundColor: P.successDim, borderColor: P.success },
  outcomeTie: { backgroundColor: P.accentDim, borderColor: P.accent },
  outcomeLost: { backgroundColor: P.dangerDim, borderColor: P.danger },
  outcomeText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: P.text },
  sectionLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: P.muted,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: P.card,
    borderRadius: 12,
    padding: 13,
    marginBottom: 8,
    borderWidth: 1,
    gap: 10,
  },
  resultMatch: { borderColor: "rgba(74,222,128,0.2)" },
  resultMiss:  { borderColor: "rgba(248,113,113,0.15)" },
  resultIcon: { paddingTop: 2 },
  resultQ: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: P.text, marginBottom: 4, lineHeight: 19 },
  resultA: { fontFamily: "Poppins_400Regular", fontSize: 12, color: P.muted },
  rematachBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: P.accent,
    backgroundColor: P.accentDim,
  },
  rematchText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: P.accent },
});
