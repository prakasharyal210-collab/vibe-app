import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RelationshipStatusBadge } from "@/components/RelationshipStatusBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { useColors } from "@/hooks/useColors";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/db";
import { Notification, supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

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

const NOTIF_FALLBACK = { icon: "notifications-outline", color: "#9CA3AF", bg: "rgba(156,163,175,0.15)" };

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  like:          { icon: "heart",               color: "#F97316", bg: "rgba(249,115,22,0.15)" },
  comment:       { icon: "chatbubble-ellipses", color: "#3B82F6", bg: "rgba(59,130,246,0.15)" },
  follow:        { icon: "person-add-outline",  color: "#7C3AED", bg: "rgba(124,58,237,0.15)" },
  vibe:          { icon: "heart-circle",        color: "#EC4899", bg: "rgba(236,72,153,0.15)" },
  mention:       { icon: "at-circle-outline",   color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  tag:           { icon: "pricetag-outline",    color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  repost:        { icon: "repeat-outline",      color: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
  save:          { icon: "bookmark-outline",    color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
  vibe_request:  { icon: "flash",               color: "#F97316", bg: "rgba(249,115,22,0.15)" },
  vibe_accepted: { icon: "heart-circle",        color: "#7C3AED", bg: "rgba(124,58,237,0.15)" },
};

function notifTypeText(type: string): string {
  switch (type) {
    case "like": return "liked your post";
    case "comment": return "commented on your post";
    case "follow": return "started following you";
    case "vibe": return "sent you a vibe ✨";
    case "mention": return "mentioned you in a comment";
    case "tag": return "tagged you in a post";
    case "vibe_request": return "wants to vibe with you ✨";
    case "vibe_accepted": return "accepted your vibe request 💜";
    default: return "interacted with you";
  }
}

// ── GradientRing ─────────────────────────────────────────────────────────────
// Wraps a child in a gradient border ring — used for unread notification avatars
function GradientRing({ size, children }: { size: number; children: React.ReactNode }) {
  const BORDER = 2.5;
  const outer = size + BORDER * 2;
  return (
    <LinearGradient
      colors={["#F97316", "#7C3AED", "#EC4899"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: outer,
        height: outer,
        borderRadius: outer / 2,
        padding: BORDER,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          backgroundColor: "#0A0A0F",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </View>
    </LinearGradient>
  );
}

// ── FollowBackButton ──────────────────────────────────────────────────────────
// Functional follow-back button — tracks its own state and calls the API
function FollowBackButton({ myId, senderId }: { myId: string; senderId: string }) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading || following || !myId || !senderId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/social/toggle-follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followerId: myId, followingId: senderId }),
      });
      if (res.ok) setFollowing(true);
    } catch {} finally {
      setLoading(false);
    }
  };

  if (following) {
    return (
      <View style={fbStyles.done}>
        <Text style={fbStyles.doneText}>Following ✓</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={handlePress} style={fbStyles.wrapper} activeOpacity={0.8} disabled={loading}>
      <LinearGradient
        colors={["#8B5CF6", "#EC4899"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={fbStyles.grad}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={fbStyles.text}>Follow Back</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const fbStyles = StyleSheet.create({
  wrapper: { borderRadius: 10, overflow: "hidden" },
  grad: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, alignItems: "center", justifyContent: "center", minWidth: 96 },
  text: { color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  done: { backgroundColor: "rgba(139,92,246,0.15)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(139,92,246,0.3)" },
  doneText: { color: "#A78BFA", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
});

// ── SectionHeaderRow ──────────────────────────────────────────────────────────
function SectionHeaderRow({ title }: { title: string }) {
  const colors = useColors();
  return (
    <View style={[shStyles.container, { backgroundColor: colors.background }]}>
      <Text style={[shStyles.title, { color: colors.mutedForeground }]}>{title}</Text>
      <LinearGradient
        colors={["rgba(124,58,237,0.5)", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={shStyles.line}
      />
    </View>
  );
}

const shStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 6 },
  title: { fontSize: 11, fontFamily: "Poppins_700Bold", textTransform: "uppercase", letterSpacing: 1.2 },
  line: { height: 1, borderRadius: 1 },
});

// ── VibeRequestInboxCard ──────────────────────────────────────────────────────
function VibeRequestInboxCard({
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
        onRespond(request.id, action);
      }
    } finally {
      setResponding(false);
    }
  };

  if (done) {
    return (
      <View style={[inboxStyles.card, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <UserAvatar username={request.sender.username} url={request.sender.avatarUrl ?? undefined} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={[inboxStyles.senderName, { color: colors.foreground }]}>@{request.sender.username}</Text>
          <Text style={{ color: done === "accepted" ? "#A78BFA" : "#9CA3AF", fontSize: 12, fontFamily: "Poppins_400Regular" }}>
            {done === "accepted" ? "Vibe accepted 💜" : "Request declined"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[inboxStyles.card, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <TouchableOpacity onPress={() => router.push(`/profile/${request.sender.username}` as any)} activeOpacity={0.8}>
        <GradientRing size={44}>
          <UserAvatar username={request.sender.username} url={request.sender.avatarUrl ?? undefined} size={44} />
        </GradientRing>
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[inboxStyles.senderName, { color: colors.foreground }]}>@{request.sender.username}</Text>
        {request.sender.relationshipStatus ? (
          <RelationshipStatusBadge status={request.sender.relationshipStatus} />
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        {responding ? (
          <ActivityIndicator size="small" color="#7C3AED" />
        ) : (
          <>
            <TouchableOpacity onPress={() => handleRespond("accept")} style={inboxStyles.acceptBtn} activeOpacity={0.8}>
              <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={inboxStyles.acceptGrad}>
                <Text style={inboxStyles.acceptBtnText}>Accept</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleRespond("decline")} style={inboxStyles.declineBtn} activeOpacity={0.8}>
              <Text style={inboxStyles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const inboxStyles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8, gap: 12 },
  senderName: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  acceptBtn: { borderRadius: 9, overflow: "hidden" },
  acceptGrad: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9 },
  acceptBtnText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  declineBtn: { backgroundColor: "rgba(107,114,128,0.18)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: "rgba(107,114,128,0.38)" },
  declineBtnText: { color: "#9CA3AF", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
});

// ── NotifRow ──────────────────────────────────────────────────────────────────
function NotifRow({
  notif,
  onRead,
  myId,
}: {
  notif: Notification;
  onRead: (id: string) => void;
  myId?: string;
}) {
  const colors = useColors();
  const config = TYPE_CONFIG[notif.type] ?? NOTIF_FALLBACK;
  const [responded, setResponded] = useState<"accepted" | "declined" | null>(null);
  const [responding, setResponding] = useState(false);
  const isUnread = !notif.read;

  const handleVibeRespond = async (action: "accept" | "decline") => {
    if (!myId || !notif.reference_id || responding) return;
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
    } finally {
      setResponding(false);
    }
  };

  const handlePress = () => {
    onRead(notif.id);
    if (notif.type === "follow" || notif.type === "vibe_accepted") {
      router.push(`/profile/${notif.username}` as any);
    } else if (notif.type === "vibe" || notif.type === "vibe_request") {
      router.push("/(tabs)/find" as any);
    } else if (notif.post_id) {
      router.push(`/post/${notif.post_id}` as any);
    } else {
      router.push(`/profile/${notif.username}` as any);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[
        styles.notifRow,
        { borderBottomColor: "rgba(255,255,255,0.05)" },
        isUnread && styles.notifRowUnread,
        isUnread && { borderLeftColor: config.color },
      ]}
      activeOpacity={0.75}
    >
      {/* Avatar with optional gradient ring for unread */}
      <TouchableOpacity onPress={() => router.push(`/profile/${notif.username}` as any)} activeOpacity={0.8}>
        <View style={styles.avatarGroup}>
          {isUnread ? (
            <GradientRing size={46}>
              <UserAvatar username={notif.username} url={notif.avatar_url ?? undefined} size={46} />
            </GradientRing>
          ) : (
            <UserAvatar username={notif.username} url={notif.avatar_url ?? undefined} size={46} />
          )}
          <View style={[styles.typeIcon, { backgroundColor: config.bg, borderColor: colors.background }]}>
            <Ionicons name={config.icon as any} size={13} color={config.color} />
          </View>
        </View>
      </TouchableOpacity>

      {/* Text body */}
      <View style={styles.notifBody}>
        <Text style={[styles.notifText, { color: colors.foreground }]}>
          <Text
            style={styles.notifUser}
            onPress={() => router.push(`/profile/${notif.username}` as any)}
          >
            {notif.username}{" "}
          </Text>
          <Text style={isUnread ? styles.notifTextUnread : {}}>
            {notif.text || notifTypeText(notif.type)}
          </Text>
        </Text>
        <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>{notif.time} ago</Text>
      </View>

      {/* Right-side action / thumbnail */}
      {notif.type === "vibe_request" && notif.reference_id ? (
        responded ? (
          <Text style={{ color: responded === "accepted" ? "#A78BFA" : "#9CA3AF", fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>
            {responded === "accepted" ? "Accepted ✓" : "Declined"}
          </Text>
        ) : (
          <View style={{ flexDirection: "column", gap: 5 }}>
            {responding ? (
              <ActivityIndicator size="small" color="#7C3AED" />
            ) : (
              <>
                <TouchableOpacity onPress={() => handleVibeRespond("accept")} style={styles.respondAccept} activeOpacity={0.8}>
                  <Text style={styles.respondAcceptText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleVibeRespond("decline")} style={styles.respondDecline} activeOpacity={0.8}>
                  <Text style={styles.respondDeclineText}>Decline</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )
      ) : notif.post_image ? (
        <View style={styles.thumbWrapper}>
          <Image source={{ uri: notif.post_image }} style={styles.postThumb} />
          {isUnread && <View style={styles.thumbUnreadDot} />}
        </View>
      ) : notif.type === "follow" ? (
        myId && notif.sender_id ? (
          <FollowBackButton myId={myId} senderId={notif.sender_id} />
        ) : (
          <View style={styles.followBtnDummy}>
            <Text style={styles.followBtnDummyText}>Follow</Text>
          </View>
        )
      ) : null}
    </TouchableOpacity>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
function EmptyState() {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <LinearGradient
        colors={["rgba(124,58,237,0.15)", "transparent"]}
        style={styles.emptyIconBg}
      >
        <Ionicons name="notifications-off-outline" size={44} color="#6B7280" />
      </LinearGradient>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All caught up</Text>
      <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
        Likes, comments, follows and vibes{"\n"}will show up here
      </Text>
    </View>
  );
}

// ── NotificationsScreen ───────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vibeRequests, setVibeRequests] = useState<VibeInboxRequest[]>([]);

  const fetchVibeRequests = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/vibe-requests/inbox?userId=${session.user.id}`);
      if (res.ok) {
        const { requests } = await res.json() as { requests: VibeInboxRequest[] };
        setVibeRequests(requests ?? []);
      }
    } catch {}
  }, [session?.user?.id]);

  const onRefresh = useCallback(async () => {
    if (!session?.user?.id) return;
    setRefreshing(true);
    await Promise.all([
      fetchNotifications(session.user.id).then(setNotifications).catch(() => {}),
      fetchVibeRequests(),
    ]);
    setRefreshing(false);
  }, [session?.user?.id, fetchVibeRequests]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;

    Promise.all([
      fetchNotifications(uid).then(setNotifications).catch(() => {}),
      fetchVibeRequests(),
    ]).finally(() => setLoading(false));

    const channelName = `notifications-${uid}-${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${uid}` },
          (payload) => {
            try {
              const n = payload.new as any;
              const newNotif: Notification = {
                id: n.id,
                type: n.type ?? "like",
                username: n.sender_username ?? "someone",
                text: n.message ?? notifTypeText(n.type),
                time: "just now",
                read: n.is_read ?? false,
                post_image: n.thumbnail_url ?? null,
                post_id: n.post_id ?? null,
                reference_id: n.reference_id ?? null,
                sender_id: n.sender_id ?? null,
              };
              setNotifications((prev) => [newNotif, ...prev]);
              if (n.type === "vibe_request") fetchVibeRequests();
            } catch {}
          }
        )
        .subscribe();
    } catch {}

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [session?.user?.id, fetchVibeRequests]);

  const markRead = (id: string) => {
    setNotifications((n) => n.map((item) => (item.id === id ? { ...item, read: true } : item)));
    markNotificationRead(id);
  };

  const markAllRead = () => {
    setNotifications((n) => n.map((item) => ({ ...item, read: true })));
    if (session?.user?.id) markAllNotificationsRead(session.user.id);
  };

  const handleInboxRespond = (id: string, _action: "accept" | "decline") => {
    setTimeout(() => {
      setVibeRequests((prev) => prev.filter((r) => r.id !== id));
    }, 1800);
  };

  function timeCategory(t: string): "today" | "week" | "earlier" {
    if (t.endsWith("s") || t.endsWith("m") || t.endsWith("h")) return "today";
    if (t.endsWith("d")) return "week";
    return "earlier";
  }

  const today = notifications.filter((n) => timeCategory(n.time) === "today");
  const thisWeek = notifications.filter((n) => timeCategory(n.time) === "week");
  const earlier = notifications.filter((n) => timeCategory(n.time) === "earlier");

  const sections = [
    ...(today.length > 0 ? [{ title: "Today", data: today }] : []),
    ...(thisWeek.length > 0 ? [{ title: "This Week", data: thisWeek }] : []),
    ...(earlier.length > 0 ? [{ title: "Earlier", data: earlier }] : []),
  ];

  const unreadCount = notifications.filter((n) => !n.read).length;
  const uid = session?.user?.id ?? "";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: "rgba(255,255,255,0.07)" }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
          {unreadCount > 0 && (
            <LinearGradient
              colors={["#8B5CF6", "#EC4899"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.badge}
            >
              <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </LinearGradient>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Loading skeleton */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading notifications…</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section: { title } }) => (
            <SectionHeaderRow title={title} />
          )}
          renderItem={({ item }) => (
            <NotifRow notif={item} onRead={markRead} myId={uid} />
          )}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            vibeRequests.length > 0 ? (
              <View style={[styles.inboxSection, { backgroundColor: colors.background }]}>
                <View style={styles.inboxHeader}>
                  <LinearGradient
                    colors={["#F97316", "#EF4444"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.inboxDot}
                  />
                  <Text style={[styles.inboxTitle, { color: "#F97316" }]}>Vibe Requests</Text>
                  <View style={styles.inboxBadge}>
                    <Text style={styles.inboxBadgeText}>{vibeRequests.length}</Text>
                  </View>
                </View>
                {vibeRequests.map((r) => (
                  <VibeRequestInboxCard
                    key={r.id}
                    request={r}
                    myId={uid}
                    onRespond={handleInboxRespond}
                  />
                ))}
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#8B5CF6"
              colors={["#8B5CF6"]}
            />
          }
          ListEmptyComponent={
            vibeRequests.length > 0 ? null : <EmptyState />
          }
          contentContainerStyle={sections.length === 0 && vibeRequests.length === 0 ? { flex: 1 } : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 13,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
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
  markAll: { fontSize: 13, fontFamily: "Poppins_600SemiBold", color: "#A78BFA" },

  // Loading
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "Poppins_400Regular" },

  // Vibe requests inbox
  inboxSection: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 4 },
  inboxHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  inboxDot: { width: 8, height: 8, borderRadius: 4 },
  inboxTitle: { fontSize: 12, fontFamily: "Poppins_700Bold", textTransform: "uppercase", letterSpacing: 1, flex: 1 },
  inboxBadge: {
    backgroundColor: "#F97316",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  inboxBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Poppins_700Bold" },

  // Notification row
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 0.5,
    gap: 12,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  notifRowUnread: {
    backgroundColor: "rgba(124,58,237,0.07)",
  },

  // Avatar + badge
  avatarGroup: { position: "relative" },
  typeIcon: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },

  // Text area
  notifBody: { flex: 1, gap: 3 },
  notifText: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 18 },
  notifTextUnread: { fontFamily: "Poppins_500Medium" },
  notifUser: { fontFamily: "Poppins_700Bold" },
  notifTime: { fontSize: 11, fontFamily: "Poppins_400Regular" },

  // Post thumbnail
  thumbWrapper: { position: "relative" },
  postThumb: { width: 48, height: 48, borderRadius: 9 },
  thumbUnreadDot: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#8B5CF6",
    borderWidth: 2,
    borderColor: "#0A0A0F",
  },

  // Follow button (dummy, when sender_id is unavailable)
  followBtnDummy: {
    backgroundColor: "rgba(139,92,246,0.18)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.4)",
  },
  followBtnDummyText: { color: "#A78BFA", fontSize: 12, fontFamily: "Poppins_600SemiBold" },

  // Vibe request respond buttons (inside notification row)
  respondAccept: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 7,
    alignItems: "center",
  },
  respondAcceptText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
  respondDecline: {
    backgroundColor: "rgba(107,114,128,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(107,114,128,0.38)",
    alignItems: "center",
  },
  respondDeclineText: { color: "#9CA3AF", fontSize: 11, fontFamily: "Poppins_600SemiBold" },

  // Empty state
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 80 },
  emptyIconBg: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  emptySubtitle: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 20 },
});
