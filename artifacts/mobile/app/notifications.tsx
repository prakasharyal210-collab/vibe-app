import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
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
import { UserAvatar } from "@/components/UserAvatar";
import { useColors } from "@/hooks/useColors";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/db";
import { Notification, supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

function notifTypeText(type: string): string {
  switch (type) {
    case "like": return "liked your post";
    case "comment": return "commented on your post";
    case "follow": return "started following you";
    case "vibe": return "sent you a vibe ✨";
    case "mention": return "mentioned you in a comment";
    case "tag": return "tagged you in a post";
    default: return "interacted with you";
  }
}

const NOTIF_FALLBACK = { icon: "notifications-outline", color: "#9CA3AF", bg: "rgba(156,163,175,0.15)" };

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  like:    { icon: "heart",                color: "#F97316", bg: "rgba(249,115,22,0.15)" },
  comment: { icon: "chatbubble-ellipses",  color: "#3B82F6", bg: "rgba(59,130,246,0.15)" },
  follow:  { icon: "person-add-outline",   color: "#7C3AED", bg: "rgba(124,58,237,0.15)" },
  vibe:    { icon: "heart-circle",         color: "#EC4899", bg: "rgba(236,72,153,0.15)" },
  mention: { icon: "at-circle-outline",    color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  tag:     { icon: "pricetag-outline",     color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  repost:  { icon: "repeat-outline",       color: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
  save:    { icon: "bookmark-outline",     color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
};

function NotifItem({ notif, onRead }: { notif: Notification; onRead: (id: string) => void }) {
  const colors = useColors();
  const config = TYPE_CONFIG[notif.type] ?? NOTIF_FALLBACK;

  const handlePress = () => {
    onRead(notif.id);
    if (notif.type === "follow") {
      router.push(`/profile/${notif.username}` as any);
    } else if (notif.type === "vibe") {
      router.push("/(tabs)/find" as any);
    } else if (notif.post_id) {
      // like, comment, tag, repost, mention, save — all reference a specific post
      router.push(`/post/${notif.post_id}` as any);
    } else {
      // fallback: sender profile
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
          <Text style={styles.notifUser} onPress={() => router.push(`/profile/${notif.username}` as any)}>{notif.username} </Text>
          {notif.text}
        </Text>
        <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>{notif.time} ago</Text>
      </View>

      {notif.post_image ? (
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

  const onRefresh = useCallback(async () => {
    if (!session?.user?.id) return;
    setRefreshing(true);
    await fetchNotifications(session.user.id).then(setNotifications).catch(() => {});
    setRefreshing(false);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    fetchNotifications(uid).then(setNotifications).catch(() => {});

    // Unique suffix per mount so rapid unmount/remount never hits
    // "can't add callbacks after subscribe()" on the same channel name.
    // Filter uses recipient_id (actual column — not user_id).
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
              };
              setNotifications((prev) => [newNotif, ...prev]);
            } catch { /* never crash on realtime payload */ }
          }
        )
        .subscribe();
    } catch { /* channel collision — safe to ignore */ }

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  const markRead = (id: string) => {
    setNotifications((n) => n.map((item) => (item.id === id ? { ...item, read: true } : item)));
    markNotificationRead(id);
  };

  const markAllRead = () => {
    setNotifications((n) => n.map((item) => ({ ...item, read: true })));
    if (session?.user?.id) markAllNotificationsRead(session.user.id);
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
          <NotifItem notif={item} onRead={markRead} />
        )}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#8B5CF6"
            colors={["#8B5CF6"]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off" size={52} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No notifications yet
            </Text>
          </View>
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
