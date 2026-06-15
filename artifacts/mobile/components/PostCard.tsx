import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Video, ResizeMode } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
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
  cancelAnimation,
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
import {
  Achievement,
  checkAchievements,
  checkFavourited,
  checkLiked,
  checkReposted,
  recordEngagement,
  toggleFavourite,
  toggleLike,
  toggleRepost,
  trackUserInterest,
  updateCreatorAnalytics,
} from "@/lib/db";
import { AchievementModal } from "@/components/AchievementModal";
import { usePostRealtime } from "@/context/RealtimeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_MARGIN = 12;
const CARD_W = SCREEN_WIDTH - CARD_MARGIN * 2;

interface PostCardProps {
  post: Post;
  isLoggedIn?: boolean;
  onRequireLogin?: () => void;
  fullScreen?: boolean;
  itemHeight?: number;
  onPress?: () => void;
}

export function PostCard({ post, isLoggedIn = false, onRequireLogin, fullScreen = false, itemHeight, onPress }: PostCardProps) {
  const colors = useColors();
  const { session } = useAuth();
  const userId = session?.user?.id;

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
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<Video>(null);
  const heartScale = useSharedValue(1);

  // Detect video posts — check is_video flag OR file extension on the URL
  const videoUrl = post.is_video
    ? (post.video_url || post.image_url)
    : (post.video_url || (post.image_url?.match(/\.(mp4|mov|webm|m4v)/i) ? post.image_url : null));
  const isVideoPost = !!videoUrl;

  const { counts: rtCounts, bumped } = usePostRealtime(post.id, {
    likes_count: post.likes_count,
    comments_count: post.comments_count,
  });

  useEffect(() => {
    return () => cancelAnimation(heartScale);
  }, []);

  useEffect(() => {
    if (!userId) return;
    checkLiked(post.id, userId).then(setLiked).catch(() => {});
    checkReposted(post.id, userId).then(setReposted).catch(() => {});
    checkFavourited(post.id, userId).then(setBookmarked).catch(() => {});
  }, [post.id, userId]);

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
    heartScale.value = withSequence(withSpring(1.5, { damping: 5 }), withSpring(1));
    if (nowLiked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (userId) {
      toggleLike(post.id, userId, nowLiked, post.user_id ?? undefined);
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
    const page = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
    setActiveImg(page);
  };

  // Full-screen derived dimensions
  const fsImageH = itemHeight ? itemHeight - 62 - 50 : 0;

  if (hidden) return null;

  if (fullScreen && itemHeight) {
    return (
      <View style={{ width: SCREEN_WIDTH, height: itemHeight, backgroundColor: "#000", overflow: "hidden" }}>
        {/* Image fills from top, behind the header */}
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: fsImageH + 62 }}>
          <FlatList
            data={images}
            keyExtractor={(_, i) => String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <Image source={{ uri: item }} style={{ width: SCREEN_WIDTH, height: fsImageH + 62 }} resizeMode="cover" />
            )}
            scrollEnabled={images.length > 1}
          />
          {/* Dark gradient at top for header legibility */}
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 90, backgroundColor: "rgba(0,0,0,0.45)" }} />
          {/* Dots */}
          {images.length > 1 && (
            <View style={styles.dotsContainer}>
              {images.map((_, i) => (
                i === activeImg ? (
                  <LinearGradient key={i} colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.dot, styles.dotActive]} />
                ) : (
                  <View key={i} style={[styles.dot, { backgroundColor: "rgba(255,255,255,0.5)" }]} />
                )
              ))}
            </View>
          )}
        </View>

        {/* Transparent tap target — sits below header/actions in z-order so they capture their own touches */}
        {onPress && (
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={onPress}
            activeOpacity={0.92}
          />
        )}

        {/* Header overlaid on top of image */}
        <View style={[styles.header, { backgroundColor: "transparent" }]}>
          <TouchableOpacity onPress={() => post.profiles?.username && router.push(`/profile/${post.profiles.username}` as any)} activeOpacity={0.8}>
            <UserAvatar username={post.profiles?.username} url={post.profiles?.avatar_url} size={38} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <TouchableOpacity onPress={() => post.profiles?.username && router.push(`/profile/${post.profiles.username}` as any)} activeOpacity={0.7}>
              <View style={styles.nameRow}>
                <Text style={[styles.username, { color: "#fff" }]}>{post.profiles?.username ?? "user"}</Text>
                {post.profiles?.is_verified && <Ionicons name="checkmark-circle" size={14} color="#8B5CF6" />}
              </View>
            </TouchableOpacity>
            <Text style={[styles.time, { color: "rgba(255,255,255,0.7)" }]}>{timeAgo(post.created_at)}</Text>
          </View>
          <TouchableOpacity onPress={() => setFollowing((f) => !f)} style={[styles.followBtn, following ? { borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", backgroundColor: "transparent" } : {}]}>
            {following ? (
              <Text style={[styles.followBtnText, { color: "#fff" }]}>Following</Text>
            ) : (
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.followGradient}>
                <Text style={[styles.followBtnText, { color: "#fff" }]}>Follow</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </View>

        {/* Caption + actions pinned to bottom */}
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.6)", paddingBottom: 8 }}>
          {post.caption ? (
            <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
              <Text style={[styles.caption, { color: "#fff" }]} numberOfLines={2}>
                <Text style={[styles.captionUsername, { color: "#fff" }]}>{post.profiles?.username ?? "user"} </Text>
                {post.caption}
              </Text>
            </View>
          ) : null}
          <View style={[styles.actions, { backgroundColor: "transparent", borderTopWidth: 0 }]}>
            <View style={styles.leftActions}>
              <TouchableOpacity onPress={handleLike} style={styles.actionBtn}>
                <Animated.View style={heartStyle}>
                  <Ionicons name={liked ? "heart" : "heart-outline"} size={26} color={liked ? "#EC4899" : "#fff"} />
                </Animated.View>
              </TouchableOpacity>
              <Text style={[styles.actionCount, { color: liked ? "#EC4899" : "rgba(255,255,255,0.85)" }]}>
                {likesCount >= 1000 ? `${(likesCount / 1000).toFixed(1)}k` : likesCount}
              </Text>
              <TouchableOpacity onPress={() => { if (requireAuth()) return; setShowComments(true); }} style={styles.actionBtn}>
                <Ionicons name="chatbubble-outline" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={[styles.actionCount, { color: "rgba(255,255,255,0.85)" }]}>{commentsDisplay}</Text>
              <TouchableOpacity onPress={() => { if (requireAuth()) return; setShowShare(true); }} style={styles.actionBtn}>
                <Ionicons name="paper-plane-outline" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => { if (requireAuth()) return; const nowR = !reposted; setReposted(nowR); if (userId) toggleRepost(post.id, userId, nowR); }}>
                <Ionicons name={reposted ? "repeat" : "repeat-outline"} size={24} color={reposted ? "#10B981" : "#fff"} />
              </TouchableOpacity>
            </View>
            <View style={styles.rightIcons}>
              <TouchableOpacity onPress={() => { if (requireAuth()) return; setFavourited((f) => !f); }}>
                <Ionicons name={favourited ? "star" : "star-outline"} size={23} color={favourited ? "#EAB308" : "#fff"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { if (requireAuth()) return; const nowB = !bookmarked; setBookmarked(nowB); if (userId) { toggleFavourite(post.id, userId, nowB); if (nowB && post.user_id && post.user_id !== userId) recordEngagement(userId, post.user_id, "save", post.id, "post").catch(() => {}); } }}>
                <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} size={23} color={bookmarked ? "#8B5CF6" : "#fff"} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <CommentsSheet visible={showComments} onClose={() => setShowComments(false)} postId={post.id} isLoggedIn={isLoggedIn} onRequireLogin={() => { setShowComments(false); onRequireLogin?.(); }} />
        <ShareSheet visible={showShare} onClose={() => setShowShare(false)} contentType="post" username={post.profiles?.username} />
        <AchievementModal visible={!!achievement} achievement={achievement} onClose={() => setAchievement(null)} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => post.profiles?.username && router.push(`/profile/${post.profiles.username}` as any)}
          activeOpacity={0.8}
        >
          <UserAvatar username={post.profiles?.username} url={post.profiles?.avatar_url} size={38} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <TouchableOpacity
            onPress={() => post.profiles?.username && router.push(`/profile/${post.profiles.username}` as any)}
            activeOpacity={0.7}
          >
            <View style={styles.nameRow}>
              <Text style={[styles.username, { color: colors.foreground }]}>
                {post.profiles?.username ?? "user"}
              </Text>
              {post.profiles?.is_verified && (
                <Ionicons name="checkmark-circle" size={14} color="#8B5CF6" />
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
              ? { borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "transparent" }
              : {},
          ]}
        >
          {following ? (
            <Text style={[styles.followBtnText, { color: colors.foreground }]}>Following</Text>
          ) : (
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientMid] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.followGradient}
            >
              <Text style={[styles.followBtnText, { color: "#fff" }]}>Follow</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setHidden(true); if (userId && post.user_id && post.user_id !== userId) recordEngagement(userId, post.user_id, "hide", post.id, "post").catch(() => {}); }} style={styles.moreBtn}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Media area — video or image carousel */}
      <View style={styles.imageContainer}>
        {isVideoPost ? (
          <TouchableOpacity
            activeOpacity={1}
            style={{ flex: 1 }}
            onPress={() => {
              if (videoPlaying) {
                videoRef.current?.pauseAsync();
                setVideoPlaying(false);
              } else {
                videoRef.current?.playAsync();
                setVideoPlaying(true);
              }
            }}
          >
            <Video
              ref={videoRef}
              source={{ uri: videoUrl! }}
              style={styles.image}
              resizeMode={ResizeMode.COVER}
              isLooping
              isMuted={false}
              onPlaybackStatusUpdate={(s) => {
                if (s.isLoaded) setVideoPlaying(s.isPlaying);
              }}
            />
            {/* Play/pause overlay */}
            {!videoPlaying && (
              <View style={styles.videoPlayOverlay}>
                <View style={styles.videoPlayBtn}>
                  <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 4 }} />
                </View>
                <View style={styles.videoBadge}>
                  <Ionicons name="videocam" size={11} color="#fff" />
                  <Text style={styles.videoBadgeText}> VIDEO</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <>
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
                  i === activeImg ? (
                    <LinearGradient
                      key={i}
                      colors={[colors.gradientStart, colors.gradientMid] as [string, string]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.dot, styles.dotActive]}
                    />
                  ) : (
                    <View key={i} style={[styles.dot, { backgroundColor: "rgba(255,255,255,0.35)" }]} />
                  )
                ))}
              </View>
            )}
            {images.length > 1 && (
              <View style={styles.imageCount}>
                <Text style={styles.imageCountText}>{activeImg + 1}/{images.length}</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Music credit */}
      {post.music_title && (
        <TouchableOpacity
          style={musicCreditStyles.bar}
          activeOpacity={0.7}
          onPress={() => router.push(`/sounds/${encodeURIComponent(post.music_title!)}` as any)}
        >
          <Ionicons name="musical-note" size={12} color="#A78BFA" />
          <Text style={musicCreditStyles.text} numberOfLines={1}>
            {post.music_title}{post.music_artist ? ` · ${post.music_artist}` : ""}
          </Text>
          <Ionicons name="chevron-forward" size={12} color="rgba(167,139,250,0.4)" />
        </TouchableOpacity>
      )}

      {/* Glassmorphism action bar */}
      <View style={styles.actions}>
        <View style={styles.leftActions}>
          <TouchableOpacity onPress={handleLike} style={styles.actionBtn}>
            <Animated.View style={heartStyle}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={26}
                color={liked ? "#EC4899" : colors.foreground}
              />
            </Animated.View>
          </TouchableOpacity>
          <Text style={[styles.actionCount, { color: liked ? "#EC4899" : colors.mutedForeground }]}>
            {likesCount >= 1000 ? `${(likesCount / 1000).toFixed(1)}k` : likesCount}
          </Text>

          <TouchableOpacity
            onPress={() => { if (requireAuth()) return; setShowComments(true); }}
            style={styles.actionBtn}
          >
            <Ionicons name="chatbubble-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{commentsDisplay}</Text>

          <TouchableOpacity onPress={() => { if (requireAuth()) return; setShowShare(true); }} style={styles.actionBtn}>
            <Ionicons name="paper-plane-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              if (requireAuth()) return;
              const nowR = !reposted;
              setReposted(nowR);
              if (userId) toggleRepost(post.id, userId, nowR);
            }}
          >
            <Ionicons name={reposted ? "repeat" : "repeat-outline"} size={24} color={reposted ? "#10B981" : colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={styles.rightIcons}>
          <TouchableOpacity onPress={() => { if (requireAuth()) return; setFavourited((f) => !f); }}>
            <Ionicons name={favourited ? "star" : "star-outline"} size={23} color={favourited ? "#EAB308" : colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            if (requireAuth()) return;
            const nowB = !bookmarked;
            setBookmarked(nowB);
            if (userId) { toggleFavourite(post.id, userId, nowB); if (nowB && post.user_id && post.user_id !== userId) recordEngagement(userId, post.user_id, "save", post.id, "post").catch(() => {}); }
          }}>
            <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} size={23} color={bookmarked ? "#8B5CF6" : colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Caption */}
      {post.caption ? (
        <View style={styles.captionContainer}>
          {post.location && (
            <TouchableOpacity
              style={styles.locationInline}
              onPress={() => router.push(`/location/${encodeURIComponent(post.location!)}` as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={11} color="#8B5CF6" />
              <Text style={[styles.location, { color: "#8B5CF6" }]}>
                {post.location} · {timeAgo(post.created_at)}
              </Text>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(139,92,246,0.12)",
    backgroundColor: "rgba(139,92,246,0.06)",
  },
  text: { flex: 1, fontSize: 12, fontFamily: "Poppins_500Medium", color: "#A78BFA" },
});

const styles = StyleSheet.create({
  container: {
    marginHorizontal: CARD_MARGIN,
    marginBottom: 20,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  headerText: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  username: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  time: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: -1 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: -1 },
  location: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  followBtn: {
    borderRadius: 10,
    overflow: "hidden",
  },
  followGradient: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  followBtnText: { fontSize: 12, fontFamily: "Poppins_600SemiBold", paddingHorizontal: 14, paddingVertical: 6 },
  moreBtn: { padding: 4 },
  imageContainer: {
    width: CARD_W,
    height: CARD_W,
    position: "relative",
  },
  image: { width: CARD_W, height: CARD_W },
  dotsContainer: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: { width: 20, height: 6, borderRadius: 3 },
  imageCount: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  imageCountText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlayBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.75)",
    alignItems: "center", justifyContent: "center",
  },
  videoBadge: {
    position: "absolute", bottom: 12, right: 12,
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  videoBadgeText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 10, letterSpacing: 0.8 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  leftActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  rightIcons: { flexDirection: "row", alignItems: "center", gap: 14 },
  actionBtn: { padding: 4 },
  actionCount: { fontSize: 13, fontFamily: "Poppins_500Medium", marginRight: 6 },
  captionContainer: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    gap: 4,
  },
  locationInline: { flexDirection: "row", alignItems: "center", gap: 3 },
  caption: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 19 },
  captionUsername: { fontFamily: "Poppins_600SemiBold" },
  hashTag: { color: "#8B5CF6", fontFamily: "Poppins_500Medium" },
});
