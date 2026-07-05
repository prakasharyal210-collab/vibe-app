import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useColors } from "@/hooks/useColors";
import { fetchLeaderboard, LeaderboardEntry } from "@/lib/db";

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

type Period = "weekly" | "monthly" | "alltime";

// MOCK_LEADERBOARD removed — screen shows real data only or an empty state.

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Text style={styles.medal}>👑</Text>;
  if (rank === 2) return <Text style={styles.medal}>🥇</Text>;
  if (rank === 3) return <Text style={styles.medal}>🥈</Text>;
  if (rank === 4) return <Text style={styles.medal}>🥉</Text>;
  return (
    <View style={styles.rankCircle}>
      <Text style={styles.rankNum}>#{rank}</Text>
    </View>
  );
}

function LeaderboardRow({ entry, index, maxScore }: { entry: LeaderboardEntry; index: number; maxScore: number }) {
  const colors = useColors();
  const slideAnim = useRef(new Animated.Value(40)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 350, delay: index * 60, useNativeDriver: false }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: false }),
    ]).start();
  }, []);

  const isTop3 = entry.rank <= 3;

  return (
    <Animated.View style={{ transform: [{ translateX: slideAnim }], opacity: opacityAnim }}>
      <TouchableOpacity
        onPress={() => entry.profiles?.username && router.push(`/profile/${entry.profiles.username}` as any)}
        style={[
          styles.row,
          { borderBottomColor: colors.border },
          isTop3 && styles.top3Row,
        ]}
        activeOpacity={0.75}
      >
        {isTop3 && (
          <LinearGradient
            colors={
              entry.rank === 1
                ? ["rgba(245,158,11,0.15)", "transparent"]
                : entry.rank === 2
                ? ["rgba(156,163,175,0.15)", "transparent"]
                : ["rgba(180,83,9,0.15)", "transparent"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        <RankBadge rank={entry.rank} />

        <UserAvatar
          username={entry.profiles?.username}
          url={entry.profiles?.avatar_url}
          size={44}
          showBorder={isTop3}
        />

        <View style={styles.rowInfo}>
          <Text style={[styles.username, { color: colors.foreground }]}>
            {entry.profiles?.username ?? "user"}
          </Text>
          <View style={styles.scoreBar}>
            <LinearGradient
              colors={["#7C3AED", "#F97316"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.scoreBarFill,
                { width: `${Math.min(100, (entry.score / maxScore) * 100)}%` as any },
              ]}
            />
          </View>
        </View>

        <View style={styles.scoreWrap}>
          <Text style={styles.scoreText}>{entry.score.toLocaleString()}</Text>
          <Text style={styles.scoreLabel}>pts</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function LeaderboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [period, setPeriod] = useState<Period>("weekly");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const [countdown, setCountdown] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchLeaderboard(period);
    setEntries(data);
    setLastRefreshed(Date.now());
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const tick = setInterval(() => {
      const elapsed = Date.now() - lastRefreshed;
      const remaining = REFRESH_INTERVAL_MS - elapsed;
      if (remaining <= 0) { setCountdown("Refreshing..."); return; }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setCountdown(`Refreshes in ${m}:${String(s).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(tick);
  }, [lastRefreshed]);

  const PERIODS: { key: Period; label: string }[] = [
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "alltime", label: "All Time" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["rgba(124,58,237,0.25)", "transparent"]}
        style={[styles.topGlow, { height: topInset + 160 }]}
      />

      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={[styles.title, { color: colors.foreground }]}>🏆 Leaderboard</Text>
          <Text style={[styles.countdown, { color: colors.mutedForeground }]}>{countdown}</Text>
        </View>
        <TouchableOpacity onPress={load} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            onPress={() => setPeriod(p.key)}
            style={[styles.periodTab, period === p.key && styles.periodTabActive]}
          >
            {period === p.key ? (
              <LinearGradient
                colors={["#7C3AED", "#F97316"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
              />
            ) : null}
            <Text style={[styles.periodLabel, { color: period === p.key ? "#fff" : colors.mutedForeground }]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading rankings...</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          renderItem={({ item, index }) => <LeaderboardRow entry={item} index={index} maxScore={entries[0]?.score ?? 10000} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 64 }}>
              <Text style={{ fontSize: 32, marginBottom: 12 }}>🏆</Text>
              <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Poppins_600SemiBold", marginBottom: 6 }}>No rankings yet</Text>
              <Text style={{ color: "#9CA3AF", fontSize: 13, fontFamily: "Poppins_400Regular" }}>Rankings will appear once creators start posting</Text>
            </View>
          }
          ListHeaderComponent={
            <View style={styles.podium}>
              <Text style={styles.podiumTitle}>This Week's Vibers</Text>
              <Text style={[styles.podiumSub, { color: colors.mutedForeground }]}>
                Top creators by engagement score
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topGlow: { position: "absolute", top: 0, left: 0, right: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1 },
  title: { fontSize: 20, fontFamily: "Poppins_700Bold" },
  countdown: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: -2 },
  refreshBtn: { padding: 4 },
  periodRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 22,
    padding: 4,
    gap: 4,
  },
  periodTab: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: "center",
    overflow: "hidden",
  },
  periodTabActive: {},
  periodLabel: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  podium: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  podiumTitle: { fontSize: 18, fontFamily: "Poppins_700Bold", color: "#fff" },
  podiumSub: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
    overflow: "hidden",
  },
  top3Row: { paddingVertical: 14 },
  medal: { fontSize: 28, width: 36, textAlign: "center" },
  rankCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  rankNum: { fontSize: 13, fontFamily: "Poppins_700Bold", color: "rgba(255,255,255,0.5)" },
  rowInfo: { flex: 1, gap: 6 },
  username: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  scoreBar: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  scoreBarFill: { height: 4, borderRadius: 2 },
  scoreWrap: { alignItems: "flex-end" },
  scoreText: { fontSize: 16, fontFamily: "Poppins_700Bold", color: "#7C3AED" },
  scoreLabel: { fontSize: 10, fontFamily: "Poppins_400Regular", color: "rgba(255,255,255,0.4)" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "Poppins_400Regular" },
});
