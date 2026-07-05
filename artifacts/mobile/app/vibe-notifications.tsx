import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { useColors } from "@/hooks/useColors";
import { fetchNotifications, markNotificationRead } from "@/lib/db";
import { Notification } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface VibeInboxRequest {
  id: string;
  senderId: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    relationshipStatus: string | null;
  };
}

interface VibeMatch {
  id: string;
  matchRowId: string;
  matchedAt: string | null;
  username: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  interests: string[];
  isVerified: boolean;
  compatibilityScore: number;
}

// Vibe-only notification types
const VIBE_TYPES = new Set(["vibe_request", "vibe_accepted", "vibe", "vibe_match"]);

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  vibe_request:  { icon: "flash",          color: "#F97316", bg: "rgba(249,115,22,0.18)",  label: "wants to vibe with you ✨" },
  vibe_accepted: { icon: "heart-circle",   color: "#7C3AED", bg: "rgba(124,58,237,0.18)", label: "accepted your vibe request 💜" },
  vibe_match:    { icon: "heart-circle",   color: "#EC4899", bg: "rgba(236,72,153,0.18)", label: "It's a match! 💜" },
  vibe:          { icon: "sparkles",       color: "#EC4899", bg: "rgba(236,72,153,0.18)", label: "sent you a vibe ✨" },
};
const FALLBACK_CFG = { icon: "flash-outline", color: "#A78BFA", bg: "rgba(167,139,250,0.15)", label: "vibed with you" };

// ── GradientRing ──────────────────────────────────────────────────────────────
function GradientRing({ size, children }: { size: number; children: React.ReactNode }) {
  const BORDER = 2.5;
  const outer = size + BORDER * 2;
  return (
    <LinearGradient
      colors={["#F97316", "#7C3AED", "#EC4899"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: outer, height: outer, borderRadius: outer / 2, padding: BORDER, alignItems: "center", justifyContent: "center" }}
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: "#0A0A0F", alignItems: "center", justifyContent: "center" }}>
        {children}
      </View>
    </LinearGradient>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({ title, icon }: { title: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={sh.container}>
      <Ionicons name={icon as any} size={14} color="#A78BFA" />
      <Text style={[sh.title, { color: colors.mutedForeground }]}>{title}</Text>
      <LinearGradient
        colors={["rgba(124,58,237,0.5)", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={sh.line}
      />
    </View>
  );
}
const sh = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, gap: 7 },
  title: { fontSize: 11, fontFamily: "Poppins_700Bold", textTransform: "uppercase", letterSpacing: 1.2 },
  line: { flex: 1, height: 1, borderRadius: 1 },
});

// ── VibeInboxCard — accept/decline incoming vibe requests ─────────────────────
function VibeInboxCard({
  request,
  myId,
  onRespond,
}: {
  request: VibeInboxRequest;
  myId: string;
  onRespond: (id: string, action: "accept" | "decline") => void;
}) {
  const colors = useColors();
  const [responding, setResponding] = useState(false);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  const handleRespond = async (action: "accept" | "decline") => {
    if (responding) return;
    setResponding(true);
    try {
      const res = await fetch(`${API_BASE}/vibe-requests/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id, userId: myId, action }),
      });
      if (res.ok) {
        setDone(action === "accept" ? "accepted" : "declined");
        setTimeout(() => onRespond(request.id, action), 1400);
      }
    } catch {} finally {
      setResponding(false);
    }
  };

  return (
    <View style={[vic.card, { backgroundColor: colors.card, borderColor: "rgba(249,115,22,0.2)" }]}>
      <TouchableOpacity
        onPress={() => router.push(`/profile/${request.sender.username}` as any)}
        activeOpacity={0.8}
      >
        <GradientRing size={50}>
          <UserAvatar username={request.sender.username} url={request.sender.avatarUrl ?? undefined} size={50} />
        </GradientRing>
      </TouchableOpacity>

      <View style={vic.body}>
        <TouchableOpacity onPress={() => router.push(`/profile/${request.sender.username}` as any)} activeOpacity={0.85}>
          <Text style={[vic.name, { color: colors.foreground }]} numberOfLines={1}>
            {request.sender.displayName ?? request.sender.username}
          </Text>
        </TouchableOpacity>
        <Text style={[vic.sub, { color: colors.mutedForeground }]}>wants to vibe with you ✨</Text>
      </View>

      {done ? (
        <Text style={{ color: done === "accepted" ? "#A78BFA" : "#9CA3AF", fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>
          {done === "accepted" ? "Accepted ✓" : "Declined"}
        </Text>
      ) : responding ? (
        <ActivityIndicator size="small" color="#7C3AED" />
      ) : (
        <View style={vic.btnGroup}>
          <TouchableOpacity onPress={() => handleRespond("accept")} style={vic.acceptBtn} activeOpacity={0.85}>
            <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={vic.acceptGrad}>
              <Text style={vic.acceptText}>Accept</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleRespond("decline")} style={[vic.declineBtn, { borderColor: colors.border }]} activeOpacity={0.85}>
            <Text style={[vic.declineText, { color: colors.mutedForeground }]}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
const vic = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginBottom: 10, padding: 12, borderRadius: 14, borderWidth: 1, gap: 11 },
  body: { flex: 1 },
  name: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 1 },
  btnGroup: { flexDirection: "column", gap: 5 },
  acceptBtn: { borderRadius: 9, overflow: "hidden" },
  acceptGrad: { paddingHorizontal: 13, paddingVertical: 7, alignItems: "center" },
  acceptText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  declineBtn: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 9, borderWidth: 1, alignItems: "center" },
  declineText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
});

// ── ActivityNotifRow — single vibe notification item ──────────────────────────
function ActivityNotifRow({
  notif,
  myId,
  onRead,
}: {
  notif: Notification;
  myId: string;
  onRead: (id: string) => void;
}) {
  const colors = useColors();
  const cfg = TYPE_CONFIG[notif.type] ?? FALLBACK_CFG;
  const isUnread = !notif.read;
  const [responded, setResponded] = useState<"accepted" | "declined" | null>(null);
  const [responding, setResponding] = useState(false);

  const handleVibeRespond = async (action: "accept" | "decline") => {
    if (!notif.reference_id || responding) return;
    setResponding(true);
    try {
      const res = await fetch(`${API_BASE}/vibe-requests/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: notif.reference_id, userId: myId, action }),
      });
      if (res.ok) {
        setResponded(action === "accept" ? "accepted" : "declined");
        onRead(notif.id);
      }
    } finally { setResponding(false); }
  };

  const handlePress = () => {
    onRead(notif.id);
    if (notif.type === "vibe_accepted" || notif.type === "vibe_match") {
      router.push({ pathname: "/(tabs)/find", params: { tab: "matches" } } as any);
    } else if (notif.type === "vibe_request" || notif.type === "vibe") {
      router.push({ pathname: "/(tabs)/find", params: { tab: "requests" } } as any);
    } else {
      router.push("/(tabs)/find" as any);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[anr.row, { borderBottomColor: "rgba(255,255,255,0.05)" }, isUnread && { backgroundColor: "rgba(124,58,237,0.05)", borderLeftColor: cfg.color, borderLeftWidth: 2 }]}
      activeOpacity={0.75}
    >
      {/* Avatar */}
      <View style={anr.avatarWrap}>
        {isUnread ? (
          <GradientRing size={44}>
            <UserAvatar username={notif.username} url={(notif as any).avatar_url ?? undefined} size={44} />
          </GradientRing>
        ) : (
          <UserAvatar username={notif.username} url={(notif as any).avatar_url ?? undefined} size={44} />
        )}
        <View style={[anr.typeIcon, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
        </View>
      </View>

      {/* Text */}
      <View style={anr.body}>
        <Text style={[anr.text, { color: colors.foreground }]} numberOfLines={2}>
          <Text style={anr.username}>{notif.username} </Text>
          <Text style={isUnread ? { color: colors.foreground } : { color: colors.mutedForeground }}>
            {notif.text || cfg.label}
          </Text>
        </Text>
        <Text style={[anr.time, { color: colors.mutedForeground }]}>{notif.time} ago</Text>
      </View>

      {/* Right: respond buttons for vibe_request, or type badge */}
      {notif.type === "vibe_request" && notif.reference_id ? (
        responded ? (
          <Text style={{ color: responded === "accepted" ? "#A78BFA" : "#9CA3AF", fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>
            {responded === "accepted" ? "Accepted ✓" : "Declined"}
          </Text>
        ) : responding ? (
          <ActivityIndicator size="small" color="#7C3AED" />
        ) : (
          <View style={{ flexDirection: "column", gap: 5 }}>
            <TouchableOpacity onPress={() => handleVibeRespond("accept")} style={anr.acceptBtn} activeOpacity={0.85}>
              <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={anr.acceptGrad}>
                <Text style={anr.acceptText}>Accept</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleVibeRespond("decline")} style={anr.declineBtn} activeOpacity={0.85}>
              <Text style={anr.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        )
      ) : notif.type === "vibe_match" ? (
        <View style={[anr.matchBadge, { backgroundColor: "rgba(236,72,153,0.12)", borderColor: "rgba(236,72,153,0.3)" }]}>
          <Text style={{ fontSize: 10, color: "#EC4899", fontFamily: "Poppins_700Bold" }}>MATCH</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}
const anr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, gap: 10 },
  avatarWrap: { position: "relative" },
  typeIcon: { position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  text: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 18 },
  username: { fontFamily: "Poppins_600SemiBold" },
  time: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 2 },
  acceptBtn: { borderRadius: 8, overflow: "hidden" },
  acceptGrad: { paddingHorizontal: 11, paddingVertical: 5, alignItems: "center" },
  acceptText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
  declineBtn: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center" },
  declineText: { color: "#9CA3AF", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
  matchBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
});

// ── CompatibilityCard — one match card in the horizontal scroll row ────────────
function CompatibilityCard({ match }: { match: VibeMatch & { score: number; factors: string[] } }) {
  const colors = useColors();
  const pct = Math.round(match.score);
  const scoreColor = pct >= 70 ? "#A78BFA" : pct >= 45 ? "#EC4899" : "#9CA3AF";

  return (
    <TouchableOpacity
      style={[cc.card, { backgroundColor: colors.card, borderColor: "rgba(124,58,237,0.22)" }]}
      activeOpacity={0.85}
      onPress={() => router.push(`/profile/${match.username}` as any)}
    >
      {/* Avatar */}
      <View style={cc.avatarWrap}>
        <UserAvatar username={match.username} url={match.avatarUrl ?? undefined} size={60} />
        {/* Score ring overlay */}
        <View style={[cc.scoreBadge, { backgroundColor: colors.background, borderColor: scoreColor }]}>
          <Text style={[cc.scoreText, { color: scoreColor }]}>{pct}%</Text>
        </View>
      </View>

      {/* Name */}
      <Text style={[cc.name, { color: colors.foreground }]} numberOfLines={1}>{match.name}</Text>
      <Text style={[cc.username, { color: colors.mutedForeground }]} numberOfLines={1}>@{match.username}</Text>

      {/* Top factor */}
      {match.factors[0] ? (
        <Text style={[cc.factor, { color: "#A78BFA" }]} numberOfLines={1}>{match.factors[0]}</Text>
      ) : null}

      {/* View Profile button */}
      <TouchableOpacity
        style={cc.viewBtn}
        activeOpacity={0.8}
        onPress={() => router.push(`/profile/${match.username}` as any)}
      >
        <LinearGradient
          colors={["#7C3AED", "#EC4899"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={cc.viewGrad}
        >
          <Text style={cc.viewText}>View Profile</Text>
        </LinearGradient>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
const cc = StyleSheet.create({
  card: { width: 148, borderRadius: 16, borderWidth: 1, padding: 14, alignItems: "center", gap: 5, marginRight: 12 },
  avatarWrap: { position: "relative", marginBottom: 4 },
  scoreBadge: { position: "absolute", bottom: -4, right: -4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1.5 },
  scoreText: { fontSize: 10, fontFamily: "Poppins_700Bold" },
  name: { fontSize: 13, fontFamily: "Poppins_600SemiBold", textAlign: "center" },
  username: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "center" },
  factor: { fontSize: 10, fontFamily: "Poppins_600SemiBold", textAlign: "center" },
  viewBtn: { borderRadius: 9, overflow: "hidden", marginTop: 6, width: "100%" },
  viewGrad: { paddingVertical: 7, alignItems: "center", borderRadius: 9 },
  viewText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
});

// ── EmptyActivity ──────────────────────────────────────────────────────────────
function EmptyActivity() {
  const colors = useColors();
  return (
    <View style={ea.wrap}>
      <LinearGradient colors={["rgba(124,58,237,0.12)", "transparent"]} style={ea.iconBg}>
        <Ionicons name="flash-outline" size={36} color="#6B7280" />
      </LinearGradient>
      <Text style={[ea.title, { color: colors.foreground }]}>No activity yet</Text>
      <Text style={[ea.sub, { color: colors.mutedForeground }]}>Vibe requests, matches and{"\n"}accepted vibes will appear here</Text>
    </View>
  );
}
const ea = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 24 },
  iconBg: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontSize: 16, fontFamily: "Poppins_600SemiBold", marginBottom: 6 },
  sub: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 20 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function VibeNotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const userId = session?.user?.id ?? "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Section 1: vibe-filtered notifications + pending inbox requests
  const [vibeNotifs, setVibeNotifs] = useState<Notification[]>([]);
  const [inboxRequests, setInboxRequests] = useState<VibeInboxRequest[]>([]);

  // Section 2: mutual matches with computed compatibility scores
  const [matchCards, setMatchCards] = useState<(VibeMatch & { score: number; factors: string[] })[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    const [all, inboxRes] = await Promise.allSettled([
      fetchNotifications(userId),
      fetch(`${API_BASE}/vibe-requests/inbox?userId=${userId}`).then((r) => r.ok ? r.json() : { requests: [] }),
    ]);
    if (all.status === "fulfilled") {
      const raw = all.value.filter((n) => VIBE_TYPES.has(n.type));
      // Dedupe vibe_request/vibe notifications by sender — show only the newest
      // per sender. Notifications are returned newest-first, so the first
      // occurrence per sender_id is the most recent.
      const seenSenders = new Set<string>();
      const deduped = raw.filter((n) => {
        if (n.type !== "vibe_request" && n.type !== "vibe") return true;
        const sid = (n as any).sender_id;
        if (!sid || seenSenders.has(sid)) return false;
        seenSenders.add(sid);
        return true;
      });
      setVibeNotifs(deduped);
    }
    if (inboxRes.status === "fulfilled") {
      setInboxRequests((inboxRes.value as any).requests ?? []);
    }
  }, [userId]);

  const loadMatches = useCallback(async () => {
    if (!userId) return;
    setMatchesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vibe/matches?userId=${userId}`);
      if (!res.ok) { setMatchesLoading(false); return; }
      const { matches } = await res.json() as { matches: VibeMatch[] };
      const top5 = (matches ?? []).slice(0, 5);
      if (top5.length === 0) { setMatchCards([]); setMatchesLoading(false); return; }

      // Compute compatibility score for each match in parallel
      const scored = await Promise.all(
        top5.map(async (m) => {
          try {
            const cr = await fetch(`${API_BASE}/vibe/compatibility?userId=${userId}&targetId=${m.id}`);
            const { score, factors } = cr.ok ? await cr.json() as { score: number; factors: string[] } : { score: 0, factors: [] };
            return { ...m, score: score ?? 0, factors: factors ?? [] };
          } catch {
            return { ...m, score: 0, factors: [] };
          }
        })
      );

      // Sort descending by score
      scored.sort((a, b) => b.score - a.score);
      setMatchCards(scored);
    } catch {} finally {
      setMatchesLoading(false);
    }
  }, [userId]);

  const load = useCallback(async () => {
    await Promise.all([loadNotifications(), loadMatches()]);
    setLoading(false);
  }, [loadNotifications, loadMatches]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadNotifications(), loadMatches()]);
    setRefreshing(false);
  }, [loadNotifications, loadMatches]);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  const markRead = (id: string) => {
    setVibeNotifs((n) => n.map((item) => (item.id === id ? { ...item, read: true } : item)));
    markNotificationRead(id);
  };

  const handleInboxRespond = (id: string, _action: "accept" | "decline") => {
    setTimeout(() => setInboxRequests((prev) => prev.filter((r) => r.id !== id)), 1400);
  };

  const unreadCount = vibeNotifs.filter((n) => !n.read).length + inboxRequests.length;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: topInset + 8, borderBottomColor: "rgba(255,255,255,0.07)" }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <View style={s.titleRow}>
          <LinearGradient
            colors={["#F97316", "#7C3AED"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.titleIcon}
          >
            <Ionicons name="flash" size={14} color="#fff" />
          </LinearGradient>
          <Text style={[s.title, { color: colors.foreground }]}>Vibe Activity</Text>
          {unreadCount > 0 && (
            <LinearGradient
              colors={["#7C3AED", "#EC4899"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.badge}
            >
              <Text style={s.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </LinearGradient>
          )}
        </View>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Loading vibe activity…</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" colors={["#8B5CF6"]} />
          }
          contentContainerStyle={s.scrollContent}
        >
          {/* ── Section 1: Match Activity ── */}
          <SectionHeader title="Match Activity" icon="flash" />

          {/* Pending inbox requests first (accept/decline) */}
          {inboxRequests.length > 0 && (
            <View style={s.inboxWrap}>
              {inboxRequests.map((r) => (
                <VibeInboxCard key={r.id} request={r} myId={userId} onRespond={handleInboxRespond} />
              ))}
            </View>
          )}

          {/* Vibe-filtered notification history */}
          {vibeNotifs.length > 0 ? (
            <View style={[s.notifList, { borderColor: "rgba(255,255,255,0.06)", backgroundColor: colors.card }]}>
              {vibeNotifs.map((n) => (
                <ActivityNotifRow key={n.id} notif={n} myId={userId} onRead={markRead} />
              ))}
            </View>
          ) : inboxRequests.length === 0 ? (
            <EmptyActivity />
          ) : null}

          {/* ── Section 2: Best Profile Matches ── */}
          <SectionHeader title="Best Profile Matches" icon="heart-circle" />

          {matchesLoading ? (
            <View style={s.matchLoadWrap}>
              <ActivityIndicator size="small" color="#8B5CF6" />
              <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Finding your best matches…</Text>
            </View>
          ) : matchCards.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.horizontalScroll}
            >
              {matchCards.map((m) => (
                <CompatibilityCard key={m.id} match={m} />
              ))}
            </ScrollView>
          ) : (
            <View style={s.noMatchWrap}>
              <Text style={[s.noMatchText, { color: colors.mutedForeground }]}>
                No mutual matches yet — keep swiping on{" "}
                <Text
                  style={{ color: "#A78BFA", fontFamily: "Poppins_600SemiBold" }}
                  onPress={() => router.push("/(tabs)/find" as any)}
                >
                  Find Vibe
                </Text>
              </Text>
            </View>
          )}

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 13,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  titleIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 21, fontFamily: "Poppins_700Bold" },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_700Bold" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "Poppins_400Regular" },
  scrollContent: { paddingTop: 4, paddingBottom: 16 },
  inboxWrap: { paddingTop: 6 },
  notifList: { marginHorizontal: 14, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  matchLoadWrap: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 20 },
  horizontalScroll: { paddingHorizontal: 14, paddingVertical: 10 },
  noMatchWrap: { paddingHorizontal: 16, paddingVertical: 20 },
  noMatchText: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 20 },
});
