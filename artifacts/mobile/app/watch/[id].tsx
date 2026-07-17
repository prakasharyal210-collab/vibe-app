import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Dimensions,
  GestureResponderEvent,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { Image } from "expo-image";
import Animated, {
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { CommentsSheet } from "@/components/CommentsSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Post, formatCount, timeAgo } from "@/lib/supabase";
import { feedPostCache } from "@/lib/db";
import { shareContent } from "@/lib/share";
import { cardUrl } from "@/lib/imageUrl";

const { width: W, height: SCREEN_H } = Dimensions.get("window");
const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
// Natural 16:9 floor — player is never shorter than this even for ultrawide videos.
const VIDEO_H_FLOOR = Math.round(W * 9 / 16);
// 55 % of screen height caps extreme portrait videos.
const MAX_VIDEO_H = Math.round(SCREEN_H * 0.55);

// ─── Module-scope helpers ─────────────────────────────────────────────────────

/** ms → "0:03" or "1:23" — matches the format used on post/[id].tsx */
function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

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

/** Seconds → "1:23" for the duration pill on Up next cards. */
function fmtDuration(seconds: number | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Module-scope sub-components ─────────────────────────────────────────────
// Defined at module scope to avoid the Ionicons empty-glyph remount bug
// (sub-components created inside a parent render fn get a new type reference on
// every render, which causes React to remount them and re-init Ionicons).

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

// ─── FullscreenVideoViewer ────────────────────────────────────────────────────
// Replicates the swipe-down-to-dismiss + position handoff pattern from post/[id].tsx.
// Two separate Video instances — expo-av cannot share a native player across trees.

function FullscreenVideoViewer({
  src,
  initialPosition,
  initialPlaying,
  isMuted,
  onMuteToggle,
  onClose,
}: {
  src: string;
  initialPosition: number;
  initialPlaying: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  onClose: (position: number, playing: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: FW, height: FH } = Dimensions.get("window");
  const fsRef = useRef<Video>(null);
  const [fsPlaying, setFsPlaying] = useState(initialPlaying);
  const [fsDuration, setFsDuration] = useState(0);
  const [fsPosition, setFsPosition] = useState(initialPosition);
  const [fsProgressW, setFsProgressW] = useState(0);
  const fsDurationRef = useRef(0);

  const positionSV = useSharedValue(initialPosition);
  const playingSV = useSharedValue(initialPlaying ? 1 : 0);

  const ty = useSharedValue(0);
  const bgOpacity = useSharedValue(1);
  const ctrlOpacity = useSharedValue(1);
  const fsLeftRippleOpacity = useSharedValue(0);
  const fsRightRippleOpacity = useSharedValue(0);
  const ctrlHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsLastTapLeft = useRef(0);
  const fsLastTapRight = useRef(0);
  const fsSingleTapLeft = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsSingleTapRight = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        fsRef.current?.pauseAsync().catch(() => {});
        setFsPlaying(false);
      }
    });
    return () => {
      sub.remove();
      if (ctrlHideTimer.current) clearTimeout(ctrlHideTimer.current);
    };
  }, []);

  const doClose = useCallback(() => {
    if (ctrlHideTimer.current) clearTimeout(ctrlHideTimer.current);
    onClose(positionSV.value, playingSV.value === 1);
  }, [onClose, positionSV, playingSV]);

  const showCtrlsTemporarily = useCallback(() => {
    ctrlOpacity.value = withTiming(1, { duration: 180 });
    if (ctrlHideTimer.current) clearTimeout(ctrlHideTimer.current);
    ctrlHideTimer.current = setTimeout(() => {
      ctrlHideTimer.current = null;
      ctrlOpacity.value = withTiming(0, { duration: 600 });
    }, 3000);
  }, [ctrlOpacity]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      ty.value = Math.max(0, e.translationY);
      bgOpacity.value = Math.max(0.15, 1 - e.translationY / 260);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 700) {
        runOnJS(doClose)();
      } else {
        ty.value = withSpring(0, { damping: 20 });
        bgOpacity.value = withSpring(1);
      }
    });

  const handleFsStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      const pos = status.positionMillis ?? 0;
      positionSV.value = pos;
      setFsPosition(pos);
      fsDurationRef.current = status.durationMillis ?? 0;
      setFsDuration(status.durationMillis ?? 0);
    },
    [positionSV],
  );

  const handleFsTap = useCallback(() => {
    setFsPlaying((p) => {
      const next = !p;
      playingSV.value = next ? 1 : 0;
      return next;
    });
    showCtrlsTemporarily();
  }, [showCtrlsTemporarily, playingSV]);

  const handleFsTapLeft = useCallback(() => {
    const now = Date.now();
    if (now - fsLastTapLeft.current < 300) {
      if (fsSingleTapLeft.current) { clearTimeout(fsSingleTapLeft.current); fsSingleTapLeft.current = null; }
      const ms = Math.max(0, Math.min(fsDurationRef.current, positionSV.value - 10_000));
      fsRef.current?.setPositionAsync(ms).catch(() => {});
      setFsPosition(ms);
      positionSV.value = ms;
      fsLeftRippleOpacity.value = withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 600 }),
      );
    } else {
      fsSingleTapLeft.current = setTimeout(() => { fsSingleTapLeft.current = null; handleFsTap(); }, 280);
    }
    fsLastTapLeft.current = now;
  }, [handleFsTap, positionSV, fsLeftRippleOpacity]);

  const handleFsTapRight = useCallback(() => {
    const now = Date.now();
    if (now - fsLastTapRight.current < 300) {
      if (fsSingleTapRight.current) { clearTimeout(fsSingleTapRight.current); fsSingleTapRight.current = null; }
      const ms = Math.max(0, Math.min(fsDurationRef.current, positionSV.value + 10_000));
      fsRef.current?.setPositionAsync(ms).catch(() => {});
      setFsPosition(ms);
      positionSV.value = ms;
      fsRightRippleOpacity.value = withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 600 }),
      );
    } else {
      fsSingleTapRight.current = setTimeout(() => { fsSingleTapRight.current = null; handleFsTap(); }, 280);
    }
    fsLastTapRight.current = now;
  }, [handleFsTap, positionSV, fsRightRippleOpacity]);

  const fsSeekToRatio = useCallback(
    (ratio: number) => {
      const ms = Math.max(0, Math.min(1, ratio)) * fsDurationRef.current;
      fsRef.current?.setPositionAsync(ms).catch(() => {});
      setFsPosition(ms);
      positionSV.value = ms;
    },
    [positionSV],
  );

  const handleFsSeek = useCallback(
    (e: GestureResponderEvent) => {
      if (!fsProgressW) return;
      fsSeekToRatio(e.nativeEvent.locationX / fsProgressW);
    },
    [fsProgressW, fsSeekToRatio],
  );

  const containerStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
    transform: [{ translateY: ty.value }],
  }));
  const ctrlsStyle = useAnimatedStyle(() => ({ opacity: ctrlOpacity.value }));
  const fsLeftRippleStyle = useAnimatedStyle(() => ({ opacity: fsLeftRippleOpacity.value }));
  const fsRightRippleStyle = useAnimatedStyle(() => ({ opacity: fsRightRippleOpacity.value }));
  const fsProgressRatio = fsDuration > 0 ? fsPosition / fsDuration : 0;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={doClose}
      statusBarTranslucent
    >
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[{ flex: 1 }, containerStyle]}>
            <Video
              ref={fsRef}
              source={{ uri: src }}
              style={{ flex: 1 }}
              resizeMode={ResizeMode.CONTAIN}
              isLooping
              shouldPlay={fsPlaying}
              isMuted={isMuted}
              positionMillis={initialPosition}
              onPlaybackStatusUpdate={handleFsStatus}
            />

            {/* Split tap zones: single tap → toggle play; double-tap → seek ±10s */}
            <View style={[StyleSheet.absoluteFill, { flexDirection: "row" }]} pointerEvents="box-none">
              <TouchableOpacity activeOpacity={1} style={{ flex: 1 }} onPress={handleFsTapLeft} />
              <TouchableOpacity activeOpacity={1} style={{ flex: 1 }} onPress={handleFsTapRight} />
            </View>

            {/* Seek ripples */}
            <Animated.View style={[S.rippleLeft, fsLeftRippleStyle]} pointerEvents="none">
              <Ionicons name="play-back" size={20} color="#fff" />
              <Text style={S.rippleTxt}>-10s</Text>
            </Animated.View>
            <Animated.View style={[S.rippleRight, fsRightRippleStyle]} pointerEvents="none">
              <Ionicons name="play-forward" size={20} color="#fff" />
              <Text style={S.rippleTxt}>+10s</Text>
            </Animated.View>

            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { justifyContent: "space-between", zIndex: 10 },
                ctrlsStyle,
              ]}
              pointerEvents="box-none"
            >
              {/* Top: mute (left) + collapse (right) */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  padding: 12,
                  paddingTop: insets.top + 12,
                }}
                pointerEvents="box-none"
              >
                <TouchableOpacity
                  style={V.muteBtn}
                  onPress={() => {
                    onMuteToggle();
                    showCtrlsTemporarily();
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons
                    name={isMuted ? "volume-mute" : "volume-high"}
                    size={18}
                    color="#fff"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={V.muteBtn}
                  onPress={doClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="contract" size={18} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Center: play/pause indicator */}
              <View style={V.centerRow} pointerEvents="none">
                <View style={V.playPauseCircle}>
                  <Ionicons
                    name={fsPlaying ? "pause" : "play"}
                    size={34}
                    color="#fff"
                    style={fsPlaying ? {} : { marginLeft: 4 }}
                  />
                </View>
              </View>

              {/* Bottom: time + seek bar */}
              <View
                style={{
                  paddingHorizontal: 14,
                  paddingBottom: Math.max(insets.bottom, 16) + 8,
                  gap: 8,
                }}
                pointerEvents="box-none"
              >
                <Text style={V.timeText}>
                  {formatTime(fsPosition)} / {formatTime(fsDuration)}
                </Text>
                <View
                  style={V.progressTrack}
                  onLayout={(e) =>
                    setFsProgressW(e.nativeEvent.layout.width)
                  }
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={(e) => {
                    showCtrlsTemporarily();
                    handleFsSeek(e);
                  }}
                  onResponderMove={handleFsSeek}
                >
                  <LinearGradient
                    colors={["#EA580C", "#7C3AED"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[
                      V.progressFill,
                      { width: fsProgressW * fsProgressRatio },
                    ]}
                  />
                  <View
                    style={[
                      V.progressThumb,
                      {
                        left: Math.max(
                          0,
                          fsProgressW * fsProgressRatio - 7,
                        ),
                      },
                    ]}
                  />
                </View>
              </View>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

// ─── Large YouTube-style card for "Up next" feed continuation ─────────────────

const THUMB_H = Math.round((W - 32) * 9 / 16);

function FeedContinuationCard({
  post,
  onPress,
}: {
  post: Post;
  onPress: () => void;
}) {
  const colors = useColors();
  // Only use image URLs as thumbnails — video URLs (.mp4 etc.) would render blank.
  const isVidUrl = (u?: string | null) => !!u?.match(/\.(mp4|mov|webm|m4v)(\?|$)/i);
  const rawThumb =
    post.thumbnail_url ||
    (!isVidUrl(post.image_url) ? post.image_url : null) ||
    undefined;
  const thumbUri = rawThumb ? (cardUrl(rawThumb) ?? rawThumb) : undefined;
  const username = post.profiles?.username ?? "user";
  const duration = fmtDuration((post as any).duration);

  return (
    <TouchableOpacity
      style={S.contCard}
      onPress={onPress}
      activeOpacity={0.85}
    >
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
            <Ionicons
              name="play-circle-outline"
              size={40}
              color="rgba(255,255,255,0.2)"
            />
          </View>
        )}
        {duration && (
          <View style={S.durationPill}>
            <Text style={S.durationTxt}>{duration}</Text>
          </View>
        )}
      </View>
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

// ─── Autoplay / replay overlay (module-scope → stable identity, no remounts) ──

function AutoplayOverlay({
  ended,
  countdown,
  nextPost,
  onCancel,
  onReplay,
}: {
  ended: boolean;
  countdown: number | null;
  nextPost: Post | null;
  onCancel: () => void;
  onReplay: () => void;
}) {
  if (!ended) return null;
  const isVidUrl = (u?: string | null) => !!u?.match(/\.(mp4|mov|webm|m4v)(\?|$)/i);
  const rawThumb = nextPost
    ? nextPost.thumbnail_url ||
      (!isVidUrl(nextPost.image_url) ? nextPost.image_url : null) ||
      undefined
    : undefined;
  const thumbUri = rawThumb ? (cardUrl(rawThumb) ?? rawThumb) : undefined;

  if (countdown !== null && nextPost) {
    return (
      <View
        style={[StyleSheet.absoluteFill, S.apOverlay]}
        pointerEvents="box-none"
      >
        <View style={S.apCard} pointerEvents="auto">
          <Text style={S.apLabel}>UP NEXT IN {countdown}…</Text>
          <View style={S.apRow}>
            {thumbUri ? (
              <Image
                source={{ uri: thumbUri }}
                style={S.apThumb}
                contentFit="cover"
              />
            ) : (
              <View style={[S.apThumb, S.apThumbEmpty]}>
                <Ionicons
                  name="play-circle-outline"
                  size={20}
                  color="rgba(255,255,255,0.4)"
                />
              </View>
            )}
            <Text style={S.apTitle} numberOfLines={2}>
              {nextPost.caption || "#video"}
            </Text>
          </View>
          <TouchableOpacity
            style={S.apCancelBtn}
            onPress={onCancel}
            activeOpacity={0.75}
          >
            <Text style={S.apCancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Countdown done / cancelled / no next video → replay button
  return (
    <View style={[StyleSheet.absoluteFill, S.apOverlay]} pointerEvents="auto">
      <TouchableOpacity
        style={S.apReplayBtn}
        onPress={onReplay}
        activeOpacity={0.8}
      >
        <Ionicons name="refresh-circle" size={72} color="rgba(255,255,255,0.9)" />
        <Text style={S.apReplayTxt}>Replay</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WatchScreen() {
  const { id, pos, ar } = useLocalSearchParams<{ id: string; pos?: string; ar?: string }>();
  const initialPos = parseInt(pos ?? "0", 10) || 0;
  // ar is the aspect ratio (width/height) forwarded by PostCard so the initial
  // player height is correct on the very first frame — no resize jump.
  const initialArParam = parseFloat(ar ?? "0");
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  // Seed instantly from feed cache — no loading state needed if we have the post.
  const [post, setPost] = useState<Post | null>(
    () => feedPostCache.get(id ?? "") ?? null,
  );
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [likesCount, setLikesCount] = useState(
    () => feedPostCache.get(id ?? "")?.likes_count ?? 0,
  );
  const [showComments, setShowComments] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [previewComments, setPreviewComments] = useState<any[]>([]);
  const [allowComments, setAllowComments] = useState(true);
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [authorStats, setAuthorStats] = useState<{
    followers_count: number;
    posts_count: number;
  } | null>(null);
  const [showVideoFullscreen, setShowVideoFullscreen] = useState(false);

  // ── Autoplay state ────────────────────────────────────────────────────────────
  const [videoEnded, setVideoEnded] = useState(false);
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(null);
  const [showReplayBtn, setShowReplayBtn] = useState(false);
  const autoplayCancelledRef = useRef(false);
  const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current snapshot of feedSlice so effects don't need it as a dep.
  const feedSliceRef = useRef<Post[]>([]);

  // Feed continuation — video posts only, current post excluded.
  const [feedSlice, setFeedSlice] = useState<Post[]>(() =>
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
  // Priority: stored DB dimensions → ar route param → 16:9 default.
  // Using the feed-cache post's image_width/image_height (set at upload time)
  // means the player height is correct from the very first frame with no jump.
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(() => {
    const cached = feedPostCache.get(id ?? "");
    if (cached?.image_width && cached?.image_height && cached.image_width > 0 && cached.image_height > 0) {
      return cached.image_width / cached.image_height;
    }
    if (initialArParam > 0 && isFinite(initialArParam)) return initialArParam;
    return 16 / 9;
  });
  const seekedRef = useRef(false);
  const controlsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Double-tap seek detection — one set of refs per half (mirrors PostCard pattern).
  const lastTapLeft = useRef(0);
  const lastTapRight = useRef(0);
  const singleTapLeft = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapRight = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Animations ───────────────────────────────────────────────────────────────
  const likeScale = useSharedValue(1);
  const controlsOpacity = useSharedValue(1);
  const leftRippleOpacity = useSharedValue(0);
  const rightRippleOpacity = useSharedValue(0);
  const likeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));
  const videoControlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));
  const leftRippleStyle = useAnimatedStyle(() => ({
    opacity: leftRippleOpacity.value,
  }));
  const rightRippleStyle = useAnimatedStyle(() => ({
    opacity: rightRippleOpacity.value,
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

  // ── Fetch author stats once post loads ────────────────────────────────────────
  useEffect(() => {
    if (!post?.user_id) return;
    fetch(`${API_BASE}/users/stats?userId=${post.user_id}`)
      .then((r) => r.json())
      .then((body) =>
        setAuthorStats({
          followers_count: body.followers_count ?? 0,
          posts_count: body.posts_count ?? 0,
        }),
      )
      .catch(() => {});
  }, [post?.user_id]);

  // ── Fetch actual follow status from server ────────────────────────────────────
  useEffect(() => {
    const uid = session?.user?.id;
    const authorId = post?.user_id;
    if (!uid || !authorId || uid === authorId) return;
    fetch(`${API_BASE}/users/social/follow-status?followerId=${uid}&followingId=${authorId}`)
      .then((r) => r.json())
      .then((body) => { if (typeof body.following === "boolean") setFollowing(body.following); })
      .catch(() => {});
  }, [session?.user?.id, post?.user_id]);

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

  // ── Fetch more "Up next" videos when feed cache is thin ───────────────────────
  useEffect(() => {
    if (feedSlice.length >= 5) return; // enough from cache
    const uid = session?.user?.id ?? "";
    fetch(`${API_BASE}/feed/foryou?limit=30${uid ? `&userId=${uid}` : ""}`)
      .then((r) => r.json())
      .then((body) => {
        const raw = (body.posts ?? body.data ?? []) as Post[];
        const videos = raw.filter((p) => p.id !== id && isVideoPost(p)).slice(0, 20);
        if (videos.length === 0) return;
        setFeedSlice((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...videos.filter((p) => !seen.has(p.id))];
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keep feedSliceRef current so autoplay effect doesn't need it as a dep ───
  useEffect(() => { feedSliceRef.current = feedSlice; }, [feedSlice]);

  // ── Reset autoplay state when the watched video changes (id switch) ──────────
  useEffect(() => {
    setVideoEnded(false);
    setShowReplayBtn(false);
    setAutoplayCountdown(null);
    autoplayCancelledRef.current = false;
    if (autoplayTimerRef.current) {
      clearTimeout(autoplayTimerRef.current);
      autoplayTimerRef.current = null;
    }
  }, [id]);

  // ── Autoplay countdown — fires once when videoEnded becomes true ─────────────
  useEffect(() => {
    if (!videoEnded) return;
    const next = feedSliceRef.current[0] ?? null;
    if (!next) {
      setShowReplayBtn(true);
      return;
    }
    autoplayCancelledRef.current = false;
    let remaining = 3;
    setAutoplayCountdown(remaining);

    const tick = () => {
      if (autoplayCancelledRef.current) return;
      remaining -= 1;
      if (remaining <= 0) {
        setAutoplayCountdown(null);
        const ar =
          next.image_width && next.image_height
            ? (next.image_width / next.image_height).toFixed(4)
            : (16 / 9).toFixed(4);
        router.replace(`/watch/${next.id}?ar=${ar}` as any);
        return;
      }
      setAutoplayCountdown(remaining);
      autoplayTimerRef.current = setTimeout(tick, 1000);
    };
    autoplayTimerRef.current = setTimeout(tick, 1000);

    return () => {
      if (autoplayTimerRef.current) {
        clearTimeout(autoplayTimerRef.current);
        autoplayTimerRef.current = null;
      }
    };
  // videoEnded is the only trigger; feedSliceRef is a stable ref, not a dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEnded]);

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
        // Cancel autoplay countdown when the user navigates away
        autoplayCancelledRef.current = true;
        if (autoplayTimerRef.current) {
          clearTimeout(autoplayTimerRef.current);
          autoplayTimerRef.current = null;
        }
      };
    }, []),
  );

  // ── Pause on app background ──────────────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setVideoPlaying(false);
        videoRef.current?.pauseAsync().catch(() => {});
        // Cancel autoplay when app is backgrounded
        autoplayCancelledRef.current = true;
        if (autoplayTimerRef.current) {
          clearTimeout(autoplayTimerRef.current);
          autoplayTimerRef.current = null;
        }
        setAutoplayCountdown(null);
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
    if (status.didJustFinish) {
      setVideoEnded(true);
    }
  }, []);

  const handleReadyForDisplay = useCallback(
    (e: any) => {
      const size = e?.naturalSize;
      if (size?.width && size?.height) {
        setVideoAspectRatio(size.width / size.height);
      }
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
    (e: GestureResponderEvent) => {
      seekToRatio(e.nativeEvent.locationX / progressTrackW);
    },
    [progressTrackW, seekToRatio],
  );

  const handleSkip = useCallback(
    (deltaMs: number) => {
      if (!videoDuration) return;
      const next = Math.max(0, Math.min(videoDuration, videoPosition + deltaMs));
      videoRef.current?.setPositionAsync(next).catch(() => {});
      showControlsTemporarily();
    },
    [videoDuration, videoPosition, showControlsTemporarily],
  );

  const handleOpenFullscreen = useCallback(() => {
    videoRef.current?.pauseAsync().catch(() => {});
    setVideoPlaying(false);
    setShowVideoFullscreen(true);
  }, []);

  const handleCloseFullscreen = useCallback(
    (position: number, playing: boolean) => {
      setShowVideoFullscreen(false);
      videoRef.current?.setPositionAsync(position).catch(() => {});
      setVideoPosition(position);
      setVideoPlaying(playing);
    },
    [],
  );

  // ── Double-tap seek handlers (PostCard 300ms / 280ms pattern) ────────────────
  const handleTapLeft = useCallback(() => {
    const now = Date.now();
    if (now - lastTapLeft.current < 300) {
      // Double-tap detected — cancel pending single-tap, seek back 10s
      if (singleTapLeft.current) {
        clearTimeout(singleTapLeft.current);
        singleTapLeft.current = null;
      }
      handleSkip(-10_000);
      leftRippleOpacity.value = withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 600 }),
      );
    } else {
      // First tap — wait 280ms to confirm it's not a double-tap
      singleTapLeft.current = setTimeout(() => {
        singleTapLeft.current = null;
        showControlsTemporarily();
      }, 280);
    }
    lastTapLeft.current = now;
  }, [handleSkip, showControlsTemporarily, leftRippleOpacity]);

  const handleTapRight = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRight.current < 300) {
      if (singleTapRight.current) {
        clearTimeout(singleTapRight.current);
        singleTapRight.current = null;
      }
      handleSkip(10_000);
      rightRippleOpacity.value = withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 600 }),
      );
    } else {
      singleTapRight.current = setTimeout(() => {
        singleTapRight.current = null;
        showControlsTemporarily();
      }, 280);
    }
    lastTapRight.current = now;
  }, [handleSkip, showControlsTemporarily, rightRippleOpacity]);

  // ── Autoplay action handlers ──────────────────────────────────────────────────
  const cancelAutoplay = useCallback(() => {
    autoplayCancelledRef.current = true;
    if (autoplayTimerRef.current) {
      clearTimeout(autoplayTimerRef.current);
      autoplayTimerRef.current = null;
    }
    setAutoplayCountdown(null);
    setShowReplayBtn(true);
  }, []);

  const handleReplay = useCallback(() => {
    setVideoEnded(false);
    setShowReplayBtn(false);
    setAutoplayCountdown(null);
    autoplayCancelledRef.current = false;
    videoRef.current
      ?.setPositionAsync(0)
      .then(() => videoRef.current?.playAsync())
      .catch(() => {});
    setVideoPlaying(true);
  }, []);

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
  // Natural height clamped between the 16:9 floor and the portrait cap.
  const pinnedH = Math.max(VIDEO_H_FLOOR, Math.min(Math.round(W / videoAspectRatio), MAX_VIDEO_H));
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
            isLooping={false}
            shouldPlay={videoPlaying}
            isMuted={isMuted}
            onPlaybackStatusUpdate={handlePlaybackStatus}
            onReadyForDisplay={handleReadyForDisplay}
          />
        ) : (
          <View style={[S.videoWrap, { height: pinnedH, backgroundColor: "#111" }]} />
        )}

        {/* Back button — overlaid top-left */}
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

        {/* Split tap zones: single tap → show controls; double-tap → seek ±10s */}
        <View
          style={[StyleSheet.absoluteFill, { flexDirection: "row" }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{ flex: 1 }}
            onPress={handleTapLeft}
          />
          <TouchableOpacity
            activeOpacity={1}
            style={{ flex: 1 }}
            onPress={handleTapRight}
          />
        </View>

        {/* Autoplay countdown / replay overlay — sits above video, below tap zones */}
        <AutoplayOverlay
          ended={videoEnded}
          countdown={autoplayCountdown}
          nextPost={showReplayBtn ? null : feedSlice[0] ?? null}
          onCancel={cancelAutoplay}
          onReplay={handleReplay}
        />

        {/* Left ripple — "-10s" flash on double-tap */}
        <Animated.View style={[S.rippleLeft, leftRippleStyle]} pointerEvents="none">
          <Ionicons name="play-back" size={20} color="#fff" />
          <Text style={S.rippleTxt}>-10s</Text>
        </Animated.View>

        {/* Right ripple — "+10s" flash on double-tap */}
        <Animated.View style={[S.rippleRight, rightRippleStyle]} pointerEvents="none">
          <Ionicons name="play-forward" size={20} color="#fff" />
          <Text style={S.rippleTxt}>+10s</Text>
        </Animated.View>

        {/* ── Controls overlay — fades after 3 s ──────────────────────── */}
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

          {/* Center: play/pause only — skip is handled by double-tap zones */}
          <View style={V.centerRow} pointerEvents="box-none">
            <TouchableOpacity
              style={V.playPauseCircle}
              onPress={() => {
                setVideoPlaying((p) => !p);
                showControlsTemporarily();
              }}
            >
              <Ionicons
                name={videoPlaying ? "pause" : "play"}
                size={34}
                color="#fff"
                style={videoPlaying ? {} : { marginLeft: 4 }}
              />
            </TouchableOpacity>
          </View>

          {/* Bottom: time (left) · seek bar · fullscreen (right) */}
          <View style={S.ctrlBottom} pointerEvents="box-none">
            {/* Time row */}
            <View style={V.timeRow} pointerEvents="box-none">
              <Text style={V.timeText}>
                {formatTime(videoPosition)} / {formatTime(videoDuration)}
              </Text>
              <View style={{ flex: 1 }} />
              {videoSrc && (
                <TouchableOpacity
                  style={S.muteBtn}
                  onPress={() => {
                    showControlsTemporarily();
                    handleOpenFullscreen();
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="expand" size={17} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
            {/* Seek bar */}
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
                    left: Math.max(0, progressTrackW * progressRatio - 7),
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

        {/* ── Author row — matches post/[id].tsx parity ──────────────── */}
        <View
          style={[
            S.metaSection,
            {
              borderTopColor: "rgba(255,255,255,0.07)",
              borderBottomColor: "rgba(255,255,255,0.07)",
            },
          ]}
        >
          <View style={S.authorRow}>
            {/* Avatar + name + stats — tappable → profile */}
            <TouchableOpacity
              style={S.authorLeft}
              onPress={() =>
                username && router.push(`/profile/${username}` as any)
              }
              activeOpacity={0.75}
            >
              <GradientRingAvatar username={username} url={avatarUrl} size={44} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[S.authorName, { color: colors.foreground }]}>
                  {username}
                </Text>
                {authorStats ? (
                  <Text style={[S.authorSub, { color: colors.mutedForeground }]}>
                    {formatCount(authorStats.followers_count)} Followers ·{" "}
                    {formatCount(authorStats.posts_count)} Posts
                  </Text>
                ) : (
                  <Text style={[S.authorSub, { color: colors.mutedForeground }]}>
                    {post ? timeAgo(post.created_at) : ""}
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Follow / Following button — hidden for own posts */}
            {!isOwnPost && (
              <TouchableOpacity
                onPress={async () => {
                  if (!session?.user?.id || !post?.user_id) return;
                  const next = !following;
                  setFollowing(next);
                  try {
                    await fetch(`${API_BASE}/users/social/toggle-follow`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ followerId: session.user.id, followingId: post.user_id }),
                    });
                  } catch {}
                }}
                activeOpacity={0.8}
              >
                {following ? (
                  <View
                    style={[
                      S.followingBtn,
                      { borderColor: "rgba(255,255,255,0.22)" },
                    ]}
                  >
                    <Text style={[S.followBtnTxt, { color: colors.foreground }]}>
                      Following
                    </Text>
                  </View>
                ) : (
                  <LinearGradient
                    colors={["#EA580C", "#7C3AED"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={S.followGrad}
                  >
                    <Text style={[S.followBtnTxt, { color: "#fff" }]}>
                      Follow
                    </Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>
            )}
          </View>

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
                  router.push(`/watch/${p.id}` as any);
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

      {videoSrc && showVideoFullscreen && (
        <FullscreenVideoViewer
          src={videoSrc}
          initialPosition={videoPosition}
          initialPlaying={videoPlaying}
          isMuted={isMuted}
          onMuteToggle={() => setIsMuted((m) => !m)}
          onClose={handleCloseFullscreen}
        />
      )}
    </View>
  );
}

// ─── Video control styles (shared by inline player + FullscreenVideoViewer) ───

const V = StyleSheet.create({
  centerRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },
  skipBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 24,
  },
  skipLabel: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Poppins_600SemiBold",
    marginTop: -2,
  },
  playPauseCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  timeText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
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
});

// ─── Screen styles ────────────────────────────────────────────────────────────

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
  muteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlBottom: { position: "absolute", bottom: 10, left: 12, right: 12 },
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
  // ── Seek ripples ──
  rippleLeft: {
    position: "absolute",
    left: "8%",
    top: "30%",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 40,
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 2,
  },
  rippleRight: {
    position: "absolute",
    right: "8%",
    top: "30%",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 40,
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 2,
  },
  rippleTxt: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.3,
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
  // ── Author row ──
  metaSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    gap: 8,
  },
  authorLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  authorName: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  authorSub: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 2 },
  followGrad: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  followingBtn: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  followBtnTxt: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
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
  // ── Autoplay / replay overlay ──
  apOverlay: {
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  apCard: {
    backgroundColor: "rgba(18,18,18,0.94)",
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 24,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    width: W - 48,
  },
  apLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  apRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  apThumb: {
    width: 90,
    height: 60,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  apThumbEmpty: { alignItems: "center", justifyContent: "center" },
  apTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    lineHeight: 18,
  },
  apCancelBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  apCancelTxt: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  apReplayBtn: { alignItems: "center", gap: 8 },
  apReplayTxt: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
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
