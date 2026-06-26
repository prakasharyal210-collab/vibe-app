import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "");

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

interface Notification {
  id: string;
  type: "reaction" | "comment";
  post_id: string;
  post_content: string;
  post_category: string;
  reaction?: string;
  comment_preview?: string;
  created_at: string;
  label: string;
}

export default function FeedNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { coupleId, userId } = useLocalSearchParams<{ coupleId: string; userId: string }>();
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAndMarkSeen = useCallback(async () => {
    if (!userId) return;
    try {
      const [res] = await Promise.all([
        fetch(`${API_BASE}/api/couple-feed/notifications?userId=${encodeURIComponent(userId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        fetch(`${API_BASE}/api/couple-feed/notifications/mark-seen`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ userId }),
        }),
      ]);
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [userId, token]);

  useEffect(() => {
    fetchAndMarkSeen();
  }, [fetchAndMarkSeen]);

  const handleTap = (notif: Notification) => {
    if (notif.type === "comment") {
      const minimalPost = {
        id: notif.post_id,
        content: notif.post_content,
        category: notif.post_category,
        photo_url: null,
        like_count: 0,
        comment_count: 0,
        coupleName: "Anonymous 💕",
        isAnonymous: true,
        postNumber: null,
        age: null,
        location: null,
        author: null,
        partner: null,
        created_at: notif.created_at,
      };
      router.push({
        pathname: "/couple/feed-comments",
        params: {
          postId: notif.post_id,
          coupleId: coupleId ?? "",
          authorId: userId ?? "",
          postJson: JSON.stringify(minimalPost),
        },
      } as any);
    } else {
      router.back();
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Activity</Text>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#ffffff" size="large" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>🔔</Text>
          <Text style={s.emptyTitle}>No activity yet</Text>
          <Text style={s.emptySub}>
            When someone reacts or comments on your confession, you'll see it here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 28,
            paddingTop: 4,
          }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onPress={() => handleTap(item)} activeOpacity={0.75}>
              <View style={s.rowLeft}>
                <Text style={s.rowLabel}>{item.label}</Text>
                {item.type === "comment" && item.comment_preview ? (
                  <Text style={s.preview} numberOfLines={2}>
                    "{item.comment_preview}"
                  </Text>
                ) : null}
                {item.post_content ? (
                  <Text style={s.postSnippet} numberOfLines={1}>
                    on: {item.post_content}
                  </Text>
                ) : null}
              </View>
              <Text style={s.time}>{timeAgo(item.created_at)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 18, color: "#ffffff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  emptyEmoji: { fontSize: 52, marginBottom: 8 },
  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#ffffff",
    textAlign: "center",
  },
  emptySub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: "#888888",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
  },
  rowLeft: { flex: 1, gap: 4 },
  rowLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#ffffff" },
  preview: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#cccccc",
    fontStyle: "italic",
  },
  postSnippet: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "#555555" },
  time: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "#555555",
    paddingTop: 2,
    flexShrink: 0,
  },
  separator: { height: 1, backgroundColor: "rgba(255,255,255,0.06)" },
});
