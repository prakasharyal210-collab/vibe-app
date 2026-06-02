import { Ionicons } from "@expo/vector-icons";
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
import { addComment, fetchComments } from "@/lib/db";
import { Comment, timeAgo } from "@/lib/supabase";
import { UserAvatar } from "./UserAvatar";

const { height: H } = Dimensions.get("window");
const SHEET_HEIGHT = H * 0.72;

interface CommentsSheetProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
  isLoggedIn: boolean;
  onRequireLogin: () => void;
}

interface CommentItemProps {
  username: string;
  text: string;
  time: string;
  likes: number;
}

function CommentItem({ username, text, time, likes }: CommentItemProps) {
  const colors = useColors();
  const [liked, setLiked] = useState(false);

  return (
    <View style={styles.commentRow}>
      <UserAvatar username={username} size={34} />
      <View style={styles.commentBody}>
        <Text style={[styles.commentUser, { color: colors.foreground }]}>
          {username}{" "}
          <Text style={[styles.commentText, { color: colors.foreground }]}>{text}</Text>
        </Text>
        <View style={styles.commentMeta}>
          <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{time}</Text>
          <TouchableOpacity>
            <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity onPress={() => setLiked((l) => !l)} style={styles.commentLike}>
        <Ionicons
          name={liked ? "heart" : "heart-outline"}
          size={16}
          color={liked ? "#F97316" : colors.mutedForeground}
        />
        <Text style={[styles.likeCount, { color: colors.mutedForeground }]}>
          {liked ? likes + 1 : likes}
        </Text>
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
}: CommentsSheetProps) {
  const colors = useColors();
  const { session } = useAuth();
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
      loadComments();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 260,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, postId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const data = await fetchComments(postId);
      setComments(data);
    } finally {
      setLoading(false);
    }
  };

  const submitComment = async () => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    if (!comment.trim()) return;
    const text = comment.trim();
    setComment("");
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
      const saved = await addComment(postId, userId, text);
      if (saved) {
        setComments((c) => c.map((item) => (item.id === optimistic.id ? saved : item)));
      }
    }
    setSubmitting(false);
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
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Comments {comments.length > 0 ? `(${comments.length})` : ""}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#7C3AED" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CommentItem
                username={item.profiles?.username ?? "user"}
                text={item.text}
                time={timeAgo(item.created_at)}
                likes={item.likes_count ?? 0}
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
          <View
            style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.card }]}
          >
            <UserAvatar username={session?.user?.email?.split("@")[0] ?? "you"} size={32} />
            <TextInput
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
                <ActivityIndicator color="#7C3AED" size="small" />
              ) : (
                <Ionicons
                  name="send"
                  size={22}
                  color={comment.trim() ? "#7C3AED" : colors.mutedForeground}
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
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontFamily: "Poppins_700Bold" },
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
