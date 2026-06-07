import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { YouTubeCard, YouTubeVideo } from "@/components/YouTubeCard";

interface Props {
  title?: string;
  subtitle?: string;
  regionCode?: string;
  maxResults?: number;
  compact?: boolean;
  /** If true, show a full-bleed section header */
  showHeader?: boolean;
}

export function YouTubeFeedSection({
  title = "Trending on the Internet",
  subtitle = "Top YouTube videos right now",
  regionCode = "US",
  maxResults = 8,
  compact = false,
  showHeader = true,
}: Props) {
  const colors = useColors();
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
    fetch(
      `${apiUrl}/api/youtube/trending?regionCode=${regionCode}&maxResults=${maxResults}`
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ videos: YouTubeVideo[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setVideos(data.videos ?? []);
        setLoading(false);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }).start();
      })
      .catch((err) => {
        if (cancelled) return;
        setError("Could not load trending videos");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [regionCode, maxResults, retryCount]);

  if (!loading && error) {
    return (
      <View style={[styles.errorWrap, { backgroundColor: colors.muted ?? "#0F0F1A" }]}>
        <Ionicons name="wifi-outline" size={28} color="rgba(255,255,255,0.3)" />
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{error}</Text>
        <TouchableOpacity
          onPress={() => setRetryCount((c) => c + 1)}
          style={styles.retryBtn}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showHeader && (
        <View style={[styles.header, { borderTopColor: colors.border ?? "rgba(255,255,255,0.08)" }]}>
          <LinearGradient
            colors={["#FF0000", "#7C3AED"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentBar}
          />
          <View style={styles.headerText}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="logo-youtube" size={16} color="#FF0000" />
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
            </View>
            {subtitle ? (
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{subtitle}</Text>
            ) : null}
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          {[0, 1, 2].map((i) => (
            <SkeletonYTCard key={i} colors={colors} />
          ))}
        </View>
      ) : (
        <Animated.View style={{ opacity: fadeAnim }}>
          {videos.map((video) => (
            <YouTubeCard key={video.id} video={video} compact={compact} />
          ))}
          {videos.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={{ fontSize: 32 }}>📺</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No trending videos available
              </Text>
            </View>
          )}
          <View style={styles.footer}>
            <Ionicons name="logo-youtube" size={13} color="#FF0000" />
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
              Powered by YouTube · Trending in {regionCode}
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function SkeletonYTCard({ colors }: { colors: any }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] });

  return (
    <View style={[styles.skelCard, { backgroundColor: colors.muted ?? "#0F0F1A", borderColor: "rgba(255,255,255,0.06)" }]}>
      <Animated.View style={[styles.skelThumb, { opacity, backgroundColor: "rgba(255,255,255,0.12)" }]} />
      <View style={styles.skelInfo}>
        <Animated.View style={[styles.skelAvatar, { opacity, backgroundColor: "rgba(255,255,255,0.12)" }]} />
        <View style={{ flex: 1, gap: 6 }}>
          <Animated.View style={[styles.skelLine, { width: "88%", opacity, backgroundColor: "rgba(255,255,255,0.12)" }]} />
          <Animated.View style={[styles.skelLine, { width: "60%", opacity, backgroundColor: "rgba(255,255,255,0.08)" }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 8 },
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
  accentBar: { width: 3, height: 20, borderRadius: 2, flexShrink: 0 },
  headerText: { flex: 1 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 1 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,0,0,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,0,0,0.3)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FF0000" },
  liveText: { color: "#FF0000", fontSize: 9, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
  loadingWrap: { gap: 6, paddingHorizontal: 12, paddingTop: 4 },
  errorWrap: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 16,
  },
  errorText: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  retryBtn: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  emptyWrap: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 16,
    paddingBottom: 4,
  },
  footerText: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  // Skeleton styles
  skelCard: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  skelThumb: { width: "100%", height: 180, borderRadius: 0 },
  skelInfo: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12 },
  skelAvatar: { width: 34, height: 34, borderRadius: 17, flexShrink: 0 },
  skelLine: { height: 12, borderRadius: 6 },
});
