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
        <UserAvatar username={request.sender.username} url={request.sender.avatarUrl ?? undefined} size={44} />
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
              <Text style={inboxStyles.acceptBtnText}>Accept</Text>
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
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  senderName: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  acceptBtn: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  acceptBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  declineBtn: {
    backgroundColor: "rgba(107,114,128,0.18)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(107,114,128,0.38)",
  },
  declineBtnText: {
    color: "#9CA3AF",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
});

function NotifItem({
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

  const handleRespond = async (action: "accept" | "decline") => {
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
        { borderBottomColor: "rgba(255,255,255,0.06)" },
        !notif.read && { backgroundColor: "rgba(139,92,246,0.06)" },
        { borderLeftWidth: 3, borderLeftColor: !notif.read ? config.color : "transparent" },
      ]}
      activeOpacity={0.78}
    >
      <TouchableOpacity onPress={() => router.push(`/profile/${notif.username}` as any)} activeOpacity={0.8}>
        <View style={styles.avatarGroup}>
          <UserAvatar username={notif.username} url={notif.avatar_url ?? undefined} size={46} />
          <View style={[styles.typeIcon, { backgroundColor: config.bg }]}>
            <Ionicons name={config.icon as any} size={14} color={config.color} />
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.notifBody}>
        <Text style={[styles.notifText, { color: colors.foreground }]}>
          <Text style={styles.notifUser} onPress={() => router.push(`/profile/${notif.username}` as any)}>
            {notif.username}{" "}
          </Text>
          {notif.text}
        </Text>
        <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>{notif.time} ago</Text>
      </View>

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
                <TouchableOpacity onPress={() => handleRespond("accept")} style={styles.respondAccept} activeOpacity={0.8}>
                  <Text style={styles.respondAcceptText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleRespond("decline")} style={styles.respondDecline} activeOpacity={0.8}>
                  <Text style={styles.respondDeclineText}>Decline</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )
      ) : notif.post_image ? (
        <Image source={{ uri: notif.post_image }} style={styles.postThumb} />
      ) : notif.type === "follow" ? (
        <TouchableOpacity style={styles.followBtn}>
          <LinearGradient
            colors={["#8B5CF6", "#EC4899"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.followBtnGrad}
          >
            <Text style={styles.followBtnText}>Follow</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      {!notif.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [notifications, setNotifications] = useState<Notification[]>([]);
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
    fetchNotifications(uid).then(setNotifications).catch(() => {});
    fetchVibeRequests();

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
                post_image: n.thumbnail_url ?? undefined,
                reference_id: n.reference_id ?? null,
              };
              setNotifications((prev) => [newNotif, ...prev]);
              if (n.type === "vibe_request") {
                fetchVibeRequests();
              }
            } catch { }
          }
        )
        .subscribe();
    } catch { }

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
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={[styles.markAll, { color: "#7C3AED" }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section: { title } }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <NotifItem notif={item} onRead={markRead} myId={uid} />
        )}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          vibeRequests.length > 0 ? (
            <View style={[styles.inboxSection, { backgroundColor: colors.background }]}>
              <View style={styles.inboxHeader}>
                <Text style={[styles.sectionTitle, { color: "#F97316" }]}>✨ VIBE REQUESTS</Text>
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
          vibeRequests.length > 0 ? null : (
            <View style={styles.empty}>
              <Ionicons name="notifications-off" size={52} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No notifications yet
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  titleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
  },
  badge: {
    backgroundColor: "#8B5CF6",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
  },
  markAll: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: "#A78BFA",
  },
  inboxSection: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
  },
  inboxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  inboxBadge: {
    backgroundColor: "#F97316",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  inboxBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  avatarGroup: {
    position: "relative",
  },
  typeIcon: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0A0A0F",
  },
  notifBody: {
    flex: 1,
    gap: 3,
  },
  notifText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    lineHeight: 18,
  },
  notifUser: {
    fontFamily: "Poppins_700Bold",
  },
  notifTime: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  postThumb: {
    width: 46,
    height: 46,
    borderRadius: 8,
  },
  followBtn: {
    borderRadius: 10,
    overflow: "hidden",
  },
  followBtnGrad: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  followBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  respondAccept: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 7,
    alignItems: "center",
  },
  respondAcceptText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  respondDecline: {
    backgroundColor: "rgba(107,114,128,0.18)",
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(107,114,128,0.38)",
    alignItems: "center",
  },
  respondDeclineText: {
    color: "#9CA3AF",
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#8B5CF6",
  },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
});
