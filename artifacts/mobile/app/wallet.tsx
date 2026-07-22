import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "") + "/api";

interface CoinTransaction {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
  related_user?: { username?: string; avatar_url?: string } | null;
}

const REASON_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  referral_activated: { label: "Referral bonus",   icon: "gift-outline",       color: "#7C3AED" },
  daily_reward:       { label: "Daily reward",      icon: "sunny-outline",      color: "#F59E0B" },
  live_gift:          { label: "Live gift",          icon: "star-outline",       color: "#EC4899" },
  reel_boost:         { label: "Reel boost",         icon: "trending-up-outline",color: "#10B981" },
};

function txMeta(reason: string) {
  return REASON_LABELS[reason] ?? { label: reason, icon: "ellipse-outline", color: "#6B7280" };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [coins, setCoins] = useState<number | null>(null);
  const [txs, setTxs] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userId = session?.user?.id;

  const load = async (silent = false) => {
    if (!userId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/wallet/balance?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const body = await res.json();
        setCoins(body.coins ?? 0);
        setTxs(body.transactions ?? []);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { void load(); }, [userId]);

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[S.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[S.headerTitle, { color: colors.foreground }]}>My Wallet</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={[S.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(true); }}
            tintColor="#7C3AED"
          />
        }
      >
        {/* Balance card */}
        <LinearGradient
          colors={["#4C1D95", "#7C3AED", "#EA580C"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={S.balanceCard}
        >
          <Text style={S.balanceLabel}>Coins balance</Text>
          {loading ? (
            <ActivityIndicator color="rgba(255,255,255,0.7)" size="large" style={{ marginVertical: 8 }} />
          ) : (
            <View style={S.balanceRow}>
              <Text style={S.coinEmoji}>🪙</Text>
              <Text style={S.balanceNum}>{(coins ?? 0).toLocaleString()}</Text>
            </View>
          )}
          <Text style={S.balanceSub}>Earn coins by inviting friends & daily rewards</Text>
        </LinearGradient>

        {/* Quick actions */}
        <View style={S.quickRow}>
          <TouchableOpacity
            style={[S.quickBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push("/invite-friends" as any)}
          >
            <Ionicons name="gift-outline" size={22} color="#7C3AED" />
            <Text style={[S.quickLabel, { color: colors.foreground }]}>Invite Friends</Text>
            <Text style={[S.quickSub, { color: colors.mutedForeground }]}>+50 coins / referral</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.quickBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push("/leaderboard" as any)}
          >
            <Ionicons name="trophy-outline" size={22} color="#F59E0B" />
            <Text style={[S.quickLabel, { color: colors.foreground }]}>Leaderboard</Text>
            <Text style={[S.quickSub, { color: colors.mutedForeground }]}>See top earners</Text>
          </TouchableOpacity>
        </View>

        {/* Transaction history */}
        <Text style={[S.sectionTitle, { color: colors.foreground }]}>Recent transactions</Text>

        {loading ? (
          <ActivityIndicator color="#7C3AED" style={{ marginTop: 24 }} />
        ) : txs.length === 0 ? (
          <View style={S.emptyState}>
            <Text style={S.emptyEmoji}>🪙</Text>
            <Text style={[S.emptyTitle, { color: colors.foreground }]}>No transactions yet</Text>
            <Text style={[S.emptySub, { color: colors.mutedForeground }]}>
              Invite friends or claim daily rewards to earn your first coins.
            </Text>
            <TouchableOpacity onPress={() => router.push("/invite-friends" as any)}>
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.emptyBtn}>
                <Text style={S.emptyBtnText}>Invite Friends</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[S.txList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {txs.map((tx, i) => {
              const meta = txMeta(tx.reason);
              const isLast = i === txs.length - 1;
              return (
                <View
                  key={tx.id}
                  style={[S.txRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                >
                  <View style={[S.txIcon, { backgroundColor: meta.color + "22" }]}>
                    <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                  </View>
                  <View style={S.txInfo}>
                    <Text style={[S.txLabel, { color: colors.foreground }]}>{meta.label}</Text>
                    {tx.related_user?.username ? (
                      <View style={S.txUserRow}>
                        <UserAvatar username={tx.related_user.username} url={tx.related_user.avatar_url} size={16} />
                        <Text style={[S.txSub, { color: colors.mutedForeground }]}>
                          @{tx.related_user.username}
                        </Text>
                      </View>
                    ) : (
                      <Text style={[S.txSub, { color: colors.mutedForeground }]}>{formatDate(tx.created_at)}</Text>
                    )}
                  </View>
                  <Text style={[S.txAmount, { color: tx.amount >= 0 ? "#22C55E" : "#EF4444" }]}>
                    {tx.amount >= 0 ? "+" : ""}{tx.amount} 🪙
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <Text style={[S.footNote, { color: colors.mutedForeground }]}>
          Coin redemption (cash-out) coming soon.{"\n"}Pull down to refresh.
        </Text>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingBottom: 12,
    borderBottomWidth: 0.5, gap: 10,
  },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: "Poppins_700Bold", textAlign: "center" },
  body: { padding: 20, gap: 18 },
  balanceCard: { borderRadius: 24, padding: 28, alignItems: "center", gap: 6 },
  balanceLabel: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 1 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  coinEmoji: { fontSize: 36 },
  balanceNum: { fontSize: 52, fontFamily: "Poppins_700Bold", color: "#fff" },
  balanceSub: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center" },
  quickRow: { flexDirection: "row", gap: 12 },
  quickBtn: {
    flex: 1, borderRadius: 16, borderWidth: 1,
    padding: 16, alignItems: "center", gap: 6,
  },
  quickLabel: { fontSize: 13, fontFamily: "Poppins_600SemiBold", textAlign: "center" },
  quickSub: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "center" },
  sectionTitle: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  emptyState: { alignItems: "center", gap: 10, paddingVertical: 32 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  emptyBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
  txList: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  txIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1, gap: 2 },
  txUserRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  txLabel: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  txSub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  txAmount: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  footNote: { fontSize: 12, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 20 },
});
