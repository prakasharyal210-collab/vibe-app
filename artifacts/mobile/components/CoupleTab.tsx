import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { Ionicons } from "@expo/vector-icons";

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

function DaysBadge({ acceptedAt }: { acceptedAt: string }) {
  const days = Math.floor((Date.now() - new Date(acceptedAt).getTime()) / 86400000);
  return (
    <View style={s.daysBadge}>
      <Text style={s.daysNum}>{days}</Text>
      <Text style={s.daysLabel}>days together</Text>
    </View>
  );
}

function ActionCard({
  emoji,
  title,
  sub,
  onPress,
  color,
}: {
  emoji: string;
  title: string;
  sub: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={[s.actionCard, { borderColor: color + "44" }]}>
      <View style={[s.actionIconWrap, { backgroundColor: color + "22" }]}>
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.actionTitle}>{title}</Text>
        <Text style={s.actionSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
    </TouchableOpacity>
  );
}

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

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

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
      if (data.error) {
        Alert.alert("Error", data.error);
        return;
      }
      Alert.alert("💌 Sent!", `Couple request sent to ${receiverName}`);
      setSearchText("");
      setSearchResults([]);
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

  if (status?.status === "coupled") {
    const { couple, partner } = status;
    const coupleId = couple.id;
    const partnerName = partner?.full_name || partner?.username || "Your partner";
    const avatarUri = partner?.avatar_url;

    return (
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["rgba(236,72,153,0.18)", "transparent"]} style={s.headerGrad}>
          <View style={s.partnerRow}>
            <View style={s.avatarWrap}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarPlaceholder]}>
                  <Text style={{ fontSize: 28 }}>👤</Text>
                </View>
              )}
            </View>
            <View style={s.heartSep}>
              <Text style={{ fontSize: 28 }}>💑</Text>
            </View>
            <View style={s.avatarWrap}>
              <View style={[s.avatar, s.avatarPlaceholder]}>
                <Text style={{ fontSize: 28 }}>😊</Text>
              </View>
            </View>
          </View>
          <Text style={s.partnerName}>{partnerName}</Text>
          {couple.accepted_at && <DaysBadge acceptedAt={couple.accepted_at} />}
          {couple.anniversary_date && (
            <Text style={s.anniversaryText}>💍 Anniversary: {couple.anniversary_date}</Text>
          )}
        </LinearGradient>

        <View style={s.cards}>
          <ActionCard
            emoji="💬"
            title="Confession Room"
            sub="Share anonymously, get support 💕"
            color="#EC4899"
            onPress={() => router.push({ pathname: "/couple/feed", params: { coupleId, userId } } as any)}
          />

          {/* Competition banner */}
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/couple/competition", params: { coupleId, userId } } as any)}
            activeOpacity={0.88}
            style={s.compBanner}
          >
            <LinearGradient colors={["#4C1D95", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.compGrad}>
              <Text style={{ fontSize: 24 }}>{compEntry && compRank && compRank <= 3 ? ["🥇","🥈","🥉"][compRank-1] : "🏆"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.compTitle}>Couple of the Month</Text>
                {compEntry ? (
                  <Text style={s.compSub}>#{compRank} · {compEntry.vote_count} votes · {compEntry.couple_name}</Text>
                ) : (
                  <Text style={s.compSub}>Enter the competition!</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </TouchableOpacity>

          <ActionCard
            emoji="📸"
            title="Shared Album"
            sub="Your photos together"
            color="#EC4899"
            onPress={() => router.push({ pathname: "/couple/album", params: { coupleId, userId } } as any)}
          />
          <ActionCard
            emoji="📝"
            title="Notes"
            sub="Leave little messages"
            color="#8B5CF6"
            onPress={() => router.push({ pathname: "/couple/notes", params: { coupleId, userId } } as any)}
          />
          <ActionCard
            emoji="🗺️"
            title="Bucket List"
            sub="Dreams to do together"
            color="#3B82F6"
            onPress={() => router.push({ pathname: "/couple/bucketlist", params: { coupleId, userId } } as any)}
          />

          <TouchableOpacity
            onPress={sendNudge}
            activeOpacity={0.82}
            style={[s.nudgeBtn, nudgeSent && s.nudgeBtnSent]}
          >
            <Text style={{ fontSize: 22 }}>{nudgeSent ? "✅" : "💭"}</Text>
            <Text style={s.nudgeBtnText}>
              {nudgeSent ? "Nudge sent!" : "Thinking of You"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={unlink} style={s.unlinkBtn}>
          <Text style={s.unlinkText}>Unlink Couple</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 120 },
  headerGrad: { alignItems: "center", paddingTop: 24, paddingBottom: 28, paddingHorizontal: 24 },
  partnerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  avatarWrap: {},
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: "#EC4899" },
  avatarPlaceholder: { backgroundColor: "rgba(236,72,153,0.18)", alignItems: "center", justifyContent: "center" },
  heartSep: { alignItems: "center" },
  partnerName: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 22, marginBottom: 10 },
  daysBadge: { backgroundColor: "rgba(236,72,153,0.2)", borderWidth: 1, borderColor: "rgba(236,72,153,0.4)", borderRadius: 16, paddingHorizontal: 20, paddingVertical: 10, alignItems: "center", marginTop: 4 },
  daysNum: { color: "#EC4899", fontFamily: "Poppins_700Bold", fontSize: 32, lineHeight: 36 },
  daysLabel: { color: "rgba(255,255,255,0.55)", fontFamily: "Poppins_400Regular", fontSize: 13 },
  anniversaryText: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 10 },
  cards: { paddingHorizontal: 16, gap: 12, marginTop: 8 },
  actionCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 18, padding: 16, borderWidth: 1 },
  actionIconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  actionTitle: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 16, marginBottom: 2 },
  actionSub: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  nudgeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(236,72,153,0.15)", borderWidth: 1.5, borderColor: "rgba(236,72,153,0.4)", borderRadius: 18, paddingVertical: 16, marginTop: 4 },
  nudgeBtnSent: { backgroundColor: "rgba(52,211,153,0.15)", borderColor: "rgba(52,211,153,0.4)" },
  nudgeBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  compBanner: { borderRadius: 18, overflow: "hidden", marginBottom: 4 },
  compGrad: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  compTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  compSub: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  unlinkBtn: { alignSelf: "center", marginTop: 28, paddingHorizontal: 20, paddingVertical: 10 },
  unlinkText: { color: "rgba(255,255,255,0.25)", fontFamily: "Poppins_400Regular", fontSize: 13 },
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
