import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
import { CommentsSheet } from "@/components/CommentsSheet";
import { ShareSheet } from "@/components/ShareSheet";
import { useColors } from "@/hooks/useColors";
import { Post, timeAgo } from "@/lib/supabase";
import { UserAvatar } from "./UserAvatar";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface PostCardProps {
  post: Post;
  isLoggedIn?: boolean;
  onRequireLogin?: () => void;
}

export function PostCard({ post, isLoggedIn = false, onRequireLogin }: PostCardProps) {
  const colors = useColors();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [bookmarked, setBookmarked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const heartScale = useSharedValue(1);

  const images = post.images && post.images.length > 0 ? post.images : [post.image_url];

  const requireAuth = () => {
    if (!isLoggedIn) { onRequireLogin?.(); return true; }
    return false;
  };

  const handleLike = () => {
    if (requireAuth()) return;
    const nowLiked = !liked;
    setLiked(nowLiked);
    setLikesCount((c) => (nowLiked ? c + 1 : c - 1));
    heartScale.value = withSequence(withSpring(1.4, { damping: 6 }), withSpring(1));
    if (nowLiked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveImg(page);
  };

  if (hidden) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <UserAvatar username={post.profiles?.username} url={post.profiles?.avatar_url} size={36} />
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text style={[styles.username, { color: colors.foreground }]}>
              {post.profiles?.username ?? "user"}
            </Text>
            {post.profiles?.is_verified && (
              <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
            )}
          </View>
          {post.location ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={11} color={colors.mutedForeground} />
              <Text style={[styles.location, { color: colors.mutedForeground }]}>{post.location}</Text>
            </View>
          ) : (
            <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeAgo(post.created_at)}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setFollowing((f) => !f)}
          style={[
            styles.followBtn,
            following
              ? { borderWidth: 1, borderColor: colors.border }
              : { backgroundColor: "#7C3AED" },
          ]}
        >
          <Text style={[styles.followBtnText, { color: following ? colors.foreground : "#fff" }]}>
            {following ? "Following" : "Follow"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setHidden(true)} style={styles.moreBtn}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.imageContainer}>
        <FlatList
          data={images}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <Image source={{ uri: item }} style={styles.image} resizeMode="cover" />
          )}
          scrollEnabled={images.length > 1}
        />
        {images.length > 1 && (
          <View style={styles.dotsContainer}>
            {images.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === activeImg ? "#7C3AED" : "rgba(255,255,255,0.5)" },
                  i === activeImg && styles.dotActive,
                ]}
              />
            ))}
          </View>
        )}
        {images.length > 1 && (
          <View style={[styles.imageCount, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
            <Text style={styles.imageCountText}>{activeImg + 1}/{images.length}</Text>
          </View>
        )}
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
          <TouchableOpacity
            onPress={() => { if (requireAuth()) return; setShowComments(true); }}
            style={styles.actionBtn}
          >
            <Ionicons name="chatbubble-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.actionCount, { color: colors.foreground }]}>{post.comments_count}</Text>
          <TouchableOpacity onPress={() => { if (requireAuth()) return; setShowShare(true); }} style={styles.actionBtn}>
            <Ionicons name="paper-plane-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => { if (requireAuth()) return; setBookmarked((b) => !b); }}>
          <Ionicons
            name={bookmarked ? "bookmark" : "bookmark-outline"}
            size={24}
            color={bookmarked ? "#7C3AED" : colors.foreground}
          />
        </TouchableOpacity>
      </View>

      {post.caption ? (
        <View style={styles.captionContainer}>
          {post.location && (
            <View style={styles.locationInline}>
              <Ionicons name="location-outline" size={11} color={colors.mutedForeground} />
              <Text style={[styles.location, { color: colors.mutedForeground }]}>{post.location} · {timeAgo(post.created_at)}</Text>
            </View>
          )}
          <Text style={[styles.caption, { color: colors.foreground }]}>
            <Text style={styles.captionUsername}>{post.profiles?.username ?? "user"} </Text>
            {post.caption}
          </Text>
        </View>
      ) : null}

      <CommentsSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        postId={post.id}
        isLoggedIn={isLoggedIn}
        onRequireLogin={() => { setShowComments(false); onRequireLogin?.(); }}
      />
      <ShareSheet
        visible={showShare}
        onClose={() => setShowShare(false)}
        contentType="post"
        username={post.profiles?.username}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  headerText: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  username: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  time: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: -2 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: -1 },
  location: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  followBtnText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  moreBtn: { padding: 4 },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    position: "relative",
  },
  image: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
  dotsContainer: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: { width: 18, borderRadius: 3 },
  imageCount: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  imageCountText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  leftActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionBtn: { padding: 2 },
  actionCount: { fontSize: 13, fontFamily: "Poppins_500Medium", marginRight: 8 },
  captionContainer: { paddingHorizontal: 12, paddingBottom: 12, gap: 3 },
  locationInline: { flexDirection: "row", alignItems: "center", gap: 3 },
  caption: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 19 },
  captionUsername: { fontFamily: "Poppins_600SemiBold" },
});
