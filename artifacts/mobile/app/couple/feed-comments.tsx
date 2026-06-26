import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Switch,
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
  Confession: "#EC4899",
  Advice: "#3B82F6",
  Story: "#10B981",
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
  isAnonymous: boolean;
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
  isAnonymous: boolean;
  postNumber: number | null;
  age: number | null;
  location: string | null;
  author: { name: string; avatar: string | null } | null;
  partner: { name: string; avatar: string | null } | null;
  created_at: string;
}

function Avatar({ uri, size = 32 }: { uri: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#2a1a3e", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.4 }}>💕</Text>
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

  const post: Post | null = (() => {
    try { return postJson ? JSON.parse(postJson) : null; } catch { return null; }
  })();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
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
        body: JSON.stringify({ coupleId, authorId, content: text, isAnonymous }),
      });
      const data = await res.json();
      if (data.comment) {
        setComments((prev) => [data.comment, ...prev]);
        setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 80);
      }
    } catch {
      setCommentText(text);
    } finally {
      setSending(false);
    }
  };

  const catColor = post ? (CAT_COLORS[post.category] ?? "#EC4899") : "#EC4899";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
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
                <View style={s.postTopRow}>
                  {post.postNumber != null && (
                    <Text style={s.postNumber}>#{post.postNumber}</Text>
                  )}
                  <View style={[s.catBadge, { backgroundColor: catColor + "22", borderColor: catColor + "55" }]}>
                    <Text style={[s.catText, { color: catColor }]}>{post.category}</Text>
                  </View>
                </View>
                {(post.age || post.location) && (
                  <Text style={s.ageLocation}>
                    {[post.age ? `${post.age}` : null, post.location].filter(Boolean).join(" · ")}
                  </Text>
                )}
                <View style={s.authorRow}>
                  {post.isAnonymous ? (
                    <>
                      <View style={s.anonAvatar}><Text style={{ fontSize: 14 }}>💕</Text></View>
                      <Text style={s.anonLabel}>Anonymous 💕</Text>
                    </>
                  ) : (
                    <Text style={s.coupleName}>{post.coupleName}</Text>
                  )}
                </View>
                <Text style={s.postContent}>{post.content}</Text>
                {post.photo_url ? (
                  <Image source={{ uri: post.photo_url }} style={s.postPhoto} resizeMode="cover" />
                ) : null}
                <Text style={s.postMeta}>{timeAgo(post.created_at)} · ❤️ {post.like_count}</Text>
                <View style={s.divider} />
                <Text style={s.commentsLabel}>
                  {loading
                    ? "Loading comments…"
                    : comments.length === 0
                    ? "No comments yet — be first!"
                    : `${comments.length} comment${comments.length !== 1 ? "s" : ""}`}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={s.commentRow}>
              <Avatar uri={item.isAnonymous ? null : item.author?.avatar ?? null} size={34} />
              <View style={s.commentBubble}>
                <Text style={[s.commentAuthor, item.isAnonymous && { color: "rgba(255,255,255,0.45)" }]}>
                  {item.isAnonymous ? "Anonymous 💕" : (item.author?.name ?? "Someone")}
                </Text>
                <Text style={s.commentText}>{item.content}</Text>
                <Text style={s.commentTime}>{timeAgo(item.created_at)}</Text>
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        />

        <View style={[s.inputSection, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={s.anonToggleRow}>
            <Text style={s.anonToggleLabel}>🕵️ Comment anonymously</Text>
            <Switch
              value={isAnonymous}
              onValueChange={setIsAnonymous}
              trackColor={{ false: "rgba(255,255,255,0.1)", true: "#EC4899" }}
              thumbColor="#fff"
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>
          <View style={s.inputBar}>
            <TextInput
              style={s.input}
              placeholder={isAnonymous ? "Comment anonymously…" : "Add a comment…"}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={500}
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
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080810" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 18, color: "#fff", textAlign: "center" },
  postCard: { margin: 16, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  postTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  postNumber: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#EC4899" },
  catBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  catText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  ageLocation: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  anonAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(236,72,153,0.15)", alignItems: "center", justifyContent: "center" },
  anonLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: "rgba(255,255,255,0.5)" },
  coupleName: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#fff" },
  postContent: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 22, marginBottom: 10 },
  postPhoto: { width: "100%", height: 180, borderRadius: 12, marginBottom: 10 },
  postMeta: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.35)" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginVertical: 14 },
  commentsLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "rgba(255,255,255,0.38)" },
  commentRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  commentBubble: { flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 11, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  commentAuthor: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#EC4899", marginBottom: 3 },
  commentText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.83)", lineHeight: 20 },
  commentTime: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 4 },
  inputSection: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)", backgroundColor: "#080810", paddingTop: 8, paddingHorizontal: 16 },
  anonToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 },
  anonToggleLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "rgba(255,255,255,0.45)" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  input: { flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EC4899", alignItems: "center", justifyContent: "center" },
});
