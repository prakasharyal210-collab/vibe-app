import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

const { width: W } = Dimensions.get("window");

export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  viewCount: string;
  likeCount: string;
  publishedAt: string;
  description: string;
  duration: string;
}

function formatCount(n: string | number): string {
  const num = typeof n === "string" ? parseInt(n, 10) : n;
  if (isNaN(num)) return "0";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return String(num);
}

function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "";
  const h = parseInt(match[1] ?? "0");
  const m = parseInt(match[2] ?? "0");
  const s = parseInt(match[3] ?? "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeAgoShort(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`;
  return `${Math.floor(diff / 31536000)}y`;
}

interface Props {
  video: YouTubeVideo;
  compact?: boolean;
}

export function YouTubeCard({ video, compact = false }: Props) {
  const colors = useColors();
  const [pressed, setPressed] = useState(false);

  const openVideo = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await WebBrowser.openBrowserAsync(`https://www.youtube.com/watch?v=${video.id}`, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      toolbarColor: "#0F0F1A",
      controlsColor: "#7C3AED",
    });
  };

  const thumbH = compact ? (W - 32) * 0.42 : (W - 24) * 0.5625;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={openVideo}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.card,
        { backgroundColor: colors.card ?? "#0F0F1A", borderColor: "rgba(255,255,255,0.07)" },
        pressed && { opacity: 0.88 },
        compact && styles.cardCompact,
      ]}
    >
      {/* Thumbnail */}
      <View style={[styles.thumbWrap, { height: thumbH }]}>
        {video.thumbnailUrl ? (
          <Image
            source={{ uri: video.thumbnailUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="play-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
          </View>
        )}

        {/* Dark gradient overlay bottom */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.7)"]}
          style={styles.thumbGrad}
          pointerEvents="none"
        />

        {/* Duration badge */}
        {video.duration && video.duration !== "PT0S" && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{parseDuration(video.duration)}</Text>
          </View>
        )}

        {/* Play button */}
        <View style={styles.playBtn}>
          <LinearGradient
            colors={["rgba(255,0,0,0.85)", "rgba(180,0,0,0.85)"]}
            style={styles.playGrad}
          >
            <Ionicons name="play" size={18} color="#fff" />
          </LinearGradient>
        </View>

        {/* Trending badge */}
        <View style={styles.trendingBadge}>
          <LinearGradient
            colors={["#FF0000", "#CC0000"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.trendingGrad}
          >
            <Text style={styles.trendingText}>🔥 Trending</Text>
          </LinearGradient>
        </View>

        {/* YouTube watermark */}
        <View style={styles.ytBadge}>
          <Ionicons name="logo-youtube" size={14} color="#FF0000" />
          <Text style={styles.ytBadgeText}>YouTube</Text>
        </View>
      </View>

      {/* Info row */}
      <View style={styles.info}>
        <View style={styles.channelAvatar}>
          <Text style={styles.channelAvatarLetter}>
            {video.channelTitle.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
            {video.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.channel, { color: colors.mutedForeground }]} numberOfLines={1}>
              {video.channelTitle}
            </Text>
            <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              {formatCount(video.viewCount)} views
            </Text>
            <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              {timeAgoShort(video.publishedAt)}
            </Text>
          </View>
        </View>

        <View style={styles.likeRow}>
          <Ionicons name="thumbs-up-outline" size={13} color={colors.mutedForeground} />
          <Text style={[styles.likeCount, { color: colors.mutedForeground }]}>
            {formatCount(video.likeCount)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardCompact: {
    marginHorizontal: 0,
    marginVertical: 0,
    borderRadius: 12,
  },
  thumbWrap: {
    width: "100%",
    position: "relative",
    backgroundColor: "#111",
  },
  thumbGrad: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "50%",
  },
  durationBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.82)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
  },
  playBtn: {
    position: "absolute",
    bottom: "50%",
    alignSelf: "center",
    transform: [{ translateY: 22 }],
  },
  playGrad: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 3,
  },
  trendingBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    borderRadius: 8,
    overflow: "hidden",
  },
  trendingGrad: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  trendingText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 0.3,
  },
  ytBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ytBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
  },
  info: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    paddingTop: 10,
  },
  channelAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FF0000",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  channelAvatarLetter: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Poppins_700Bold",
  },
  textBlock: { flex: 1 },
  title: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 18,
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 3,
  },
  channel: { fontSize: 11, fontFamily: "Poppins_500Medium", maxWidth: 100 },
  dot: { fontSize: 11 },
  meta: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  likeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingTop: 2,
    flexShrink: 0,
  },
  likeCount: { fontSize: 11, fontFamily: "Poppins_500Medium" },
});
