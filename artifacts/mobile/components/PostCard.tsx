import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { Post, timeAgo } from "@/lib/supabase";
import { UserAvatar } from "./UserAvatar";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface PostCardProps {
  post: Post;
  onComment?: () => void;
}

export function PostCard({ post, onComment }: PostCardProps) {
  const colors = useColors();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [bookmarked, setBookmarked] = useState(false);
  const heartScale = useSharedValue(1);
  const heartOpacity = useSharedValue(0);

  const handleLike = () => {
    const nowLiked = !liked;
    setLiked(nowLiked);
    setLikesCount((c) => (nowLiked ? c + 1 : c - 1));
    heartScale.value = withSequence(withSpring(1.3, { damping: 6 }), withSpring(1));
    if (nowLiked) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      heartOpacity.value = withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(1, { duration: 600 }),
        withTiming(0, { duration: 300 })
      );
    }
  };

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const floatingHeartStyle = useAnimatedStyle(() => ({
    opacity: heartOpacity.value,
    transform: [{ scale: heartOpacity.value * 1.5 + 0.5 }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <UserAvatar
          username={post.profiles?.username}
          url={post.profiles?.avatar_url}
          size={36}
        />
        <View style={styles.headerText}>
          <Text style={[styles.username, { color: colors.foreground }]}>
            {post.profiles?.username ?? "user"}
          </Text>
          <Text style={[styles.time, { color: colors.mutedForeground }]}>
            {timeAgo(post.created_at)}
          </Text>
        </View>
        <TouchableOpacity style={styles.moreBtn}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.imageContainer}>
        <Image
          source={{ uri: post.image_url }}
          style={styles.image}
          resizeMode="cover"
        />
        <Animated.View style={[styles.floatingHeart, floatingHeartStyle]}>
          <Ionicons name="heart" size={80} color="rgba(255,255,255,0.9)" />
        </Animated.View>
      </View>

      <View style={styles.actions}>
        <View style={styles.leftActions}>
          <TouchableOpacity onPress={handleLike} style={styles.actionBtn}>
            <Animated.View style={heartStyle}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={26}
                color={liked ? "#F97316" : colors.foreground}
              />
            </Animated.View>
          </TouchableOpacity>
          <Text style={[styles.actionCount, { color: colors.foreground }]}>
            {likesCount >= 1000 ? `${(likesCount / 1000).toFixed(1)}k` : likesCount}
          </Text>
          <TouchableOpacity onPress={onComment} style={styles.actionBtn}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.actionCount, { color: colors.foreground }]}>
            {post.comments_count}
          </Text>
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="paper-plane-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => setBookmarked((b) => !b)}>
          <Ionicons
            name={bookmarked ? "bookmark" : "bookmark-outline"}
            size={24}
            color={bookmarked ? "#7C3AED" : colors.foreground}
          />
        </TouchableOpacity>
      </View>

      {post.caption ? (
        <View style={styles.captionContainer}>
          <Text style={[styles.caption, { color: colors.foreground }]}>
            <Text style={styles.captionUsername}>{post.profiles?.username ?? "user"} </Text>
            {post.caption}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  headerText: {
    flex: 1,
  },
  username: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  time: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    marginTop: -2,
  },
  moreBtn: {
    padding: 4,
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  floatingHeart: {
    position: "absolute",
    alignSelf: "center",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  leftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtn: {
    padding: 2,
  },
  actionCount: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    marginRight: 8,
  },
  captionContainer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  caption: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    lineHeight: 19,
  },
  captionUsername: {
    fontFamily: "Poppins_600SemiBold",
  },
});
