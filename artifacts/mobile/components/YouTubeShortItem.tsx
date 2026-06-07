"use no memo";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
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
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { YouTubeVideo } from "@/components/YouTubeCard";

const { height: SCREEN_H } = Dimensions.get("window");

function fmt(n: string | number): string {
  const num = typeof n === "string" ? parseInt(n, 10) : n;
  if (isNaN(num)) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

export interface YouTubeShort {
  kind: "youtube-short";
  video: YouTubeVideo;
}

interface Props {
  item: YouTubeShort;
  isActive: boolean;
}

export function YouTubeShortItem({ item, isActive }: Props) {
  const { video } = item;
  const insets = useSafeAreaInsets();
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  // Fake progress bar (shimmer while "playing")
  const progress = useSharedValue(0);
  const marqueeX = useSharedValue(0);

  useEffect(() => {
    if (!isActive) {
      cancelAnimation(progress);
      progress.value = 0;
      cancelAnimation(marqueeX);
      marqueeX.value = 0;
      return;
    }
    // Animate progress across 30s (short video avg)
    progress.value = withTiming(1, { duration: 30000, easing: Easing.linear });
    marqueeX.value = withRepeat(
      withTiming(-200, { duration: 9000, easing: Easing.linear }),
      -1,
      false
    );
    return () => {
      cancelAnimation(progress);
      cancelAnimation(marqueeX);
    };
  }, [isActive]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as any,
  }));
  const marqueeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: marqueeX.value }],
  }));

  const openVideo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    WebBrowser.openBrowserAsync(`https://www.youtube.com/shorts/${video.id}`, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      toolbarColor: "#000000",
      controlsColor: "#FF0000",
    });
  };

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom + 56;

  return (
    <Pressable style={[S.container, { height: SCREEN_H }]} onPress={openVideo}>
      {/* Background thumbnail */}
      <Image
        source={{ uri: video.thumbnailUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
        priority={isActive ? "high" : "normal"}
      />

      {/* Dark overlays */}
      <LinearGradient
        colors={["rgba(0,0,0,0.6)", "transparent"]}
        style={[S.topGrad, { height: topPad + 100 }]}
      />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.92)"]}
        style={[S.bottomGrad, { height: bottomPad + 260 }]}
      />

      {/* YouTube Shorts badge — top left */}
      <View style={[S.ytShortsBadge, { top: topPad + 12 }]}>
        <Ionicons name="logo-youtube" size={16} color="#FF0000" />
        <Text style={S.ytShortsText}>Shorts</Text>
      </View>

      {/* Curated badge — top right */}
      <LinearGradient
        colors={["rgba(124,58,237,0.85)", "rgba(236,72,153,0.85)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[S.curatedBadge, { top: topPad + 12 }]}
      >
        <Text style={S.curatedText}>✦ Curated</Text>
      </LinearGradient>

      {/* Center play button */}
      <View style={S.playCenter} pointerEvents="none">
        <LinearGradient
          colors={["rgba(255,0,0,0.9)", "rgba(180,0,0,0.9)"]}
          style={S.playCircle}
        >
          <Ionicons name="play" size={32} color="#fff" style={{ paddingLeft: 4 }} />
        </LinearGradient>
        <Text style={S.tapToWatch}>Tap to watch</Text>
      </View>

      {/* Right actions */}
      <View style={[S.rightActions, { bottom: bottomPad + 8 }]}>
        {/* Channel avatar */}
        <View style={S.channelAvatar}>
          <Text style={S.channelInitial}>
            {video.channelTitle.charAt(0).toUpperCase()}
          </Text>
          <View style={S.followDot}>
            <Ionicons name="logo-youtube" size={9} color="#FF0000" />
          </View>
        </View>

        {/* Like */}
        <TouchableOpacity
          style={S.actionBtn}
          onPress={() => {
            setLiked((v) => !v);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={32}
            color={liked ? "#F43F5E" : "#fff"}
          />
          <Text style={S.actionCount}>{fmt(liked ? parseInt(video.likeCount) + 1 : video.likeCount)}</Text>
        </TouchableOpacity>

        {/* Comment (opens video) */}
        <TouchableOpacity style={S.actionBtn} onPress={openVideo}>
          <Ionicons name="chatbubble-outline" size={30} color="#fff" />
          <Text style={S.actionCount}>{fmt(parseInt(video.viewCount) / 100 | 0)}</Text>
        </TouchableOpacity>

        {/* Share (opens video) */}
        <TouchableOpacity style={S.actionBtn} onPress={openVideo}>
          <Ionicons name="paper-plane-outline" size={28} color="#fff" />
          <Text style={S.actionCount}>Share</Text>
        </TouchableOpacity>

        {/* Bookmark */}
        <TouchableOpacity
          style={S.actionBtn}
          onPress={() => {
            setBookmarked((b) => !b);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Ionicons
            name={bookmarked ? "bookmark" : "bookmark-outline"}
            size={28}
            color={bookmarked ? "#7C3AED" : "#fff"}
          />
        </TouchableOpacity>

        {/* Music disc */}
        <View style={S.musicDisc}>
          <View style={S.musicDiscInner}>
            <Ionicons name="musical-note" size={14} color="#fff" />
          </View>
          <View style={S.musicNote}>
            <Ionicons name="logo-youtube" size={8} color="#FF0000" />
          </View>
        </View>
      </View>

      {/* Bottom info */}
      <View style={[S.bottomInfo, { bottom: bottomPad + 8 }]}>
        <View style={S.usernameRow}>
          <Ionicons name="logo-youtube" size={13} color="#FF0000" />
          <Text style={S.username}>@{video.channelTitle.toLowerCase().replace(/\s+/g, "")}</Text>
        </View>

        <TouchableOpacity activeOpacity={0.8} onPress={() => setCaptionExpanded((e) => !e)}>
          <Text style={S.caption} numberOfLines={captionExpanded ? undefined : 2}>
            {video.title}
          </Text>
          {!captionExpanded && <Text style={S.moreText}>...more</Text>}
        </TouchableOpacity>

        {/* Sound row */}
        <View style={S.soundRow}>
          <Ionicons name="musical-notes" size={13} color="rgba(255,255,255,0.8)" />
          <View style={S.soundMarqueeClip}>
            <Animated.Text style={[S.soundText, marqueeStyle]} numberOfLines={1}>
              {video.channelTitle} · Original Audio · {video.channelTitle} · Original Audio ·{"  "}
            </Animated.Text>
          </View>
        </View>

        {/* Views */}
        <View style={S.viewsRow}>
          <Text style={S.viewsText}>👁️ {fmt(video.viewCount)} views</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[S.progressWrap, { bottom: Platform.OS === "web" ? 84 : insets.bottom }]}>
        <View style={S.progressTrack}>
          <Animated.View style={[S.progressFill, progressStyle]} />
        </View>
      </View>
    </Pressable>
  );
}

const S = StyleSheet.create({
  container: { width: "100%", backgroundColor: "#000" },
  topGrad: { position: "absolute", top: 0, left: 0, right: 0 },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0 },
  ytShortsBadge: {
    position: "absolute",
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,0,0,0.35)",
  },
  ytShortsText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_700Bold" },
  curatedBadge: {
    position: "absolute",
    right: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  curatedText: { color: "#fff", fontSize: 10, fontFamily: "Poppins_700Bold", letterSpacing: 0.3 },
  playCenter: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  playCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF0000",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  tapToWatch: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.3,
  },
  rightActions: {
    position: "absolute",
    right: 12,
    alignItems: "center",
    gap: 18,
  },
  channelAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FF0000",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  channelInitial: { color: "#fff", fontSize: 18, fontFamily: "Poppins_700Bold" },
  followDot: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FF0000",
  },
  actionBtn: { alignItems: "center", gap: 3 },
  actionCount: { color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  musicDisc: { position: "relative", width: 42, height: 42 },
  musicDiscInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#222",
    borderWidth: 6,
    borderColor: "#444",
    alignItems: "center",
    justifyContent: "center",
  },
  musicNote: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomInfo: { position: "absolute", left: 14, right: 80, gap: 4 },
  usernameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  username: { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
  caption: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 19 },
  moreText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Poppins_400Regular" },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  soundMarqueeClip: { overflow: "hidden", flex: 1 },
  soundText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Poppins_500Medium" },
  viewsRow: { marginTop: 2 },
  viewsText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Poppins_400Regular" },
  progressWrap: { position: "absolute", left: 0, right: 0, height: 2 },
  progressTrack: { height: 2, backgroundColor: "rgba(255,255,255,0.25)", width: "100%" },
  progressFill: { height: 2, backgroundColor: "#FF0000" },
});
