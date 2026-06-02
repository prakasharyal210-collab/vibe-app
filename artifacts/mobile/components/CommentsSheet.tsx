import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
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
import { useColors } from "@/hooks/useColors";
import { MOCK_COMMENTS, timeAgo } from "@/lib/supabase";
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
  isLoggedIn: boolean;
}

function CommentItem({ username, text, time, likes, isLoggedIn }: CommentItemProps) {
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
      <TouchableOpacity
        onPress={() => setLiked((l) => !l)}
        style={styles.commentLike}
      >
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
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [comment, setComment] = useState("");
  const [localComments, setLocalComments] = useState(MOCK_COMMENTS);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 260,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const submitComment = () => {
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    if (!comment.trim()) return;
    const newComment = {
      id: Date.now().toString(),
      post_id: postId,
      user_id: "me",
      text: comment.trim(),
      created_at: new Date().toISOString(),
      likes_count: 0,
      profiles: { id: "me", username: "you" },
    };
    setLocalComments((c) => [newComment, ...c]);
    setComment("");
  };

  const comments = localComments.filter((c) => c.post_id === postId);
  const allComments = comments.length > 0 ? comments : localComments.slice(0, 6);

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
          <Text style={[styles.title, { color: colors.foreground }]}>Comments</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={allComments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CommentItem
              username={item.profiles?.username ?? "user"}
              text={item.text}
              time={timeAgo(item.created_at)}
              likes={item.likes_count ?? 0}
              isLoggedIn={isLoggedIn}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 12 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No comments yet. Be the first!
              </Text>
            </View>
          }
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
            <UserAvatar username="you" size={32} />
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
              editable={isLoggedIn}
              multiline
              maxLength={500}
            />
            <TouchableOpacity onPress={submitComment} disabled={!comment.trim()}>
              <Ionicons
                name="send"
                size={22}
                color={comment.trim() ? "#7C3AED" : colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
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
  title: {
    fontSize: 17,
    fontFamily: "Poppins_700Bold",
  },
  commentRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
    alignItems: "flex-start",
  },
  commentBody: {
    flex: 1,
    gap: 4,
  },
  commentUser: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 18,
  },
  commentText: {
    fontFamily: "Poppins_400Regular",
  },
  commentMeta: {
    flexDirection: "row",
    gap: 14,
  },
  commentTime: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  commentLike: {
    alignItems: "center",
    gap: 2,
    paddingTop: 2,
  },
  likeCount: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
  empty: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
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
