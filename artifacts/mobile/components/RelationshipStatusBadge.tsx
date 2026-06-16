import React from "react";
import { StyleSheet, Text, View } from "react-native";

export type RelationshipStatus =
  | "Single"
  | "In a Relationship"
  | "Married"
  | "Engaged"
  | "It's Complicated"
  | "Open Relationship"
  | "Divorced"
  | "Widowed";

type StatusCfg = { emoji: string; color: string; bg: string; border: string };

const STATUS_CONFIG: Record<RelationshipStatus, StatusCfg> = {
  "Single":            { emoji: "💚", color: "#22c55e",  bg: "rgba(34,197,94,0.13)",   border: "rgba(34,197,94,0.32)"   },
  "In a Relationship": { emoji: "💕", color: "#ec4899",  bg: "rgba(236,72,153,0.13)",  border: "rgba(236,72,153,0.32)"  },
  "Married":           { emoji: "💍", color: "#eab308",  bg: "rgba(234,179,8,0.13)",   border: "rgba(234,179,8,0.32)"   },
  "Engaged":           { emoji: "💎", color: "#38bdf8",  bg: "rgba(56,189,248,0.13)",  border: "rgba(56,189,248,0.32)"  },
  "It's Complicated":  { emoji: "🌀", color: "#a855f7",  bg: "rgba(168,85,247,0.13)",  border: "rgba(168,85,247,0.32)"  },
  "Open Relationship": { emoji: "🌈", color: "#f97316",  bg: "rgba(249,115,22,0.13)",  border: "rgba(249,115,22,0.32)"  },
  "Divorced":          { emoji: "🍂", color: "#c2410c",  bg: "rgba(194,65,12,0.13)",   border: "rgba(194,65,12,0.32)"   },
  "Widowed":           { emoji: "🖤", color: "#9ca3af",  bg: "rgba(156,163,175,0.13)", border: "rgba(156,163,175,0.32)" },
};

export const ALL_STATUSES: RelationshipStatus[] = [
  "Single",
  "In a Relationship",
  "Married",
  "Engaged",
  "It's Complicated",
  "Open Relationship",
  "Divorced",
  "Widowed",
];

export function getStatusConfig(status: string): StatusCfg | null {
  return STATUS_CONFIG[status as RelationshipStatus] ?? null;
}

export function RelationshipStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as RelationshipStatus];
  if (!cfg) return null;
  return (
    <View style={[st.pill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={st.emoji}>{cfg.emoji}</Text>
      <Text style={[st.label, { color: cfg.color }]}>{status}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  emoji: { fontSize: 13 },
  label: { fontFamily: "Poppins_500Medium", fontSize: 12 },
});
