import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CommentsSheet } from "@/components/CommentsSheet";
import { LoginPrompt } from "@/components/LoginPrompt";
import { ShareSheet } from "@/components/ShareSheet";
import { UserAvatar } from "@/components/UserAvatar";

import { useAuth } from "@/context/AuthContext";
import { checkReelLiked, likeReelOnly, toggleReelLike, toggleLike, logWatchEvent, reportContent, blockUser } from "@/lib/db";
import { supabase } from "@/lib/supabase";

const { width: W, height: H } = Dimensions.get("window");
const SCREEN_H = H;
// Fixed 9:16 portrait reference ratio used for adaptive resizeMode in ReelItem.
// Comparing against the DEVICE screen ratio (W/H ≈ 0.46-0.48) was wrong — it caused
// normal 9:16 footage (0.5625) to exceed the threshold and get CONTAIN+blur.
// Instead we compare every video against a canonical portrait 9:16 = 0.5625,
// with a ±20% tolerance to cover 9:19.5, 9:20, and other native phone ratios.
const PORTRAIT_REFERENCE_ASPECT = 9 / 16; // 0.5625

// Stable viewability config — must be defined outside the component so its
// reference never changes (React Native throws if it changes after mount).
const REEL_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 120,
};

// ─── Types ──────────────────────────────────────────────────────────────────────
interface Reel {
  id: string;
  image: string;       // thumbnail / poster fallback
  videoUrl?: string;   // actual video URL for playback (DB reels only)
  username: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  sound: string;
  isVerified?: boolean;
  duration?: number;   // seconds; used for watch_time_ratio
  allowDownload?: boolean;  // creator's allow_download preference from DB
}


const TRENDING_SOUNDS = [
  { id: "s1", name: "Good Days", artist: "SZA", uses: "2.1M" },
  { id: "s2", name: "Blinding Lights", artist: "The Weeknd", uses: "5.4M" },
  { id: "s3", name: "Lo-Fi Beats", artist: "ChilledCow", uses: "890K" },
  { id: "s4", name: "Essence", artist: "Wizkid", uses: "1.3M" },
  { id: "s5", name: "Heat Waves", artist: "Glass Animals", uses: "3.2M" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function parseCaption(text: string, onHashtag: (tag: string) => void) {
  const parts = text.split(/(\s*#\w+)/g);
  return parts.map((part, i) => {
    const trimmed = part.trim();
    if (trimmed.startsWith("#")) {
      return (
        <Text
          key={i}
          style={captionStyles.tag}
          onPress={() => onHashtag(trimmed.slice(1))}
        >
          {part}
        </Text>
      );
    }
    return <Text key={i} style={captionStyles.text}>{part}</Text>;
  });
}

const captionStyles = StyleSheet.create({
  text: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 19 },
  tag: { color: "#A78BFA", fontSize: 13, fontFamily: "Poppins_600SemiBold", lineHeight: 19 },
});

// ─── Sounds modal ─────────────────────────────────────────────────────────────────
function SoundsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={soundsStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={soundsStyles.sheet}>
        <View style={soundsStyles.handle} />
        <Text style={soundsStyles.title}>🎵 Trending Sounds</Text>
        {TRENDING_SOUNDS.map((s, i) => (
          <TouchableOpacity key={s.id} style={soundsStyles.row} activeOpacity={0.7}>
            <View style={soundsStyles.rank}>
              <Text style={soundsStyles.rankNum}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={soundsStyles.soundName}>{s.name}</Text>
              <Text style={soundsStyles.soundArtist}>{s.artist} · {s.uses} uses</Text>
            </View>
            <Ionicons name="play-circle-outline" size={28} color="#7C3AED" />
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}
const soundsStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 16 },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17, marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.08)" },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(124,58,237,0.25)", alignItems: "center", justifyContent: "center" },
  rankNum: { color: "#A78BFA", fontFamily: "Poppins_700Bold", fontSize: 12 },
  soundName: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  soundArtist: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 12 },
});

// ─── ReelItem ─────────────────────────────────────────────────────────────────────
interface ReelItemProps {
  reel: Reel;
  isActive: boolean;
  onComplete: () => void;
  onRequireLogin: () => void;
  isLoggedIn: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
}

function ReelItem({ reel, isActive, onComplete, onRequireLogin, isLoggedIn, soundOn, onToggleSound }: ReelItemProps) {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id;

  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(reel.likes);

  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [paused, setPaused] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [slowMo, setSlowMo] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportReasons, setShowReportReasons] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  // null = not yet known (assume cover until video reports its naturalSize)
  const [videoAspect, setVideoAspect] = useState<number | null>(null);

  // Guard: once the user has tapped like/unlike, the async mount-time checkReelLiked
  // result must NOT overwrite their intent (race condition causes brief flicker + revert).
  const hasInteracted = useRef(false);

  // animations
  const progress = useSharedValue(0);
  const heartBurstOpacity = useSharedValue(0);
  const heartBurstScale = useSharedValue(0);
  const pauseOpacity = useSharedValue(0);
  const marqueeX = useSharedValue(0);

  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const pausedAtRef = useRef(0);
  const watchStartRef = useRef<number | null>(null);

  // Load real liked state from API server on mount (service-role key, no RLS hang).
  // Only updates state if the user hasn't already tapped like — prevents the async
  // response from overwriting an in-flight optimistic update.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    checkReelLiked(reel.id, userId)
      .then((v) => { if (!cancelled && !hasInteracted.current) setLiked(v); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reel.id, userId]);

  // Watch time tracking — log when the reel stops being active
  const videoDurationSec = reel.duration ?? 14;
  useEffect(() => {
    if (isActive) {
      watchStartRef.current = Date.now();
    } else {
      if (watchStartRef.current !== null) {
        const watched = (Date.now() - watchStartRef.current) / 1000;
        watchStartRef.current = null;
        if (watched > 0.5) {
          logWatchEvent(reel.id, watched, videoDurationSec, userId ?? undefined);
        }
      }
    }
    return () => {
      if (watchStartRef.current !== null) {
        const watched = (Date.now() - watchStartRef.current) / 1000;
        watchStartRef.current = null;
        if (watched > 0.5) {
          logWatchEvent(reel.id, watched, videoDurationSec, userId ?? undefined);
        }
      }
    };
  }, [isActive]);

  // Reset paused when this reel loses focus — so it autoplays next time it's visible
  useEffect(() => {
    if (!isActive) {
      setPaused(false);
    }
  }, [isActive]);

  // Progress bar animation — loops visually with the video; never auto-advances
  useEffect(() => {
    if (!isActive || paused) {
      cancelAnimation(progress);
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 14000, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(progress);
  }, [isActive, paused]);

  // Track progress when pausing
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as any }));

  // Sound marquee
  useEffect(() => {
    if (!isActive) { cancelAnimation(marqueeX); marqueeX.value = 0; return; }
    marqueeX.value = withRepeat(
      withTiming(-180, { duration: 9000, easing: Easing.linear }),
      -1, false
    );
    return () => { cancelAnimation(marqueeX); };
  }, [isActive]);
  const marqueeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: marqueeX.value }] }));

  const heartBurstStyle = useAnimatedStyle(() => ({
    opacity: heartBurstOpacity.value,
    transform: [{ scale: heartBurstScale.value }],
  }));
  const pauseStyle = useAnimatedStyle(() => ({ opacity: pauseOpacity.value }));

  const doLike = useCallback(() => {
    // Double-tap always likes (never unlikes) — like Instagram/TikTok.
    // Burst animation fires even if already liked (visual feedback), but API only called once.
    if (!isLoggedIn) { onRequireLogin(); return; }
    hasInteracted.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Burst animation — explicit opacity + scale, same pattern as PostCard
    heartBurstOpacity.value = 0;
    heartBurstScale.value = 0.3;
    heartBurstOpacity.value = withTiming(1, { duration: 80 });
    heartBurstScale.value = withSpring(1, { damping: 7, stiffness: 200 });
    setTimeout(() => {
      heartBurstOpacity.value = withTiming(0, { duration: 450 });
      heartBurstScale.value = withTiming(1.3, { duration: 450 });
    }, 650);
    if (liked) return; // already liked — animate but don't re-call API
    setLiked(true);
    setLikes((l) => l + 1);
    if (userId) {
      // like-only endpoint: idempotent, never unlikes, never double-counts
      likeReelOnly(reel.id, userId)
        .then((result) => { setLiked(result.liked); setLikes(result.likes); })
        .catch(() => { setLiked(false); setLikes((l) => l - 1); });
    }
  }, [isLoggedIn, userId, reel.id, liked]);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      // Double tap → like
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      doLike();
    } else {
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        // Single tap → pause / play
        setPaused((p) => {
          const next = !p;
          if (next) {
            pausedAtRef.current = progress.value;
            pauseOpacity.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 800, easing: Easing.out(Easing.quad) }));
          }
          return next;
        });
      }, 350);
    }
    lastTap.current = now;
  }, [doLike, progress]);

  const handleLike = useCallback(() => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    hasInteracted.current = true;
    // Optimistic toggle
    const optimisticLiked = !liked;
    setLiked(optimisticLiked);
    setLikes((l) => optimisticLiked ? l + 1 : l - 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (userId) {
      // API server confirms the real state and returns the actual DB count
      toggleReelLike(reel.id, userId)
        .then((result) => { setLiked(result.liked); setLikes(result.likes); })
        .catch(() => {
          // Revert on failure
          setLiked(liked);
          setLikes((l) => optimisticLiked ? l - 1 : l + 1);
        });
    }
  }, [liked, isLoggedIn, userId, reel.id]);


  const topPad = Platform.OS === "web" ? 20 : insets.top;
  // Tab bar top edge = insets.bottom + 78. Buttons/text overlays must sit above it.
  // bottomPad drives: rightActions, bottomInfo, soundToggle (all at bottom: bottomPad + 8 = insets.bottom + 92).
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom + 84;

  return (
    <Pressable
      style={[S.reelContainer, { height: SCREEN_H }]}
      onPress={handlePress}
      onLongPress={() => {
        setSlowMo(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => setSlowMo(false), 2000);
      }}
      delayLongPress={400}
    >
      {/* Background: real video for DB reels, placeholder poster if video not yet loaded */}
      {reel.videoUrl && !videoError ? (() => {
        // Aspect-ratio comparison: video aspect vs fixed 9:16 portrait reference (0.5625).
        // ±20% tolerance covers 9:16, 9:19.5, 9:20 native-shot content → COVER (crop-to-fill).
        // Anything outside that band (4:5, 1:1, 16:9 landscape) → CONTAIN + blurred backdrop.
        const isCloseAspect =
          videoAspect === null ||
          Math.abs(videoAspect - PORTRAIT_REFERENCE_ASPECT) / PORTRAIT_REFERENCE_ASPECT < 0.20;
        const videoResizeMode = isCloseAspect ? ResizeMode.COVER : ResizeMode.CONTAIN;
        return (
          <>
            {/* No blurred backdrop: reelContainer already has backgroundColor="#000",
                which gives true-black letterbox bars in CONTAIN mode.
                A blurred backdrop painted with absoluteFill + contentFit="cover"
                floods the entire container with warm video tones that the dark
                overlay (rgba 0,0,0,0.45) cannot fully suppress — causing the
                brown/tan letterbox visible in the screenshot. Plain black is correct. */}
            <Video
              source={{ uri: reel.videoUrl }}
              style={{ position: "absolute", top: 0, left: 0, width: W, height: SCREEN_H }}
              resizeMode={videoResizeMode}
              isLooping
              isMuted={!soundOn}
              shouldPlay={isActive && !paused}
              useNativeControls={false}
              posterSource={{ uri: reel.image }}
              usePoster
              onError={() => setVideoError(true)}
              onReadyForDisplay={(e) => {
                const { width: vw, height: vh } = e.naturalSize;
                if (vw > 0 && vh > 0) setVideoAspect(vw / vh);
              }}
            />
          </>
        );
      })() : (
        <Image
          source={{ uri: reel.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
          priority={isActive ? "high" : "normal"}
        />
      )}

      {/* Slow-mo overlay */}
      {slowMo && (
        <View style={S.slowMoBanner}>
          <Text style={S.slowMoText}>🐢 Slow Motion</Text>
        </View>
      )}

      {/* Gradients */}
      <LinearGradient colors={["rgba(0,0,0,0.55)", "transparent"]} style={[S.topGrad, { height: topPad + 100 }]} />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} style={[S.bottomGrad, { height: bottomPad + 260 }]} />

      {/* Floating heart on double tap — burst animation, same pattern as PostCard */}
      <Animated.View style={[S.floatingHeart, heartBurstStyle]} pointerEvents="none">
        <Ionicons name="heart" size={100} color="#EC4899" />
      </Animated.View>

      {/* Pause indicator */}
      <Animated.View style={[S.pauseIndicator, pauseStyle]} pointerEvents="none">
        <Ionicons name={paused ? "pause" : "play"} size={64} color="rgba(255,255,255,0.7)" />
      </Animated.View>

      {/* ── Right actions ─────────────────────────────────────────────────── */}
      {/* Avatar/follow removed — author info lives only in the bottom-left stack */}
      <View style={[S.rightActions, { bottom: bottomPad + 8 }]}>
        {/* Like */}
        <TouchableOpacity style={S.actionBtn} onPress={handleLike} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={32} color={liked ? "#F43F5E" : "#fff"} style={S.actionIcon} />
          <Text style={S.actionCount}>{fmt(likes)}</Text>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity
          style={S.actionBtn}
          onPress={() => { if (!isLoggedIn) { onRequireLogin(); return; } setShowComments(true); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chatbubble-outline" size={30} color="#fff" style={S.actionIcon} />
          <Text style={S.actionCount}>{fmt(reel.comments)}</Text>
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity style={S.actionBtn} onPress={() => setShowShare(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-redo-outline" size={28} color="#fff" style={S.actionIcon} />
          <Text style={S.actionCount}>{fmt(reel.shares)}</Text>
        </TouchableOpacity>

        {/* Download — only shown when creator enabled downloads; saving gated
            until watermarked export ships (ffmpeg-kit pipeline). */}
        {reel.allowDownload !== false && (
          <TouchableOpacity
            style={S.actionBtn}
            onPress={() => Alert.alert(
              "Coming soon",
              "Watermarked downloads are on their way. Stay tuned! 🎬",
              [{ text: "OK" }],
            )}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="cloud-download-outline" size={28} color="#fff" style={S.actionIcon} />
            <Text style={S.actionCount}>Save</Text>
          </TouchableOpacity>
        )}

        {/* Spinning music disc */}
        <TouchableOpacity style={S.musicDisc} onPress={() => router.push("/search" as any)}>
          <UserAvatar username={reel.username} size={36} />
          <View style={S.musicNote}>
            <Ionicons name="musical-note" size={10} color="#fff" />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Bottom-left overlay: TikTok-style compact stack ──────────────── */}
      {/* Order: caption (1-line) → @username → sound + views inline       */}
      <View style={[S.bottomInfo, { bottom: bottomPad + 8 }]}>

        {/* Caption — single line; tapping toggles full-caption expand */}
        {reel.caption ? (
          <TouchableOpacity activeOpacity={0.8} onPress={() => setCaptionExpanded((e) => !e)}>
            <Text style={S.caption} numberOfLines={captionExpanded ? undefined : 1}>
              {parseCaption(reel.caption, (tag) => router.push(`/search?q=%23${tag}` as any))}
            </Text>
            {!captionExpanded && (
              <Text style={S.moreText}>See more</Text>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Username — bold, directly below caption */}
        <TouchableOpacity
          onPress={() => router.push(`/profile/${reel.username}` as any)}
          style={S.usernameRow}
        >
          <Text style={S.username}>@{reel.username}</Text>
          {reel.isVerified && <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />}
        </TouchableOpacity>

        {/* Sound marquee — views removed from this line */}
        <TouchableOpacity style={S.soundRow} activeOpacity={0.7}>
          <Ionicons name="musical-notes" size={12} color="rgba(255,255,255,0.75)" />
          <View style={S.soundMarqueeClip}>
            <Animated.Text style={[S.soundText, marqueeStyle]} numberOfLines={1}>
              {reel.sound}
            </Animated.Text>
          </View>
        </TouchableOpacity>

      </View>

      {/* ── Sound toggle (bottom left) ──────────────────────────────────── */}
      <TouchableOpacity style={[S.soundToggle, { bottom: bottomPad + 8 }]} onPress={onToggleSound}>
        <Ionicons name={soundOn ? "volume-high" : "volume-mute"} size={18} color="#fff" />
      </TouchableOpacity>

      {/* ── Progress bar (very bottom) ──────────────────────────────────── */}
      <View style={[S.progressWrap, { bottom: Platform.OS === "web" ? 84 : insets.bottom }]}>
        <View style={S.progressTrack}>
          <Animated.View style={[S.progressFill, progressStyle]} />
        </View>
      </View>

      <CommentsSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        postId={reel.id}
        isLoggedIn={isLoggedIn}
        onRequireLogin={() => { setShowComments(false); onRequireLogin(); }}
        contentType="reel"
      />
      <ShareSheet
        visible={showShare}
        onClose={() => setShowShare(false)}
        contentType="reel"
        username={reel.username}
      />

      {/* ── More / Report sheet ─────────────────────────────────────────── */}
      <Modal visible={showMoreMenu} transparent animationType="slide" onRequestClose={() => setShowMoreMenu(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} activeOpacity={1} onPress={() => { setShowMoreMenu(false); setShowReportReasons(false); }} />
        <View style={{ backgroundColor: "#1A0A2E", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === "ios" ? insets.bottom + 16 : 24 }}>
          <View style={{ width: 40, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
          {!showReportReasons ? (
            <>
              {[
                { icon: "flag-outline" as const, label: "Report Reel", color: "#EF4444", onPress: () => setShowReportReasons(true) },
                { icon: "person-remove-outline" as const, label: `Block @${reel.username}`, color: "#EF4444", onPress: () => {
                  setShowMoreMenu(false);
                  router.push(`/profile/${reel.username}` as any);
                }},
                { icon: "eye-off-outline" as const, label: "Not Interested", color: "#fff", onPress: () => { setShowMoreMenu(false); } },
              ].map((item, i) => (
                <TouchableOpacity key={i} onPress={item.onPress} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
                  <Ionicons name={item.icon} size={20} color={item.color} style={{ marginRight: 14 }} />
                  <Text style={{ color: item.color, fontSize: 15, fontFamily: "Poppins_500Medium" }}>{item.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setShowMoreMenu(false)} style={{ alignItems: "center", paddingTop: 14 }}>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "Poppins_500Medium" }}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Poppins_600SemiBold", marginBottom: 12 }}>Why are you reporting this?</Text>
              {["Spam", "Harassment", "Nudity or sexual content", "Violence", "Misinformation", "Other"].map((reason) => (
                <TouchableOpacity key={reason} disabled={!!reporting} onPress={async () => {
                  if (!userId) return;
                  setReporting(reason);
                  try {
                    await reportContent(userId, reel.id, "reel", reason);
                    setShowMoreMenu(false);
                    setShowReportReasons(false);
                    Alert.alert("Reported ✅", "Thanks for letting us know. We'll review this content.");
                  } catch { Alert.alert("Error", "Could not submit. Try again."); }
                  finally { setReporting(null); }
                }} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)", opacity: reporting === reason ? 0.5 : 1 }}>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" style={{ marginRight: 12 }} />
                  <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Poppins_400Regular" }}>{reporting === reason ? "Submitting…" : reason}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setShowReportReasons(false)} style={{ alignItems: "center", paddingTop: 14 }}>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "Poppins_500Medium" }}>Back</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────────
export default function ReelsScreen() {
  "use no memo";
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const isLoggedIn = !!session;

  const [feedTab, setFeedTab] = useState<"foryou" | "following">("foryou");
  const feedTabRef = useRef<"foryou" | "following">("foryou");
  const [activeIndex, setActiveIndex] = useState(0);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [showSounds, setShowSounds] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  // Tracks the settled index at the START of each drag gesture so onMomentumScrollEnd
  // can clamp to exactly ±1 regardless of how far momentum carried the offset.
  const dragStartIndexRef = useRef(0);
  const [forYouReels, setForYouReels] = useState<Reel[]>([]);
  const [followingReels, setFollowingReels] = useState<Reel[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [screenFocused, setScreenFocused] = useState(true);
  const viewTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => { feedTabRef.current = feedTab; }, [feedTab]);

  const reels = feedTab === "foryou" ? forYouReels : followingReels;
  const displayReels = reels;

  // Helper: map a posts-table row to the Reel shape
  const postToReel = (p: any): Reel => ({
    id: `post_${p.id}`,
    image: p.image_url ?? p.media_url ?? `https://picsum.photos/seed/${p.id}/450/900`,
    username: p.profiles?.username ?? "user",
    caption: p.caption ?? "",
    likes: p.likes_count ?? 0,
    comments: p.comments_count ?? 0,
    shares: p.shares_count ?? 0,
    views: p.views_count ?? 0,
    sound: "Original Sound",
    isVerified: p.profiles?.is_verified ?? false,
  });

  // Helper: map a reels-table row to the Reel shape
  const reelRowToReel = (r: any): Reel => ({
    id: `reel_${r.id}`,
    image: r.thumbnail_url ?? `https://picsum.photos/seed/${r.id}/450/900`,
    videoUrl: r.video_url ?? undefined,
    username: r.profiles?.username ?? "user",
    caption: r.caption ?? "",
    likes: r.likes_count ?? 0,
    comments: r.comments_count ?? 0,
    shares: r.shares_count ?? 0,
    views: r.views_count ?? 0,
    sound: r.sound_name ?? "Original Sound",
    isVerified: r.profiles?.is_verified ?? false,
    duration: r.duration ?? 14,
  });

  // Viral boost: interleave fresh items into a base feed every BOOST_EVERY slots
  const BOOST_EVERY = 3;
  const interleaveBoost = (base: Reel[], fresh: Reel[]): Reel[] => {
    const seen = new Set(base.map((r) => r.id));
    const queue = fresh.filter((r) => !seen.has(r.id));
    const result: Reel[] = [];
    let qi = 0;
    for (let i = 0; i < base.length; i++) {
      result.push(base[i]);
      if ((i + 1) % BOOST_EVERY === 0 && qi < queue.length) {
        result.push(queue[qi++]);
      }
    }
    while (qi < queue.length) result.push(queue[qi++]);
    return result;
  };

  // Session-level diversity cap — limits any single creator to maxPerCreator
  // slots in the For You reel feed (overflow pushed to the end).
  const applyReelDiversity = (reels: Reel[], maxPerCreator = 2): Reel[] => {
    const creatorCount = new Map<string, number>();
    const primary: Reel[] = [];
    const overflow: Reel[] = [];
    for (const reel of reels) {
      const creator = reel.username;
      const n = creatorCount.get(creator) ?? 0;
      if (n < maxPerCreator) {
        primary.push(reel);
        creatorCount.set(creator, n + 1);
      } else {
        overflow.push(reel);
      }
    }
    return [...primary, ...overflow];
  };

  const loadFeed = useCallback(async () => {
    const uid = session?.user?.id;
    const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    console.log('[loadFeed] called uid:', uid?.slice(0, 8) ?? 'guest');

    // Helper to map a raw DB row from the API server → Reel shape
    function rowToReel(r: any): Reel {
      return {
        id: r.id,
        image: r.thumbnail_url ?? `https://picsum.photos/seed/${r.id}/450/900`,
        videoUrl: r.video_url || undefined,  // || treats empty string as absent (not just null/undefined)
        username: r.username ?? r.profiles?.username ?? "user",
        caption: r.caption ?? "",
        likes: r.likes_count ?? 0,
        comments: r.comments_count ?? 0,
        shares: r.shares_count ?? 0,
        views: r.views_count ?? 0,
        sound: r.sound_name ?? "Original Sound",
        isVerified: r.is_verified ?? r.profiles?.is_verified ?? false,
        allowDownload: r.allow_download ?? true,
      };
    }

    // ── For You reels via API server ─────────────────────────────────────────
    // All RPC calls go through the API server (service role key, <1 s round
    // trip). Direct supabase.rpc() from mobile hangs indefinitely on this
    // device's network path, so we never call supabase directly for feeds.
    // userId is optional — the API serves public reels to guests too.
    try {
      const uidParam = uid ? `?userId=${encodeURIComponent(uid)}&limit=20` : `?limit=20`;
      const res = await fetch(`${API_BASE}/feed/reels${uidParam}`);
      console.log('[loadFeed] foryou reels status:', res.status);
      if (res.ok) {
        const body = await res.json();
        const fyData: any[] = body.data ?? [];
        console.log('[loadFeed] foryou reels rows:', fyData.length, 'source:', body.source);
        // Always call setForYouReels — even with [] — so a previously empty
        // state can be replaced on re-fetch. The `if length > 0` guard was
        // silently leaving state as [] when the pre-auth guest load returned
        // nothing and the authenticated re-fetch never updated the state.
        setForYouReels(applyReelDiversity(fyData.map(rowToReel)));
      }
    } catch (_e: any) {
      console.log('[loadFeed] foryou reels error:', (_e as any)?.message);
    }

    // ── Following reels via API server ───────────────────────────────────────
    if (uid) {
      try {
        const res = await fetch(`${API_BASE}/feed/following-reels?userId=${encodeURIComponent(uid)}&limit=20`);
        if (res.ok) {
          const body = await res.json();
          const followData: any[] = body.data ?? [];
          console.log('[loadFeed] following reels from api server, rows:', followData.length);
          if (followData.length > 0) {
            setFollowingReels(followData.map(rowToReel));
          }
        }
      } catch (e: any) {
        console.log('[loadFeed] following reels fetch threw:', e?.message);
      }
    }
  }, [session?.user?.id]);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    loadFeed();
    return () => setScreenFocused(false);
  }, [loadFeed]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  }, [loadFeed]);


  // Primary activeIndex update: fires whenever a reel crosses 50% viewport coverage.
  // Using a ref keeps the callback reference stable (React Native requirement).
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  // Sync the settled index after native snap completes.
  // snapToInterval handles all the actual snapping — we just track state here.
  const onMomentumScrollEnd = useCallback((e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / SCREEN_H);
    const clamped = Math.max(0, Math.min(idx, displayReels.length - 1));
    dragStartIndexRef.current = clamped;
    setActiveIndex(clamped);
  }, [displayReels.length]);

  const handleComplete = useCallback(() => {
    const next = activeIndex + 1;
    if (next < displayReels.length) {
      const targetOffset = next * SCREEN_H;
      flatListRef.current?.scrollToOffset({ offset: targetOffset, animated: true });
      setActiveIndex(next);
    }
  }, [activeIndex, displayReels.length]);

  const switchTab = (tab: "foryou" | "following") => {
    setFeedTab(tab);
    setActiveIndex(0);
    setTimeout(() => {
      const targetReels = tab === "foryou" ? forYouReels : followingReels;
      if (flatListRef.current && targetReels.length > 0) {
        flatListRef.current.scrollToOffset({ offset: 0, animated: false });
      }
    }, 50);
  };

  const feedPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.8 && Math.abs(gs.dx) > 25,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -40) {
          if (feedTabRef.current === "foryou") {
            router.navigate("/(tabs)/feed" as any);
          } else {
            switchTab("foryou");
          }
        } else if (gs.dx > 40) {
          switchTab("following");
        }
      },
    })
  ).current;

  const topPad = Platform.OS === "web" ? 20 : insets.top;

  return (
    <View style={S.container} {...feedPanResponder.panHandlers}>
      <FlatList
        ref={flatListRef}
        data={displayReels}
        style={{ flex: 1 }}
        keyExtractor={(item) => item.id + feedTab}
        snapToInterval={SCREEN_H}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={REEL_VIEWABILITY_CONFIG}
        onMomentumScrollEnd={onMomentumScrollEnd}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#8B5CF6"
            colors={["#8B5CF6"]}
          />
        }
        renderItem={({ item, index }) => {
          return (
            <ReelItem
              reel={item}
              isActive={index === activeIndex && screenFocused}
              onComplete={handleComplete}
              onRequireLogin={() => setShowLoginPrompt(true)}
              isLoggedIn={isLoggedIn}
              soundOn={soundOn}
              onToggleSound={() => setSoundOn((s) => !s)}
            />
          );
        }}
        ListEmptyComponent={() =>
          feedTab === "following" ? (
            <View style={[S.emptyState, { height: SCREEN_H }]}>
              <Text style={S.emptyEmoji}>💜</Text>
              <Text style={S.emptyTitle}>Nothing here yet</Text>
              <Text style={S.emptySub}>
                Follow people to see their reels here
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/search" as any)}
                style={S.emptyBtn}
              >
                <Text style={S.emptyBtnText}>Find People →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[S.emptyState, { height: SCREEN_H }]}>
              <Text style={S.emptyEmoji}>🎬</Text>
              <Text style={S.emptyTitle}>No reels yet</Text>
              <Text style={S.emptySub}>Be the first to post a reel!</Text>
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/create" as any)}
                style={S.emptyBtn}
              >
                <Text style={S.emptyBtnText}>Create Reel →</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {/* ── Fixed top bar ───────────────────────────────────────────────── */}
      <View style={[S.topBar, { paddingTop: topPad + 6 }]} pointerEvents="box-none">
        {/* Following / For You tabs */}
        <View style={S.topTabs}>
          <TouchableOpacity onPress={() => switchTab("following")} style={S.topTabBtn}>
            <Text style={[S.topTabText, feedTab === "following" && S.topTabTextActive]}>Following</Text>
            {feedTab === "following" && <View style={S.topTabUnderline} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => switchTab("foryou")} style={S.topTabBtn}>
            <Text style={[S.topTabText, feedTab === "foryou" && S.topTabTextActive]}>For You</Text>
            {feedTab === "foryou" && <View style={S.topTabUnderline} />}
          </TouchableOpacity>
        </View>

        {/* Right icons */}
        <View style={S.topRight}>
          <TouchableOpacity onPress={() => router.push("/search")} style={S.topIconBtn}>
            <Ionicons name="search-outline" size={23} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSounds(true)} style={S.topIconBtn}>
            <Ionicons name="musical-notes" size={23} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
      <SoundsModal visible={showSounds} onClose={() => setShowSounds(false)} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  // reel
  reelContainer: { width: W, overflow: "hidden", backgroundColor: "#000" },
  topGrad: { position: "absolute", top: 0, left: 0, right: 0 },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0 },

  // overlays
  floatingHeart: { position: "absolute", alignSelf: "center", top: "38%" },
  pauseIndicator: { position: "absolute", alignSelf: "center", top: "42%" },
  slowMoBanner: {
    position: "absolute", top: "45%", alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, zIndex: 99,
  },
  slowMoText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },

  // top bar
  topBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    zIndex: 20,
  },
  topTabs: { flexDirection: "row", gap: 20 },
  topTabBtn: { alignItems: "center", paddingBottom: 2 },
  topTabText: { color: "rgba(255,255,255,0.55)", fontSize: 16, fontFamily: "Poppins_600SemiBold" },
  topTabTextActive: { color: "#fff", fontFamily: "Poppins_700Bold" },
  topTabUnderline: { width: "100%", height: 3, backgroundColor: "#8B5CF6", borderRadius: 2, marginTop: 3 },
  topRight: { flexDirection: "row", gap: 4 },
  topIconBtn: { padding: 6 },

  // right actions
  rightActions: {
    position: "absolute",
    right: 12,
    alignItems: "center",
    gap: 18,
  },
  actionBtn: {
    alignItems: "center",
    gap: 2,
  },
  actionIcon: {
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  actionCount: {
    color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold",
    textShadowColor: "rgba(0,0,0,0.85)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  musicDisc: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.4)",
    overflow: "hidden",
    position: "relative",
  },
  musicNote: {
    position: "absolute", bottom: 2, right: 2,
    backgroundColor: "#000", borderRadius: 6, padding: 1,
  },

  // bottom info — TikTok compact stack
  bottomInfo: {
    position: "absolute",
    left: 14,
    right: 70,
    gap: 2,   // tighter row spacing vs old 4
  },
  usernameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  username: {
    color: "#fff", fontSize: 14, fontFamily: "Poppins_700Bold",
    textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  caption: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 18 },
  moreText: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Poppins_500Medium" },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  soundMarqueeClip: { flex: 1, overflow: "hidden" },
  soundText: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "Poppins_500Medium", width: 600 },

  // sound toggle
  soundToggle: {
    position: "absolute",
    left: 14,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },

  // progress bar
  progressWrap: {
    position: "absolute",
    left: 0, right: 0,
    paddingHorizontal: 0,
  },
  progressTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#8B5CF6" },

  // empty state
  emptyState: { width: W, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { color: "#fff", fontSize: 22, fontFamily: "Poppins_700Bold" },
  emptySub: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "Poppins_400Regular" },
  emptyBtn: { backgroundColor: "#8B5CF6", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  emptyBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
});
