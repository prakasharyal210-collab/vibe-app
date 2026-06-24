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
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
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
  | { status: "coupled"; couple: CoupleLink; partner: Partner };

// ─── Pulsing heart between avatars ──────────────────────────────────────────

function PulsingHeart() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 750 }),
        withTiming(1, { duration: 750 })
      ),
      -1,
      false
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <Text style={{ fontSize: 28 }}>💕</Text>
    </Animated.View>
  );
}

// ─── Animated card wrapper (entrance + press spring) ────────────────────────

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
  const translateY = useSharedValue(18);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 480 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 16, stiffness: 110 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 15, stiffness: 320 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 320 }); }}
        onPress={onPress}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── Glass feature card ──────────────────────────────────────────────────────

function GlassCard({
  emoji,
  title,
  sub,
  color,
  onPress,
  delay,
}: {
  emoji: string;
  title: string;
  sub: string;
  color: string;
  onPress: () => void;
  delay: number;
}) {
  return (
    <AnimatedCard onPress={onPress} delay={delay}>
      <View
        style={[
          s.glassCard,
          {
            borderColor: color + "28",
            shadowColor: color,
            shadowOpacity: 0.28,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          },
        ]}
      >
        <LinearGradient
          colors={[color + "18", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[s.iconSquircle, { backgroundColor: color + "22" }]}>
          <Text style={{ fontSize: 26 }}>{emoji}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={s.cardTitle}>{title}</Text>
          <Text style={s.cardSub}>{sub}</Text>
        </View>
        <View style={[s.chevronCircle, { backgroundColor: color + "18" }]}>
          <Ionicons name="chevron-forward" size={15} color={color} />
        </View>
      </View>
    </AnimatedCard>
  );
}

// ─── Days badge ──────────────────────────────────────────────────────────────

function DaysBadge({ acceptedAt }: { acceptedAt: string }) {
  const days = Math.floor((Date.now() - new Date(acceptedAt).getTime()) / 86400000);
  return (
    <BlurView intensity={24} tint="dark" style={s.daysBadge}>
      <Text style={s.daysNum}>{days}</Text>
      <Text style={s.daysLabel}>days together</Text>
    </BlurView>
  );
}

// ─── Avatar with gradient ring ───────────────────────────────────────────────

function RingedAvatar({ uri, emoji }: { uri: string | null; emoji?: string }) {
  return (
    <LinearGradient
      colors={["#EC4899", "#A855F7", "#6366F1"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.avatarRing}
    >
      <View style={s.avatarInner}>
        {uri ? (
          <Image source={{ uri }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarPlaceholder]}>
            <Text style={{ fontSize: 26 }}>{emoji ?? "👤"}</Text>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

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
        <ActivityIndicator color="#EC4899" size="large" />
      </View>
    );
  }

  // ── Coupled home (premium redesign) ─────────────────────────────────────────
  if (status?.status === "coupled") {
    const { couple, partner } = status;
    const coupleId = couple.id;
    const partnerName = partner?.full_name || partner?.username || "Your partner";
    const partnerFirst = partnerName.split(" ")[0];

    return (
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={s.headerWrap}>
          {/* Ambient glow orbs */}
          <View style={[s.glowOrb, { backgroundColor: "#EC4899", width: 240, height: 240, top: -60, left: -40, opacity: 0.13 }]} />
          <View style={[s.glowOrb, { backgroundColor: "#8B5CF6", width: 200, height: 200, top: -30, right: -30, opacity: 0.11 }]} />
          <View style={[s.glowOrb, { backgroundColor: "#EC4899", width: 120, height: 120, bottom: 0, left: "35%", opacity: 0.07 }]} />

          <View style={s.avatarRow}>
            <RingedAvatar uri={null} emoji="😊" />
            <PulsingHeart />
            <RingedAvatar uri={partner?.avatar_url ?? null} emoji="👤" />
          </View>

          <Text style={s.coupleName} numberOfLines={1}>You & {partnerFirst}</Text>

          {couple.accepted_at && <DaysBadge acceptedAt={couple.accepted_at} />}

          {couple.anniversary_date && (
            <View style={s.anniversaryRow}>
              <Text style={s.anniversaryText}>💍 Anniversary: {couple.anniversary_date}</Text>
            </View>
          )}
        </View>

        {/* ── Feature cards ───────────────────────────────────────────────── */}
        <View style={s.cards}>
          <GlassCard
            emoji="💬"
            title="Confession Room"
            sub="Share anonymously, get support 💕"
            color="#EC4899"
            onPress={() => router.push({ pathname: "/couple/feed", params: { coupleId, userId } } as any)}
            delay={0}
          />

          {/* Couple of the Month — special gradient card */}
          <AnimatedCard
            onPress={() => router.push({ pathname: "/couple/competition", params: { coupleId, userId } } as any)}
            delay={70}
          >
            <View style={[s.glassCard, { borderColor: "#F59E0B28", shadowColor: "#F59E0B", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 8 }]}>
              <LinearGradient
                colors={["#4C1D9522", "#7C3AED18", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[s.iconSquircle, { backgroundColor: "#F59E0B22" }]}>
                <Text style={{ fontSize: 26 }}>
                  {compEntry && compRank && compRank <= 3 ? ["🥇", "🥈", "🥉"][compRank - 1] : "🏆"}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={s.cardTitle}>Couple of the Month</Text>
                <Text style={s.cardSub}>
                  {compEntry ? `#${compRank} · ${compEntry.vote_count} votes` : "Enter the competition!"}
                </Text>
              </View>
              <View style={[s.chevronCircle, { backgroundColor: "#F59E0B18" }]}>
                <Ionicons name="chevron-forward" size={15} color="#F59E0B" />
              </View>
            </View>
          </AnimatedCard>

          <GlassCard
            emoji="📸"
            title="Shared Album"
            sub="Your photos together"
            color="#A855F7"
            onPress={() => router.push({ pathname: "/couple/album", params: { coupleId, userId } } as any)}
            delay={140}
          />
          <GlassCard
            emoji="📝"
            title="Notes"
            sub="Leave little messages"
            color="#3B82F6"
            onPress={() => router.push({ pathname: "/couple/notes", params: { coupleId, userId } } as any)}
            delay={210}
          />
          <GlassCard
            emoji="🗺️"
            title="Bucket List"
            sub="Dreams to do together"
            color="#14B8A6"
            onPress={() => router.push({ pathname: "/couple/bucketlist", params: { coupleId, userId } } as any)}
            delay={280}
          />

          {/* Thinking of You nudge */}
          <AnimatedCard onPress={sendNudge} delay={350}>
            <View style={[s.nudgeCard, nudgeSent && s.nudgeCardSent]}>
              <LinearGradient
                colors={nudgeSent ? ["rgba(52,211,153,0.15)", "transparent"] : ["rgba(236,72,153,0.12)", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={{ fontSize: 22 }}>{nudgeSent ? "✅" : "💭"}</Text>
              <Text style={s.nudgeText}>{nudgeSent ? "Nudge sent!" : "Thinking of You"}</Text>
            </View>
          </AnimatedCard>
        </View>

        <TouchableOpacity onPress={unlink} style={s.unlinkBtn}>
          <Text style={s.unlinkText}>Unlink Couple</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Non-coupled states (unchanged) ──────────────────────────────────────────
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={s.heroSection}>
        <Text style={s.heroEmoji}>💑</Text>
        <Text style={s.heroTitle}>Find Your Partner</Text>
        <Text style={s.heroSub}>Link with your partner to unlock your shared space</Text>
      </View>

      <View style={s.searchSection}>
        <View style={s.searchRow}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" style={{ marginLeft: 14 }} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by username..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchText}
            onChangeText={(t) => { setSearchText(t); searchUsers(t); }}
            autoCapitalize="none"
          />
          {searchLoading && <ActivityIndicator size="small" color="#EC4899" style={{ marginRight: 12 }} />}
        </View>

        {searchResults.length > 0 && (
          <View style={s.searchResults}>
            {searchResults.map((u) => (
              <View key={u.id} style={s.searchResultRow}>
                <View style={s.searchResultAvatar}>
                  {u.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                  ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(236,72,153,0.2)", alignItems: "center", justifyContent: "center" }}>
                      <Text>👤</Text>
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
                  <Text style={s.sendRequestText}>💌 Request</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {status?.status === "pending_sent" && (
        <View style={s.pendingBanner}>
          <Text style={{ fontSize: 20 }}>⏳</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.pendingTitle}>Request sent!</Text>
            <Text style={s.pendingSub}>Waiting for your partner to accept</Text>
          </View>
        </View>
      )}

      {status?.status === "pending_received" && status.pendingRequests.length > 0 && (
        <View style={s.incomingSection}>
          <Text style={s.incomingHeader}>💌 Incoming Requests</Text>
          {status.pendingRequests.map((req) => (
            <View key={req.id} style={s.incomingCard}>
              <View style={s.incomingAvatar}>
                {req.requester?.avatar_url ? (
                  <Image source={{ uri: req.requester.avatar_url }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(236,72,153,0.2)", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 22 }}>👤</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.incomingName}>{req.requester?.full_name || req.requester?.username || "Someone"}</Text>
                <Text style={s.incomingUser}>@{req.requester?.username}</Text>
              </View>
              <View style={s.incomingBtns}>
                <TouchableOpacity onPress={() => acceptRequest(req.id)} style={s.acceptBtn}>
                  <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 }}>Accept 💑</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => declineRequest(req.id)} style={s.declineBtn}>
                  <Text style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>Decline</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1, backgroundColor: "#0D0D14" },
  scrollContent: { paddingBottom: 120 },

  // ── Coupled header ────────────────────────────────────────────────────────
  headerWrap: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 24,
    overflow: "hidden",
    position: "relative",
  },
  glowOrb: { position: "absolute", borderRadius: 999 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 18 },
  avatarRing: { width: 88, height: 88, borderRadius: 44, padding: 3, alignItems: "center", justifyContent: "center" },
  avatarInner: { width: 82, height: 82, borderRadius: 41, overflow: "hidden", backgroundColor: "#0D0D14" },
  avatar: { width: 82, height: 82, borderRadius: 41 },
  avatarPlaceholder: { flex: 1, backgroundColor: "rgba(236,72,153,0.15)", alignItems: "center", justifyContent: "center" },
  coupleName: {
    color: "#fff",
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    letterSpacing: 0.4,
    marginBottom: 14,
    textAlign: "center",
  },
  daysBadge: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    overflow: "hidden",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  daysNum: { color: "#EC4899", fontFamily: "Poppins_700Bold", fontSize: 34, lineHeight: 40 },
  daysLabel: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 14 },
  anniversaryRow: { marginTop: 10 },
  anniversaryText: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_400Regular", fontSize: 13 },

  // ── Feature cards ─────────────────────────────────────────────────────────
  cards: { paddingHorizontal: 16, gap: 14, marginTop: 4 },
  glassCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    overflow: "hidden",
  },
  iconSquircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 16, marginBottom: 2 },
  cardSub: { color: "rgba(255,255,255,0.42)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Nudge card ────────────────────────────────────────────────────────────
  nudgeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1.5,
    borderColor: "rgba(236,72,153,0.3)",
    borderRadius: 24,
    paddingVertical: 18,
    overflow: "hidden",
  },
  nudgeCardSent: { borderColor: "rgba(52,211,153,0.3)" },
  nudgeText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },

  // ── Unlink ────────────────────────────────────────────────────────────────
  unlinkBtn: { alignSelf: "center", marginTop: 32, paddingHorizontal: 20, paddingVertical: 10 },
  unlinkText: { color: "rgba(255,255,255,0.2)", fontFamily: "Poppins_400Regular", fontSize: 13 },

  // ── Non-coupled states (unchanged) ────────────────────────────────────────
  heroSection: { alignItems: "center", paddingTop: 32, paddingBottom: 24, paddingHorizontal: 24 },
  heroEmoji: { fontSize: 52, marginBottom: 12 },
  heroTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 24, marginBottom: 8, textAlign: "center" },
  heroSub: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 21 },
  searchSection: { marginHorizontal: 16, marginBottom: 20 },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", gap: 8 },
  searchInput: { flex: 1, paddingVertical: 13, paddingRight: 14, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15 },
  searchResults: { marginTop: 8, backgroundColor: "rgba(15,15,26,0.98)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  searchResultRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.06)" },
  searchResultAvatar: {},
  searchResultName: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  searchResultUser: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  sendRequestBtn: { backgroundColor: "rgba(236,72,153,0.2)", borderWidth: 1, borderColor: "rgba(236,72,153,0.5)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  sendRequestText: { color: "#EC4899", fontFamily: "Poppins_700Bold", fontSize: 12 },
  pendingBanner: { marginHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "rgba(234,179,8,0.1)", borderWidth: 1, borderColor: "rgba(234,179,8,0.3)", borderRadius: 16, padding: 16 },
  pendingTitle: { color: "#EAB308", fontFamily: "Poppins_700Bold", fontSize: 15 },
  pendingSub: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  incomingSection: { marginHorizontal: 16, marginTop: 8 },
  incomingHeader: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17, marginBottom: 12 },
  incomingCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "rgba(236,72,153,0.2)", marginBottom: 10 },
  incomingAvatar: {},
  incomingName: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  incomingUser: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  incomingBtns: { gap: 8 },
  acceptBtn: { backgroundColor: "#EC4899", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  declineBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
});
