import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "");

const CAT_COLORS: Record<string, string> = {
  Story: "#EC4899",
  Advice: "#3B82F6",
  Milestone: "#F59E0B",
  Venting: "#8B5CF6",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  author: { name: string; avatar: string | null } | null;
}

interface Post {
  id: string;
  content: string;
  photo_url: string | null;
  category: string;
  like_count: number;
  comment_count: number;
  coupleName: string;
  author: { name: string; avatar: string | null } | null;
  partner: { name: string; avatar: string | null } | null;
  created_at: string;
}

function Avatar({ uri, size = 32 }: { uri: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#2a1a3e", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.45 }}>👤</Text>
    </View>
  );
}

export default function FeedCommentsScreen() {
  const insets = useSafeAreaInsets();
  const { postId, coupleId, authorId, postJson } = useLocalSearchParams<{
    postId: string;
    coupleId: string;
    authorId: string;
    postJson: string;
  }>();
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const post: Post | null = (() => { try { return postJson ? JSON.parse(postJson) : null; } catch { return null; } })();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const fetchComments = useCallback(async () => {
    if (!postId) return;
    try {
      const res = await fetch(`${API_BASE}/api/couple-feed/posts/${postId}/comments`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setComments(data.comments ?? []);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [postId, token]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const sendComment = async () => {
    if (!commentText.trim() || sending) return;
    setSending(true);
    const text = commentText.trim();
    setCommentText("");
    try {
      const res = await fetch(`${API_BASE}/api/couple-feed/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ coupleId, authorId, content: text }),
      });
      const data = await res.json();
      if (data.comment) {
        setComments((prev) => [data.comment, ...prev]);
        setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
      }
    } catch {
      setCommentText(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Comments</Text>
          <View style={{ width: 38 }} />
        </View>

        <FlatList
          ref={listRef}
          data={comments}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={
            post ? (
              <View style={s.postCard}>
                <View style={s.postHeader}>
                  <View style={s.avatarOverlap}>
                    <Avatar uri={post.author?.avatar ?? null} size={30} />
                    <View style={{ marginLeft: -8 }}>
                      <Avatar uri={post.partner?.avatar ?? null} size={30} />
                    </View>
                  </View>
                  <Text style={s.coupleName} numberOfLines={1}>{post.coupleName || "A Couple"}</Text>
                  <View style={[s.catBadge, { backgroundColor: (CAT_COLORS[post.category] ?? "#EC4899") + "22", borderColor: (CAT_COLORS[post.category] ?? "#EC4899") + "55" }]}>
                    <Text style={[s.catText, { color: CAT_COLORS[post.category] ?? "#EC4899" }]}>{post.category}</Text>
                  </View>
                </View>
                <Text style={s.postContent}>{post.content}</Text>
                {post.photo_url ? (
                  <Image source={{ uri: post.photo_url }} style={s.postPhoto} resizeMode="cover" />
                ) : null}
                <Text style={s.postMeta}>{timeAgo(post.created_at)} · ❤️ {post.like_count} · 💬 {post.comment_count}</Text>
                <View style={s.divider} />
                <Text style={s.commentsSectionLabel}>
                  {loading ? "Loading comments…" : comments.length === 0 ? "No comments yet. Be first!" : `${comments.length} comment${comments.length !== 1 ? "s" : ""}`}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={s.commentRow}>
              <Avatar uri={item.author?.avatar ?? null} size={34} />
              <View style={s.commentBubble}>
                <Text style={s.commentAuthor}>{item.author?.name ?? "Someone"}</Text>
                <Text style={s.commentText}>{item.content}</Text>
                <Text style={s.commentTime}>{timeAgo(item.created_at)}</Text>
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            !loading && !post ? (
              <View style={s.center}>
                <ActivityIndicator color="#EC4899" />
              </View>
            ) : null
          }
        />

        <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={s.input}
            placeholder="Add a comment…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={sendComment}
          />
          <TouchableOpacity
            onPress={sendComment}
            disabled={!commentText.trim() || sending}
            style={[s.sendBtn, (!commentText.trim() || sending) && { opacity: 0.4 }]}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080810" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 18, color: "#fff", textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
  postCard: { margin: 16, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  avatarOverlap: { flexDirection: "row" },
  coupleName: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#fff" },
  catBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  catText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  postContent: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 22, marginBottom: 10 },
  postPhoto: { width: "100%", height: 180, borderRadius: 12, marginBottom: 10 },
  postMeta: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.35)" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 14 },
  commentsSectionLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "rgba(255,255,255,0.4)" },
  commentRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  commentBubble: { flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  commentAuthor: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#EC4899", marginBottom: 3 },
  commentText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 20 },
  commentTime: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", backgroundColor: "#080810" },
  input: { flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EC4899", alignItems: "center", justifyContent: "center" },
});
