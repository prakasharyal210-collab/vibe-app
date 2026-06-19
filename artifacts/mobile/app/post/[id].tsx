import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommentsSheet } from "@/components/CommentsSheet";
import { FullscreenImageViewer } from "@/components/FullscreenImageViewer";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Post, formatCount, timeAgo } from "@/lib/supabase";
import { shareContent } from "@/lib/share";

const { width: W } = Dimensions.get("window");
const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

// ─── Module-scope sub-components ─────────────────────────────────────────────
// Defined at module scope to avoid the Ionicons empty-box remount bug.

function GradientRingAvatar({
  username,
  url,
  size = 44,
}: {
  username: string;
  url?: string | null;
  size?: number;
}) {
  return (
    <LinearGradient
      colors={["#EA580C", "#9333EA"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size + 4,
        height: size + 4,
        borderRadius: (size + 4) / 2,
        padding: 2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <UserAvatar username={username} url={url} size={size} />
    </LinearGradient>
  );
}

function CommentRow({
  comment,
  textColor,
}: {
  comment: { text?: string; content?: string; profiles?: { username?: string } };
  textColor: string;
}) {
  const username = comment.profiles?.username ?? "user";
  const text = (comment.text ?? comment.content ?? "").trim();
  if (!text) return null;
  return (
    <View style={{ paddingVertical: 3 }}>
      <Text
        style={{ fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 18, color: textColor }}
        numberOfLines={2}
      >
        <Text style={{ fontFamily: "Poppins_700Bold" }}>{username} </Text>
        {text}
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [previewComments, setPreviewComments] = useState<any[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [morePosts, setMorePosts] = useState<any[]>([]);
  const [moreLoading, setMoreLoading] = useState(false);

  // Reanimated — like heart pop + double-tap burst
  const likeScale = useSharedValue(1);
  const heartBurstOpacity = useSharedValue(0);
  const heartBurstScale = useSharedValue(0);

  const likeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));
  const heartBurstStyle = useAnimatedStyle(() => ({
    opacity: heartBurstOpacity.value,
    transform: [{ scale: heartBurstScale.value }],
  }));

  // Double-tap: track last tap + pending single-tap timer
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch post ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(id)}`);
        if (res.ok) {
          const body = await res.json();
          const data = body.data as any;
          if (data) {
            if (!data.image_url && data.media_url) data.image_url = data.media_url;
            setPost(data as Post);
            setLikesCount(data.likes_count ?? 0);
          }
        } else {
          console.error("[post-detail] API error", res.status);
        }
      } catch (e: any) {
        console.error("[post-detail] fetch threw:", e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Fetch like/save status once post loaded ─────────────────────────────────
  useEffect(() => {
    if (!id || !session?.user?.id) return;
    fetch(`${API_BASE}/posts/like-status?postId=${id}&userId=${session.user.id}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.liked !== undefined) setLiked(!!body.liked);
        if (body.saved !== undefined) setSaved(!!body.saved);
      })
      .catch(() => {});
  }, [id, session?.user?.id]);

  // ── Fetch "More from this user" grid once post is loaded ────────────────────
  useEffect(() => {
    if (!post?.user_id || !id) return;
    setMoreLoading(true);
    fetch(`${API_BASE}/posts/user/${encodeURIComponent(post.user_id)}/more?excludeId=${encodeURIComponent(id)}&limit=9`)
      .then((r) => r.json())
      .then((body) => setMorePosts(body.posts ?? []))
      .catch(() => {})
      .finally(() => setMoreLoading(false));
  }, [post?.user_id, id]);

  // ── Fetch top 2 preview comments ────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/comments?postId=${id}`)
      .then((r) => r.json())
      .then((body) => setPreviewComments((body.comments ?? []).slice(0, 2)))
      .catch(() => {});
  }, [id]);

  // ── Like handler (optimistic + server confirm) ──────────────────────────────
  const handleLike = async () => {
    if (!session?.user?.id || !post) return;
    const nowLiked = !liked;
    setLiked(nowLiked);
    setLikesCount((n) => (nowLiked ? n + 1 : Math.max(0, n - 1)));
    // Pop animation on action bar heart
    likeScale.value = withSequence(
      withSpring(1.4, { damping: 5 }),
      withSpring(1, { damping: 7 }),
    );
    try {
      const res = await fetch(`${API_BASE}/posts/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, userId: session.user.id }),
      });
      if (res.ok) {
        const body = await res.json();
        // Reconcile with server truth
        setLiked(body.liked);
        setLikesCount(body.likesCount);
      }
    } catch {}
  };

  // ── Double-tap: burst heart + like ─────────────────────────────────────────
  const handleDoubleTap = () => {
    if (!liked) handleLike();
    // Burst animation
    heartBurstOpacity.value = 0;
    heartBurstScale.value = 0.3;
    heartBurstOpacity.value = withTiming(1, { duration: 80 });
    heartBurstScale.value = withSpring(1, { damping: 7, stiffness: 200 });
    // Fade out after beat — setTimeout on JS thread, safe outside Reanimated callbacks
    setTimeout(() => {
      heartBurstOpacity.value = withTiming(0, { duration: 450 });
      heartBurstScale.value = withTiming(1.3, { duration: 450 });
    }, 650);
  };

  // ── Tap dispatcher (single = fullscreen, double = like) ────────────────────
  const handleMediaTap = (imageIndex: number) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double-tap — cancel pending fullscreen open
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      handleDoubleTap();
    } else {
      // Wait to see if a second tap follows before opening fullscreen
      singleTapTimerRef.current = setTimeout(() => {
        setViewerInitialIndex(imageIndex);
        setShowViewer(true);
        singleTapTimerRef.current = null;
      }, 280);
    }
    lastTapRef.current = now;
  };

  // ── Save / bookmark ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!session?.user?.id || !post) return;
    const nowSaved = !saved;
    setSaved(nowSaved);
    try {
      await fetch(`${API_BASE}/posts/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, userId: session.user.id }),
      });
    } catch {}
  };

  const handleShare = () => {
    if (!post) return;
    shareContent(
      "post",
      { username: post.profiles?.username ?? "user", id: post.id },
      post.caption ?? undefined,
    );
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const username = post?.profiles?.username ?? "user";
  const isVerified = post?.profiles?.is_verified;
  const avatarUrl = post?.profiles?.avatar_url;
  const images = post
    ? (post.images && post.images.length > 0
        ? post.images.filter(Boolean)
        : [post.image_url ?? ""].filter(Boolean))
    : [];
  const caption = post?.caption ?? "";
  const captionNeedsExpand = caption.length > 120;
  const displayCaption =
    captionExpanded || !captionNeedsExpand ? caption : caption.slice(0, 120) + "…";
  const captionParts = displayCaption.split(/([@#]\w+)/g);
  const commentsCount = post?.comments_count ?? 0;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────────
  if (!post) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12, fontFamily: "Poppins_400Regular" }}>
          Post not found
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "#7C3AED", fontFamily: "Poppins_600SemiBold" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Post</Text>
        <TouchableOpacity onPress={handleShare} style={styles.headerBtn}>
          <Ionicons name="share-social-outline" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 56 }}>
        {/* ── Author row ─────────────────────────────────────────────────── */}
        <View style={styles.authorRow}>
          <TouchableOpacity
            style={styles.authorInfo}
            onPress={() => router.push(`/profile/${username}` as any)}
            activeOpacity={0.75}
          >
            <GradientRingAvatar username={username} url={avatarUrl} size={44} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[styles.authorUsername, { color: colors.foreground }]}>{username}</Text>
                {isVerified && <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />}
              </View>
              <Text style={[styles.authorTime, { color: colors.mutedForeground }]}>
                {timeAgo(post.created_at)}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Follow button */}
          <TouchableOpacity onPress={() => setFollowing((f) => !f)} activeOpacity={0.8}>
            {following ? (
              <View style={styles.followingBtn}>
                <Text style={[styles.followBtnText, { color: colors.foreground }]}>Following</Text>
              </View>
            ) : (
              <LinearGradient
                colors={["#EA580C", "#7C3AED"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.followGrad}
              >
                <Text style={[styles.followBtnText, { color: "#fff" }]}>Follow</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Media card ─────────────────────────────────────────────────── */}
        {/* Shadow wrapper (separate from overflow:hidden to keep shadow visible) */}
        <View style={styles.mediaShadow}>
          <View style={styles.mediaCard}>
            {images.length > 1 ? (
              /* Multi-image horizontal scroll */
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(e) =>
                  setCurrentImageIndex(Math.round(e.nativeEvent.contentOffset.x / W))
                }
              >
                {images.map((img, idx) => (
                  <TouchableOpacity key={idx} activeOpacity={1} onPress={() => handleMediaTap(idx)}>
                    <Image
                      source={{ uri: img }}
                      style={{ width: W, height: W }}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <TouchableOpacity activeOpacity={1} onPress={() => handleMediaTap(0)}>
                <Image
                  source={{ uri: images[0] ?? "" }}
                  style={{ width: W, height: W }}
                  contentFit="cover"
                />
              </TouchableOpacity>
            )}

            {/* Double-tap heart burst overlay */}
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.heartBurstOverlay, heartBurstStyle]}
              pointerEvents="none"
            >
              <Ionicons name="heart" size={100} color="rgba(255,255,255,0.88)" />
            </Animated.View>

            {/* Multi-image dot indicators */}
            {images.length > 1 && (
              <View style={styles.dotsRow} pointerEvents="none">
                {images.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, i === currentImageIndex && styles.dotActive]}
                  />
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Action bar ─────────────────────────────────────────────────── */}
        <View style={styles.actionsRow}>
          {/* Like */}
          <TouchableOpacity onPress={handleLike} style={styles.actionItem}>
            <Animated.View style={likeAnimStyle}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={28}
                color={liked ? "#EF4444" : colors.foreground}
              />
            </Animated.View>
            <Text style={[styles.actionCount, { color: colors.foreground }]}>
              {formatCount(likesCount)}
            </Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity onPress={() => setShowComments(true)} style={styles.actionItem}>
            <Ionicons name="chatbubble-outline" size={26} color={colors.foreground} />
            <Text style={[styles.actionCount, { color: colors.foreground }]}>
              {formatCount(commentsCount)}
            </Text>
          </TouchableOpacity>

          {/* Repost / forward */}
          <TouchableOpacity onPress={handleShare} style={styles.actionItem}>
            <Ionicons name="arrow-redo-outline" size={26} color={colors.foreground} />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {/* Bookmark */}
          <TouchableOpacity onPress={handleSave} style={styles.actionItem}>
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={26}
              color={saved ? "#7C3AED" : colors.foreground}
            />
          </TouchableOpacity>

          {/* Share / send */}
          <TouchableOpacity onPress={handleShare} style={styles.actionItem}>
            <Ionicons name="paper-plane-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* ── Caption ────────────────────────────────────────────────────── */}
        {caption ? (
          <View style={styles.captionSection}>
            <Text style={[styles.captionText, { color: colors.foreground }]}>
              <Text style={styles.captionAuthor}>{username} </Text>
              {captionParts.map((part, i) =>
                part.startsWith("@") || part.startsWith("#") ? (
                  <Text key={i} style={styles.captionAccent}>
                    {part}
                  </Text>
                ) : (
                  <Text key={i}>{part}</Text>
                ),
              )}
            </Text>
            {captionNeedsExpand && (
              <TouchableOpacity onPress={() => setCaptionExpanded((v) => !v)} style={{ marginTop: 4 }}>
                <Text style={styles.moreText}>{captionExpanded ? "less" : "more"}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* ── Comments preview ───────────────────────────────────────────── */}
        {previewComments.length > 0 && (
          <View style={styles.commentsPreview}>
            {previewComments.map((c, i) => (
              <CommentRow key={c.id ?? i} comment={c} textColor={colors.foreground} />
            ))}
            <TouchableOpacity onPress={() => setShowComments(true)} style={{ marginTop: 8 }}>
              <Text style={[styles.viewAllText, { color: colors.mutedForeground }]}>
                View all {formatCount(commentsCount)} comment{commentsCount !== 1 ? "s" : ""} →
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── More from this user ─────────────────────────────────────────── */}
        {(moreLoading || morePosts.length > 0) && (
          <View style={styles.moreSection}>
            {/* Divider + header */}
            <View style={[styles.moreDivider, { backgroundColor: colors.border ?? "rgba(255,255,255,0.08)" }]} />
            <View style={styles.moreHeader}>
              <View style={styles.moreAccentBar} />
              <Text style={[styles.moreTitle, { color: colors.foreground }]}>
                More from{" "}
                <Text style={styles.moreUsername}>@{username}</Text>
              </Text>
              <TouchableOpacity
                onPress={() => router.push(`/profile/${username}` as any)}
                style={styles.moreSeAllBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.moreSeeAll}>See all →</Text>
              </TouchableOpacity>
            </View>

            {moreLoading ? (
              <View style={styles.moreLoadingWrap}>
                <ActivityIndicator size="small" color="#7C3AED" />
              </View>
            ) : (
              <View style={styles.moreGrid}>
                {morePosts.map((p) => {
                  const thumb = p.image_url ?? p.media_url ?? "";
                  const isVideo = typeof p.media_url === "string" &&
                    /\.(mp4|mov|m4v|webm)(\?|$)/i.test(p.media_url);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.moreThumb}
                      activeOpacity={0.82}
                      onPress={() => router.replace(`/post/${p.id}` as any)}
                    >
                      <Image
                        source={{ uri: thumb }}
                        style={styles.moreThumbImg}
                        contentFit="cover"
                      />
                      {isVideo && (
                        <View style={styles.moreVideoIcon}>
                          <Ionicons name="play" size={11} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Sheets ─────────────────────────────────────────────────────────── */}
      <CommentsSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        postId={id!}
        isLoggedIn={!!session}
        onRequireLogin={() => setShowComments(false)}
        contentType="post"
      />
      <FullscreenImageViewer
        images={images}
        initialIndex={viewerInitialIndex}
        visible={showViewer}
        onClose={() => setShowViewer(false)}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Poppins_700Bold" },
  headerBtn: { padding: 4, width: 40 },

  // Author row
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  authorInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  authorUsername: { fontSize: 14, fontFamily: "Poppins_700Bold" },
  authorTime: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  followGrad: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 7 },
  followingBtn: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
  },
  followBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  // Media
  mediaShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 12,
  },
  mediaCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 0, // Full-bleed (shadow comes from mediaShadow wrapper)
  },
  heartBurstOverlay: { alignItems: "center", justifyContent: "center" },
  dotsRow: {
    position: "absolute",
    bottom: 12,
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
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  dotActive: { backgroundColor: "#fff", width: 18 },

  // Actions
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  actionCount: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  // Caption
  captionSection: { paddingHorizontal: 14, paddingBottom: 8 },
  captionText: { fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 21 },
  captionAuthor: { fontFamily: "Poppins_700Bold" },
  captionAccent: { color: "#8B5CF6", fontFamily: "Poppins_600SemiBold" },
  moreText: { fontSize: 13, color: "#7C3AED", fontFamily: "Poppins_600SemiBold" },

  // Comments preview
  commentsPreview: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    marginTop: 4,
  },
  viewAllText: { fontSize: 13, fontFamily: "Poppins_400Regular" },

  // More from this user
  moreSection: { marginTop: 8 },
  moreDivider: { height: 6, marginVertical: 8 },
  moreHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  moreAccentBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#7C3AED",
  },
  moreTitle: { flex: 1, fontSize: 14, fontFamily: "Poppins_700Bold" },
  moreUsername: { color: "#A78BFA", fontFamily: "Poppins_700Bold" },
  moreSeAllBtn: { paddingHorizontal: 4 },
  moreSeeAll: { fontSize: 12, color: "#7C3AED", fontFamily: "Poppins_600SemiBold" },
  moreLoadingWrap: { paddingVertical: 24, alignItems: "center" },
  moreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  moreThumb: {
    width: W / 3,
    height: W / 3,
    position: "relative",
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.6)",
  },
  moreThumbImg: {
    width: "100%",
    height: "100%",
  },
  moreVideoIcon: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});
