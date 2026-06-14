import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { addComment, addReelComment, fetchComments, fetchReelComments } from "@/lib/db";
import { Comment, timeAgo } from "@/lib/supabase";
import { UserAvatar } from "./UserAvatar";

const { height: H } = Dimensions.get("window");
const SHEET_HEIGHT = H * 0.76;
const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

type SortMode = "top" | "recent";

interface CommentsSheetProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
  isLoggedIn: boolean;
  onRequireLogin: () => void;
  contentType?: "post" | "reel";
}

interface CommentItemProps {
  commentId: string;
  username: string;
  text: string;
  time: string;
  likes: number;
  userId?: string;
  onReply: () => void;
}

function CommentItem({ commentId, username, text, time, likes, userId, onReply }: CommentItemProps) {
  const colors = useColors();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(likes);

  const handleLike = async () => {
    if (!myId) return;
    const nowLiked = !liked;
    setLiked(nowLiked);
    setLikesCount((n) => nowLiked ? n + 1 : Math.max(0, n - 1));
    try {
      const res = await fetch(`${API_BASE}/comments/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: myId, commentId }),
      });
      if (res.ok) {
        const json = await res.json();
        setLiked(json.liked);
        setLikesCount(json.likes_count ?? likesCount);
      }
    } catch {
      setLiked(!nowLiked);
      setLikesCount((n) => !nowLiked ? n + 1 : Math.max(0, n - 1));
    }
  };

  return (
    <View style={styles.commentRow}>
      <TouchableOpacity onPress={() => router.push(`/profile/${username}` as any)} activeOpacity={0.8}>
        <UserAvatar username={username} size={34} />
      </TouchableOpacity>
      <View style={styles.commentBody}>
        <Text style={[styles.commentUser, { color: colors.foreground }]}>
          <Text onPress={() => router.push(`/profile/${username}` as any)} style={styles.commentUser}>
            {username}
          </Text>{" "}
          <Text style={[styles.commentText, { color: colors.foreground }]}>{text}</Text>
        </Text>
        <View style={styles.commentMeta}>
          <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{time}</Text>
          <TouchableOpacity onPress={onReply}>
            <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity onPress={handleLike} style={styles.commentLike}>
        <Ionicons
          name={liked ? "heart" : "heart-outline"}
          size={16}
          color={liked ? "#F97316" : colors.mutedForeground}
        />
        {likesCount > 0 && (
          <Text style={[styles.likeCount, { color: colors.mutedForeground }]}>
            {likesCount}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export function CommentsSheet({
  visible,
  onClose,
  postId,
  isLoggedIn,
  onRequireLogin,
  contentType = "post",
}: CommentsSheetProps) {
  const colors = useColors();
  const { session } = useAuth();
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: false,
        damping: 20,
        stiffness: 150,
      }).start();
      loadComments();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 260,
        useNativeDriver: false,
      }).start();
      setReplyTo(null);
    }
  }, [visible, postId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const data = contentType === "reel"
        ? await fetchReelComments(postId)
        : await fetchComments(postId);
      setComments(data);
    } finally {
      setLoading(false);
    }
  };

  const sortedComments = [...comments].sort((a, b) => {
    if (sortMode === "top") {
      return (b.likes_count ?? 0) - (a.likes_count ?? 0);
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const submitComment = async () => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    if (!comment.trim()) return;
    const text = comment.trim();
    setComment("");
    setReplyTo(null);
    setSubmitting(true);

    const userId = session?.user?.id;
    const username = session?.user?.email?.split("@")[0] ?? "you";
    const optimistic: Comment = {
      id: Date.now().toString(),
      post_id: postId,
      user_id: userId ?? "me",
      text,
      created_at: new Date().toISOString(),
      likes_count: 0,
      profiles: { id: userId ?? "me", username },
    };
    setComments((c) => [optimistic, ...c]);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });

    if (userId) {
      const saved = contentType === "reel"
        ? await addReelComment(postId, userId, text)
        : await addComment(postId, userId, text);
      if (saved) {
        setComments((c) => c.map((item) => (item.id === optimistic.id ? saved : item)));
      }
    }
    setSubmitting(false);
  };

  const handleReply = (commentId: string, username: string) => {
    setReplyTo({ id: commentId, username });
    setComment(`@${username} `);
    inputRef.current?.focus();
  };

  const clearReply = () => {
    setReplyTo(null);
    setComment("");
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.card, borderTopColor: colors.border },
          { transform: [{ translateY }] },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header with sort toggle */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Comments {comments.length > 0 ? `(${comments.length})` : ""}
          </Text>
          <View style={styles.sortRow}>
            <TouchableOpacity
              onPress={() => setSortMode("top")}
              style={[styles.sortBtn, sortMode === "top" && { backgroundColor: "rgba(139,92,246,0.15)" }]}
            >
              <Text style={[styles.sortText, { color: sortMode === "top" ? "#8B5CF6" : colors.mutedForeground }]}>
                Top
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSortMode("recent")}
              style={[styles.sortBtn, sortMode === "recent" && { backgroundColor: "rgba(139,92,246,0.15)" }]}
            >
              <Text style={[styles.sortText, { color: sortMode === "recent" ? "#8B5CF6" : colors.mutedForeground }]}>
                Recent
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ marginLeft: 8 }}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#8B5CF6" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={sortedComments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CommentItem
                commentId={item.id}
                username={item.profiles?.username ?? "user"}
                text={item.text}
                time={timeAgo(item.created_at)}
                likes={item.likes_count ?? 0}
                userId={item.user_id}
                onReply={() => handleReply(item.id, item.profiles?.username ?? "user")}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubble-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No comments yet. Be the first!
                </Text>
              </View>
            }
          />
        )}

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {/* Reply banner */}
          {replyTo && (
            <View style={[styles.replyBanner, { backgroundColor: colors.muted, borderTopColor: colors.border }]}>
              <Text style={[styles.replyText, { color: colors.mutedForeground }]}>
                Replying to <Text style={{ color: colors.foreground }}>@{replyTo.username}</Text>
              </Text>
              <TouchableOpacity onPress={clearReply}>
                <Ionicons name="close" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          )}
          <View
            style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.card }]}
          >
            <UserAvatar username={session?.user?.email?.split("@")[0] ?? "you"} size={32} />
            <TextInput
              ref={inputRef}
              value={comment}
              onChangeText={setComment}
              placeholder={isLoggedIn ? "Add a comment..." : "Sign in to comment..."}
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border },
              ]}
              onFocus={() => !isLoggedIn && onRequireLogin()}
              editable={isLoggedIn && !submitting}
              multiline
              maxLength={500}
            />
            <TouchableOpacity onPress={submitComment} disabled={!comment.trim() || submitting}>
              {submitting ? (
                <ActivityIndicator color="#8B5CF6" size="small" />
              ) : (
                <Ionicons
                  name="send"
                  size={22}
                  color={comment.trim() ? "#8B5CF6" : colors.mutedForeground}
                />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 0.5,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  title: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sortBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  sortText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  loadingRow: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  commentRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
    alignItems: "flex-start",
  },
  commentBody: { flex: 1, gap: 4 },
  commentUser: { fontSize: 13, fontFamily: "Poppins_600SemiBold", lineHeight: 18 },
  commentText: { fontFamily: "Poppins_400Regular" },
  commentMeta: { flexDirection: "row", gap: 14 },
  commentTime: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  commentLike: { alignItems: "center", gap: 2, paddingTop: 2 },
  likeCount: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  empty: { padding: 32, alignItems: "center", gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Poppins_400Regular" },
  replyBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 0.5,
  },
  replyText: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 0.5,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 90,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    borderWidth: 1,
  },
});
