import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Session } from "@supabase/supabase-js";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
} from "react-native-reanimated";

// ── Monochrome palette ────────────────────────────────────────────────────────
const P = {
  bg:           "#000000",
  card:         "#141414",
  iconTile:     "#1f1f1f",
  text:         "#ffffff",
  muted:        "#888888",
  chevron:      "#555555",
  avatarBg:     "#1a1a1a",
  avatarBorder: "#2e2e2e",
  border:       "rgba(255,255,255,0.08)",
};

const API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/couple";

async function coupleApi(path: string, method = "GET", body?: object) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

interface Partner {
  id: string;
  username: string;
  avatar_url: string | null;
  full_name: string | null;
}

interface CoupleLink {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: string;
  anniversary_date: string | null;
  accepted_at: string | null;
}

interface PendingRequest {
  id: string;
  requester_id: string;
  requester?: Partner;
}

type CoupleStatus =
  | { status: "none" }
  | { status: "pending_sent"; pending: CoupleLink }
  | { status: "pending_received"; pendingRequests: PendingRequest[] }
  | { status: "coupled"; couple: CoupleLink; partner: Partner; myProfile: Partner | null };

// ─── Pulsing heart ────────────────────────────────────────────────────────────

function PulsingHeart() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 900 }),
        withTiming(1,    { duration: 900 })
      ),
      -1,
      false
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[style, { marginHorizontal: 6 }]}>
      <Text style={{ fontSize: 20 }}>💕</Text>
    </Animated.View>
  );
}

// ─── Animated card wrapper (entrance slide + press spring) ───────────────────

function AnimatedCard({
  onPress,
  delay,
  children,
}: {
  onPress: () => void;
  delay: number;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(14);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 420 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 120 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.975, { damping: 15, stiffness: 320 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 320 }); }}
        onPress={onPress}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── Monochrome avatar circle ─────────────────────────────────────────────────

function MonoAvatar({ uri, name }: { uri: string | null; name?: string | null }) {
  // Show the first letter of the name instead of a grey person icon when
  // avatar_url is null — reviewer saw an empty placeholder next to "You & Prakash".
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  return (
    <View style={s.avatarCircle}>
      {uri ? (
        <Image source={{ uri }} style={s.avatarImg} />
      ) : (
        <View style={[s.avatarImg, s.avatarFallback]}>
          <Text style={s.avatarInitial}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Emoji feature card ───────────────────────────────────────────────────────

function MonoCard({
  emoji,
  title,
  sub,
  onPress,
  delay,
}: {
  emoji: string;
  title: string;
  sub: string;
  onPress: () => void;
  delay: number;
}) {
  return (
    <AnimatedCard onPress={onPress} delay={delay}>
      <View style={s.featureCard}>
        <View style={s.iconTile}>
          <Text style={s.tileEmoji}>{emoji}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={s.cardTitle}>{title}</Text>
          <Text style={s.cardSub}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={P.chevron} />
      </View>
    </AnimatedCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CoupleTab({ userId, session }: { userId: string; session: Session | null }) {
  const [status, setStatus] = useState<CoupleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<Partner[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [nudgeSent, setNudgeSent] = useState(false);
  const [compEntry, setCompEntry] = useState<{ id: string; couple_name: string; vote_count: number } | null>(null);
  const [compRank, setCompRank] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await coupleApi(`/status?userId=${encodeURIComponent(userId)}`);
      setStatus(data);
      if (data.status === "coupled") {
        coupleApi(`/competition/my-entry?coupleId=${encodeURIComponent(data.couple.id)}&voterId=${encodeURIComponent(userId)}`)
          .then((d: any) => {
            setCompEntry(d.entry ?? null);
            setCompRank(d.entry ? d.rank : null);
          })
          .catch(() => {});
      }
    } catch {
      setStatus({ status: "none" });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const searchUsers = async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
      const res = await fetch(`${apiBase}/users/search?q=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json();
      setSearchResults((data.users ?? []).filter((u: any) => u.id !== userId));
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const sendRequest = async (receiverId: string, receiverName: string) => {
    try {
      const data = await coupleApi("/request", "POST", { requesterId: userId, receiverId });
      if (data.error) { Alert.alert("Error", data.error); return; }
      Alert.alert("💌 Sent!", `Couple request sent to ${receiverName}`);
      setSearchText(""); setSearchResults([]);
      fetchStatus();
    } catch {
      Alert.alert("Error", "Failed to send request");
    }
  };

  const acceptRequest = async (coupleId: string) => {
    try {
      const data = await coupleApi("/accept", "POST", { coupleId, userId });
      if (data.error) { Alert.alert("Error", data.error); return; }
      fetchStatus();
    } catch {
      Alert.alert("Error", "Failed to accept request");
    }
  };

  const declineRequest = async (coupleId: string) => {
    try {
      await coupleApi("/decline", "POST", { coupleId, userId });
      fetchStatus();
    } catch {
      Alert.alert("Error", "Failed to decline");
    }
  };

  const unlink = () => {
    Alert.alert(
      "Unlink Couple?",
      "This will remove your couple connection. Both of you will be visible in Find Vibe again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlink",
          style: "destructive",
          onPress: async () => {
            if (status?.status !== "coupled") return;
            await coupleApi("/unlink", "DELETE", { coupleId: status.couple.id, userId });
            fetchStatus();
          },
        },
      ]
    );
  };

  const sendNudge = async () => {
    if (status?.status !== "coupled") return;
    const partnerId =
      status.couple.requester_id === userId ? status.couple.receiver_id : status.couple.requester_id;
    try {
      await coupleApi("/nudge", "POST", { senderId: userId, partnerId });
      setNudgeSent(true);
      setTimeout(() => setNudgeSent(false), 3000);
    } catch {
      Alert.alert("Error", "Failed to send nudge");
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#ffffff" size="large" />
      </View>
    );
  }

  // ── Coupled home ─────────────────────────────────────────────────────────────
  if (status?.status === "coupled") {
    const { couple, partner, myProfile } = status;
    const coupleId = couple.id;
    const partnerName = partner?.full_name || partner?.username || "Your partner";
    const partnerFirst = partnerName.split(" ")[0];
    const daysCount = couple.accepted_at
      ? Math.floor((Date.now() - new Date(couple.accepted_at).getTime()) / 86400000)
      : null;

    return (
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={s.headerWrap}>
          <View style={s.avatarRow}>
            <MonoAvatar uri={myProfile?.avatar_url ?? null} name={myProfile?.full_name || myProfile?.username} />
            <PulsingHeart />
            <MonoAvatar uri={partner?.avatar_url ?? null} name={partnerFirst} />
          </View>

          <Text style={s.coupleName}>You & {partnerFirst}</Text>

          {daysCount !== null && (
            <Text style={s.daysText}>{daysCount} days together</Text>
          )}

          {couple.anniversary_date && (
            <Text style={s.anniversaryText}>💍 Anniversary: {couple.anniversary_date}</Text>
          )}
        </View>

        {/* ── Feature cards ─────────────────────────────────────────────── */}
        <View style={s.cards}>
          <MonoCard
            emoji="💬"
            title="Confession Room"
            sub="A safe space to share"
            onPress={() => router.push({ pathname: "/couple/feed", params: { coupleId, userId } } as any)}
            delay={0}
          />

          <AnimatedCard
            onPress={() => router.push({ pathname: "/couple/competition", params: { coupleId, userId } } as any)}
            delay={70}
          >
            <View style={s.featureCard}>
              <View style={s.iconTile}>
                <Text style={s.tileEmoji}>🏆</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={s.cardTitle}>Couple of the Month</Text>
                <Text style={s.cardSub}>
                  {compEntry ? `#${compRank} · ${compEntry.vote_count} votes` : "Enter the competition!"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={P.chevron} />
            </View>
          </AnimatedCard>

          <MonoCard
            emoji="🎮"
            title="Couple Games"
            sub="Play against other couples"
            onPress={() => router.push({ pathname: "/couple/games", params: { coupleId, userId } } as any)}
            delay={140}
          />
          <MonoCard
            emoji="📸"
            title="Shared Album"
            sub="Your photos together"
            onPress={() => router.push({ pathname: "/couple/album", params: { coupleId, userId } } as any)}
            delay={210}
          />
          <MonoCard
            emoji="💌"
            title="Notes"
            sub="Leave little messages"
            onPress={() => router.push({ pathname: "/couple/notes", params: { coupleId, userId } } as any)}
            delay={280}
          />
          <MonoCard
            emoji="✨"
            title="Bucket List"
            sub="Dreams to do together"
            onPress={() => router.push({ pathname: "/couple/bucketlist", params: { coupleId, userId } } as any)}
            delay={350}
          />

          {/* Thinking of You nudge */}
          <AnimatedCard onPress={sendNudge} delay={420}>
            <View style={s.featureCard}>
              <View style={s.iconTile}>
                <Text style={s.tileEmoji}>{nudgeSent ? "✅" : "💞"}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={s.cardTitle}>{nudgeSent ? "Nudge sent!" : "Thinking of You"}</Text>
                <Text style={s.cardSub}>
                  {nudgeSent ? "They'll know you're thinking of them" : "Send a gentle nudge to your partner"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={P.chevron} />
            </View>
          </AnimatedCard>
        </View>

        <TouchableOpacity onPress={unlink} style={s.unlinkBtn}>
          <Text style={s.unlinkText}>Unlink Couple</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Non-coupled states ────────────────────────────────────────────────────────
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={s.heroSection}>
        <Text style={s.heroEmoji}>💑</Text>
        <Text style={s.heroTitle}>Find Your Partner</Text>
        <Text style={s.heroSub}>Link with your partner to unlock your shared space</Text>
      </View>

      <View style={s.searchSection}>
        <View style={s.searchRow}>
          <Ionicons name="search" size={18} color={P.muted} style={{ marginLeft: 14 }} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by username..."
            placeholderTextColor={P.muted}
            value={searchText}
            onChangeText={(t) => { setSearchText(t); searchUsers(t); }}
            autoCapitalize="none"
          />
          {searchLoading && <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 12 }} />}
        </View>

        {searchResults.length > 0 && (
          <View style={s.searchResults}>
            {searchResults.map((u) => (
              <View key={u.id} style={s.searchResultRow}>
                <View style={s.searchResultAvatar}>
                  {u.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                  ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: P.iconTile, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="person" size={20} color={P.muted} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.searchResultName}>{u.full_name || u.username}</Text>
                  <Text style={s.searchResultUser}>@{u.username}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => sendRequest(u.id, u.full_name || u.username)}
                  style={s.sendRequestBtn}
                >
                  <Text style={s.sendRequestText}>Request</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {status?.status === "pending_sent" && (
        <View style={s.pendingBanner}>
          <Ionicons name="time-outline" size={22} color={P.muted} />
          <View style={{ flex: 1 }}>
            <Text style={s.pendingTitle}>Request sent!</Text>
            <Text style={s.pendingSub}>Waiting for your partner to accept</Text>
          </View>
        </View>
      )}

      {status?.status === "pending_received" && status.pendingRequests.length > 0 && (
        <View style={s.incomingSection}>
          <Text style={s.incomingHeader}>Incoming Requests</Text>
          {status.pendingRequests.map((req) => (
            <View key={req.id} style={s.incomingCard}>
              <View style={s.incomingAvatar}>
                {req.requester?.avatar_url ? (
                  <Image source={{ uri: req.requester.avatar_url }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: P.iconTile, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="person" size={22} color={P.muted} />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.incomingName}>{req.requester?.full_name || req.requester?.username || "Someone"}</Text>
                <Text style={s.incomingUser}>@{req.requester?.username}</Text>
              </View>
              <View style={s.incomingBtns}>
                <TouchableOpacity onPress={() => acceptRequest(req.id)} style={s.acceptBtn}>
                  <Text style={{ color: "#000000", fontFamily: "Poppins_700Bold", fontSize: 13 }}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => declineRequest(req.id)} style={s.declineBtn}>
                  <Text style={{ color: P.muted, fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  // ── Shared ────────────────────────────────────────────────────────────────
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: P.bg },
  scroll: { flex: 1, backgroundColor: P.bg },
  scrollContent: { paddingBottom: 120 },

  // ── Coupled header ─────────────────────────────────────────────────────────
  headerWrap: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  avatarRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  avatarCircle: {
    width: 66, height: 66, borderRadius: 33,
    backgroundColor: P.avatarBg,
    borderWidth: 1.5, borderColor: P.avatarBorder,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 63, height: 63, borderRadius: 31.5 },
  avatarFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 24, fontWeight: "700", color: "#ffffff" },
  coupleName: {
    color: P.text,
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    textAlign: "center",
    marginBottom: 4,
  },
  daysText: {
    color: P.muted,
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 2,
  },
  anniversaryText: { color: P.muted, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },

  // ── Feature cards ──────────────────────────────────────────────────────────
  cards: { paddingHorizontal: 16, gap: 10, marginTop: 4 },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: P.card,
    borderRadius: 14,
    padding: 15,
  },
  iconTile: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: P.iconTile,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  tileEmoji: { fontSize: 22, textAlign: "center" },
  cardTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: P.text, marginBottom: 2 },
  cardSub: { fontFamily: "Poppins_400Regular", fontSize: 13, color: P.muted },

  // ── Unlink ─────────────────────────────────────────────────────────────────
  unlinkBtn: { marginTop: 28, alignSelf: "center", padding: 12 },
  unlinkText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: P.muted },

  // ── Non-coupled ─────────────────────────────────────────────────────────────
  heroSection: { alignItems: "center", paddingTop: 60, paddingBottom: 32, paddingHorizontal: 24, gap: 10 },
  heroEmoji: { fontSize: 56 },
  heroTitle: { fontFamily: "Poppins_700Bold", fontSize: 24, color: P.text, textAlign: "center" },
  heroSub: { fontFamily: "Poppins_400Regular", fontSize: 15, color: P.muted, textAlign: "center" },
  searchSection: { marginHorizontal: 16, gap: 10 },
  searchRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: P.card, borderRadius: 14, height: 50,
    borderWidth: 1, borderColor: P.border,
  },
  searchInput: { flex: 1, paddingHorizontal: 12, color: P.text, fontFamily: "Poppins_400Regular", fontSize: 15 },
  searchResults: {
    backgroundColor: P.card, borderRadius: 14,
    borderWidth: 1, borderColor: P.border, overflow: "hidden",
  },
  searchResultRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 12,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  searchResultAvatar: {},
  searchResultName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: P.text },
  searchResultUser: { fontFamily: "Poppins_400Regular", fontSize: 12, color: P.muted },
  sendRequestBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14,
    backgroundColor: "#ffffff",
  },
  sendRequestText: { fontFamily: "Poppins_700Bold", fontSize: 13, color: "#000000" },

  // ── Pending / incoming ────────────────────────────────────────────────────
  pendingBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 20,
    backgroundColor: P.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: P.border,
  },
  pendingTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: P.text },
  pendingSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: P.muted, marginTop: 2 },
  incomingSection: { marginHorizontal: 16, marginTop: 20, gap: 12 },
  incomingHeader: { fontFamily: "Poppins_700Bold", fontSize: 16, color: P.text },
  incomingCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: P.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: P.border,
  },
  incomingAvatar: {},
  incomingName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: P.text },
  incomingUser: { fontFamily: "Poppins_400Regular", fontSize: 12, color: P.muted, marginTop: 1 },
  incomingBtns: { flexDirection: "column", gap: 6 },
  acceptBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  declineBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
