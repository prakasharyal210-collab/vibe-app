"use no memo";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  videographerName: string;
  videographerUrl: string;
  thumbnailUrl: string;
  videoUrl: string;
  avgColor: string;
}

interface Props {
  video: PexelsVideo;
}

const { width: W } = Dimensions.get("window");
const VIDEO_H = Math.round(W * 0.5625); // 16:9

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function PexelsVideoCard({ video }: Props) {
  const colors = useColors();
  const viewRef = useRef<View>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount] = useState(() => Math.floor(Math.random() * 60_000) + 1_200);
  const [commentCount] = useState(() => Math.floor(Math.random() * 8_000) + 150);
  const [error, setError] = useState(false);

  // Scroll-based visibility detection using native measure()
  useEffect(() => {
    if (Platform.OS === "web") {
      setIsVisible(true);
      return;
    }
    const id = setInterval(() => {
      if (!viewRef.current) return;
      viewRef.current.measure((_x, _y, _w, h, _px, py) => {
        const sh = Dimensions.get("window").height;
        setIsVisible(py < sh * 0.76 && py + h > sh * 0.24);
      });
    }, 350);
    return () => clearInterval(id);
  }, []);

  const initial = (video.videographerName || "V").charAt(0).toUpperCase();

  return (
    <View
      ref={viewRef}
      style={[
        styles.card,
        { backgroundColor: colors.card ?? "#0F0F1A", borderColor: "rgba(255,255,255,0.06)" },
      ]}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: "#7C3AED" }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.authorName, { color: colors.foreground }]} numberOfLines={1}>
            {video.videographerName}
          </Text>
          <Text style={[styles.authorSub, { color: colors.mutedForeground }]}>
            Videographer · Pexels
          </Text>
        </View>
        <View style={styles.featuredBadge}>
          <Ionicons name="star" size={10} color="#7C3AED" />
          <Text style={styles.featuredText}>Featured</Text>
        </View>
      </View>

      {/* ── Video ── */}
      <View style={styles.videoWrap}>
        {!error ? (
          <Video
            source={{ uri: video.videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            isLooping
            isMuted={muted}
            shouldPlay={isVisible}
            useNativeControls={false}
            onError={() => setError(true)}
          />
        ) : (
          <View style={[styles.video, { backgroundColor: video.avgColor ?? "#111", alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="videocam-outline" size={32} color="rgba(255,255,255,0.3)" />
          </View>
        )}

        {/* bottom gradient */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.4)"]}
          style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
        />

        {/* duration badge */}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{fmtDuration(video.duration)}</Text>
        </View>

        {/* mute toggle */}
        <TouchableOpacity style={styles.muteBtn} onPress={() => setMuted((m) => !m)}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setLiked((l) => !l)}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={22}
            color={liked ? "#F43F5E" : (colors.mutedForeground ?? "#888")}
          />
          <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>
            {fmt(liked ? likeCount + 1 : likeCount)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={21} color={colors.mutedForeground ?? "#888"} />
          <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>{fmt(commentCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="paper-plane-outline" size={21} color={colors.mutedForeground ?? "#888"} />
          <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>Share</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <View style={styles.pexelsAttr}>
          <Ionicons name="aperture-outline" size={11} color="rgba(255,255,255,0.3)" />
          <Text style={styles.pexelsAttrText}>Pexels</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: { color: "#fff", fontSize: 16, fontFamily: "Poppins_700Bold" },
  authorName: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  authorSub: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 1 },
  featuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(124,58,237,0.15)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.3)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  featuredText: { color: "#8B5CF6", fontSize: 10, fontFamily: "Poppins_600SemiBold" },
  videoWrap: { width: "100%", height: VIDEO_H, backgroundColor: "#000" },
  video: { width: "100%", height: VIDEO_H },
  durationBadge: {
    position: "absolute",
    bottom: 8,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  durationText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
  muteBtn: {
    position: "absolute",
    bottom: 8,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 6, paddingVertical: 4 },
  actionLabel: { fontSize: 13, fontFamily: "Poppins_500Medium" },
  pexelsAttr: { flexDirection: "row", alignItems: "center", gap: 4 },
  pexelsAttrText: { color: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Poppins_400Regular" },
});
