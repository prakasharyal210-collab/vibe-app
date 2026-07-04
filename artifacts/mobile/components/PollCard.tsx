import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "");

export interface PollOption {
  id: string;
  label: string;
  position: number;
  votes: number;
}

export interface PollData {
  id: string;
  question: string | null;
  ends_at: string;
  options: PollOption[];
  totalVotes: number;
  viewerVote: string | null;
}

interface Props {
  poll: PollData;
  userId: string | null;
}

function timeLeft(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Final results";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "< 1h left";
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

export default function PollCard({ poll, userId }: Props) {
  const [options, setOptions] = useState<PollOption[]>(poll.options);
  const [totalVotes, setTotalVotes] = useState(poll.totalVotes);
  const [viewerVote, setViewerVote] = useState<string | null>(poll.viewerVote);
  const [loading, setLoading] = useState<string | null>(null);

  const isEnded = new Date(poll.ends_at) <= new Date();
  const showResults = isEnded || viewerVote !== null;

  const leadingId =
    showResults && totalVotes > 0
      ? [...options].sort((a, b) => b.votes - a.votes)[0]?.id ?? null
      : null;

  const handleVote = async (optionId: string) => {
    if (!userId || isEnded || loading || showResults) return;
    setLoading(optionId);

    const prevOpts = options;
    const prevTotal = totalVotes;
    const prevVote = viewerVote;

    // Optimistic update
    setViewerVote(optionId);
    setTotalVotes((t) => t + 1);
    setOptions((opts) =>
      opts.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o)),
    );

    try {
      const res = await fetch(`${API_BASE}/api/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId, userId }),
      });
      const data = await res.json();
      if (res.ok && data.poll) {
        setOptions(data.poll.options);
        setTotalVotes(data.poll.totalVotes);
        setViewerVote(data.poll.viewerVote);
      } else {
        setOptions(prevOpts);
        setTotalVotes(prevTotal);
        setViewerVote(prevVote);
      }
    } catch {
      setOptions(prevOpts);
      setTotalVotes(prevTotal);
      setViewerVote(prevVote);
    } finally {
      setLoading(null);
    }
  };

  return (
    <View style={s.container}>
      {poll.question ? <Text style={s.question}>{poll.question}</Text> : null}

      {options.map((opt) => {
        const pct =
          totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
        const isChosen = viewerVote === opt.id;
        const isLeading = leadingId === opt.id;

        if (showResults) {
          return (
            <View key={opt.id} style={s.resultRow}>
              {isLeading ? (
                <LinearGradient
                  colors={["#7C3AED", "#EA580C"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[s.bar, { width: `${Math.max(pct, 4)}%` as any }]}
                />
              ) : (
                <View
                  style={[
                    s.bar,
                    s.barMuted,
                    { width: `${Math.max(pct, 2)}%` as any },
                  ]}
                />
              )}
              <View style={s.resultLabelRow}>
                <Text
                  style={[s.optText, isChosen && s.optTextChosen]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
                <View style={s.resultRight}>
                  {isChosen && (
                    <Ionicons
                      name="checkmark-circle"
                      size={13}
                      color="#A78BFA"
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text style={s.pctText}>{pct}%</Text>
                </View>
              </View>
            </View>
          );
        }

        return (
          <TouchableOpacity
            key={opt.id}
            style={[s.voteBtn, loading === opt.id && { opacity: 0.5 }]}
            onPress={() => handleVote(opt.id)}
            activeOpacity={userId ? 0.75 : 1}
            disabled={!userId || !!loading}
          >
            <Text style={s.optText} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}

      <View style={s.footer}>
        <Text style={s.footerText}>
          {totalVotes === 1 ? "1 vote" : `${totalVotes} votes`}
        </Text>
        <Text style={s.footerDot}>·</Text>
        <Text style={s.footerText}>{timeLeft(poll.ends_at)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 4,
    gap: 7,
  },
  question: {
    color: "#fff",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    marginBottom: 2,
  },
  voteBtn: {
    borderWidth: 1.5,
    borderColor: "rgba(167,139,250,0.35)",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(124,58,237,0.06)",
  },
  optText: {
    color: "#fff",
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  optTextChosen: { color: "#A78BFA" },
  resultRow: {
    height: 40,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 10,
  },
  barMuted: { backgroundColor: "rgba(255,255,255,0.12)" },
  resultLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    height: 40,
  },
  resultRight: { flexDirection: "row", alignItems: "center" },
  pctText: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  footerText: {
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  footerDot: { color: "rgba(255,255,255,0.2)", fontSize: 12 },
});
