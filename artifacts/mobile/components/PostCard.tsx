import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
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
import { useAuth } from "@/context/AuthContext";
import { Achievement, checkAchievements, checkFavourited, checkLiked, checkReposted, toggleFavourite, toggleLike, toggleRepost, trackUserInterest, updateCreatorAnalytics } from "@/lib/db";
import { AchievementModal } from "@/components/AchievementModal";
import { usePostRealtime } from "@/context/RealtimeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface PostCardProps {
  post: Post;
  isLoggedIn?: boolean;
  onRequireLogin?: () => void;
}

export function PostCard({ post, isLoggedIn = false, onRequireLogin }: PostCardProps) {
  const colors = useColors();
  const { session } = useAuth();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    checkLiked(post.id, userId).then(setLiked).catch(() => {});
    checkReposted(post.id, userId).then(setReposted).catch(() => {});
    checkFavourited(post.id, userId).then(setBookmarked).catch(() => {});
  }, [post.id, userId]);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [commentsDisplay, setCommentsDisplay] = useState(post.comments_count);
  const [achievement, setAchievement] = useState<Achievement | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [favourited, setFavourited] = useState(false);
  const [following, setFollowing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const heartScale = useSharedValue(1);

  // ── Realtime live count updates ────────────────────────────────────────────
  const { counts: rtCounts, bumped } = usePostRealtime(post.id, {
    likes_count: post.likes_count,
    comments_count: post.comments_count,
  });
  useEffect(() => { setLikesCount(rtCounts.likes_count); }, [rtCounts.likes_count]);
  useEffect(() => { setCommentsDisplay(rtCounts.comments_count); }, [rtCounts.comments_count]);
  useEffect(() => {
    if (bumped === "likes_count") {
      heartScale.value = withSequence(withSpring(1.3, { damping: 7 }), withSpring(1));
    }
  }, [bumped]);

  const images = post.images && post.images.length > 0 ? post.images : [post.image_url];

  const requireAuth = () => {
    if (!isLoggedIn) { onRequireLogin?.(); return true; }
    return false;
  };

  const extractHashtags = (text: string) => (text?.match(/#(\w+)/g) ?? []).map((t) => t.slice(1));

  const handleLike = () => {
    if (requireAuth()) return;
    const nowLiked = !liked;
    setLiked(nowLiked);
    setLikesCount((c) => (nowLiked ? c + 1 : c - 1));
    heartScale.value = withSequence(withSpring(1.4, { damping: 6 }), withSpring(1));
    if (nowLiked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (userId) {
      toggleLike(post.id, userId, nowLiked);
      if (nowLiked) {
        const hashtags = extractHashtags(post.caption ?? "");
        hashtags.forEach((tag) => trackUserInterest(userId, tag, "like").catch(() => {}));
        if (post.user_id) updateCreatorAnalytics(post.user_id).catch(() => {});
        checkAchievements(userId)
          .then((unlocked) => { if (unlocked.length > 0) setAchievement(unlocked[0]); })
          .catch(() => {});
      }
    }
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
        <TouchableOpacity onPress={() => post.profiles?.username && router.push(`/profile/${post.profiles.username}` as any)} activeOpacity={0.8}>
          <UserAvatar username={post.profiles?.username} url={post.profiles?.avatar_url} size={36} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <TouchableOpacity onPress={() => post.profiles?.username && router.push(`/profile/${post.profiles.username}` as any)} activeOpacity={0.7}>
          <View style={styles.nameRow}>
            <Text style={[styles.username, { color: colors.foreground }]}>
              {post.profiles?.username ?? "user"}
            </Text>
            {post.profiles?.is_verified && (
              <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
            )}
          </View>
          </TouchableOpacity>
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

      {post.music_title && (
        <TouchableOpacity
          style={musicCreditStyles.bar}
          activeOpacity={0.7}
          onPress={() => router.push(`/sounds/${encodeURIComponent(post.music_title!)}` as any)}
        >
          <Ionicons name="musical-note" size={12} color="#A78BFA" />
          <Text style={musicCreditStyles.text} numberOfLines={1}>
            {post.music_title}
            {post.music_artist ? ` · ${post.music_artist}` : ""}
          </Text>
          <Ionicons name="chevron-forward" size={12} color="rgba(167,139,250,0.4)" />
        </TouchableOpacity>
      )}

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
          <Text style={[styles.actionCount, { color: colors.foreground }]}>{commentsDisplay}</Text>
          <TouchableOpacity onPress={() => { if (requireAuth()) return; setShowShare(true); }} style={styles.actionBtn}>
            <Ionicons name="paper-plane-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => {
            if (requireAuth()) return;
            const nowR = !reposted;
            setReposted(nowR);
            if (userId) toggleRepost(post.id, userId, nowR);
            if (nowR) Alert.alert("Reposted! ↩", "Added to your profile reposts");
          }}>
            <Ionicons name={reposted ? "repeat" : "repeat-outline"} size={24} color={reposted ? "#10B981" : colors.foreground} />
          </TouchableOpacity>
        </View>
        <View style={styles.rightIcons}>
          <TouchableOpacity onPress={() => { if (requireAuth()) return; setFavourited((f) => !f); }}>
            <Ionicons name={favourited ? "star" : "star-outline"} size={24} color={favourited ? "#EAB308" : colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { if (requireAuth()) return; const nowB = !bookmarked; setBookmarked(nowB); if (userId) toggleFavourite(post.id, userId, nowB); }}>
            <Ionicons
              name={bookmarked ? "bookmark" : "bookmark-outline"}
              size={24}
              color={bookmarked ? "#7C3AED" : colors.foreground}
            />
          </TouchableOpacity>
        </View>
      </View>

      {post.caption ? (
        <View style={styles.captionContainer}>
          {post.location && (
            <TouchableOpacity
              style={styles.locationInline}
              onPress={() => router.push(`/location/${encodeURIComponent(post.location!)}` as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={11} color="#7C3AED" />
              <Text style={[styles.location, { color: "#7C3AED" }]}>{post.location} · {timeAgo(post.created_at)}</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.caption, { color: colors.foreground }]}>
            <Text style={styles.captionUsername}>{post.profiles?.username ?? "user"} </Text>
            {post.caption.split(/(#\w+)/g).map((part, i) =>
              part.startsWith("#") ? (
                <Text
                  key={i}
                  style={styles.hashTag}
                  onPress={() => router.push(`/hashtag/${encodeURIComponent(part.slice(1))}` as any)}
                >
                  {part}
                </Text>
              ) : (
                <Text key={i}>{part}</Text>
              )
            )}
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
      <AchievementModal
        visible={!!achievement}
        achievement={achievement}
        onClose={() => setAchievement(null)}
      />
    </View>
  );
}

const musicCreditStyles = StyleSheet.create({
  bar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderTopWidth: 0.5, borderBottomWidth: 0.5,
    borderColor: "rgba(124,58,237,0.18)",
    backgroundColor: "rgba(124,58,237,0.06)",
  },
  text: { flex: 1, fontSize: 12, fontFamily: "Poppins_500Medium", color: "#A78BFA" },
});

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
  rightIcons: { flexDirection: "row", alignItems: "center", gap: 12 },
  actionBtn: { padding: 2 },
  actionCount: { fontSize: 13, fontFamily: "Poppins_500Medium", marginRight: 8 },
  captionContainer: { paddingHorizontal: 12, paddingBottom: 12, gap: 3 },
  locationInline: { flexDirection: "row", alignItems: "center", gap: 3 },
  caption: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 19 },
  captionUsername: { fontFamily: "Poppins_600SemiBold" },
  hashTag: { color: "#7C3AED", fontFamily: "Poppins_500Medium" },
});
