import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  BattleSummary,
  CoupleSearchResult,
  createChallenge,
  listMyBattles,
  searchCouples,
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
  danger: "#f87171",
  warning: "#fbbf24",
};

function statusColor(s: BattleSummary["status"]) {
  switch (s) {
    case "active":    return P.accent;
    case "pending":   return P.warning;
    case "completed": return P.success;
    case "declined":  return P.danger;
    case "expired":   return P.muted;
    default:          return P.muted;
  }
}

function statusLabel(b: BattleSummary) {
  if (b.status === "active" && b.isMyTurn) return "YOUR TURN";
  if (b.status === "active")              return "WAITING";
  if (b.status === "pending" && !b.iAmChallenger) return "ACCEPT?";
  if (b.status === "pending")             return "PENDING";
  if (b.status === "completed" && b.iWon) return "WON 🏆";
  if (b.status === "completed" && b.isTie) return "TIE 🤝";
  if (b.status === "completed")           return "LOST";
  return b.status.toUpperCase();
}

function BattleRow({ item, userId, onPress }: { item: BattleSummary; userId: string; onPress: () => void }) {
  const color = statusColor(item.status);
  return (
    <TouchableOpacity style={s.battleCard} onPress={onPress} activeOpacity={0.75}>
      <View style={s.battleLeft}>
        <Text style={s.battleOpponent}>{item.opponentCoupleName}</Text>
        <Text style={s.battleMeta}>
          {item.status === "active"
            ? `${item.myAnswerCount}/${item.totalQuestions} answered`
            : item.status === "completed"
            ? `Tap to see results`
            : item.status === "pending" && !item.iAmChallenger
            ? "Challenge received!"
            : "Waiting for response"}
        </Text>
      </View>
      <View style={[s.statusBadge, { borderColor: color }]}>
        <Text style={[s.statusText, { color }]}>{statusLabel(item)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function QuizBattleScreen() {
  const insets = useSafeAreaInsets();
  const { coupleId, userId } = useLocalSearchParams<{ coupleId: string; userId: string }>();

  const [battles, setBattles] = useState<BattleSummary[]>([]);
  const [myCoupleId, setMyCoupleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [challengeOpen, setChallengeOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<CoupleSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [challenging, setChallenging] = useState(false);
  const [challengeError, setChallengeError] = useState("");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBattles = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    try {
      const result = await listMyBattles(userId);
      setBattles(result.battles);
      setMyCoupleId(result.myCoupleId ?? "");
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { loadBattles(); }, [loadBattles]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadBattles(true);
  }, [loadBattles]);

  const doSearch = useCallback((q: string) => {
    if (!userId) return;
    setSearchLoading(true);
    searchCouples(userId, q)
      .then((r) => setSearchResults(r.couples))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, [userId]);

  const handleSearchChange = (q: string) => {
    setSearchQ(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(q), 400);
  };

  const handleChallenge = async (opponentCoupleId: string) => {
    if (!userId) return;
    setChallenging(true);
    setChallengeError("");
    try {
      await createChallenge(userId, opponentCoupleId);
      setChallengeOpen(false);
      setSearchQ("");
      setSearchResults([]);
      await loadBattles(true);
    } catch (e: any) {
      setChallengeError(e.message ?? "Failed to send challenge");
    } finally {
      setChallenging(false);
    }
  };

  const openChallenge = () => {
    setChallengeOpen(true);
    setChallengeError("");
    setSearchQ("");
    doSearch("");
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={P.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Couple Quiz Battle ⚔️</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={P.accent} />
        </View>
      ) : (
        <FlatList
          data={battles}
          keyExtractor={(b) => b.id}
          contentContainerStyle={s.listContent}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListHeaderComponent={
            <View style={s.listHeader}>
              <TouchableOpacity style={s.challengeBtn} onPress={openChallenge} activeOpacity={0.8}>
                <Ionicons name="add-circle-outline" size={18} color="#000" />
                <Text style={s.challengeBtnText}>Challenge a Couple</Text>
              </TouchableOpacity>
              {battles.length > 0 && (
                <Text style={s.sectionLabel}>YOUR BATTLES</Text>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>⚔️</Text>
              <Text style={s.emptyTitle}>No battles yet</Text>
              <Text style={s.emptyBody}>Challenge another couple to find out who's most in sync!</Text>
            </View>
          }
          renderItem={({ item }) => (
            <BattleRow
              item={item}
              userId={userId ?? ""}
              onPress={() =>
                router.push({
                  pathname: "/couple/games/[battleId]" as any,
                  params: { battleId: item.id, userId, myCoupleId },
                })
              }
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={challengeOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setChallengeOpen(false)}
      >
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Challenge a Couple</Text>
            <TouchableOpacity onPress={() => setChallengeOpen(false)} style={s.modalClose}>
              <Ionicons name="close" size={22} color={P.text} />
            </TouchableOpacity>
          </View>

          <View style={s.searchRow}>
            <Ionicons name="search" size={16} color={P.muted} style={{ marginLeft: 14 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Search by username..."
              placeholderTextColor={P.muted}
              value={searchQ}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoFocus
            />
            {searchLoading && (
              <ActivityIndicator size="small" color={P.accent} style={{ marginRight: 12 }} />
            )}
          </View>

          {challengeError !== "" && (
            <Text style={s.errorText}>{challengeError}</Text>
          )}

          <FlatList
            data={searchResults}
            keyExtractor={(c) => c.coupleId}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              !searchLoading ? (
                <View style={s.center}>
                  <Text style={s.emptyBody}>
                    {searchQ ? "No couples found" : "Search to find couples"}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.coupleRow}
                onPress={() => handleChallenge(item.coupleId)}
                activeOpacity={0.75}
                disabled={challenging}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.coupleName}>
                    {item.partner1.name} & {item.partner2.name}
                  </Text>
                  <Text style={s.coupleUsernames}>
                    @{item.partner1.username} · @{item.partner2.username}
                  </Text>
                </View>
                {challenging ? (
                  <ActivityIndicator size="small" color={P.accent} />
                ) : (
                  <View style={s.challengeRowBtn}>
                    <Text style={s.challengeRowBtnText}>Challenge</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
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
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: P.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  listHeader: { paddingTop: 16, paddingBottom: 8 },
  challengeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  challengeBtnText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#000000" },
  sectionLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: P.muted,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  battleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: P.card,
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: P.border,
  },
  battleLeft: { flex: 1, marginRight: 12 },
  battleOpponent: { fontFamily: "Poppins_700Bold", fontSize: 15, color: P.text, marginBottom: 3 },
  battleMeta: { fontFamily: "Poppins_400Regular", fontSize: 12, color: P.muted },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: { fontFamily: "Poppins_700Bold", fontSize: 10, letterSpacing: 0.5 },
  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: P.text, marginBottom: 8 },
  emptyBody: { fontFamily: "Poppins_400Regular", fontSize: 14, color: P.muted, textAlign: "center" },
  modalContainer: { flex: 1, backgroundColor: P.bg },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, color: P.text },
  modalClose: { padding: 4 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: P.card,
    borderRadius: 14,
    margin: 16,
    height: 48,
    borderWidth: 1,
    borderColor: P.border,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 12,
    color: P.text,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
  },
  errorText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: P.danger,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  coupleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: P.card,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: P.border,
  },
  coupleName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: P.text, marginBottom: 2 },
  coupleUsernames: { fontFamily: "Poppins_400Regular", fontSize: 12, color: P.muted },
  challengeRowBtn: {
    backgroundColor: P.accentDim,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: P.accent,
  },
  challengeRowBtnText: { fontFamily: "Poppins_700Bold", fontSize: 12, color: P.accent },
});
