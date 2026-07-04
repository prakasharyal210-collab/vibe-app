/**
 * Admin Welcome Desk — admin-only screen (is_admin = true).
 * Lists new users' first posts from the last 7 days with AI-suggested
 * founder comments. Send a personal welcome comment with one tap.
 *
 * Navigate to this screen via: router.push("/admin/welcome-desk")
 */
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";

// ─── Admin check (matches reports.tsx) ────────────────────────────────────────
const ADMIN_USERNAMES = ["prakasharyal", "admin", "gundruk_admin"];

interface FirstPost {
  id: string;
  caption: string;
  thumbnail_url: string | null;
  media_url: string | null;
  created_at: string;
  author_username: string | null;
  author_avatar_url: string | null;
  founder_commented: boolean;
  welcome_bot_commented: boolean;
  suggested_comment: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Post Card (module-scope to avoid remount-on-render) ──────────────────────
function WelcomeCard({
  post,
  userId,
  apiBase,
  colors,
  onSent,
}: {
  post: FirstPost;
  userId: string;
  apiBase: string;
  colors: ReturnType<typeof useColors>;
  onSent: (postId: string) => void;
}) {
  const [text, setText] = useState(post.suggested_comment);
  const [sending, setSending] = useState(false);
  const done = post.founder_commented;

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${apiBase}/admin/first-posts/${post.id}/comment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        Alert.alert("Error", (json as any).error ?? "Failed to post comment");
        return;
      }
      onSent(post.id);
    } catch {
      Alert.alert("Error", "Network error — please try again");
    } finally {
      setSending(false);
    }
  };

  const thumbUri = post.thumbnail_url ?? post.media_url;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: done ? "#10B98144" : colors.border,
        overflow: "hidden",
        marginBottom: 14,
      }}
    >
      {/* Thumbnail */}
      {!!thumbUri && (
        <Image
          source={{ uri: thumbUri }}
          style={{ width: "100%", height: 180 }}
          contentFit="cover"
        />
      )}

      <View style={{ padding: 14 }}>
        {/* Author row */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
          <UserAvatar url={post.author_avatar_url ?? undefined} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>
              @{post.author_username ?? "unknown"}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Poppins_400Regular" }}>
              {timeAgo(post.created_at)} · First post 🌱
            </Text>
          </View>
          {done && (
            <View
              style={{
                backgroundColor: "#10B98122",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: "#10B981", fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>
                Welcomed ✓
              </Text>
            </View>
          )}
        </View>

        {/* Caption */}
        {!!post.caption && (
          <Text
            style={{
              color: colors.foreground,
              fontSize: 13,
              fontFamily: "Poppins_400Regular",
              marginBottom: 12,
              lineHeight: 19,
            }}
            numberOfLines={3}
          >
            {post.caption}
          </Text>
        )}

        {/* Comment input + send button */}
        {!done ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder="Write a welcome comment…"
              placeholderTextColor={colors.mutedForeground}
              style={{
                backgroundColor: colors.background,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 10,
                color: colors.foreground,
                fontSize: 13,
                fontFamily: "Poppins_400Regular",
                minHeight: 60,
                textAlignVertical: "top",
              }}
            />
            <TouchableOpacity
              onPress={send}
              disabled={sending || !text.trim()}
              activeOpacity={0.8}
              style={{
                backgroundColor: text.trim() && !sending ? "#7C3AED" : colors.muted,
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>
                  Send 💬
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          post.welcome_bot_commented && (
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: 11,
                fontFamily: "Poppins_400Regular",
                marginTop: 2,
              }}
            >
              Bot also welcomed them ✓
            </Text>
          )
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function WelcomeDeskScreen() {
  const { session } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const userId = session?.user?.id ?? "";
  const username = (session?.user?.user_metadata?.username ?? "") as string;
  const isAdmin = ADMIN_USERNAMES.includes(username.toLowerCase());

  const [posts, setPosts] = useState<FirstPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

  const fetchPosts = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await fetch(`${apiBase}/admin/first-posts`, {
          headers: { "x-user-id": userId },
        });
        if (res.status === 403) {
          setAccessDenied(true);
          return;
        }
        const json = await res.json();
        setPosts((json.posts ?? []) as FirstPost[]);
      } catch {
        Alert.alert("Error", "Could not load first posts");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId, apiBase],
  );

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      setAccessDenied(true);
      return;
    }
    fetchPosts();
  }, [isAdmin]);

  const handleSent = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, founder_commented: true } : p)),
    );
  }, []);

  if (!isAdmin || accessDenied) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="lock-closed" size={48} color={colors.mutedForeground} />
        <Text
          style={{
            color: colors.mutedForeground,
            marginTop: 12,
            fontSize: 16,
            fontFamily: "Poppins_500Medium",
          }}
        >
          Access denied
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 24 }}>
          <Text style={{ color: "#7C3AED", fontSize: 14, fontFamily: "Poppins_500Medium" }}>
            Go back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pending = posts.filter((p) => !p.founder_commented);
  const done = posts.filter((p) => p.founder_commented);
  const ordered = [...pending, ...done];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: Platform.OS === "web" ? 16 : insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.foreground,
              fontSize: 18,
              fontFamily: "Poppins_600SemiBold",
            }}
          >
            Welcome Desk
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 12,
              fontFamily: "Poppins_400Regular",
            }}
          >
            {pending.length} to welcome · last 7 days
          </Text>
        </View>
        <TouchableOpacity onPress={() => fetchPosts(true)}>
          <Ionicons name="refresh" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#7C3AED" size="large" />
          <Text
            style={{
              color: colors.mutedForeground,
              marginTop: 12,
              fontSize: 13,
              fontFamily: "Poppins_400Regular",
            }}
          >
            Generating suggestions…
          </Text>
        </View>
      ) : posts.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
          <Text
            style={{
              color: colors.mutedForeground,
              marginTop: 12,
              fontFamily: "Poppins_500Medium",
            }}
          >
            No first posts in the last 7 days
          </Text>
        </View>
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchPosts(true)}
              tintColor="#7C3AED"
            />
          }
          renderItem={({ item }) => (
            <WelcomeCard
              post={item}
              userId={userId}
              apiBase={apiBase}
              colors={colors}
              onSent={handleSent}
            />
          )}
        />
      )}
    </View>
  );
}
