import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { CommentsSheet } from "@/components/CommentsSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Post, formatCount, timeAgo } from "@/lib/supabase";
import { feedPostCache } from "@/lib/db";
import { shareContent } from "@/lib/share";
import { cardUrl } from "@/lib/imageUrl";

const { width: W } = Dimensions.get("window");
const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
// Max pinned-player height — cap at 4:3 so portrait videos don't dominate the screen.
const MAX_VIDEO_H = Math.round(W * 0.75);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectVideoUrl(post: Post): string | null {
  const resolved = post.image_url || post.media_url || undefined;
  if (post.is_video) return post.video_url || resolved || null;
  if (post.video_url) return post.video_url;
  if (resolved?.match(/\.(mp4|mov|webm|m4v)(\?|$)/i)) return resolved;
  return null;
}

function isVideoPost(post: Post): boolean {
  return !!detectVideoUrl(post);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** "1:23" or "0:45" from a duration in seconds (as stored on some posts). */
function fmtDuration(seconds: number | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Large YouTube-style card for "Up next" feed continuation ─────────────────

const THUMB_H = Math.round((W - 32) * 9 / 16); // 16:9, full-width with 16px side padding

function FeedContinuationCard({
  post,
  onPress,
}: {
  post: Post;
  onPress: () => void;
}) {
  const colors = useColors();
  const rawThumb =
    post.thumbnail_url || post.image_url || post.media_url || undefined;
  const thumbUri = cardUrl(rawThumb) ?? rawThumb;
  const username = post.profiles?.username ?? "user";
  const duration = fmtDuration((post as any).duration);

  return (
    <TouchableOpacity
      style={S.contCard}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Thumbnail — 16:9, full card width */}
      <View style={S.contThumbWrap}>
        {thumbUri ? (
          <Image
            source={{ uri: thumbUri }}
            style={S.contThumb}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={rawThumb}
          />
        ) : (
          <View style={[S.contThumb, S.contThumbEmpty]}>
            <Ionicons name="play-circle-outline" size={40} color="rgba(255,255,255,0.2)" />
          </View>
        )}

        {/* Duration pill — bottom-right, YouTube-style */}
        {duration && (
          <View style={S.durationPill}>
            <Text style={S.durationTxt}>{duration}</Text>
          </View>
        )}
      </View>

      {/* Text meta below thumbnail */}
      <View style={S.contMeta}>
        <Text
          style={[S.contCaption, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {post.caption || "(no caption)"}
        </Text>
        <Text style={[S.contSub, { color: colors.mutedForeground }]}>
          {username} · {timeAgo(post.created_at)} · {formatCount(post.likes_count)} likes
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WatchScreen() {
  const { id, pos } = useLocalSearchParams<{ id: string; pos?: string }>();
  const initialPos = parseInt(pos ?? "0", 10) || 0;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  // Seed instantly from feed cache — no loading state needed if we have the post.
  const [post, setPost] = useState<Post | null>(
    () => feedPostCache.get(id ?? "") ?? null,
  );
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(
    () => feedPostCache.get(id ?? "")?.likes_count ?? 0,
  );
  const [showComments, setShowComments] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [previewComments, setPreviewComments] = useState<any[]>([]);
  const [allowComments, setAllowComments] = useState(true);
  const [hideLikeCount, setHideLikeCount] = useState(false);

  // Feed continuation — video posts only, current post excluded,
  // reversed so newest-seen (most relevant) appear first.
  const [feedSlice] = useState<Post[]>(() =>
    [...feedPostCache.values()]
      .reverse()
      .filter((p) => p.id !== id && isVideoPost(p))
      .slice(0, 24),
  );

  // ── Video ────────────────────────────────────────────────────────────────────
  const videoRef = useRef<Video>(null);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoPosition, setVideoPosition] = useState(0);
  const [progressTrackW, setProgressTrackW] = useState(0);
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const seekedRef = useRef(false);
  const controlsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Animations ───────────────────────────────────────────────────────────────
  const likeScale = useSharedValue(1);
  const controlsOpacity = useSharedValue(1);
  const likeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));
  const videoControlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  // ── Fetch post if not cached ─────────────────────────────────────────────────
  useEffect(() => {
    if (!id || feedPostCache.has(id)) return;
    const uid = session?.user?.id;
    const q = uid ? `?viewerId=${encodeURIComponent(uid)}` : "";
    fetch(`${API_BASE}/posts/${encodeURIComponent(id)}${q}`)
      .then((r) => r.json())
      .then((body) => {
        const data = body.data as any;
        if (data) {
          if (!data.image_url && data.media_url) data.image_url = data.media_url;
          setPost(data as Post);
          setLikesCount(data.likes_count ?? 0);
          setAllowComments(data.allow_comments ?? true);
          setHideLikeCount(data.hide_like_count ?? false);
        }
      })
      .catch(() => {});
  }, [id, session?.user?.id]);

  // ── Like / save status ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !session?.user?.id) return;
    fetch(
      `${API_BASE}/posts/like-status?postId=${id}&userId=${session.user.id}`,
    )
      .then((r) => r.json())
      .then((body) => {
        if (body.liked !== undefined) setLiked(!!body.liked);
        if (body.saved !== undefined) setSaved(!!body.saved);
      })
      .catch(() => {});
  }, [id, session?.user?.id]);

  // ── Top 2 preview comments ───────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/comments?postId=${id}`)
      .then((r) => r.json())
      .then((body) =>
        setPreviewComments((body.comments ?? []).slice(0, 2)),
      )
      .catch(() => {});
  }, [id]);

  // ── Record view (fire-and-forget) ────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/posts/${encodeURIComponent(id)}/view`, {
      method: "POST",
    }).catch(() => {});
  }, [id]);

  // ── Pause on blur / back navigation ─────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      return () => {
        setVideoPlaying(false);
        videoRef.current?.pauseAsync().catch(() => {});
        if (controlsHideTimer.current) {
          clearTimeout(controlsHideTimer.current);
          controlsHideTimer.current = null;
        }
      };
    }, []),
  );

  // ── Pause on app background — no audio after leaving ────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setVideoPlaying(false);
        videoRef.current?.pauseAsync().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // ── Video helpers ────────────────────────────────────────────────────────────
  const showControlsTemporarily = useCallback(() => {
    controlsOpacity.value = withTiming(1, { duration: 180 });
    if (controlsHideTimer.current) clearTimeout(controlsHideTimer.current);
    controlsHideTimer.current = setTimeout(() => {
      controlsHideTimer.current = null;
      controlsOpacity.value = withTiming(0, { duration: 600 });
    }, 3000);
  }, [controlsOpacity]);

  const handlePlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setVideoPosition(status.positionMillis ?? 0);
    setVideoDuration(status.durationMillis ?? 0);
    setVideoPlaying(status.isPlaying ?? false);
  }, []);

  const handleReadyForDisplay = useCallback(
    (e: any) => {
      const size = e?.naturalSize;
      if (size?.width && size?.height) {
        setVideoAspectRatio(size.width / size.height);
      }
      // Seek to the feed position once — only on the first ready event.
      if (initialPos > 0 && !seekedRef.current) {
        seekedRef.current = true;
        videoRef.current?.setPositionAsync(initialPos).catch(() => {});
      }
      showControlsTemporarily();
    },
    [initialPos, showControlsTemporarily],
  );

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (!videoDuration) return;
      const ms = Math.max(0, Math.min(1, ratio)) * videoDuration;
      videoRef.current?.setPositionAsync(ms).catch(() => {});
    },
    [videoDuration],
  );

  const handleSeekGesture = useCallback(
    (e: any) => {
      seekToRatio(e.nativeEvent.locationX / progressTrackW);
    },
    [progressTrackW, seekToRatio],
  );

  // ── Action handlers ──────────────────────────────────────────────────────────
  const handleLike = async () => {
    if (!session?.user?.id || !post) return;
    const nowLiked = !liked;
    setLiked(nowLiked);
    setLikesCount((n) => (nowLiked ? n + 1 : Math.max(0, n - 1)));
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
        setLiked(body.liked);
        setLikesCount(body.likesCount);
      }
    } catch {}
  };

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

  // ── Derived ──────────────────────────────────────────────────────────────────
  const videoSrc = post ? detectVideoUrl(post) : null;
  const pinnedH = Math.min(Math.round(W / videoAspectRatio), MAX_VIDEO_H);
  const progressRatio = videoDuration > 0 ? videoPosition / videoDuration : 0;
  const username = post?.profiles?.username ?? "";
  const avatarUrl = post?.profiles?.avatar_url ?? null;
  const caption = post?.caption ?? "";
  const captionNeedsExpand = caption.length > 140;
  const displayCaption =
    captionExpanded || !captionNeedsExpand
      ? caption
      : caption.slice(0, 140) + "…";
  const isOwnPost = !!(
    post &&
    session?.user?.id &&
    post.user_id === session.user.id
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[S.screen, { backgroundColor: colors.background }]}>
      {/* ── Pinned video at top — does NOT scroll ───────────────────────── */}
      <View style={[S.videoWrap, { height: pinnedH }]}>
        {videoSrc ? (
          <Video
            ref={videoRef}
            source={{ uri: videoSrc }}
            style={{ width: W, height: pinnedH }}
            resizeMode={ResizeMode.CONTAIN}
            isLooping
            shouldPlay={videoPlaying}
            isMuted={isMuted}
            onPlaybackStatusUpdate={handlePlaybackStatus}
            onReadyForDisplay={handleReadyForDisplay}
          />
        ) : (
          <View style={[S.videoWrap, { height: pinnedH, backgroundColor: "#111" }]} />
        )}

        {/* Back button — semi-transparent pill overlaid top-left */}
        <View
          style={[S.backOverlay, { top: insets.top + 8 }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={S.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Full-area tap-catcher — single tap toggles play/pause */}
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={() => {
            setVideoPlaying((p) => !p);
            showControlsTemporarily();
          }}
        />

        {/* Controls overlay — fades after 3 s of inactivity */}
        <Animated.View
          style={[StyleSheet.absoluteFill, S.controlsOverlay, videoControlsStyle]}
          pointerEvents="box-none"
        >
          {/* Top-right: mute toggle */}
          <View style={S.ctrlTop} pointerEvents="box-none">
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={S.muteBtn}
              onPress={() => {
                setIsMuted((m) => !m);
                showControlsTemporarily();
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={isMuted ? "volume-mute" : "volume-high"}
                size={18}
                color="#fff"
              />
            </TouchableOpacity>
          </View>

          {/* Bottom: gradient seek bar */}
          <View style={S.ctrlBottom} pointerEvents="box-none">
            <View
              style={S.progressTrack}
              onLayout={(e) =>
                setProgressTrackW(e.nativeEvent.layout.width)
              }
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                showControlsTemporarily();
                handleSeekGesture(e);
              }}
              onResponderMove={handleSeekGesture}
            >
              <LinearGradient
                colors={["#EA580C", "#7C3AED"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  S.progressFill,
                  { width: progressTrackW * progressRatio },
                ]}
              />
              <View
                style={[
                  S.progressThumb,
                  {
                    left: Math.max(
                      0,
                      progressTrackW * progressRatio - 7,
                    ),
                  },
                ]}
              />
            </View>
          </View>
        </Animated.View>
      </View>

      {/* ── Scrollable content below pinned player ─────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={S.scroll}
      >
        {/* Action bar — like · comment · save · share */}
        {/* TODO: extract shared PostActions component */}
        <View style={S.actionBar}>
          <TouchableOpacity
            onPress={handleLike}
            style={S.actionBtn}
            activeOpacity={0.7}
          >
            <Animated.View style={likeAnimStyle}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={28}
                color={liked ? "#EF4444" : colors.foreground}
              />
            </Animated.View>
            {(!hideLikeCount || isOwnPost) && (
              <Text style={[S.actionCount, { color: colors.foreground }]}>
                {formatCount(likesCount)}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              if (!allowComments && !isOwnPost) {
                Alert.alert(
                  "Comments turned off",
                  "The author has turned off commenting for this post.",
                );
                return;
              }
              setShowComments(true);
            }}
            style={S.actionBtn}
            activeOpacity={0.7}
          >
            <Ionicons
              name="chatbubble-outline"
              size={26}
              color={
                !allowComments && !isOwnPost
                  ? colors.mutedForeground
                  : colors.foreground
              }
            />
            <Text
              style={[
                S.actionCount,
                {
                  color:
                    !allowComments && !isOwnPost
                      ? colors.mutedForeground
                      : colors.foreground,
                },
              ]}
            >
              {formatCount(post?.comments_count ?? 0)}
            </Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            onPress={handleSave}
            style={S.actionBtn}
            activeOpacity={0.7}
          >
            <Ionicons
              name={saved ? "star" : "star-outline"}
              size={26}
              color={saved ? "#EAB308" : colors.foreground}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShare}
            style={S.actionBtn}
            activeOpacity={0.7}
          >
            <Ionicons
              name="paper-plane-outline"
              size={24}
              color={colors.foreground}
            />
          </TouchableOpacity>
        </View>

        {/* Author row + caption */}
        <View
          style={[
            S.metaSection,
            {
              borderTopColor: "rgba(255,255,255,0.07)",
              borderBottomColor: "rgba(255,255,255,0.07)",
            },
          ]}
        >
          <TouchableOpacity
            style={S.authorRow}
            onPress={() =>
              username && router.push(`/profile/${username}` as any)
            }
            activeOpacity={0.75}
          >
            <UserAvatar url={avatarUrl} size={40} />
            <View style={S.authorMeta}>
              <Text style={[S.authorName, { color: colors.foreground }]}>
                {username}
              </Text>
              <Text
                style={[S.authorTime, { color: colors.mutedForeground }]}
              >
                {post ? timeAgo(post.created_at) : ""}
              </Text>
            </View>
          </TouchableOpacity>

          {caption.length > 0 && (
            <View style={S.captionWrap}>
              <Text style={[S.caption, { color: colors.foreground }]}>
                {displayCaption}
              </Text>
              {captionNeedsExpand && (
                <TouchableOpacity
                  onPress={() => setCaptionExpanded((e) => !e)}
                >
                  <Text style={S.captionMore}>
                    {captionExpanded ? "less" : "more"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Top-2 comment preview */}
        {previewComments.length > 0 && (
          <View
            style={[
              S.commentsPreview,
              { borderBottomColor: "rgba(255,255,255,0.07)" },
            ]}
          >
            {previewComments.map((c: any) => (
              <View key={c.id ?? c.content} style={S.commentRow}>
                <Text
                  style={[S.commentUser, { color: colors.foreground }]}
                >
                  {c.profiles?.username ?? "user"}
                </Text>
                <Text
                  style={[
                    S.commentText,
                    { color: colors.mutedForeground },
                  ]}
                  numberOfLines={2}
                >
                  {c.content}
                </Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => setShowComments(true)}>
              <Text style={S.viewAll}>View all comments</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Feed continuation — "Up next" */}
        {feedSlice.length > 0 && (
          <View style={S.feedSection}>
            <Text
              style={[S.feedHeader, { color: colors.mutedForeground }]}
            >
              Up next
            </Text>
            {feedSlice.map((p) => (
              <FeedContinuationCard
                key={p.id}
                post={p}
                onPress={() => {
                  if (isVideoPost(p)) {
                    router.push(`/watch/${p.id}` as any);
                  } else {
                    router.push(`/post/${p.id}` as any);
                  }
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <CommentsSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        postId={id ?? ""}
        isLoggedIn={!!session}
        onRequireLogin={() => setShowComments(false)}
        contentType="post"
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screen: { flex: 1 },
  // ── Video ──
  videoWrap: { width: W, backgroundColor: "#000", overflow: "hidden" },
  backOverlay: { position: "absolute", left: 12, zIndex: 20, pointerEvents: "box-none" } as any,
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlsOverlay: { zIndex: 10 },
  ctrlTop: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  ctrlBottom: { position: "absolute", bottom: 10, left: 12, right: 12 },
  muteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "visible",
  },
  progressFill: { height: 4, borderRadius: 2 },
  progressThumb: {
    position: "absolute",
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#7C3AED",
  },
  // ── Scrollable content ──
  scroll: { paddingBottom: 40 },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 18,
    gap: 5,
  },
  actionCount: { fontSize: 14, fontFamily: "Poppins_500Medium" },
  metaSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  authorRow: { flexDirection: "row", alignItems: "center", paddingTop: 12 },
  authorMeta: { flex: 1, marginLeft: 10 },
  authorName: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  authorTime: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 2 },
  captionWrap: { marginTop: 10 },
  caption: { fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 20 },
  captionMore: {
    color: "#7C3AED",
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    marginTop: 4,
  },
  commentsPreview: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  commentRow: { gap: 2 },
  commentUser: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  commentText: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  viewAll: {
    color: "#7C3AED",
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    marginTop: 6,
  },
  feedSection: { paddingTop: 12 },
  feedHeader: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    paddingHorizontal: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  // ── YouTube-style large cards ──
  contCard: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  contThumbWrap: { position: "relative", borderRadius: 10, overflow: "hidden" },
  contThumb: {
    width: W - 32,
    height: THUMB_H,
    borderRadius: 10,
  },
  contThumbEmpty: {
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  durationPill: {
    position: "absolute",
    bottom: 7,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  durationTxt: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.3,
  },
  contMeta: { paddingTop: 8, gap: 3 },
  contCaption: { fontSize: 14, fontFamily: "Poppins_500Medium", lineHeight: 20 },
  contSub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
});
