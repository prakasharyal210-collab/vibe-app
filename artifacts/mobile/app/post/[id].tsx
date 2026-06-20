import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  DeviceEventEmitter,
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
import Animated, {
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
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
const IMG_MARGIN = 16;
const IMG_W = W - IMG_MARGIN * 2;
const GRID_GAP = 4;
const THUMB_W = (W - IMG_MARGIN * 2 - GRID_GAP * 2) / 3;

// ─── Module-scope helpers ─────────────────────────────────────────────────────

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ─── Module-scope sub-components ─────────────────────────────────────────────
// All defined at module scope to avoid the Ionicons empty-box remount bug.

function GradientRingAvatar({
  username,
  url,
  size = 52,
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

function StatCell({
  label,
  value,
  mutedColor,
  boldColor,
}: {
  label: string;
  value: string;
  mutedColor: string;
  boldColor: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 4 }}>
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Poppins_400Regular",
          letterSpacing: 0.4,
          color: mutedColor,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 22, fontFamily: "Poppins_700Bold", color: boldColor }}>
        {value}
      </Text>
    </View>
  );
}

function StatDivider() {
  return (
    <View
      style={{
        width: StyleSheet.hairlineWidth,
        backgroundColor: "rgba(255,255,255,0.13)",
        alignSelf: "stretch",
        marginVertical: 4,
      }}
    />
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
    <View style={{ paddingVertical: 4 }}>
      <Text
        style={{
          fontSize: 13,
          fontFamily: "Poppins_400Regular",
          lineHeight: 19,
          color: textColor,
        }}
        numberOfLines={2}
      >
        <Text style={{ fontFamily: "Poppins_700Bold" }}>{username} </Text>
        {text}
      </Text>
    </View>
  );
}

// ─── FullscreenVideoViewer ────────────────────────────────────────────────────
// Replicates the swipe-down-to-dismiss gesture from FullscreenImageViewer.
// Two separate Video instances (inline + fullscreen) with position handoff on
// open/close — expo-av cannot share a single native player across two trees.
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

  // Shared values accessible from the Pan worklet for position handoff on dismiss
  const positionSV = useSharedValue(initialPosition);
  const playingSV = useSharedValue(initialPlaying ? 1 : 0);

  // Swipe-down dismiss animation
  const ty = useSharedValue(0);
  const bgOpacity = useSharedValue(1);
  const ctrlOpacity = useSharedValue(1);
  const ctrlHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pause when app goes to background while fullscreen is open
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

  const handleFsStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const pos = status.positionMillis ?? 0;
    positionSV.value = pos;
    // NOTE: intentionally NOT calling setFsPlaying(status.isPlaying) here.
    // expo-av fires isPlaying=false during the initial buffer/seek phase,
    // which would set shouldPlay=false and permanently freeze playback.
    // fsPlaying is controlled solely by the tap handler + initialPlaying.
    setFsPosition(pos);
    fsDurationRef.current = status.durationMillis ?? 0;
    setFsDuration(status.durationMillis ?? 0);
  }, [positionSV]);

  const handleFsTap = useCallback(() => {
    setFsPlaying((p) => {
      const next = !p;
      playingSV.value = next ? 1 : 0; // keep shared value in sync for close handoff
      return next;
    });
    showCtrlsTemporarily();
  }, [showCtrlsTemporarily, playingSV]);

  const seekToRatio = useCallback((ratio: number) => {
    const ms = Math.max(0, Math.min(1, ratio)) * fsDurationRef.current;
    fsRef.current?.setPositionAsync(ms).catch(() => {});
    setFsPosition(ms);
    positionSV.value = ms;
  }, [positionSV]);

  const handleFsSeek = useCallback((e: GestureResponderEvent) => {
    if (!fsProgressW) return;
    seekToRatio(e.nativeEvent.locationX / fsProgressW);
  }, [fsProgressW, seekToRatio]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
    transform: [{ translateY: ty.value }],
  }));
  const ctrlsStyle = useAnimatedStyle(() => ({ opacity: ctrlOpacity.value }));

  const fsProgressRatio = fsDuration > 0 ? fsPosition / fsDuration : 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={doClose} statusBarTranslucent>
      <StatusBar hidden />
      {/* flex:1 wrapper — GestureDetector has no intrinsic size; without this the
          Animated.View collapses to 0 height and the Video renders at inline size.
          Same fix as FullScreenMediaViewer. */}
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[{ flex: 1 }, containerStyle]}>

            {/* Video — flex:1 fills the container; rendered first (lowest z) so the
                native surface stays below the React-Native controls overlay.
                On Android, expo-av's SurfaceView punches through absoluteFill siblings
                if the Video is higher in the z-stack, showing icons as tofu. */}
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

            {/* Transparent tap catcher — absoluteFill above Video, below controls */}
            <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={handleFsTap} />

          {/* Controls overlay — fades in/out on tap; zIndex:10 ensures it renders
              above the native Video surface on Android */}
          <Animated.View
            style={[StyleSheet.absoluteFill, { justifyContent: "space-between", zIndex: 10 }, ctrlsStyle]}
            pointerEvents="box-none"
          >
            {/* Top: mute (left) + collapse/close (right) */}
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
                onPress={() => { onMuteToggle(); showCtrlsTemporarily(); }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={V.muteBtn}
                onPress={doClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="contract" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Center: play/pause indicator — pointerEvents none so taps fall to TouchableOpacity */}
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

            {/* Bottom: time label + gradient seek bar */}
            <View
              style={{ paddingHorizontal: 14, paddingBottom: Math.max(insets.bottom, 16) + 8, gap: 8 }}
              pointerEvents="box-none"
            >
              <Text style={V.timeText}>{formatTime(fsPosition)} / {formatTime(fsDuration)}</Text>
              <View
                style={V.progressTrack}
                onLayout={(e) => setFsProgressW(e.nativeEvent.layout.width)}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => { showCtrlsTemporarily(); handleFsSeek(e); }}
                onResponderMove={handleFsSeek}
              >
                <LinearGradient
                  colors={["#EA580C", "#7C3AED"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[V.progressFill, { width: fsProgressW * fsProgressRatio }]}
                />
                <View
                  style={[V.progressThumb, { left: Math.max(0, fsProgressW * fsProgressRatio - 7) }]}
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
  const [mediaAspectRatio, setMediaAspectRatio] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const [authorStats, setAuthorStats] = useState<{
    followers_count: number;
    posts_count: number;
  } | null>(null);

  // ── Video player state ───────────────────────────────────────────────────────
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoPosition, setVideoPosition] = useState(0);
  const [progressTrackW, setProgressTrackW] = useState(0);
  const [showVideoFullscreen, setShowVideoFullscreen] = useState(false);
  const videoRef = useRef<Video>(null);
  const controlsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reanimated — like heart pop + double-tap burst + video controls fade
  const likeScale = useSharedValue(1);
  const heartBurstOpacity = useSharedValue(0);
  const heartBurstScale = useSharedValue(0);
  const controlsOpacity = useSharedValue(1);

  const likeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));
  const heartBurstStyle = useAnimatedStyle(() => ({
    opacity: heartBurstOpacity.value,
    transform: [{ scale: heartBurstScale.value }],
  }));
  const videoControlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Record view once per post open (fire-and-forget, no deduplication needed) ─
  const viewRecordedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!id || viewRecordedRef.current === id) return;
    viewRecordedRef.current = id;
    fetch(`${API_BASE}/posts/${encodeURIComponent(id)}/view`, { method: "POST" }).catch(() => {});
  }, [id]);

  // ── Fetch post ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
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
        }
      } catch {}
      finally { setLoading(false); }
    })();
  }, [id]);

  // ── Fetch like/save status ──────────────────────────────────────────────────
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

  // ── Fetch author stats once post loads ─────────────────────────────────────
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

  // ── Fetch "More from this user" ─────────────────────────────────────────────
  useEffect(() => {
    if (!post?.user_id || !id) return;
    setMoreLoading(true);
    fetch(
      `${API_BASE}/posts/user/${encodeURIComponent(post.user_id)}/more?excludeId=${encodeURIComponent(id)}&limit=9`,
    )
      .then((r) => r.json())
      .then((body) => setMorePosts(body.posts ?? []))
      .catch(() => {})
      .finally(() => setMoreLoading(false));
  }, [post?.user_id, id]);

  // ── Fetch top 2 preview comments ───────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/comments?postId=${id}`)
      .then((r) => r.json())
      .then((body) => setPreviewComments((body.comments ?? []).slice(0, 2)))
      .catch(() => {});
  }, [id]);

  // ── Reset aspect ratio + video state when navigating to a different post ────
  useEffect(() => {
    setMediaAspectRatio(1);
    setVideoPlaying(false);
    setVideoPosition(0);
    setVideoDuration(0);
  }, [id]);

  // ── Video: auto-play once the post loads and is confirmed as a video ─────────
  useEffect(() => {
    const isVid = !!(
      (post as any)?.is_video ||
      (post as any)?.video_url ||
      ((post as any)?.media_url || (post as any)?.image_url || "").match(/\.(mp4|mov|webm|m4v)(\?|$)/i)
    );
    if (isVid) {
      setVideoPlaying(true);
      controlsOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [post]);

  // ── Pause video when navigating away, clean up controls timer ───────────────
  useFocusEffect(useCallback(() => {
    return () => {
      setVideoPlaying(false);
      videoRef.current?.pauseAsync().catch(() => {});
      if (controlsHideTimer.current) {
        clearTimeout(controlsHideTimer.current);
        controlsHideTimer.current = null;
      }
    };
  }, []));

  // ── Like handler ────────────────────────────────────────────────────────────
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

  // ── Double-tap: burst heart + like ─────────────────────────────────────────
  const handleDoubleTap = () => {
    if (!liked) handleLike();
    heartBurstOpacity.value = 0;
    heartBurstScale.value = 0.3;
    heartBurstOpacity.value = withTiming(1, { duration: 80 });
    heartBurstScale.value = withSpring(1, { damping: 7, stiffness: 200 });
    setTimeout(() => {
      heartBurstOpacity.value = withTiming(0, { duration: 450 });
      heartBurstScale.value = withTiming(1.3, { duration: 450 });
    }, 650);
  };

  // ── Tap dispatcher (single = fullscreen viewer, double = like) ─────────────
  const handleMediaTap = (imageIndex: number) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      handleDoubleTap();
    } else {
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

  const handleDeletePost = async () => {
    if (!post || !session?.user?.id || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(post.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.user.id }),
      });
      if (res.ok) {
        DeviceEventEmitter.emit("postDeleted", { postId: post.id });
        router.back();
      } else {
        const body = await res.json().catch(() => ({}));
        Alert.alert("Delete failed", (body as any).error ?? "Please try again.");
      }
    } catch {
      Alert.alert("Delete failed", "Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const handleMoreOptions = () => {
    Alert.alert(
      "Post options",
      undefined,
      [
        {
          text: "Delete Post",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Delete Post",
              "This can't be undone.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: handleDeletePost },
              ],
            ),
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  // ── Video helpers ────────────────────────────────────────────────────────────
  const showControlsTemporarily = useCallback(() => {
    controlsOpacity.value = withTiming(1, { duration: 180 });
    if (controlsHideTimer.current) clearTimeout(controlsHideTimer.current);
    controlsHideTimer.current = setTimeout(() => {
      controlsHideTimer.current = null;
      controlsOpacity.value = withTiming(0, { duration: 600 });
    }, 3000);
  }, []);

  const handlePlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setVideoPosition(status.positionMillis ?? 0);
    setVideoDuration(status.durationMillis ?? 0);
    setVideoPlaying(status.isPlaying ?? false);
  }, []);

  const seekToRatio = useCallback((ratio: number) => {
    if (!videoDuration) return;
    const ms = Math.max(0, Math.min(1, ratio)) * videoDuration;
    videoRef.current?.setPositionAsync(ms).catch(() => {});
    setVideoPosition(ms);
  }, [videoDuration]);

  const handleSeekGesture = useCallback((e: GestureResponderEvent) => {
    if (!progressTrackW) return;
    seekToRatio(e.nativeEvent.locationX / progressTrackW);
  }, [progressTrackW, seekToRatio]);

  const handleVideoTap = useCallback(() => {
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
        setVideoPlaying((p) => !p);
        showControlsTemporarily();
      }, 280);
    }
    lastTapRef.current = now;
    showControlsTemporarily();
  }, [handleDoubleTap, showControlsTemporarily]);

  // ── Fullscreen video handlers ─────────────────────────────────────────────
  const handleOpenFullscreen = useCallback(() => {
    // Pause inline player and capture position before handing off to the modal
    videoRef.current?.pauseAsync().catch(() => {});
    setVideoPlaying(false);
    setShowVideoFullscreen(true);
  }, []);

  const handleCloseFullscreen = useCallback((position: number, playing: boolean) => {
    setShowVideoFullscreen(false);
    // Restore the inline player to where the fullscreen player was
    videoRef.current?.setPositionAsync(position).catch(() => {});
    setVideoPosition(position);
    setVideoPlaying(playing);
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const username = post?.profiles?.username ?? "user";
  const isOwnPost = !!(post && session?.user?.id && post.user_id === session.user.id);
  const isVerified = post?.profiles?.is_verified;
  const avatarUrl = post?.profiles?.avatar_url;
  const images = post
    ? (post.images && post.images.length > 0
        ? post.images.filter(Boolean)
        : [post.image_url ?? ""].filter(Boolean))
    : [];
  const caption = post?.caption ?? "";
  const captionNeedsExpand = caption.length > 140;
  const displayCaption =
    captionExpanded || !captionNeedsExpand ? caption : caption.slice(0, 140) + "…";
  const captionParts = displayCaption.split(/([@#]\w+)/g);
  const commentsCount = post?.comments_count ?? 0;
  const imgH = IMG_W / mediaAspectRatio;

  // ── Video detection ─────────────────────────────────────────────────────────
  const rawVideoUrl =
    (post as any)?.video_url ||
    ((post as any)?.media_url || "").match(/\.(mp4|mov|webm|m4v)(\?|$)/i)
      ? ((post as any)?.media_url ?? "")
      : ((post as any)?.image_url || "").match(/\.(mp4|mov|webm|m4v)(\?|$)/i)
      ? ((post as any)?.image_url ?? "")
      : null;
  const isVideoPost = !!(
    (post as any)?.is_video || (post as any)?.video_url || rawVideoUrl
  );
  const videoSrc = rawVideoUrl as string | null;
  const progressRatio = videoDuration > 0 ? videoPosition / videoDuration : 0;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View
        style={[S.center, { backgroundColor: colors.background, paddingTop: insets.top }]}
      >
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────────
  if (!post) {
    return (
      <View
        style={[S.center, { backgroundColor: colors.background, paddingTop: insets.top }]}
      >
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text
          style={{
            color: colors.mutedForeground,
            marginTop: 12,
            fontFamily: "Poppins_400Regular",
          }}
        >
          Post not found
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "#7C3AED", fontFamily: "Poppins_600SemiBold" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[S.screen, { backgroundColor: colors.background }]}>
      {/* ── Nav bar ─────────────────────────────────────────────────────────── */}
      <View
        style={[
          S.navBar,
          {
            paddingTop: insets.top + 6,
            borderBottomColor: colors.border ?? "rgba(255,255,255,0.08)",
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={S.navBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[S.navTitle, { color: colors.foreground }]}>Post</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={handleShare}
            style={S.navBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="share-social-outline" size={22} color={colors.foreground} />
          </TouchableOpacity>
          {isOwnPost && (
            <TouchableOpacity
              onPress={handleMoreOptions}
              style={[S.navBtn, { marginLeft: 4 }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              disabled={deleting}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={colors.foreground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={S.scroll}
      >
        {/* ── Media card — video player or photo ──────────────────────────── */}
        <View style={S.imageShadow}>
          <View style={[S.imageCard, { height: imgH }]}>

            {isVideoPost && videoSrc ? (
              /* ── Premium video player ────────────────────────────────────── */
              <View style={{ flex: 1 }}>
                <Video
                  ref={videoRef}
                  source={{ uri: videoSrc }}
                  style={{ width: IMG_W, height: imgH }}
                  resizeMode={ResizeMode.CONTAIN}
                  isLooping
                  shouldPlay={videoPlaying}
                  isMuted={isMuted}
                  onPlaybackStatusUpdate={handlePlaybackStatus}
                  onReadyForDisplay={(s: any) => {
                    if (s.naturalSize?.width && s.naturalSize?.height) {
                      setMediaAspectRatio(s.naturalSize.width / s.naturalSize.height);
                    }
                  }}
                />

                {/*
                  ── Touch-layer stack (bottom → top) ───────────────────────
                  1. Tap-catcher  (absoluteFill, rendered FIRST = lowest z)
                     Handles single-tap play/pause and double-tap like on the
                     bare video area.
                  2. Controls overlay (absoluteFill, rendered SECOND = above)
                     pointerEvents="box-none" → the Animated.View container
                     itself is transparent to touches; only its interactive
                     children (mute button, seek track) receive gestures.
                     The center play-icon area is pointerEvents="none" so
                     taps there fall through to the tap-catcher.
                  3. Heart burst (pointerEvents="none", topmost, decorative)
                */}

                {/* 1 ── Transparent full-area tap handler */}
                <TouchableOpacity
                  activeOpacity={1}
                  style={StyleSheet.absoluteFill}
                  onPress={handleVideoTap}
                />

                {/* 2 ── Controls overlay — fades in/out, sits ABOVE tap-catcher */}
                <Animated.View
                  style={[StyleSheet.absoluteFill, V.controls, videoControlsStyle]}
                  pointerEvents="box-none"
                >
                  {/* Top row: mute button */}
                  <View style={V.topRow} pointerEvents="box-none">
                    <TouchableOpacity
                      style={V.muteBtn}
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

                  {/* Center: visual play/pause indicator — pointerEvents="none"
                      so taps pass through to the tap-catcher below */}
                  <View style={V.centerRow} pointerEvents="none">
                    <View style={V.playPauseCircle}>
                      <Ionicons
                        name={videoPlaying ? "pause" : "play"}
                        size={34}
                        color="#fff"
                        style={videoPlaying ? {} : { marginLeft: 4 }}
                      />
                    </View>
                  </View>

                  {/* Bottom: time + gradient seek bar */}
                  <View style={V.bottomRow} pointerEvents="box-none">
                    <Text style={V.timeText}>
                      {formatTime(videoPosition)} / {formatTime(videoDuration)}
                    </Text>
                    <View
                      style={V.progressTrack}
                      onLayout={(e) => setProgressTrackW(e.nativeEvent.layout.width)}
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
                        style={[V.progressFill, { width: progressTrackW * progressRatio }]}
                      />
                      <View
                        style={[
                          V.progressThumb,
                          { left: Math.max(0, progressTrackW * progressRatio - 7) },
                        ]}
                      />
                    </View>
                  </View>

                  {/* ── Expand button — bottom-right, YouTube-style ─────── */}
                  <TouchableOpacity
                    style={V.expandBtn}
                    onPress={() => {
                      showControlsTemporarily();
                      handleOpenFullscreen();
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="expand" size={16} color="#fff" />
                  </TouchableOpacity>
                </Animated.View>

                {/* 3 ── Heart burst (purely decorative, never blocks touches) */}
                <Animated.View
                  style={[StyleSheet.absoluteFill, S.heartBurstOverlay, heartBurstStyle]}
                  pointerEvents="none"
                >
                  <Ionicons name="heart" size={100} color="#EC4899" />
                </Animated.View>
              </View>

            ) : images.length > 1 ? (
              /* ── Multi-image carousel ────────────────────────────────────── */
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                style={{ height: imgH, width: IMG_W }}
                onScroll={(e) =>
                  setCurrentImageIndex(
                    Math.round(e.nativeEvent.contentOffset.x / IMG_W),
                  )
                }
              >
                {images.map((img, idx) => (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={1}
                    onPress={() => handleMediaTap(idx)}
                  >
                    <Image
                      source={{ uri: img }}
                      style={{ width: IMG_W, height: imgH }}
                      contentFit="contain"
                      onLoad={(e) => {
                        if (idx === 0) {
                          const { width, height } = (e as any).source ?? {};
                          if (width && height) setMediaAspectRatio(width / height);
                        }
                      }}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              /* ── Single photo ────────────────────────────────────────────── */
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => handleMediaTap(0)}
                style={{ flex: 1 }}
              >
                <Image
                  source={{ uri: images[0] ?? "" }}
                  style={{ width: IMG_W, height: imgH }}
                  contentFit="contain"
                  onLoad={(e) => {
                    const { width, height } = (e as any).source ?? {};
                    if (width && height) setMediaAspectRatio(width / height);
                  }}
                />
              </TouchableOpacity>
            )}

            {/* Double-tap heart burst — photo only (video has its own above) */}
            {!isVideoPost && (
              <Animated.View
                style={[StyleSheet.absoluteFill, S.heartBurstOverlay, heartBurstStyle]}
                pointerEvents="none"
              >
                <Ionicons name="heart" size={100} color="#EC4899" />
              </Animated.View>
            )}

            {/* Carousel dot indicators — photo only */}
            {!isVideoPost && images.length > 1 && (
              <View style={S.dotsRow} pointerEvents="none">
                {images.map((_, i) => (
                  <View
                    key={i}
                    style={[S.dot, i === currentImageIndex && S.dotActive]}
                  />
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Action bar: like · comment · save · share ─────────────────── */}
        <View style={S.actionBar}>
          <TouchableOpacity onPress={handleLike} style={S.actionBtn} activeOpacity={0.7}>
            <Animated.View style={likeAnimStyle}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={28}
                color={liked ? "#EF4444" : colors.foreground}
              />
            </Animated.View>
            <Text style={[S.actionCount, { color: colors.foreground }]}>
              {formatCount(likesCount)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowComments(true)}
            style={S.actionBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-outline" size={26} color={colors.foreground} />
            <Text style={[S.actionCount, { color: colors.foreground }]}>
              {formatCount(commentsCount)}
            </Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity onPress={handleSave} style={S.actionBtn} activeOpacity={0.7}>
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={26}
              color={saved ? "#7C3AED" : colors.foreground}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={S.actionBtn} activeOpacity={0.7}>
            <Ionicons name="paper-plane-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* ── Author row — large avatar + follower/post count + Follow ─── */}
        <View
          style={[
            S.authorSection,
            {
              borderTopColor: "rgba(255,255,255,0.07)",
              borderBottomColor: "rgba(255,255,255,0.07)",
            },
          ]}
        >
          <TouchableOpacity
            style={S.authorLeft}
            onPress={() => router.push(`/profile/${username}` as any)}
            activeOpacity={0.75}
          >
            <GradientRingAvatar username={username} url={avatarUrl} size={52} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text style={[S.authorName, { color: colors.foreground }]}>{username}</Text>
                {isVerified && (
                  <Ionicons name="checkmark-circle" size={15} color="#7C3AED" />
                )}
              </View>
              {authorStats ? (
                <Text style={[S.authorSub, { color: colors.mutedForeground }]}>
                  {formatCount(authorStats.followers_count)} Followers ·{" "}
                  {formatCount(authorStats.posts_count)} Posts
                </Text>
              ) : (
                <Text style={[S.authorSub, { color: colors.mutedForeground }]}>
                  {timeAgo(post.created_at)}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setFollowing((f) => !f)} activeOpacity={0.8}>
            {following ? (
              <View
                style={[S.followingBtn, { borderColor: "rgba(255,255,255,0.22)" }]}
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
                <Text style={[S.followBtnTxt, { color: "#fff" }]}>Follow</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Post Information — 3-column stats row ─────────────────────── */}
        <View
          style={[
            S.statsSection,
            { borderBottomColor: "rgba(255,255,255,0.07)" },
          ]}
        >
          <Text style={[S.sectionLabel, { color: colors.mutedForeground }]}>
            POST INFORMATION
          </Text>
          <View style={S.statsRow}>
            <StatCell
              label="Likes"
              value={formatCount(likesCount)}
              mutedColor={colors.mutedForeground}
              boldColor={colors.foreground}
            />
            <StatDivider />
            <StatCell
              label="Comments"
              value={formatCount(commentsCount)}
              mutedColor={colors.mutedForeground}
              boldColor={colors.foreground}
            />
            <StatDivider />
            <StatCell
              label="Posted"
              value={timeAgo(post.created_at)}
              mutedColor={colors.mutedForeground}
              boldColor={colors.foreground}
            />
          </View>
        </View>

        {/* ── Caption ─────────────────────────────────────────────────────── */}
        {caption ? (
          <View style={S.captionSection}>
            <Text style={[S.captionText, { color: colors.foreground }]}>
              <Text style={S.captionAuthor}>{username} </Text>
              {captionParts.map((part, i) =>
                part.startsWith("@") || part.startsWith("#") ? (
                  <Text key={i} style={S.captionAccent}>
                    {part}
                  </Text>
                ) : (
                  <Text key={i}>{part}</Text>
                ),
              )}
            </Text>
            {captionNeedsExpand && (
              <TouchableOpacity
                onPress={() => setCaptionExpanded((v) => !v)}
                style={{ marginTop: 6 }}
              >
                <Text style={S.moreText}>{captionExpanded ? "less" : "more"}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* ── Comments preview ─────────────────────────────────────────────── */}
        {previewComments.length > 0 && (
          <View
            style={[
              S.commentsSection,
              { borderTopColor: "rgba(255,255,255,0.07)" },
            ]}
          >
            <Text style={[S.sectionLabel, { color: colors.mutedForeground }]}>
              COMMENTS
            </Text>
            {previewComments.map((c, i) => (
              <CommentRow key={c.id ?? i} comment={c} textColor={colors.foreground} />
            ))}
            <TouchableOpacity
              onPress={() => setShowComments(true)}
              style={{ marginTop: 10 }}
            >
              <Text style={[S.viewAllComments, { color: colors.mutedForeground }]}>
                View all {formatCount(commentsCount)} comment
                {commentsCount !== 1 ? "s" : ""} →
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── More from @username — rounded 3-column grid ───────────────── */}
        {(moreLoading || morePosts.length > 0) && (
          <View style={S.moreSection}>
            <View
              style={[
                S.moreSep,
                { backgroundColor: colors.border ?? "rgba(255,255,255,0.06)" },
              ]}
            />
            <View style={S.moreHeader}>
              <Text style={[S.moreTitle, { color: colors.foreground }]}>
                More from{" "}
                <Text style={S.moreUser}>@{username}</Text>
              </Text>
              <TouchableOpacity
                onPress={() => router.push(`/profile/${username}` as any)}
                activeOpacity={0.7}
              >
                <Text style={S.moreSeeAll}>See all →</Text>
              </TouchableOpacity>
            </View>

            {moreLoading ? (
              <View style={{ paddingVertical: 32, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#7C3AED" />
              </View>
            ) : (
              <View style={S.moreGrid}>
                {morePosts.map((p) => {
                  const thumb = p.image_url ?? p.media_url ?? "";
                  const isVideo =
                    typeof p.media_url === "string" &&
                    /\.(mp4|mov|m4v|webm)(\?|$)/i.test(p.media_url);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={S.moreThumb}
                      activeOpacity={0.82}
                      onPress={() => router.replace(`/post/${p.id}` as any)}
                    >
                      <Image
                        source={{ uri: thumb }}
                        style={S.moreThumbImg}
                        contentFit="cover"
                      />
                      {isVideo && (
                        <View style={S.moreVideoIcon}>
                          <Ionicons name="play" size={10} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 48 }} />
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
      {isVideoPost && videoSrc && showVideoFullscreen && (
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingBottom: 80 },

  // Nav
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },
  navBtn: { padding: 8, width: 44, alignItems: "center" },

  // Image
  imageShadow: {
    marginHorizontal: IMG_MARGIN,
    marginTop: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 20,
  },
  imageCard: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#0a0a0a",
    position: "relative",
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
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: { backgroundColor: "#fff", width: 18 },

  // Action bar
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: IMG_MARGIN,
    paddingTop: 16,
    paddingBottom: 6,
    gap: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  actionCount: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },

  // Author
  authorSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: IMG_MARGIN,
    paddingVertical: 18,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
  },
  authorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  authorName: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  authorSub: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 2 },
  followGrad: { borderRadius: 22, paddingHorizontal: 20, paddingVertical: 9 },
  followingBtn: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1.5,
  },
  followBtnTxt: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  // Post Information
  statsSection: {
    paddingHorizontal: IMG_MARGIN,
    paddingTop: 22,
    paddingBottom: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 1.4,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  // Caption
  captionSection: {
    paddingHorizontal: IMG_MARGIN,
    paddingTop: 20,
    paddingBottom: 12,
  },
  captionText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    lineHeight: 22,
  },
  captionAuthor: { fontFamily: "Poppins_700Bold" },
  captionAccent: { color: "#8B5CF6", fontFamily: "Poppins_600SemiBold" },
  moreText: { fontSize: 13, color: "#7C3AED", fontFamily: "Poppins_600SemiBold" },

  // Comments
  commentsSection: {
    paddingHorizontal: IMG_MARGIN,
    paddingTop: 20,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  viewAllComments: { fontSize: 13, fontFamily: "Poppins_400Regular" },

  // More from user
  moreSection: { marginTop: 8 },
  moreSep: { height: 6, marginVertical: 8 },
  moreHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: IMG_MARGIN,
    paddingVertical: 16,
  },
  moreTitle: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  moreUser: { color: "#A78BFA" },
  moreSeeAll: { fontSize: 13, color: "#7C3AED", fontFamily: "Poppins_600SemiBold" },
  moreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: IMG_MARGIN,
    gap: GRID_GAP,
  },
  moreThumb: {
    width: THUMB_W,
    height: THUMB_W,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#111",
  },
  moreThumbImg: { width: "100%", height: "100%" },
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

// ─── Video player controls styles ─────────────────────────────────────────────
const V = StyleSheet.create({
  controls: {
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 12,
  },
  muteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerRow: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  playPauseCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
  },
  bottomRow: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  timeText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    letterSpacing: 0.3,
  },
  progressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 2,
    position: "relative",
    overflow: "visible",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    position: "absolute",
    left: 0,
    top: 0,
  },
  progressThumb: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fff",
    top: -5,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },
  expandBtn: {
    position: "absolute",
    bottom: 14,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});
