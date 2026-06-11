"use no memo";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ShareSheet } from "@/components/ShareSheet";
import type { PexelsVideo } from "@/components/PexelsVideoCard";

const { width: W, height: SCREEN_H } = Dimensions.get("window");

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export interface PexelsReel {
  kind: "pexels-reel";
  video: PexelsVideo;
}

interface Props {
  item: PexelsReel;
  isActive: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
}

export function PexelsReelItem({ item, isActive, soundOn, onToggleSound }: Props) {
  const { video } = item;
  const insets = useSafeAreaInsets();

  const [liked, setLiked] = useState(false);
  const [likeCount] = useState(() => Math.floor(Math.random() * 500_000) + 10_000);
  const [bookmarked, setBookmarked] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [paused, setPaused] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // Shared values
  const progress = useSharedValue(0);
  const heartScale = useSharedValue(0);
  const saveScale = useSharedValue(1);
  const pauseOpacity = useSharedValue(0);
  const marqueeX = useSharedValue(0);

  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel ALL animations on unmount to prevent dangling rafCallback worklet errors
  useEffect(() => {
    return () => {
      cancelAnimation(progress);
      cancelAnimation(heartScale);
      cancelAnimation(saveScale);
      cancelAnimation(pauseOpacity);
      cancelAnimation(marqueeX);
    };
  }, []);

  // Progress bar driven by video duration
  const durationMs = (video.duration > 0 ? video.duration : 20) * 1000;

  useEffect(() => {
    if (!isActive || paused) {
      cancelAnimation(progress);
      return;
    }
    progress.value = withTiming(1, { duration: durationMs, easing: Easing.linear });
    return () => cancelAnimation(progress);
  }, [isActive, paused, durationMs]);

  // Reset progress on active change
  useEffect(() => {
    if (!isActive) {
      cancelAnimation(progress);
      progress.value = 0;
    }
  }, [isActive]);

  // Marquee when active
  useEffect(() => {
    if (!isActive) { cancelAnimation(marqueeX); marqueeX.value = 0; return; }
    marqueeX.value = withRepeat(withTiming(-200, { duration: 9000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(marqueeX);
  }, [isActive]);

  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as any }));
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartScale.value > 0 ? 1 : 0,
  }));
  const saveStyle = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));
  const pauseStyle = useAnimatedStyle(() => ({ opacity: pauseOpacity.value }));
  const marqueeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: marqueeX.value }] }));

  const doLike = useCallback(() => {
    setLiked(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    heartScale.value = withSequence(withTiming(1.5, { duration: 150 }), withTiming(0, { duration: 600 }));
  }, []);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      doLike();
    } else {
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        setPaused((p) => {
          const next = !p;
          if (next) {
            pauseOpacity.value = withSequence(
              withTiming(1, { duration: 120 }),
              withTiming(0, { duration: 800, easing: Easing.out(Easing.quad) })
            );
          }
          return next;
        });
      }, 350);
    }
    lastTap.current = now;
  }, [doLike]);

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom + 56;
  const initial = (video.videographerName || "P").charAt(0).toUpperCase();
  const caption = `Shot by ${video.videographerName} · Pexels`;

  return (
    <Pressable style={[S.container, { height: SCREEN_H }]} onPress={handlePress}>
      {/* ── Background video ── */}
      {!videoError ? (
        <Video
          source={{ uri: video.videoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          isLooping
          isMuted={!soundOn}
          shouldPlay={isActive && !paused}
          useNativeControls={false}
          onError={() => setVideoError(true)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0F0F1A", alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="videocam-outline" size={48} color="rgba(255,255,255,0.2)" />
        </View>
      )}

      {/* gradients */}
      <LinearGradient
        colors={["rgba(0,0,0,0.55)", "transparent"]}
        style={[S.topGrad, { height: topPad + 100 }]}
      />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.92)"]}
        style={[S.bottomGrad, { height: bottomPad + 260 }]}
      />

      {/* floating heart on double-tap */}
      <Animated.View style={[S.floatingHeart, heartStyle]} pointerEvents="none">
        <Ionicons name="heart" size={100} color="rgba(255,255,255,0.92)" />
      </Animated.View>

      {/* pause indicator */}
      <Animated.View style={[S.pauseIndicator, pauseStyle]} pointerEvents="none">
        <Ionicons name={paused ? "pause" : "play"} size={64} color="rgba(255,255,255,0.7)" />
      </Animated.View>

      {/* ── Curated badge top-right ── */}
      <View style={[S.curatedBadge, { top: topPad + 10 }]}>
        <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.curatedGrad}>
          <Text style={S.curatedText}>✦ Curated</Text>
        </LinearGradient>
      </View>

      {/* ── Right actions ── */}
      <View style={[S.rightActions, { bottom: bottomPad + 8 }]}>
        {/* Creator avatar */}
        <View style={S.creatorAvatar}>
          <View style={[S.avatarCircle, { backgroundColor: "#7C3AED" }]}>
            <Text style={S.avatarInitial}>{initial}</Text>
          </View>
        </View>

        {/* Like */}
        <TouchableOpacity
          style={S.actionBtn}
          onPress={() => { setLiked((l) => !l); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Ionicons name={liked ? "heart" : "heart-outline"} size={30} color={liked ? "#F43F5E" : "#fff"} />
          <Text style={S.actionCount}>{fmt(liked ? likeCount + 1 : likeCount)}</Text>
        </TouchableOpacity>

        {/* Comment (display only — curated content) */}
        <TouchableOpacity style={S.actionBtn}>
          <Ionicons name="chatbubble-outline" size={28} color="#fff" />
          <Text style={S.actionCount}>{fmt(Math.floor(likeCount * 0.04))}</Text>
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity style={S.actionBtn} onPress={() => setShowShare(true)}>
          <Ionicons name="paper-plane-outline" size={26} color="#fff" />
          <Text style={S.actionCount}>Share</Text>
        </TouchableOpacity>

        {/* Bookmark */}
        <TouchableOpacity
          style={S.actionBtn}
          onPress={() => {
            setBookmarked((b) => !b);
            saveScale.value = withSequence(withSpring(1.3, { damping: 6 }), withSpring(1));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Animated.View style={saveStyle}>
            <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} size={26} color={bookmarked ? "#7C3AED" : "#fff"} />
          </Animated.View>
        </TouchableOpacity>

        {/* Pexels logo disc */}
        <View style={S.pexelsDisc}>
          <Ionicons name="aperture" size={20} color="#fff" />
        </View>
      </View>

      {/* ── Bottom info ── */}
      <View style={[S.bottomInfo, { bottom: bottomPad + 8 }]}>
        <Text style={S.username} numberOfLines={1}>@{video.videographerName.replace(/\s+/g, "").toLowerCase()}</Text>
        <TouchableOpacity activeOpacity={0.8} onPress={() => setCaptionExpanded((e) => !e)}>
          <Text style={S.caption} numberOfLines={captionExpanded ? undefined : 2}>{caption}</Text>
          {!captionExpanded && <Text style={S.moreText}>...more</Text>}
        </TouchableOpacity>
        {/* Sound marquee */}
        <View style={S.soundRow}>
          <Ionicons name="musical-notes" size={13} color="rgba(255,255,255,0.8)" />
          <View style={S.soundClip}>
            <Animated.Text style={[S.soundText, marqueeStyle]} numberOfLines={1}>
              Pexels Original · {video.videographerName} · Pexels Original ·{"  "}
            </Animated.Text>
          </View>
        </View>
      </View>

      {/* ── Sound toggle ── */}
      <TouchableOpacity style={[S.soundToggle, { bottom: bottomPad + 8 }]} onPress={onToggleSound}>
        <Ionicons name={soundOn ? "volume-high" : "volume-mute"} size={18} color="#fff" />
      </TouchableOpacity>

      {/* ── Progress bar ── */}
      <View style={[S.progressWrap, { bottom: Platform.OS === "web" ? 84 : insets.bottom }]}>
        <View style={S.progressTrack}>
          <Animated.View style={[S.progressFill, progressStyle]} />
        </View>
      </View>

      <ShareSheet
        visible={showShare}
        onClose={() => setShowShare(false)}
        contentType="reel"
        username={video.videographerName}
      />
    </Pressable>
  );
}

const S = StyleSheet.create({
  container: { width: W, overflow: "hidden", backgroundColor: "#000" },
  topGrad: { position: "absolute", top: 0, left: 0, right: 0 },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0 },
  floatingHeart: { position: "absolute", alignSelf: "center", top: "38%" },
  pauseIndicator: { position: "absolute", alignSelf: "center", top: "42%" },
  curatedBadge: { position: "absolute", right: 12 },
  curatedGrad: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  curatedText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
  rightActions: {
    position: "absolute",
    right: 10,
    alignItems: "center",
    gap: 20,
  },
  creatorAvatar: { alignItems: "center" },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#8B5CF6",
  },
  avatarInitial: { color: "#fff", fontSize: 18, fontFamily: "Poppins_700Bold" },
  pexelsDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  actionBtn: {
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  actionCount: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomInfo: { position: "absolute", left: 14, right: 70, gap: 4 },
  username: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  caption: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 19 },
  moreText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Poppins_500Medium" },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  soundClip: { flex: 1, overflow: "hidden" },
  soundText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Poppins_500Medium", width: 600 },
  soundToggle: {
    position: "absolute",
    left: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  progressWrap: { position: "absolute", left: 0, right: 0 },
  progressTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#8B5CF6" },
});
