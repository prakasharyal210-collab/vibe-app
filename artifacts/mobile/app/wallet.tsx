import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradientButton } from "@/components/GradientButton";
import { fetchWallet, fetchWalletTransactions, getStreakInfo, StreakInfo, WalletTransaction } from "@/lib/db";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const { width: W } = Dimensions.get("window");

const EARNINGS_DATA = [
  { day: "Mon", coins: 120 },
  { day: "Tue", coins: 340 },
  { day: "Wed", coins: 180 },
  { day: "Thu", coins: 520 },
  { day: "Fri", coins: 290 },
  { day: "Sat", coins: 780 },
  { day: "Sun", coins: 440 },
];

const MAX_COINS = Math.max(...EARNINGS_DATA.map((d) => d.coins));


const EARNING_SOURCES = [
  { icon: "🎁", label: "Live Gifts", amount: "1,248", change: "+12%", color: "#7C3AED", bg: "rgba(124,58,237,0.12)" },
  { icon: "👁", label: "Reel Views", amount: "418", change: "+34%", color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  { icon: "⚡", label: "Post Boosts", amount: "180", change: "+8%", color: "#F97316", bg: "rgba(249,115,22,0.12)" },
];

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [totalCoins, setTotalCoins] = useState(1846);
  const [dbTransactions, setDbTransactions] = useState<WalletTransaction[]>([]);
  const [streakInfo, setStreakInfo] = useState<StreakInfo>({ streak: 0, claimed_today: false, coins_today: 0, next_reward: 50 });
  const usdValue = (totalCoins * 0.01).toFixed(2);

  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    fetchWallet(uid).then((w) => setTotalCoins(w.coins)).catch(() => {});
    fetchWalletTransactions(uid).then((ts) => { if (ts.length > 0) setDbTransactions(ts); }).catch(() => {});
    getStreakInfo(uid).then((info) => setStreakInfo(info)).catch(() => {});
  }, [session?.user?.id]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Wallet</Text>
        <TouchableOpacity onPress={() => Alert.alert("Help", "Coins are earned from live gifts, reel views, and post boosts. 100 coins ≈ $1.00")}>
          <Ionicons name="help-circle-outline" size={24} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.balanceSection}>
          <LinearGradient colors={["#4C1D95", "#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Total Balance</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.coinEmoji}>🪙</Text>
              <Text style={styles.balanceAmount}>{totalCoins.toLocaleString()}</Text>
              <Text style={styles.balanceCurrency}>coins</Text>
            </View>
            <Text style={styles.usdValue}>≈ ${usdValue} USD</Text>
            <View style={styles.withdrawRow}>
              <TouchableOpacity
                onPress={() => Alert.alert("Withdraw", "Minimum withdrawal is 10,000 coins ($100). You need more coins to withdraw.")}
                style={styles.withdrawBtn}
              >
                <Ionicons name="card-outline" size={16} color="#fff" />
                <Text style={styles.withdrawText}>Withdraw</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert("Top Up", "Purchase coin packages to send gifts during live streams.")}
                style={[styles.withdrawBtn, { backgroundColor: "rgba(255,255,255,0.15)" }]}
              >
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={styles.withdrawText}>Top Up</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        <View style={[styles.section, { paddingHorizontal: 16 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Earnings This Week</Text>
          <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.chartBars}>
              {EARNINGS_DATA.map((d) => {
                const barHeight = (d.coins / MAX_COINS) * 80;
                return (
                  <View key={d.day} style={styles.barGroup}>
                    <Text style={[styles.barValue, { color: colors.mutedForeground }]}>{d.coins}</Text>
                    <View style={[styles.barBg, { backgroundColor: colors.muted }]}>
                      <LinearGradient
                        colors={["#7C3AED", "#EA580C"]}
                        style={[styles.barFill, { height: barHeight }]}
                      />
                    </View>
                    <Text style={[styles.barDay, { color: colors.mutedForeground }]}>{d.day}</Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.chartFooter}>
              <Text style={[styles.chartTotal, { color: colors.foreground }]}>
                Total: 🪙 {EARNINGS_DATA.reduce((a, b) => a + b.coins, 0).toLocaleString()} this week
              </Text>
              <Text style={[styles.chartChange, { color: "#10B981" }]}>↑ +23% vs last week</Text>
            </View>
          </View>
        </View>

        <View style={[styles.section, { paddingHorizontal: 16 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Earning Sources</Text>
          <View style={styles.sourcesRow}>
            {EARNING_SOURCES.map((s) => (
              <View key={s.label} style={[styles.sourceCard, { backgroundColor: s.bg, borderColor: colors.border }]}>
                <Text style={styles.sourceIcon}>{s.icon}</Text>
                <Text style={[styles.sourceLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                <View style={styles.sourceCoins}>
                  <Text style={styles.sourceCoinEmoji}>🪙</Text>
                  <Text style={[styles.sourceAmount, { color: s.color }]}>{s.amount}</Text>
                </View>
                <Text style={[styles.sourceChange, { color: "#10B981" }]}>{s.change}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.section, { paddingHorizontal: 16 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Transactions</Text>
          <View style={[styles.transactionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {dbTransactions.length > 0 ? dbTransactions.map((t, i) => (
              <View key={t.id} style={[styles.txRow, i < dbTransactions.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
                <View style={[styles.txIcon, { backgroundColor: colors.muted }]}>
                  <Text style={{ fontSize: 18 }}>{t.icon}</Text>
                </View>
                <View style={styles.txInfo}>
                  <Text style={[styles.txLabel, { color: colors.foreground }]}>{t.label}</Text>
                  <Text style={[styles.txSub, { color: colors.mutedForeground }]}>{t.username} · {t.time}</Text>
                </View>
                <View style={styles.txCoins}>
                  <Text style={styles.txCoinEmoji}>🪙</Text>
                  <Text style={[styles.txAmount, { color: "#10B981" }]}>+{t.coins}</Text>
                </View>
              </View>
            )) : (
              <View style={{ paddingVertical: 28, alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 30 }}>🪙</Text>
                <Text style={{ color: colors.foreground, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>No transactions yet</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: "center", paddingHorizontal: 20 }}>
                  Earn coins by going live, posting reels, and receiving gifts
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <LinearGradient
            colors={["rgba(124,58,237,0.18)", "rgba(249,115,22,0.10)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.streakCard, { borderColor: "rgba(124,58,237,0.3)" }]}
          >
            <View style={styles.streakTopRow}>
              <View style={styles.streakBadge}>
                <Text style={styles.streakFire}>🔥</Text>
                <Text style={styles.streakDay}>
                  {streakInfo.streak > 0 ? `Day ${streakInfo.streak} Streak` : "Start your streak!"}
                </Text>
              </View>
              {streakInfo.claimed_today && (
                <View style={styles.claimedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                  <Text style={styles.claimedText}>Claimed today</Text>
                </View>
              )}
            </View>

            <View style={styles.streakStatsRow}>
              <View style={styles.streakStat}>
                <Text style={styles.streakStatVal}>🪙 {streakInfo.coins_today > 0 ? `+${streakInfo.coins_today}` : "—"}</Text>
                <Text style={styles.streakStatLabel}>Earned today</Text>
              </View>
              <View style={[styles.streakDivider, { backgroundColor: colors.border }]} />
              <View style={styles.streakStat}>
                <Text style={styles.streakStatVal}>🎁 {streakInfo.next_reward}</Text>
                <Text style={styles.streakStatLabel}>Tomorrow's reward</Text>
              </View>
              <View style={[styles.streakDivider, { backgroundColor: colors.border }]} />
              <View style={styles.streakStat}>
                <Text style={styles.streakStatVal}>
                  {streakInfo.streak >= 7 ? "🌟" : streakInfo.streak >= 3 ? "⚡" : "🎯"} {streakInfo.streak >= 7 ? "Max!" : streakInfo.streak >= 3 ? "Bonus!" : `${7 - streakInfo.streak}d`}
                </Text>
                <Text style={styles.streakStatLabel}>{streakInfo.streak >= 7 ? "Max streak" : "To bonus"}</Text>
              </View>
            </View>

            {streakInfo.streak >= 3 && (
              <View style={styles.bonusBanner}>
                <Text style={styles.bonusText}>
                  {streakInfo.streak >= 7 ? "🌟 7-day bonus active — earning 2× coins!" : "⚡ 3-day streak bonus — earning +50% coins!"}
                </Text>
              </View>
            )}
          </LinearGradient>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <GradientButton
            onPress={() => Alert.alert("Withdraw", "You need 10,000 coins to withdraw. Keep creating!")}
            title="Withdraw Earnings"
          />
          <Text style={[styles.withdrawNote, { color: colors.mutedForeground }]}>
            Min. 10,000 coins · Pays to bank or PayPal · Processing 3-5 days
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 0.5, gap: 10 },
  title: { flex: 1, fontSize: 20, fontFamily: "Poppins_700Bold", textAlign: "center" },
  balanceSection: { padding: 16 },
  balanceCard: { borderRadius: 24, padding: 24 },
  balanceLabel: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontFamily: "Poppins_400Regular", marginBottom: 8 },
  balanceRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginBottom: 4 },
  coinEmoji: { fontSize: 28, marginBottom: 2 },
  balanceAmount: { fontSize: 48, fontFamily: "Poppins_700Bold", color: "#fff" },
  balanceCurrency: { fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 8, fontFamily: "Poppins_400Regular" },
  usdValue: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontFamily: "Poppins_400Regular", marginBottom: 20 },
  withdrawRow: { flexDirection: "row", gap: 10 },
  withdrawBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  withdrawText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontFamily: "Poppins_700Bold", marginBottom: 12 },
  chartCard: { borderRadius: 16, padding: 16, borderWidth: 0.5 },
  chartBars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 6, height: 100, marginBottom: 12 },
  barGroup: { flex: 1, alignItems: "center", gap: 4 },
  barValue: { fontSize: 9, fontFamily: "Poppins_400Regular" },
  barBg: { width: "100%", height: 80, borderRadius: 4, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", borderRadius: 4 },
  barDay: { fontSize: 10, fontFamily: "Poppins_500Medium" },
  chartFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chartTotal: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  chartChange: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  sourcesRow: { flexDirection: "row", gap: 10 },
  sourceCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center", gap: 4, borderWidth: 0.5 },
  sourceIcon: { fontSize: 24 },
  sourceLabel: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "center" },
  sourceCoins: { flexDirection: "row", alignItems: "center", gap: 2 },
  sourceCoinEmoji: { fontSize: 12 },
  sourceAmount: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  sourceChange: { fontSize: 11, fontFamily: "Poppins_500Medium" },
  transactionCard: { borderRadius: 16, overflow: "hidden", borderWidth: 0.5 },
  txRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  txIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1 },
  txLabel: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  txSub: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  txCoins: { flexDirection: "row", alignItems: "center", gap: 3 },
  txCoinEmoji: { fontSize: 13 },
  txAmount: { fontSize: 14, fontFamily: "Poppins_700Bold" },
  withdrawNote: { fontSize: 12, fontFamily: "Poppins_400Regular", textAlign: "center", marginTop: 10, lineHeight: 18 },
  streakCard: { borderRadius: 20, padding: 18, borderWidth: 1, gap: 16 },
  streakTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  streakBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  streakFire: { fontSize: 22 },
  streakDay: { fontSize: 16, fontFamily: "Poppins_700Bold", color: "#fff" },
  claimedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(16,185,129,0.15)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  claimedText: { fontSize: 12, fontFamily: "Poppins_600SemiBold", color: "#10B981" },
  streakStatsRow: { flexDirection: "row", alignItems: "center" },
  streakStat: { flex: 1, alignItems: "center", gap: 4 },
  streakStatVal: { fontSize: 15, fontFamily: "Poppins_700Bold", color: "#fff" },
  streakStatLabel: { fontSize: 11, fontFamily: "Poppins_400Regular", color: "rgba(255,255,255,0.55)", textAlign: "center" },
  streakDivider: { width: 1, height: 36, opacity: 0.3 },
  bonusBanner: { backgroundColor: "rgba(249,115,22,0.15)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  bonusText: { fontSize: 12, fontFamily: "Poppins_500Medium", color: "#F97316", textAlign: "center" },
});
