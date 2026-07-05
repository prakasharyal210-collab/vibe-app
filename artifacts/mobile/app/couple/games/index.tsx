import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

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
};

interface GameCardProps {
  emoji: string;
  title: string;
  sub: string;
  locked?: boolean;
  onPress?: () => void;
}

function GameCard({ emoji, title, sub, locked, onPress }: GameCardProps) {
  return (
    <TouchableOpacity
      style={[s.card, locked && s.cardLocked]}
      onPress={locked ? undefined : onPress}
      activeOpacity={locked ? 1 : 0.7}
    >
      <View style={s.iconTile}>
        <Text style={s.tileEmoji}>{emoji}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={s.cardTitle}>{title}</Text>
        <Text style={s.cardSub}>{sub}</Text>
      </View>
      {locked ? (
        <View style={s.lockBadge}>
          <Ionicons name="lock-closed" size={12} color={P.muted} />
          <Text style={s.lockText}>Soon</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={P.chevron} />
      )}
    </TouchableOpacity>
  );
}

export default function CoupleGamesHub() {
  const insets = useSafeAreaInsets();
  const { coupleId, userId } = useLocalSearchParams<{ coupleId: string; userId: string }>();

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={P.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Couple Games</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.heroBanner}>
          <Text style={s.heroEmoji}>🎮</Text>
          <Text style={s.heroTitle}>Play Together</Text>
          <Text style={s.heroSub}>Challenge other couples and see who's most in sync</Text>
        </View>

        <Text style={s.sectionLabel}>AVAILABLE</Text>
        <GameCard
          emoji="⚔️"
          title="Couple Quiz Battle"
          sub="How in-sync are you two vs them?"
          onPress={() =>
            router.push({
              pathname: "/couple/games/quiz" as any,
              params: { coupleId, userId },
            })
          }
        />

        <Text style={[s.sectionLabel, { marginTop: 24 }]}>COMING SOON</Text>
        <GameCard
          emoji="🔀"
          title="This or That"
          sub="Pick your preferences together"
          locked
        />
        <GameCard
          emoji="📷"
          title="Photo Challenge"
          sub="Weekly photo prompts for couples"
          locked
        />
        <GameCard
          emoji="💣"
          title="Truth Bombs"
          sub="Deep questions you might be afraid to ask"
          locked
        />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },
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
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, color: P.text },
  content: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 },
  heroBanner: {
    alignItems: "center",
    paddingVertical: 28,
    marginBottom: 8,
    backgroundColor: P.accentDim,
    borderRadius: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.25)",
  },
  heroEmoji: { fontSize: 44, marginBottom: 8 },
  heroTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: P.text },
  heroSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: P.muted,
    textAlign: "center",
    paddingHorizontal: 24,
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: P.muted,
    letterSpacing: 1.2,
    marginTop: 20,
    marginBottom: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: P.card,
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: P.border,
  },
  cardLocked: { opacity: 0.5 },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: P.iconTile,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tileEmoji: { fontSize: 22, textAlign: "center" },
  cardTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, color: P.text, marginBottom: 2 },
  cardSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: P.muted },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lockText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: P.muted },
});
