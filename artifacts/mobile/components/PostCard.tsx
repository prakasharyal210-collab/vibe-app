import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Video, ResizeMode } from "expo-av";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { captureRef } from "react-native-view-shot";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildVibeUrl } from "@/lib/share";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { CommentsSheet } from "@/components/CommentsSheet";
import { FullscreenImageViewer } from "@/components/FullscreenImageViewer";
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
  recordEngagement,
  reportContent,
  toggleFavourite,
  toggleLike,
  trackUserInterest,
  updateCreatorAnalytics,
} from "@/lib/db";
import { AchievementModal } from "@/components/AchievementModal";
import PollCard from "@/components/PollCard";
import { usePostRealtime } from "@/context/RealtimeContext";

// ── Couple header sub-component (module-level to avoid remount on each render) ─
export function CoupleHeaderRow({ post, style }: { post: any; style?: object }) {
  const couple = post.couple as { coupleName?: string; partner1?: { username?: string; avatar_url?: string | null }; partner2?: { username?: string; avatar_url?: string | null } } | undefined;
  if (!couple) return null;

  const handlePress = () => {
    Alert.alert(
      couple.coupleName ?? "Couple Post",
      "Visit a profile:",
      [
        couple.partner1?.username ? { text: `@${couple.partner1.username}`, onPress: () => router.push(`/profile/${couple.partner1!.username}` as any) } : null,
        couple.partner2?.username ? { text: `@${couple.partner2.username}`, onPress: () => router.push(`/profile/${couple.partner2!.username}` as any) } : null,
        { text: "Cancel", style: "cancel" },
      ].filter(Boolean) as any[]
    );
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8} style={[{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <UserAvatar username={couple.partner1?.username} url={couple.partner1?.avatar_url} size={34} />
        <View style={{ marginLeft: -10, borderRadius: 99, borderWidth: 2, borderColor: "#0a0a0a" }}>
          <UserAvatar username={couple.partner2?.username} url={couple.partner2?.avatar_url} size={34} />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 }} numberOfLines={1}>{couple.coupleName ?? "Couple"}</Text>
          <Text style={{ fontSize: 13 }}>💑</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_MARGIN = 12;
const CARD_W = SCREEN_WIDTH - CARD_MARGIN * 2;
const MAX_PORTRAIT_H = CARD_W * 1.25; // cap for very tall portraits only
const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? "") + "/api";

// Module-level cache — survives component remounts.
// Image.getSize is synchronous for images already in RN's decode cache, so
// returning the stored ratio on re-render eliminates the "flash-then-resize".
const _ratioCache = new Map<string, number>();

// ── FollowPillButton ────────────────────────────────────────────────────────
// Module-scope so Ionicons class instances are stable across re-renders
// (prevents the empty-glyph remount bug — see crash-fixes.md).
function FollowPillButton({ following, onPress }: { following: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96, { damping: 15, stiffness: 400 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 300 }); }}
      >
        {following ? (
          <View style={[styles.followPill, styles.followPillOutline]}>
            <Ionicons name="checkmark" size={11} color="#D4AF37" />
            <Text style={[styles.followPillText, { color: "#D4AF37" }]}>Following</Text>
          </View>
        ) : (
          <LinearGradient
            colors={["#111111", "#1C1C1C"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.followPill, styles.followPillDark]}
          >
            <Text style={[styles.followPillText, { color: "#D4AF37" }]}>Follow</Text>
          </LinearGradient>
        )}
      </Pressable>
    </Animated.View>
  );
}

interface PostCardProps {
  post: Post;
  isLoggedIn?: boolean;
  onRequireLogin?: () => void;
  fullScreen?: boolean;
  itemHeight?: number;
  onPress?: () => void;
  /** true only when this card is the visible item AND the feed screen is focused */
  isActive?: boolean;
}

export function PostCard({ post, isLoggedIn = false, onRequireLogin, fullScreen = false, itemHeight, onPress, isActive = false }: PostCardProps) {
  const colors = useColors();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [commentsDisplay, setCommentsDisplay] = useState(post.comments_count);
  const [achievement, setAchievement] = useState<Achievement | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [favourited, setFavourited] = useState(false);
  const [following, setFollowing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [showOptionsSheet, setShowOptionsSheet] = useState(false);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [reportingReason, setReportingReason] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showEditCaption, setShowEditCaption] = useState(false);
  const [editCaptionText, setEditCaptionText] = useState(post.caption ?? "");
  const [savingCaption, setSavingCaption] = useState(false);
  const [isArchived, setIsArchived] = useState((post as any).is_archived ?? false);
  const [hideLikeCount, setHideLikeCount] = useState((post as any).hide_like_count ?? false);
  const [allowComments, setAllowComments] = useState((post as any).allow_comments !== false);
  const [isPinned, setIsPinned] = useState((post as any).is_pinned ?? false);
  const insets = useSafeAreaInsets();
  const qrViewRef = useRef<View>(null);
  // null = dimensions not yet known → show shimmer placeholder.
  // Initialise from module-level cache so already-seen posts render at the
  // correct height immediately (no layout jump on scroll-back).
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(() => {
    const url = (post.images && post.images.length > 0 ? post.images[0] : post.image_url) ?? null;
    return url ? (_ratioCache.get(url) ?? null) : null;
  });
  const videoRef = useRef<Video>(null);
  const heartScale = useSharedValue(1);
  const heartBurstOpacity = useSharedValue(0);
  const heartBurstScale = useSharedValue(0);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve the image's real aspect ratio so the container height = CARD_W / ratio
  // (no black gaps, no crop). Uses a module-level cache — synchronous for images
  // already in RN's decode cache, eliminating the flash-then-resize on scroll-back.
  useEffect(() => {
    const url = images[0];
    if (!url) { setMediaAspectRatio(1); return; }
    // Serve from cache immediately — no state update needed if already correct
    const cached = _ratioCache.get(url);
    if (cached) { setMediaAspectRatio(cached); return; }
    // Unknown image: show shimmer (null) while we fetch dimensions
    setMediaAspectRatio(null);
    Image.getSize(
      url,
      (w, h) => {
        if (w && h) {
          const r = w / h;
          _ratioCache.set(url, r);
          setMediaAspectRatio(r);
        }
      },
      () => { setMediaAspectRatio(4 / 3); } // fallback on error
    );
  }, [post.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return () => {
      cancelAnimation(heartScale);
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    checkLiked(post.id, userId).then(setLiked).catch(() => {});
    checkFavourited(post.id, userId).then(setFavourited).catch(() => {});
  }, [post.id, userId]);

  useEffect(() => { setLikesCount(rtCounts.likes_count); }, [rtCounts.likes_count]);
  useEffect(() => { setCommentsDisplay(rtCounts.comments_count); }, [rtCounts.comments_count]);
  useEffect(() => {
    if (bumped === "likes_count") {
      heartScale.value = withSequence(withSpring(1.3, { damping: 7 }), withSpring(1));
    }
  }, [bumped]);

  const images = post.images && post.images.length > 0 ? post.images : [post.image_url];
  const hasMedia = !!(images[0]);

  const requireAuth = () => {
    if (!isLoggedIn) { onRequireLogin?.(); return true; }
    return false;
  };

  const extractHashtags = (text: string) => (text?.match(/#(\w+)/g) ?? []).map((t) => t.slice(1));

  const handleLike = async () => {
    if (requireAuth()) return;
    const nowLiked = !liked;
    // Optimistic update — instant feedback; server result confirms or rolls back.
    setLiked(nowLiked);
    setLikesCount((c) => (nowLiked ? c + 1 : Math.max(0, c - 1)));
    heartScale.value = withSequence(withSpring(1.5, { damping: 5 }), withSpring(1));
    if (nowLiked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (userId) {
      try {
        const result = await toggleLike(post.id, userId, nowLiked, post.user_id ?? undefined);
        // Confirm with server-accurate state. likesCount === -1 means the API was
        // unreachable — keep the optimistic value in that case.
        setLiked(result.liked);
        if (result.likesCount >= 0) setLikesCount(result.likesCount);
      } catch {
        // Rollback on unexpected error
        setLiked(!nowLiked);
        setLikesCount((c) => (nowLiked ? Math.max(0, c - 1) : c + 1));
      }
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
  const heartBurstStyle = useAnimatedStyle(() => ({
    opacity: heartBurstOpacity.value,
    transform: [{ scale: heartBurstScale.value }],
  }));

  // Double-tap: like + burst animation (only likes, never unlikes — Instagram behaviour)
  const handleDoubleTap = useCallback(() => {
    if (!liked) handleLike();
    heartBurstOpacity.value = 0;
    heartBurstScale.value = 0.3;
    heartBurstOpacity.value = withTiming(1, { duration: 80 });
    heartBurstScale.value = withSpring(1, { damping: 7, stiffness: 200 });
    // Fade out on JS thread — safe to call setTimeout outside Reanimated callbacks
    setTimeout(() => {
      heartBurstOpacity.value = withTiming(0, { duration: 450 });
      heartBurstScale.value = withTiming(1.3, { duration: 450 });
    }, 650);
  }, [liked, handleLike, heartBurstOpacity, heartBurstScale]);

  // Tap dispatcher: single tap → navigate after 280ms delay; double tap → like
  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      handleDoubleTap();
    } else {
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        onPress?.();
      }, 280);
    }
    lastTapRef.current = now;
  }, [handleDoubleTap, onPress]);

  // Tap dispatcher for normal card image: single → open viewer, double → like+burst
  const handleMediaTap = useCallback((imageIndex: number) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double-tap: cancel pending viewer open, fire like+burst
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      handleDoubleTap();
    } else {
      // Single-tap: wait 280ms to confirm no second tap, then open post detail
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        router.push(`/post/${post.id}` as any);
      }, 280);
    }
    lastTapRef.current = now;
  }, [handleDoubleTap]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
    setActiveImg(page);
  };

  // Full-screen derived dimensions
  const fsImageH = itemHeight ? itemHeight - 62 - 50 : 0;

  const isOwn = !!(userId && post.user_id && userId === post.user_id);

  const patchPost = async (fields: Record<string, unknown>) => {
    try {
      const res = await fetch(`${API_BASE}/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("patch failed");
    } catch {
      // silently swallow — UI already has optimistic state
    }
  };

  const handleNotInterested = () => {
    setShowOptionsSheet(false);
    setHidden(true);
    if (userId && post.user_id && post.user_id !== userId) {
      recordEngagement(userId, post.user_id, "hide", post.id, "post").catch(() => {});
    }
  };

  const handleSaveFromSheet = () => {
    setShowOptionsSheet(false);
    if (!isLoggedIn) { onRequireLogin?.(); return; }
    const nowF = !favourited;
    setFavourited(nowF);
    if (userId) {
      toggleFavourite(post.id, userId, nowF);
      if (nowF && post.user_id && post.user_id !== userId) {
        recordEngagement(userId, post.user_id, "save", post.id, "post").catch(() => {});
      }
    }
  };

  const handleShareToFindVibes = async () => {
    setShowOptionsSheet(false);
    try {
      const url = buildVibeUrl("post", { id: post.id, username: post.profiles?.username ?? "" });
      await Share.share({ message: url, url });
    } catch { /* user cancelled */ }
  };

  const handleArchiveToggle = () => {
    setShowOptionsSheet(false);
    const next = !isArchived;
    setIsArchived(next);
    patchPost({ is_archived: next });
  };

  const handleHideLikeCountToggle = () => {
    const next = !hideLikeCount;
    setHideLikeCount(next);
    patchPost({ hide_like_count: next });
  };

  const handleAllowCommentsToggle = () => {
    const next = !allowComments;
    setAllowComments(next);
    patchPost({ allow_comments: next });
  };

  const handlePinToggle = () => {
    setShowOptionsSheet(false);
    const next = !isPinned;
    setIsPinned(next);
    patchPost({ is_pinned: next });
  };

  const handleDeletePost = () => {
    setShowOptionsSheet(false);
    Alert.alert("Delete post", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${API_BASE}/posts/${post.id}`, { method: "DELETE" });
            setHidden(true);
          } catch { /* ignore */ }
        },
      },
    ]);
  };

  const handleSaveCaptionEdit = async () => {
    setSavingCaption(true);
    try {
      await patchPost({ caption: editCaptionText.trim() });
    } finally {
      setSavingCaption(false);
      setShowEditCaption(false);
    }
  };

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
            renderItem={({ item, index }) => (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => { setViewerStartIndex(index); setShowViewer(true); }}
              >
                <Image source={{ uri: item }} style={{ width: SCREEN_WIDTH, height: fsImageH + 62 }} resizeMode="contain" />
              </TouchableOpacity>
            )}
            scrollEnabled={images.length > 1}
          />
          {/* Very subtle fade at top — just enough contrast for the username, not a dark band */}
          <LinearGradient
            colors={["rgba(0,0,0,0.28)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: 64 }}
            pointerEvents="none"
          />
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

        {/* Tap dispatcher: single tap → navigate (280ms delay), double tap → like + burst */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={handleTap}
          activeOpacity={1}
        />
        {/* Heart burst overlay — shown on double-tap, pointerEvents="none" so it doesn't block other touches */}
        <Animated.View style={[styles.heartBurst, heartBurstStyle]} pointerEvents="none">
          <Ionicons name="heart" size={100} color="#EC4899" />
        </Animated.View>

        {/* Header overlaid on top of image */}
        <View style={[styles.header, { backgroundColor: "transparent" }]}>
          {(post as any).is_couple_post && (post as any).couple ? (
            <CoupleHeaderRow post={post} />
          ) : (
            <>
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
            </>
          )}
          <FollowPillButton following={following} onPress={() => setFollowing((f) => !f)} />
        </View>

        {/* Caption + actions pinned to bottom — subtle gradient scrim, not a heavy dark block */}
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: 8 }}>
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.32)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {post.caption?.trim() ? (
            <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
              <Text style={[styles.caption, { color: "#fff" }]} numberOfLines={2}>
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
            </View>
            <View style={styles.rightIcons}>
              <TouchableOpacity onPress={() => { if (requireAuth()) return; const nowF = !favourited; setFavourited(nowF); if (userId) { toggleFavourite(post.id, userId, nowF); if (nowF && post.user_id && post.user_id !== userId) recordEngagement(userId, post.user_id, "save", post.id, "post").catch(() => {}); } }}>
                <Ionicons name={favourited ? "star" : "star-outline"} size={23} color={favourited ? "#EAB308" : "#fff"} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <CommentsSheet visible={showComments} onClose={() => setShowComments(false)} postId={post.id} isLoggedIn={isLoggedIn} onRequireLogin={() => { setShowComments(false); onRequireLogin?.(); }} />
        <ShareSheet visible={showShare} onClose={() => setShowShare(false)} contentType="post" username={post.profiles?.username} />
        <AchievementModal visible={!!achievement} achievement={achievement} onClose={() => setAchievement(null)} />
        <FullscreenImageViewer
          images={images.filter(Boolean) as string[]}
          initialIndex={viewerStartIndex}
          visible={showViewer}
          onClose={() => setShowViewer(false)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {/* Header */}
      <View style={styles.header}>
        {(post as any).is_couple_post && (post as any).couple ? (
          <CoupleHeaderRow post={post} />
        ) : (
          <>
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
                  <Text
                    style={[styles.username, { color: colors.foreground }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {post.profiles?.username ?? "user"}
                  </Text>
                  {post.profiles?.is_verified && (
                    <Ionicons name="checkmark-circle" size={14} color="#8B5CF6" style={{ flexShrink: 0 }} />
                  )}
                  {(post as any).is_first_post && (
                    <View style={newHereBadge.pill}>
                      <Text style={newHereBadge.text}>New here 👋</Text>
                    </View>
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
          </>
        )}
        <FollowPillButton following={following} onPress={() => setFollowing((f) => !f)} />
        <TouchableOpacity onPress={() => setShowOptionsSheet(true)} style={styles.moreBtn}>
          <Ionicons name="ellipsis-vertical" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Media area — video or image carousel.
          Container height = CARD_W / realAspectRatio (exact fit, no gaps, no crop).
          Extreme portraits (taller than 1.25× width) are capped + use cover.
          While dimensions are loading, a thin shimmer placeholder avoids a large
          wrong-size box flashing before the real height is known.
          Skipped entirely for media-less posts (polls, text posts). */}
      {hasMedia ? (
        mediaAspectRatio === null ? (
          // Shimmer — shown only for truly first-load images not yet in _ratioCache.
          // Height is a neutral 56vw so the card isn't massively tall or collapsed.
          <View style={[styles.imageContainer, styles.shimmer, { height: CARD_W * 0.56 }]} />
        ) : (() => {
        const isExtremePortrait = (CARD_W / mediaAspectRatio) > MAX_PORTRAIT_H;
        const imgH = isExtremePortrait ? MAX_PORTRAIT_H : CARD_W / mediaAspectRatio;
        // Always cover: the container is already sized to CARD_W × (CARD_W / ratio),
        // so cover fills it exactly. Any sub-pixel rounding becomes a hairline clip
        // rather than a visible dark band from letterboxing.
        const imgResizeMode = "cover" as const;
        return (
        <View style={[styles.imageContainer, { height: imgH }]}>
        {isVideoPost ? (
          <View style={{ flex: 1 }}>
            <Video
              ref={videoRef}
              source={{ uri: videoUrl! }}
              style={{ width: CARD_W, height: imgH }}
              resizeMode={ResizeMode.COVER}
              isLooping
              shouldPlay={isActive}
              isMuted={!isActive}
              onPlaybackStatusUpdate={(s) => {
                if (s.isLoaded) setVideoPlaying(s.isPlaying);
              }}
            />
            {/* Play/pause indicator — visual only, no touch handling */}
            {!videoPlaying && (
              <View style={styles.videoPlayOverlay} pointerEvents="none">
                <View style={styles.videoPlayBtn}>
                  <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 4 }} />
                </View>
                <View style={styles.videoBadge}>
                  <Ionicons name="videocam" size={11} color="#fff" />
                  <Text style={styles.videoBadgeText}> VIDEO</Text>
                </View>
              </View>
            )}
            {/* Heart burst — double-tap like animation over video */}
            <Animated.View style={[styles.heartBurst, heartBurstStyle]} pointerEvents="none">
              <Ionicons name="heart" size={100} color="#EC4899" />
            </Animated.View>
            {/* Transparent tap-catcher — same dispatcher as photo posts (single→open, double→like) */}
            <TouchableOpacity
              activeOpacity={1}
              style={StyleSheet.absoluteFill}
              onPress={() => handleMediaTap(0)}
            />
          </View>
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
              extraData={mediaAspectRatio}
              style={{ height: imgH }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => handleMediaTap(images.indexOf(item))}
                >
                  <Image
                    source={{ uri: item }}
                    style={{ width: CARD_W, height: imgH }}
                    resizeMode={imgResizeMode}
                  />
                </TouchableOpacity>
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
            {/* Heart burst — double-tap like animation, pointerEvents="none" so it doesn't block scrolling */}
            <Animated.View style={[styles.heartBurst, heartBurstStyle]} pointerEvents="none">
              <Ionicons name="heart" size={100} color="#EC4899" />
            </Animated.View>
          </>
        )}
        </View>
        );
      })()
      ) : null}

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

      {/* Poll */}
      {(post as any).poll && (
        <PollCard poll={(post as any).poll} userId={userId ?? null} />
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
        </View>

        <View style={styles.rightIcons}>
          <TouchableOpacity onPress={() => {
            if (requireAuth()) return;
            const nowF = !favourited;
            setFavourited(nowF);
            if (userId) { toggleFavourite(post.id, userId, nowF); if (nowF && post.user_id && post.user_id !== userId) recordEngagement(userId, post.user_id, "save", post.id, "post").catch(() => {}); }
          }}>
            <Ionicons name={favourited ? "star" : "star-outline"} size={23} color={favourited ? "#EAB308" : colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Caption — plain text only; username + timestamp already in card header */}
      {(post.caption?.trim() || post.location) ? (
        <View style={styles.captionContainer}>
          {post.location && (
            <TouchableOpacity
              style={styles.locationInline}
              onPress={() => router.push(`/location/${encodeURIComponent(post.location!)}` as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={11} color="#8B5CF6" />
              <Text style={[styles.location, { color: "#8B5CF6" }]}>{post.location}</Text>
            </TouchableOpacity>
          )}
          {post.caption?.trim() ? (
            <Text style={[styles.caption, { color: colors.foreground }]}>
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
          ) : null}
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
      <FullscreenImageViewer
        images={images.filter(Boolean) as string[]}
        initialIndex={viewerStartIndex}
        visible={showViewer}
        onClose={() => setShowViewer(false)}
      />

      {/* ── Options bottom sheet ───────────────────────────────────────────── */}
      <Modal visible={showOptionsSheet} transparent animationType="slide" onRequestClose={() => setShowOptionsSheet(false)}>
        <TouchableOpacity style={cardOptS.backdrop} activeOpacity={1} onPress={() => setShowOptionsSheet(false)} />
        <View style={[cardOptS.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={cardOptS.handle} />

          {/* QR / Save / Share icon row */}
          <View style={cardOptS.iconRow}>
            <TouchableOpacity style={cardOptS.iconItem} onPress={() => { setShowOptionsSheet(false); setShowQRCode(true); }}>
              <View style={cardOptS.iconCircle}><Ionicons name="qr-code-outline" size={22} color="#fff" /></View>
              <Text style={cardOptS.iconLabel}>QR Code</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cardOptS.iconItem} onPress={handleSaveFromSheet}>
              <View style={cardOptS.iconCircle}><Ionicons name={favourited ? "star" : "star-outline"} size={22} color={favourited ? "#EAB308" : "#fff"} /></View>
              <Text style={cardOptS.iconLabel}>{favourited ? "Saved" : "Save"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cardOptS.iconItem} onPress={handleShareToFindVibes}>
              <View style={cardOptS.iconCircle}><Ionicons name="share-social-outline" size={22} color="#fff" /></View>
              <Text style={cardOptS.iconLabel}>Share</Text>
            </TouchableOpacity>
          </View>

          {isOwn ? (
            <>
              <CardSheetRow icon="archive-outline" label={isArchived ? "Unarchive" : "Archive"} onPress={handleArchiveToggle} />
              <CardSheetRow icon={hideLikeCount ? "heart" : "heart-outline"} label={hideLikeCount ? "Show like count" : "Hide like count"} onPress={handleHideLikeCountToggle} />
              <CardSheetRow icon={allowComments ? "chatbubble-outline" : "chatbubble"} label={allowComments ? "Turn off commenting" : "Turn on commenting"} onPress={handleAllowCommentsToggle} />
              <CardSheetRow icon="create-outline" label="Edit caption" onPress={() => { setShowOptionsSheet(false); setEditCaptionText(post.caption ?? ""); setShowEditCaption(true); }} />
              <CardSheetRow icon={isPinned ? "pin" : "pin-outline"} label={isPinned ? "Unpin from grid" : "Pin to grid"} onPress={handlePinToggle} />
              <CardSheetRow icon="trash-outline" label="Delete" onPress={handleDeletePost} color="#EF4444" />
            </>
          ) : (
            <>
              <CardSheetRow icon="eye-off-outline" label="Not interested" onPress={handleNotInterested} />
              <CardSheetRow icon="flag-outline" label="Report" onPress={() => { setShowOptionsSheet(false); setShowReportSheet(true); }} color="#EF4444" />
            </>
          )}
        </View>
      </Modal>

      {/* ── Report reasons sheet ───────────────────────────────────────────── */}
      <Modal visible={showReportSheet} transparent animationType="slide" onRequestClose={() => setShowReportSheet(false)}>
        <TouchableOpacity style={cardOptS.backdrop} activeOpacity={1} onPress={() => setShowReportSheet(false)} />
        <View style={[cardOptS.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={cardOptS.handle} />
          <Text style={[cardOptS.reportTitle]}>Why are you reporting this post?</Text>
          {["Spam", "Harassment", "Inappropriate content", "Misinformation", "Other"].map((reason) => (
            <TouchableOpacity
              key={reason}
              disabled={!!reportingReason}
              onPress={async () => {
                if (!userId) return;
                setReportingReason(reason);
                try {
                  await reportContent(userId, post.id, "post", reason);
                  setShowReportSheet(false);
                  Alert.alert("Reported", "Thanks for letting us know. We'll review this post.");
                } finally {
                  setReportingReason(null);
                }
              }}
              style={[cardOptS.reportRow, { opacity: reportingReason === reason ? 0.5 : 1 }]}
            >
              <Ionicons name="flag-outline" size={18} color="#EF4444" />
              <Text style={cardOptS.reportRowText}>{reportingReason === reason ? "Submitting…" : reason}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setShowReportSheet(false)} style={cardOptS.cancelRow}>
            <Text style={cardOptS.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── QR Code modal ─────────────────────────────────────────────────── */}
      <Modal visible={showQRCode} transparent animationType="fade" onRequestClose={() => setShowQRCode(false)}>
        <TouchableOpacity style={cardOptS.qrBackdrop} activeOpacity={1} onPress={() => setShowQRCode(false)}>
          <View style={cardOptS.qrBox}>
            <View ref={qrViewRef} style={cardOptS.qrInner} collapsable={false}>
              <QRCode value={buildVibeUrl("post", { id: post.id, username: post.profiles?.username ?? "" })} size={200} backgroundColor="#fff" color="#000" />
            </View>
            <TouchableOpacity
              style={cardOptS.qrShareBtn}
              onPress={async () => {
                try {
                  const uri = await captureRef(qrViewRef, { format: "png", quality: 1 });
                  const postUrl = buildVibeUrl("post", { id: post.id, username: post.profiles?.username ?? "" });
                  await Share.share({ url: uri, message: postUrl });
                } catch { /* cancelled */ }
              }}
            >
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={cardOptS.qrShareText}>Share QR</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Edit caption modal ────────────────────────────────────────────── */}
      <Modal visible={showEditCaption} transparent animationType="slide" onRequestClose={() => setShowEditCaption(false)}>
        <TouchableOpacity style={cardOptS.backdrop} activeOpacity={1} onPress={() => setShowEditCaption(false)} />
        <View style={[cardOptS.editSheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={cardOptS.handle} />
          <Text style={cardOptS.editTitle}>Edit caption</Text>
          <TextInput
            style={cardOptS.editInput}
            value={editCaptionText}
            onChangeText={setEditCaptionText}
            multiline
            placeholder="Write a caption…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoFocus
          />
          <TouchableOpacity style={[cardOptS.editSaveBtn, savingCaption && { opacity: 0.5 }]} disabled={savingCaption} onPress={handleSaveCaptionEdit}>
            <Text style={cardOptS.editSaveTxt}>{savingCaption ? "Saving…" : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// ── Module-scope CardSheetRow — stable reference prevents Ionicons glyph reset ─
function CardSheetRow({ icon, label, onPress, color }: { icon: string; label: string; onPress: () => void; color?: string }) {
  const clr = color ?? "#fff";
  return (
    <TouchableOpacity style={cardOptS.row} onPress={onPress} activeOpacity={0.7}>
      <View style={cardOptS.rowIcon}><Ionicons name={icon as any} size={22} color={clr} /></View>
      <Text style={[cardOptS.rowLabel, { color: clr }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const cardOptS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: "#1A1A2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 0,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center", marginBottom: 18,
  },
  iconRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 8,
  },
  iconItem: { alignItems: "center", gap: 6 },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  iconLabel: { fontSize: 11, fontFamily: "Poppins_400Regular", color: "rgba(255,255,255,0.75)" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingHorizontal: 22 },
  rowIcon: { width: 36, alignItems: "center" },
  rowLabel: { fontSize: 15, fontFamily: "Poppins_400Regular", flex: 1, marginLeft: 10 },
  qrBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", alignItems: "center", justifyContent: "center" },
  qrBox: { backgroundColor: "#1A1A2E", borderRadius: 20, padding: 28, alignItems: "center", gap: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  qrInner: { backgroundColor: "#fff", borderRadius: 12, padding: 12 },
  qrShareBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(139,92,246,0.18)", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  qrShareText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  editSheet: {
    backgroundColor: "#1A1A2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  editTitle: { fontSize: 16, fontFamily: "Poppins_700Bold", color: "#fff", marginBottom: 14, textAlign: "center" },
  editInput: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    color: "#fff",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    minHeight: 100,
    padding: 14,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  editSaveBtn: { backgroundColor: "#7C3AED", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  editSaveTxt: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  reportTitle: { fontSize: 15, fontFamily: "Poppins_600SemiBold", color: "#fff", paddingHorizontal: 22, paddingBottom: 10 },
  reportRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 22, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  reportRowText: { fontSize: 14, fontFamily: "Poppins_400Regular", color: "#fff", flex: 1 },
  cancelRow: { paddingVertical: 14, alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", marginTop: 4 },
  cancelText: { fontSize: 14, fontFamily: "Poppins_500Medium", color: "rgba(255,255,255,0.5)" },
});

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

const newHereBadge = StyleSheet.create({
  pill: {
    backgroundColor: "rgba(34,197,94,0.14)",
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "rgba(34,197,94,0.35)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexShrink: 0,
  },
  text: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    color: "#4ADE80",
  },
});

const styles = StyleSheet.create({
  container: {
    marginHorizontal: CARD_MARGIN,
    marginBottom: 12,
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
    paddingTop: 10,
    paddingBottom: 0,
    gap: 10,
  },
  headerText: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  username: { fontSize: 15, fontFamily: "Poppins_700Bold", flexShrink: 1 },
  time: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: -1 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: -1 },
  location: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  followPill: {
    borderRadius: 999,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
    paddingVertical: 5,
    gap: 4,
  },
  followPillOutline: {
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
    backgroundColor: "transparent",
  },
  followPillDark: {
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.30)",
  },
  followPillText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  moreBtn: { padding: 4 },
  imageContainer: {
    width: CARD_W,
    position: "relative",
    overflow: "hidden",
  },
  shimmer: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  image: { width: CARD_W },
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
  heartBurst: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
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
    paddingTop: 6,
    paddingBottom: 8,
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
    paddingBottom: 10,
    paddingTop: 2,
    gap: 3,
  },
  locationInline: { flexDirection: "row", alignItems: "center", gap: 3 },
  caption: { fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 21 },
  captionUsername: { fontFamily: "Poppins_700Bold" },
  hashTag: { color: "#8B5CF6", fontFamily: "Poppins_500Medium" },
  postTimestamp: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 1 },
});
