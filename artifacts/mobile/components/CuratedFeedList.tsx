"use no memo";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { PexelsCard, PexelsPhoto } from "@/components/PexelsCard";
import { YouTubeCard, YouTubeVideo } from "@/components/YouTubeCard";

type CuratedItem =
  | { kind: "photo"; data: PexelsPhoto; key: string }
  | { kind: "video"; data: YouTubeVideo; key: string };

function interleave(photos: PexelsPhoto[], videos: YouTubeVideo[]): CuratedItem[] {
  const items: CuratedItem[] = [];
  let pi = 0;
  let vi = 0;
  // Pattern: photo, photo, video, photo, photo, video, ...
  while (pi < photos.length || vi < videos.length) {
    for (let i = 0; i < 2 && pi < photos.length; i++, pi++) {
      items.push({ kind: "photo", data: photos[pi]!, key: `photo-${photos[pi]!.id}` });
    }
    if (vi < videos.length) {
      items.push({ kind: "video", data: videos[vi]!, key: `video-${videos[vi]!.id}` });
      vi++;
    }
  }
  return items;
}

interface Props {
  /** "empty" = replacing empty feed, "footer" = appended after real posts */
  mode: "empty" | "footer";
  maxPhotos?: number;
  maxVideos?: number;
}

export function CuratedFeedList({ mode, maxPhotos = 10, maxVideos = 5 }: Props) {
  const colors = useColors();
  const [photos, setPhotos] = useState<PexelsPhoto[]>([]);
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [errorPhotos, setErrorPhotos] = useState(false);
  const [errorVideos, setErrorVideos] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";

  useEffect(() => {
    let cancelled = false;
    setLoadingPhotos(true);
    setLoadingVideos(true);
    setErrorPhotos(false);
    setErrorVideos(false);
    fadeAnim.setValue(0);

    fetch(`${apiUrl}/api/pexels/trending?perPage=${maxPhotos}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ photos: PexelsPhoto[] }>;
      })
      .then((d) => {
        if (cancelled) return;
        setPhotos(d.photos ?? []);
        setLoadingPhotos(false);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorPhotos(true);
        setLoadingPhotos(false);
      });

    fetch(`${apiUrl}/api/youtube/trending?maxResults=${maxVideos}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ videos: YouTubeVideo[] }>;
      })
      .then((d) => {
        if (cancelled) return;
        setVideos(d.videos ?? []);
        setLoadingVideos(false);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorVideos(true);
        setLoadingVideos(false);
      });

    return () => { cancelled = true; };
  }, [maxPhotos, maxVideos, retryKey]);

  const loading = loadingPhotos || loadingVideos;

  useEffect(() => {
    if (!loading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }).start();
    }
  }, [loading]);

  const items = interleave(photos, videos);

  return (
    <View>
      {/* Section header */}
      <View style={[styles.header, { borderTopColor: colors.border ?? "rgba(255,255,255,0.08)" }]}>
        <LinearGradient
          colors={["#7C3AED", "#EC4899", "#FF0000"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accentBar}
        />
        <View style={styles.headerContent}>
          <View style={styles.titleRow}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              {mode === "empty" ? "Trending Worldwide" : "Trending on the Internet"}
            </Text>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {mode === "empty"
              ? "Top photos & videos while your feed warms up"
              : "Top photos & videos curated for you"}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.skeletons}>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} colors={colors} />)}
        </View>
      ) : (errorPhotos && errorVideos) ? (
        <View style={[styles.errorWrap, { backgroundColor: colors.muted ?? "#0F0F1A" }]}>
          <Ionicons name="wifi-outline" size={28} color="rgba(255,255,255,0.3)" />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            Couldn't load curated content
          </Text>
          <TouchableOpacity onPress={() => setRetryKey((k) => k + 1)} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.View style={{ opacity: fadeAnim }}>
          {items.map((item) =>
            item.kind === "photo" ? (
              <PexelsCard key={item.key} photo={item.data} />
            ) : (
              <YouTubeCard key={item.key} video={item.data} />
            )
          )}
          {items.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={{ fontSize: 32 }}>✨</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No curated content right now
              </Text>
            </View>
          )}
          {/* Footer attribution */}
          <View style={styles.attribution}>
            <View style={styles.attrRow}>
              <Ionicons name="aperture-outline" size={12} color="rgba(255,255,255,0.3)" />
              <Text style={[styles.attrText, { color: colors.mutedForeground }]}>
                Photos by Pexels
              </Text>
              <Text style={[styles.attrDot, { color: colors.mutedForeground }]}>·</Text>
              <Ionicons name="logo-youtube" size={12} color="#FF0000" />
              <Text style={[styles.attrText, { color: colors.mutedForeground }]}>
                Videos by YouTube
              </Text>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function SkeletonCard({ colors }: { colors: any }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 850, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.45] });
  const bg = "rgba(255,255,255,0.12)";

  return (
    <View
      style={[
        styles.skelCard,
        { backgroundColor: colors.card ?? "#0F0F1A", borderColor: "rgba(255,255,255,0.06)" },
      ]}
    >
      {/* Header row */}
      <View style={styles.skelHeader}>
        <Animated.View style={[styles.skelAvatar, { opacity, backgroundColor: bg }]} />
        <View style={{ flex: 1, gap: 6 }}>
          <Animated.View style={[styles.skelLine, { width: "55%", opacity, backgroundColor: bg }]} />
          <Animated.View style={[styles.skelLine, { width: "35%", opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.35] }), backgroundColor: bg }]} />
        </View>
      </View>
      {/* Image placeholder */}
      <Animated.View style={[styles.skelImage, { opacity, backgroundColor: bg }]} />
      {/* Actions row */}
      <View style={styles.skelActions}>
        {[0, 1, 2].map((i) => (
          <Animated.View key={i} style={[styles.skelActionBtn, { opacity, backgroundColor: bg }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 22,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  accentBar: { width: 3, height: 22, borderRadius: 2, flexShrink: 0 },
  headerContent: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(124,58,237,0.18)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.35)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#7C3AED" },
  liveText: { color: "#8B5CF6", fontSize: 9, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
  headerSub: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 2 },
  // Loading skeletons
  skeletons: { paddingTop: 4 },
  skelCard: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
  },
  skelHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  skelAvatar: { width: 42, height: 42, borderRadius: 21, flexShrink: 0 },
  skelLine: { height: 12, borderRadius: 6 },
  skelImage: { height: 220, marginHorizontal: 0 },
  skelActions: { flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingTop: 10 },
  skelActionBtn: { width: 32, height: 14, borderRadius: 7 },
  // Error
  errorWrap: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 16,
  },
  errorText: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  retryBtn: { backgroundColor: "#7C3AED", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10 },
  retryText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  // Empty
  emptyWrap: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  // Attribution footer
  attribution: { paddingVertical: 16, alignItems: "center" },
  attrRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  attrText: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  attrDot: { fontSize: 11 },
});
