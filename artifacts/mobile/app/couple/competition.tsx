import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

const API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/couple";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const RANK_META = [
  { emoji: "🥇", colors: ["#F59E0B", "#B45309"] as [string, string], label: "1st Place" },
  { emoji: "🥈", colors: ["#94A3B8", "#64748B"] as [string, string], label: "2nd Place" },
  { emoji: "🥉", colors: ["#B45309", "#78350F"] as [string, string], label: "3rd Place" },
];

interface LeaderboardEntry {
  id: string;
  couple_id: string;
  couple_name: string;
  cover_photo_url: string | null;
  vote_count: number;
  daysTogether: number;
  rank: number;
  requester: { id: string; username: string; avatar_url: string | null } | null;
  receiver: { id: string; username: string; avatar_url: string | null } | null;
}

interface Winner {
  id: string;
  couple_id: string;
  couple_name: string;
  cover_photo_url: string | null;
  month: number;
  year: number;
  rank: number;
  vote_count: number;
}

function MiniAvatar({ uri }: { uri: string | null }) {
  if (uri) return <Image source={{ uri }} style={s.miniAvatar} />;
  return (
    <View style={[s.miniAvatar, { backgroundColor: "rgba(139,92,246,0.25)", alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ fontSize: 14 }}>👤</Text>
    </View>
  );
}

function VoteButton({
  voted,
  count,
  onPress,
  disabled,
}: {
  voted: boolean;
  count: number;
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} disabled={disabled} activeOpacity={0.8}>
      <Animated.View style={[s.voteBtn, voted && s.voteBtnActive, { transform: [{ scale }] }]}>
        <Text style={{ fontSize: 16 }}>{voted ? "❤️" : "🤍"}</Text>
        <Text style={[s.voteCount, voted && { color: "#EC4899" }]}>{count}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function LeaderboardCard({
  entry,
  myEntry,
  userId,
  userVotes,
  onVote,
  onShare,
}: {
  entry: LeaderboardEntry;
  myEntry: LeaderboardEntry | null;
  userId: string;
  userVotes: string[];
  onVote: (id: string, voted: boolean) => void;
  onShare: (entry: LeaderboardEntry) => void;
}) {
  const rank = entry.rank;
  const isTop3 = rank <= 3;
  const meta = isTop3 ? RANK_META[rank - 1] : null;
  const voted = userVotes.includes(entry.id);
  const isMine = myEntry?.id === entry.id;

  const cardContent = (
    <View style={[s.card, isMine && s.cardMine]}>
      <View style={s.cardTop}>
        <View style={s.rankBadge}>
          <Text style={s.rankText}>{isTop3 ? meta!.emoji : `#${rank}`}</Text>
        </View>
        <View style={s.avatarPair}>
          <MiniAvatar uri={entry.requester?.avatar_url ?? null} />
          <View style={s.heartOverlap}><Text style={{ fontSize: 12 }}>💑</Text></View>
          <MiniAvatar uri={entry.receiver?.avatar_url ?? null} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.coupleName} numberOfLines={1}>{entry.couple_name}</Text>
          <Text style={s.daysTogether}>{entry.daysTogether}d together</Text>
        </View>
        <View style={s.cardActions}>
          {isMine && (
            <TouchableOpacity onPress={() => onShare(entry)} style={s.shareBtn}>
              <Ionicons name="share-outline" size={16} color="#A78BFA" />
            </TouchableOpacity>
          )}
          <VoteButton
            voted={voted}
            count={entry.vote_count}
            onPress={() => onVote(entry.id, voted)}
            disabled={isMine}
          />
        </View>
      </View>
      {entry.cover_photo_url && (
        <Image source={{ uri: entry.cover_photo_url }} style={s.coverPhoto} resizeMode="cover" />
      )}
    </View>
  );

  if (isTop3 && meta) {
    return (
      <LinearGradient
        colors={[meta.colors[0] + "44", meta.colors[1] + "22"]}
        style={s.topCardGrad}
      >
        <View style={[s.topCardInner, { borderColor: meta.colors[0] + "66" }]}>
          {cardContent}
        </View>
      </LinearGradient>
    );
  }

  return <View style={s.plainCardWrap}>{cardContent}</View>;
}

export default function CompetitionScreen() {
  const insets = useSafeAreaInsets();
  const { coupleId, userId } = useLocalSearchParams<{ coupleId: string; userId: string }>();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [userVotes, setUserVotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [enterModal, setEnterModal] = useState(false);
  const [coupleName, setCoupleName] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [entering, setEntering] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [lbRes, winRes, myRes] = await Promise.all([
        fetch(`${API}/competition/leaderboard`),
        fetch(`${API}/competition/winners`),
        coupleId
          ? fetch(`${API}/competition/my-entry?coupleId=${encodeURIComponent(coupleId)}&voterId=${encodeURIComponent(userId ?? "")}`)
          : Promise.resolve(null),
      ]);

      const lbData = await lbRes.json();
      setLeaderboard(lbData.leaderboard ?? []);
      setMonth(lbData.month ?? new Date().getMonth() + 1);
      setYear(lbData.year ?? new Date().getFullYear());

      const winData = await winRes.json();
      setWinners(winData.winners ?? []);

      if (myRes) {
        const myData = await myRes.json();
        if (myData.entry) {
          const found = (lbData.leaderboard ?? []).find((e: LeaderboardEntry) => e.id === myData.entry.id);
          setMyEntry(found ?? null);
          setMyRank(myData.rank ?? null);
        }
        setUserVotes(myData.userVotes ?? []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [coupleId, userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleVote = async (competitionId: string, alreadyVoted: boolean) => {
    const method = alreadyVoted ? "DELETE" : "POST";
    setUserVotes((prev) =>
      alreadyVoted ? prev.filter((id) => id !== competitionId) : [...prev, competitionId]
    );
    setLeaderboard((prev) =>
      prev.map((e) =>
        e.id === competitionId
          ? { ...e, vote_count: e.vote_count + (alreadyVoted ? -1 : 1) }
          : e
      )
    );
    try {
      await fetch(`${API}/competition/vote/${encodeURIComponent(competitionId)}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId: userId }),
      });
    } catch {
      setUserVotes((prev) =>
        alreadyVoted ? [...prev, competitionId] : prev.filter((id) => id !== competitionId)
      );
      setLeaderboard((prev) =>
        prev.map((e) =>
          e.id === competitionId
            ? { ...e, vote_count: e.vote_count + (alreadyVoted ? 1 : -1) }
            : e
        )
      );
    }
  };

  const handleEnter = async () => {
    if (!coupleName.trim()) { Alert.alert("Name required", "Enter a couple name to compete"); return; }
    setEntering(true);
    try {
      const res = await fetch(`${API}/competition/enter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coupleId,
          coupleName: coupleName.trim(),
          coverPhotoUrl: coverUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.error) { Alert.alert("Error", data.error); return; }
      setEnterModal(false);
      setCoupleName("");
      setCoverUrl("");
      fetchAll();
    } catch {
      Alert.alert("Error", "Failed to enter competition");
    } finally {
      setEntering(false);
    }
  };

  const handleShare = (entry: LeaderboardEntry) => {
    Share.share({
      message: `💑 We're competing in the Gundruk Couple of the Month! Vote for "${entry.couple_name}" — ${entry.daysTogether} days together and counting 💜`,
    }).catch(() => {});
  };

  const hallOfFameByMonth = winners.reduce<Record<string, Winner[]>>((acc, w) => {
    const key = `${MONTHS[w.month - 1]} ${w.year}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(w);
    return acc;
  }, {});

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>Couple of the Month 🏆</Text>
          <Text style={s.headerSub}>{MONTHS[month - 1]} {year}</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        {coupleId && !myEntry && (
          <TouchableOpacity onPress={() => setEnterModal(true)} activeOpacity={0.88} style={s.enterBanner}>
            <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.enterGrad}>
              <Text style={{ fontSize: 28 }}>🏆</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.enterTitle}>Enter This Month!</Text>
                <Text style={s.enterSub}>Compete for Couple of the Month</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {myEntry && myRank && (
          <View style={s.myEntryBanner}>
            <LinearGradient colors={["rgba(124,58,237,0.3)", "rgba(236,72,153,0.15)"]} style={s.myEntryGrad}>
              <Text style={{ fontSize: 24 }}>{myRank <= 3 ? RANK_META[myRank - 1].emoji : "🏅"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.myEntryTitle}>{myEntry.couple_name}</Text>
                <Text style={s.myEntrySub}>Rank #{myRank} · {myEntry.vote_count} votes</Text>
              </View>
              <TouchableOpacity onPress={() => handleShare(myEntry)} style={s.shareMyBtn}>
                <Ionicons name="share-social" size={18} color="#A78BFA" />
                <Text style={s.shareMyText}>Share</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        )}

        <Text style={s.sectionTitle}>🏅 Leaderboard</Text>

        {loading ? (
          <View style={s.loadingWrap}><ActivityIndicator color="#8B5CF6" size="large" /></View>
        ) : leaderboard.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyEmoji}>💑</Text>
            <Text style={s.emptyTitle}>No entries yet</Text>
            <Text style={s.emptySub}>Be the first couple to compete this month!</Text>
          </View>
        ) : (
          leaderboard.map((entry) => (
            <LeaderboardCard
              key={entry.id}
              entry={entry}
              myEntry={myEntry}
              userId={userId ?? ""}
              userVotes={userVotes}
              onVote={handleVote}
              onShare={handleShare}
            />
          ))
        )}

        {Object.keys(hallOfFameByMonth).length > 0 && (
          <>
            <Text style={[s.sectionTitle, { marginTop: 32 }]}>✨ Hall of Fame</Text>
            {Object.entries(hallOfFameByMonth).map(([monthKey, monthWinners]) => (
              <View key={monthKey} style={s.hofMonth}>
                <Text style={s.hofMonthTitle}>{monthKey}</Text>
                {monthWinners.map((w) => {
                  const meta = RANK_META[w.rank - 1];
                  return (
                    <View key={w.id} style={s.hofRow}>
                      <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.hofName}>{w.couple_name}</Text>
                        <Text style={s.hofVotes}>{w.vote_count} votes</Text>
                      </View>
                      {w.cover_photo_url && (
                        <Image source={{ uri: w.cover_photo_url }} style={s.hofPhoto} />
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={enterModal} transparent animationType="slide" onRequestClose={() => setEnterModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalOverlay}>
          <View style={s.enterSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Enter Competition 🏆</Text>
            <Text style={s.sheetSub}>Choose a couple name that represents you both</Text>

            <Text style={s.fieldLabel}>Couple Name *</Text>
            <TextInput
              style={s.textInput}
              placeholder="e.g. SunflowerDuo, CoffeeLovers..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={coupleName}
              onChangeText={setCoupleName}
              maxLength={40}
            />

            <Text style={s.fieldLabel}>Cover Photo URL (optional)</Text>
            <TextInput
              style={s.textInput}
              placeholder="Paste a photo URL from your album"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={coverUrl}
              onChangeText={setCoverUrl}
              autoCapitalize="none"
            />

            <TouchableOpacity
              onPress={handleEnter}
              disabled={!coupleName.trim() || entering}
              style={[s.enterConfirmBtn, (!coupleName.trim() || entering) && { opacity: 0.5 }]}
            >
              {entering ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.enterConfirmText}>Enter Competition 🏆</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEnterModal(false)} style={s.cancelBtn}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080810" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.08)" },
  backBtn: { padding: 6 },
  headerTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 18 },
  headerSub: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  scrollContent: { paddingBottom: 120, paddingTop: 4 },
  enterBanner: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, overflow: "hidden" },
  enterGrad: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 18 },
  enterTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  enterSub: { color: "rgba(255,255,255,0.65)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  myEntryBanner: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(139,92,246,0.4)" },
  myEntryGrad: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 16 },
  myEntryTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  myEntrySub: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  shareMyBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(139,92,246,0.2)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  shareMyText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  sectionTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 18, paddingHorizontal: 16, marginTop: 20, marginBottom: 12 },
  loadingWrap: { paddingVertical: 48, alignItems: "center" },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 10, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 18, textAlign: "center" },
  emptySub: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center" },
  topCardGrad: { marginHorizontal: 16, marginBottom: 10, borderRadius: 20 },
  topCardInner: { borderRadius: 18, borderWidth: 1.5, overflow: "hidden", backgroundColor: "#0F0F1A" },
  plainCardWrap: { marginHorizontal: 16, marginBottom: 8 },
  card: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  cardMine: { borderColor: "rgba(139,92,246,0.5)" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  rankBadge: { width: 36, alignItems: "center" },
  rankText: { fontSize: 22 },
  avatarPair: { flexDirection: "row", alignItems: "center", width: 72 },
  miniAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "#080810" },
  heartOverlap: { marginHorizontal: -4, zIndex: 1 },
  coupleName: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  daysTogether: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  shareBtn: { padding: 8, backgroundColor: "rgba(139,92,246,0.15)", borderRadius: 12 },
  voteBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  voteBtnActive: { backgroundColor: "rgba(236,72,153,0.15)", borderColor: "rgba(236,72,153,0.4)" },
  voteCount: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_700Bold", fontSize: 13 },
  coverPhoto: { width: "100%", height: 140 },
  hofMonth: { marginHorizontal: 16, marginBottom: 16, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  hofMonthTitle: { color: "rgba(255,255,255,0.55)", fontFamily: "Poppins_600SemiBold", fontSize: 13, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.07)" },
  hofRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.05)" },
  hofName: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  hofVotes: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  hofPhoto: { width: 44, height: 44, borderRadius: 8 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  enterSheet: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 40 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginTop: 14, marginBottom: 20 },
  sheetTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 22, marginBottom: 6 },
  sheetSub: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 14, marginBottom: 20 },
  fieldLabel: { color: "rgba(255,255,255,0.55)", fontFamily: "Poppins_600SemiBold", fontSize: 13, marginBottom: 8 },
  textInput: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 16, paddingVertical: 13, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15, marginBottom: 16 },
  enterConfirmBtn: { backgroundColor: "#7C3AED", borderRadius: 16, paddingVertical: 16, alignItems: "center", marginBottom: 10 },
  enterConfirmText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  cancelBtn: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 14 },
});
