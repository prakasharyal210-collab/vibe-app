import { Ionicons } from "@expo/vector-icons";
import { RelationshipStatusBadge } from "@/components/RelationshipStatusBadge";
import { ZodiacSignBadge } from "@/components/ZodiacSignBadge";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import * as VideoThumbnails from "expo-video-thumbnails";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMainTabSwipe } from "@/hooks/useMainTabSwipe";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RAnimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { GradientButton } from "@/components/GradientButton";
import { LoginPrompt } from "@/components/LoginPrompt";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { fetchProfilePosts, getProfileStats, ProfileGridItem, fetchHighlights, createHighlight, deleteHighlight, togglePinPost, StoryHighlight } from "@/lib/db";
import { useProfileRealtime } from "@/context/RealtimeContext";
import { useColors } from "@/hooks/useColors";
import { Profile, supabase } from "@/lib/supabase";
import { HighlightViewer, Highlight } from "@/components/HighlightViewer";
import { BASE_URL, shareContent } from "@/lib/share";

const { width: W, height: H } = Dimensions.get("window");
const GRID_ITEM = (W - 3) / 3;

const MOCK_GRID = Array.from({ length: 9 }, (_, i) => ({
  id: String(i),
  image_url: `https://picsum.photos/seed/grid${i + 10}/400/400`,
  isReel: i % 3 === 2,
  likes: [8200, 4500, 12300, 1800, 33400, 5600, 9100, 2700, 15800][i],
  comments: [120, 54, 340, 23, 890, 67, 145, 34, 420][i],
  caption: ["Golden hour vibes 🌅", "City nights 🌃", "Dancing in the rain ☔", "Sunday feels ☕", "New adventures await ✨", "Behind the lens 📸", "Art is everywhere 🎨", "Music is life 🎵", "Living my best life 💜"][i],
}));

const MOCK_REELS_GRID = Array.from({ length: 6 }, (_, i) => ({
  id: String(i),
  image_url: `https://picsum.photos/seed/reel${i + 20}/300/400`,
  isReel: true,
  likes: [22400, 8900, 44100, 6700, 31200, 17800][i],
  comments: [560, 220, 1200, 180, 840, 430][i],
  caption: ["Dance challenge 🔥", "POV: golden hour", "Aesthetic travel ✈️", "Gym motivation 💪", "Sunset drive 🚗", "Vibes only 💜"][i],
}));


const MOCK_PROFILE: Profile = {
  id: "me",
  username: "your_vibe",
  bio: "Living, laughing, vibing ✨",
  followers_count: 0,
  following_count: 0,
  posts_count: 0,
};

interface GridItem {
  id: string;
  image_url: string;
  media_url?: string;
  isReel?: boolean;
  is_video?: boolean;
  likes?: number;
  comments?: number;
  caption?: string;
  duration?: number;
  video_url?: string;
  created_at?: string;
  visibility?: string;
}

function isVideoUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0] ?? "";
  return u.endsWith(".mp4") || u.endsWith(".mov") || u.endsWith(".webm") || u.endsWith(".m4v");
}

function VideoGridCell({ videoUri, style }: { videoUri: string; style: any }) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(videoUri, { time: 0 })
      .then(({ uri }) => { if (!cancelled) setThumbUri(uri); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [videoUri]);
  if (thumbUri) return <Image source={{ uri: thumbUri }} style={style} resizeMode="cover" />;
  return (
    <View style={[style, { backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" }]}>
      <ActivityIndicator color="#A78BFA" size="small" />
    </View>
  );
}

function formatCount(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function VideoItem({ item, isActive }: { item: GridItem; isActive: boolean }) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [posSecs, setPosSecs] = useState(0);
  const [durSecs, setDurSecs] = useState(0);
  const [ended, setEnded] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const trackWidthRef = useRef(1);

  useEffect(() => {
    if (!isActive) {
      videoRef.current?.pauseAsync().catch(() => {});
    }
  }, [isActive]);

  const onStatus = (status: any) => {
    if (!status.isLoaded) return;
    setPosSecs(status.positionMillis / 1000);
    if (status.durationMillis) setDurSecs(status.durationMillis / 1000);
    setIsPlaying(status.isPlaying);
    setBuffering(status.isBuffering ?? false);
    if (status.didJustFinish) {
      setEnded(true);
      setIsPlaying(false);
    }
  };

  const togglePlay = async () => {
    if (ended) {
      await videoRef.current?.setPositionAsync(0);
      setPosSecs(0);
      setEnded(false);
    }
    if (isPlaying) {
      await videoRef.current?.pauseAsync();
    } else {
      await videoRef.current?.playAsync();
    }
  };

  const seekTo = (x: number) => {
    if (durSecs === 0) return;
    const frac = Math.max(0, Math.min(1, x / trackWidthRef.current));
    const ms = frac * durSecs * 1000;
    videoRef.current?.setPositionAsync(ms);
    setPosSecs(frac * durSecs);
    setEnded(false);
  };

  const seekPR = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: (e) => seekTo(e.nativeEvent.locationX),
    onPanResponderMove: (e) => seekTo(e.nativeEvent.locationX),
  });

  const progress = durSecs > 0 ? Math.min(1, posSecs / durSecs) : 0;
  const pct = `${Math.min(99.5, progress * 100)}%` as any;

  return (
    <View style={{ width: W, alignItems: "center", justifyContent: "center" }}>
      <Video
        ref={videoRef}
        source={{ uri: item.media_url ?? item.image_url }}
        style={pvStyles.photo}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls={false}
        isLooping={false}
        onPlaybackStatusUpdate={onStatus}
      />
      {buffering && !isPlaying && (
        <ActivityIndicator color="#7C3AED" size="large" style={StyleSheet.absoluteFill as any} />
      )}
      <View style={pvStyles.videoControls}>
        {/* Seek bar */}
        <View
          style={pvStyles.seekTrack}
          onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
          {...seekPR.panHandlers}
        >
          <View style={pvStyles.seekBg} />
          <View style={[pvStyles.seekFill, { width: `${progress * 100}%` as any }]} />
          <View style={[pvStyles.seekThumb, { left: pct }]} />
        </View>
        {/* Time labels */}
        <View style={pvStyles.timeRow}>
          <Text style={pvStyles.timeText}>{fmtTime(posSecs)}</Text>
          <Text style={pvStyles.timeText}>{fmtTime(durSecs)}</Text>
        </View>
        {/* Rewind / Play-Pause / Fast-Forward */}
        <View style={pvStyles.ctrlRow}>
          <TouchableOpacity
            onPress={() => {
              const ms = Math.max(0, (posSecs - 10) * 1000);
              videoRef.current?.setPositionAsync(ms);
              setPosSecs(ms / 1000);
              setEnded(false);
            }}
            style={pvStyles.ctrlBtn}
          >
            <Ionicons name="play-back" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={togglePlay} style={pvStyles.playPauseBtn}>
            <Ionicons
              name={ended ? "reload-circle" : isPlaying ? "pause" : "play"}
              size={36}
              color="#fff"
              style={(!isPlaying || ended) && !ended ? { marginLeft: 3 } : undefined}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const ms = Math.min(durSecs * 1000, (posSecs + 10) * 1000);
              videoRef.current?.setPositionAsync(ms);
              setPosSecs(ms / 1000);
            }}
            style={pvStyles.ctrlBtn}
          >
            <Ionicons name="play-forward" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function PhotoViewer({
  photos,
  initialIndex,
  onClose,
}: {
  photos: GridItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [idx, setIdx] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * W, animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, [initialIndex]);

  const photo = photos[idx];

  const go = (newIdx: number) => {
    if (newIdx < 0 || newIdx >= photos.length) return;
    scrollRef.current?.scrollTo({ x: newIdx * W, animated: true });
    setIdx(newIdx);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[pvStyles.container]}>
        {/* Top bar */}
        <View style={[pvStyles.topBar, { paddingTop: topPad + 8 }]}>
          <TouchableOpacity onPress={onClose} style={pvStyles.topBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={pvStyles.counter}>{idx + 1} / {photos.length}</Text>
          <TouchableOpacity style={pvStyles.topBtn} onPress={() => Alert.alert("Share", "Share this post")}>
            <Ionicons name="share" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Photo / Video carousel */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            setIdx(Math.round(e.nativeEvent.contentOffset.x / W));
          }}
          style={{ flex: 1 }}
        >
          {photos.map((p, i) => (
            <View key={p.id} style={pvStyles.photoWrap}>
              {(p.is_video || p.isReel) && (p.video_url || (p.is_video && p.image_url)) ? (
                <VideoItem item={p} isActive={idx === i} />
              ) : (
                <Image source={{ uri: p.image_url }} style={pvStyles.photo} resizeMode="contain" />
              )}
            </View>
          ))}
        </ScrollView>

        {/* Left/right arrows */}
        {idx > 0 && (
          <TouchableOpacity style={[pvStyles.arrow, pvStyles.arrowLeft]} onPress={() => go(idx - 1)}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
        )}
        {idx < photos.length - 1 && (
          <TouchableOpacity style={[pvStyles.arrow, pvStyles.arrowRight]} onPress={() => go(idx + 1)}>
            <Ionicons name="chevron-forward" size={26} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Info panel */}
        <View style={pvStyles.infoPanel}>
          {photo?.isReel && (
            <View style={pvStyles.reelBadge}>
              <Ionicons name="play-circle" size={14} color="#fff" />
              <Text style={pvStyles.reelBadgeText}>Reel</Text>
            </View>
          )}
          <View style={pvStyles.actionRow}>
            <TouchableOpacity style={pvStyles.actionItem}>
              <Ionicons name="heart" size={24} color="rgba(255,255,255,0.75)" />
              <Text style={pvStyles.actionCount}>{formatCount(photo?.likes ?? 0)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pvStyles.actionItem}>
              <Ionicons name="chatbubble" size={22} color="#fff" />
              <Text style={pvStyles.actionCount}>{formatCount(photo?.comments ?? 0)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pvStyles.actionItem}>
              <Ionicons name="paper-plane" size={22} color="#fff" />
              <Text style={pvStyles.actionCount}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pvStyles.actionItem}>
              <Ionicons name="bookmark" size={22} color="#fff" />
              <Text style={pvStyles.actionCount}>Save</Text>
            </TouchableOpacity>
          </View>
          {photo?.caption && (
            <Text style={pvStyles.caption} numberOfLines={3}>{photo.caption}</Text>
          )}

          {/* Dot indicators */}
          {photos.length > 1 && (
            <View style={pvStyles.dots}>
              {photos.map((_, i) => (
                <TouchableOpacity key={i} onPress={() => go(i)}>
                  <View style={[pvStyles.dot, i === idx && pvStyles.dotActive]} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const pvStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(0,0,0,0.97)" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, zIndex: 10 },
  topBtn: { padding: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 20 },
  counter: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  photoWrap: { width: W, justifyContent: "center", alignItems: "center" },
  photo: { width: W, height: H * 0.58 },
  arrow: { position: "absolute", top: "48%", backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 24, padding: 10, zIndex: 10 },
  arrowLeft: { left: 10 },
  arrowRight: { right: 10 },
  infoPanel: { backgroundColor: "rgba(0,0,0,0.85)", padding: 18, paddingBottom: 36, gap: 12 },
  reelBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#8B5CF6", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: "flex-start" },
  reelBadgeText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  actionRow: { flexDirection: "row", gap: 24 },
  actionItem: { alignItems: "center", gap: 4 },
  actionCount: { color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 12 },
  caption: { color: "rgba(255,255,255,0.88)", fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 20 },
  dots: { flexDirection: "row", gap: 6, alignSelf: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)" },
  dotActive: { backgroundColor: "#8B5CF6", width: 16 },
  videoControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    gap: 6,
  },
  seekTrack: { height: 22, justifyContent: "center", position: "relative" },
  seekBg: { position: "absolute", left: 0, right: 0, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)" },
  seekFill: { position: "absolute", left: 0, height: 3, borderRadius: 2, backgroundColor: "#7C3AED" },
  seekThumb: { position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: "#fff", top: "50%", marginTop: -7, marginLeft: -7 },
  timeRow: { flexDirection: "row", justifyContent: "space-between" },
  timeText: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontFamily: "Poppins_500Medium" },
  ctrlRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 32, marginTop: 2 },
  ctrlBtn: { padding: 6 },
  playPauseBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(124,58,237,0.75)", alignItems: "center", justifyContent: "center" },
});

function SkeletonGrid() {
  const pulse = useSharedValue(0.35);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.75, { duration: 850 }),
        withTiming(0.35, { duration: 850 })
      ),
      -1,
      false
    );
    return () => cancelAnimation(pulse);
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View>
      {[0, 3, 6].map((row) => (
        <View key={row} style={{ flexDirection: "row", gap: 1.5, marginBottom: 1.5 }}>
          {[0, 1, 2].map((col) => (
            <RAnimated.View
              key={col}
              style={[{ width: GRID_ITEM, height: GRID_ITEM, backgroundColor: "#2D1B69" }, pulseStyle]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function EmptyGrid({ onCreatePost }: { onCreatePost: () => void }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: "center", paddingTop: 56, paddingHorizontal: 40, gap: 14 }}>
      <LinearGradient
        colors={["rgba(139,92,246,0.2)", "rgba(236,72,153,0.08)"]}
        style={{ width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name="camera-outline" size={38} color="#8B5CF6" />
      </LinearGradient>
      <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Poppins_700Bold", textAlign: "center" }}>
        Share your first moment
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 20 }}>
        Your photos and videos will appear here
      </Text>
      <TouchableOpacity onPress={onCreatePost} style={{ borderRadius: 14, overflow: "hidden", marginTop: 4 }}>
        <LinearGradient colors={["#8B5CF6", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 30, paddingVertical: 14 }}>
          <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" }}>Create Post</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

function StatBlock({ label, value, onPress }: { label: string; value: number | string; onPress?: () => void }) {
  const colors = useColors();
  const inner = (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>
        {typeof value === "number" && value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  }
  return inner;
}

function GuestProfile() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  return (
    <View style={[styles.guestContainer, { paddingTop: topInset + 40 }]}>
      <View style={[styles.guestAvatar, { backgroundColor: colors.muted }]}>
        <Ionicons name="person" size={48} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.guestTitle, { color: colors.foreground }]}>Your Profile</Text>
      <Text style={[styles.guestSub, { color: colors.mutedForeground }]}>Sign in to see your posts, followers, and messages</Text>
      <GradientButton onPress={() => router.push("/(auth)/login")} title="Sign In" style={{ width: "80%" }} />
      <TouchableOpacity onPress={() => router.push("/(auth)/signup")}>
        <Text style={{ color: "#8B5CF6", fontSize: 14, fontFamily: "Poppins_600SemiBold" }}>Create account →</Text>
      </TouchableOpacity>
    </View>
  );
}

type ProfileTab = "posts" | "reels" | "tagged" | "saved";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const [profile, setProfile] = useState<Profile>(MOCK_PROFILE);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // ── Realtime profile counts ──────────────────────────────────────────────
  const rtProfile = useProfileRealtime(session?.user?.id ?? null, {
    followers_count: profile.followers_count,
    following_count: profile.following_count,
    posts_count: profile.posts_count,
  });
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [myPosts, setMyPosts] = useState<GridItem[]>([]);
  const [taggedPosts, setTaggedPosts] = useState<GridItem[]>([]);
  const [savedPosts, setSavedPosts] = useState<GridItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerPhotos, setViewerPhotos] = useState<GridItem[]>([]);
  const [activeHighlight, setActiveHighlight] = useState<Highlight | null>(null);
  const [showCreateHighlight, setShowCreateHighlight] = useState(false);
  const [newHighlightName, setNewHighlightName] = useState("");
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [creatingHighlight, setCreatingHighlight] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  // Tab bar: 68px height + 10px bottom offset = 78px from screen bottom. Add 10px buffer → 88px.
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 88;
  const mainTabSwipe = useMainTabSwipe("profile");

  const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

  useEffect(() => {
    if (!session?.user?.id || activeTab !== "saved") return;
    const uid = session.user.id;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/posts/saved?userId=${uid}`);
        if (res.ok) {
          const json = await res.json();
          setSavedPosts(
            (json.posts ?? []).map((p: any) => ({
              id: p.id,
              image_url: p.media_url ?? p.image_url,
              isReel: false,
              likes: p.likes ?? 0,
              comments: p.comments ?? 0,
              caption: p.caption ?? "",
            }))
          );
        }
      } catch {}
    })();
  }, [activeTab, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || activeTab !== "tagged") return;
    const uid = session.user.id;
    (async () => {
      try {
        const { data } = await supabase
          .from("post_tags")
          .select("posts(id, media_url, caption, likes_count, comments_count)")
          .eq("tagged_user_id", uid)
          .limit(30);
        if (data && data.length > 0) {
          setTaggedPosts(
            data
              .map((r: any) => r.posts)
              .filter(Boolean)
              .map((p: any) => ({
                id: p.id,
                image_url: p.media_url ?? p.image_url ?? null,
                isReel: false,
                likes: p.likes_count ?? 0,
                comments: p.comments_count ?? 0,
                caption: p.caption ?? "",
              }))
          );
        }
      } catch {}
    })();
  }, [activeTab, session?.user?.id]);

  const loadProfile = useCallback(async (uid: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    if (!data) return;
    // Fetch live counts via API server (uses service-role key, bypasses RLS +
    // avoids the Android Supabase-client hang on COUNT queries).
    const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    let liveCounts = {
      posts_count: data.posts_count ?? 0,
      followers_count: data.followers_count ?? 0,
      following_count: data.following_count ?? 0,
    };
    try {
      const apiRes = await fetch(`${apiBase}/users/profile/${encodeURIComponent(data.username)}`);
      if (apiRes.ok) {
        const json = await apiRes.json();
        const p = json.profile ?? json;
        liveCounts = {
          posts_count: p.posts_count ?? liveCounts.posts_count,
          followers_count: p.followers_count ?? liveCounts.followers_count,
          following_count: p.following_count ?? liveCounts.following_count,
        };
      }
    } catch {}
    setProfile({ ...(data as Profile), ...liveCounts });
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadProfile(session.user.id);
  }, [session?.user?.id, loadProfile]);

  const loadHighlights = useCallback(async (uid: string) => {
    setHighlightsLoading(true);
    const data = await fetchHighlights(uid);
    setHighlights(data);
    setHighlightsLoading(false);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadHighlights(session.user.id);
  }, [session?.user?.id]);

  const loadMyPosts = useCallback(async (uid: string) => {
    const results = await fetchProfilePosts(uid, uid);
    setMyPosts(results);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    setPostsLoading(true);
    loadMyPosts(session.user.id).finally(() => setPostsLoading(false));
  }, [session?.user?.id]);

  // Re-fetch profile + posts every time this tab is focused (catches edits made on other screens)
  useFocusEffect(
    useCallback(() => {
      if (!session?.user?.id) return;
      loadProfile(session.user.id);
      loadMyPosts(session.user.id);
    }, [session?.user?.id, loadProfile, loadMyPosts])
  );

  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`profile-grid-${uid}-${suffix}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: `user_id=eq.${uid}` }, (payload) => {
          try {
            const p = payload.new as any;
            const mediaUrl = p.media_url ?? p.image_url ?? '';
            const isVid = isVideoUrl(mediaUrl);
            setMyPosts((prev) => [{ id: p.id, image_url: mediaUrl, video_url: isVid ? mediaUrl : undefined, is_video: isVid, isReel: false, likes: 0, comments: 0, caption: p.caption ?? '', created_at: p.created_at }, ...prev]);
            setProfile((prof) => ({ ...prof, posts_count: (prof.posts_count ?? 0) + 1 }));
          } catch { /* never crash on realtime payload */ }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reels', filter: `user_id=eq.${uid}` }, (payload) => {
          try {
            const r = payload.new as any;
            setMyPosts((prev) => [{ id: `reel_${r.id}`, image_url: r.thumbnail_url ?? '', video_url: r.video_url, isReel: true, likes: 0, comments: 0, caption: r.caption ?? '', duration: r.duration, created_at: r.created_at }, ...prev]);
            setProfile((prof) => ({ ...prof, posts_count: (prof.posts_count ?? 0) + 1 }));
          } catch { /* never crash on realtime payload */ }
        })
        .subscribe();
    } catch { /* channel collision — safe to ignore */ }
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  const handleRefresh = useCallback(async () => {
    if (!session?.user?.id) return;
    setRefreshing(true);
    await loadMyPosts(session.user.id);
    setRefreshing(false);
  }, [session?.user?.id, loadMyPosts]);

  const openPhoto = (photos: GridItem[], index: number) => {
    setViewerPhotos(photos);
    setViewerIndex(index);
    setViewerOpen(true);
  };

  if (!isLoggedIn) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]} {...mainTabSwipe.panHandlers}>
        <GuestProfile />
        <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
      </View>
    );
  }

  const emailUsername = session?.user?.email?.split("@")[0] ?? "your_vibe";
  const displayUsername = profile.username === "your_vibe" ? emailUsername : profile.username;

  const reelsOnly = myPosts.filter((p) => p.isReel);

  const gridData: GridItem[] =
    activeTab === "posts" ? myPosts :
    activeTab === "reels" ? reelsOnly :
    activeTab === "saved" ? savedPosts :
    taggedPosts;

  const ListHeader = (
    <View>
      <LinearGradient colors={["rgba(124,58,237,0.35)", "transparent"]} style={[styles.headerGradient, { paddingTop: topInset + 8 }]}>
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <Text style={[styles.username, { color: colors.foreground }]}>{displayUsername}</Text>
            <View style={styles.verifiedRow}>
              <Ionicons name="checkmark-circle" size={16} color="#8B5CF6" />
              <Text style={[styles.verifiedText, { color: "#8B5CF6" }]}>Verified</Text>
            </View>
          </View>
          <View style={styles.topActions}>
            <TouchableOpacity onPress={() => router.push("/notifications")} style={styles.iconBtn}>
              <Ionicons name="notifications-outline" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/inbox")} style={styles.iconBtn}>
              <Ionicons name="chatbubble-outline" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/settings")} style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileHeader}>
          <UserAvatar username={displayUsername} url={profile.avatar_url} size={88} showBorder />
          <View style={styles.profileInfo}>
            {profile.bio ? <Text style={[styles.bio, { color: colors.mutedForeground }]}>{profile.bio}</Text> : null}
            {(profile as any).relationship_status ? (
              <RelationshipStatusBadge status={(profile as any).relationship_status} />
            ) : null}
            {(profile as any).zodiac_sign ? (
              <ZodiacSignBadge sign={(profile as any).zodiac_sign} />
            ) : null}
            <TouchableOpacity style={styles.shareLinkBtn} onPress={() => Alert.alert("Link copied!", `${BASE_URL}/${displayUsername}`)}>
              <Ionicons name="link-outline" size={13} color="#8B5CF6" />
              <Text style={[styles.shareLinkText, { color: "#8B5CF6" }]}>{BASE_URL.replace("https://", "")}/{displayUsername}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.statsRow, { backgroundColor: "rgba(255,255,255,0.04)" }]}>
          <StatBlock label="Posts" value={rtProfile.posts_count ?? profile.posts_count ?? 0} />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock
            label="Followers"
            value={rtProfile.followers_count ?? profile.followers_count ?? 0}
            onPress={() => router.push(`/followers/${displayUsername}?type=followers` as any)}
          />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock
            label="Following"
            value={rtProfile.following_count ?? profile.following_count ?? 0}
            onPress={() => router.push(`/followers/${displayUsername}?type=following` as any)}
          />
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity onPress={() => router.push("/edit-profile" as any)} style={[styles.editBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.editBtnText, { color: colors.foreground }]}>Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/analytics" as any)}
            style={[styles.analyticsBtn, { backgroundColor: "rgba(139,92,246,0.12)", borderColor: "#8B5CF6" }]}
          >
            <Ionicons name="bar-chart-outline" size={15} color="#8B5CF6" />
            <Text style={styles.analyticsBtnText}>Analytics</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              shareContent("profile", { username: displayUsername }, `Check out @${displayUsername} on Gundruk!`);
            }}
            style={[styles.iconActionBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Ionicons name="share-social-outline" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconActionBtn, { backgroundColor: colors.muted, borderColor: colors.border }]} onPress={() => router.push("/suggested-users" as any)}>
            <Ionicons name="person-add-outline" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/wallet")} style={[styles.walletChip, { backgroundColor: "rgba(139,92,246,0.15)", borderColor: "#8B5CF6" }]}>
            <Text style={styles.walletEmoji}>🪙</Text>
            <Text style={styles.walletChipText}>Wallet</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={[styles.highlightsSection, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsScroll}>
          <TouchableOpacity style={styles.highlightNew} onPress={() => setShowCreateHighlight(true)}>
            <View style={[styles.highlightCircle, { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1, borderStyle: "dashed" }]}>
              <Ionicons name="add" size={26} color="#8B5CF6" />
            </View>
            <Text style={[styles.highlightLabel, { color: colors.mutedForeground }]}>New</Text>
          </TouchableOpacity>
          {highlights.map((h) => (
            <TouchableOpacity
              key={h.id}
              style={styles.highlightItem}
              onPress={() => setActiveHighlight({
                id: h.id,
                label: h.title,
                image: h.cover_image_url ?? `https://picsum.photos/seed/${h.id}/200/200`,
                username: displayUsername,
              })}
              onLongPress={() => {
                Alert.alert(h.title, "Manage this highlight", [
                  { text: "Delete", style: "destructive", onPress: async () => {
                    await deleteHighlight(h.id);
                    setHighlights((prev) => prev.filter((x) => x.id !== h.id));
                  }},
                  { text: "Cancel", style: "cancel" },
                ]);
              }}
            >
              <LinearGradient colors={["#8B5CF6", "#EC4899"]} style={styles.highlightRing}>
                <View style={[styles.highlightInner, { backgroundColor: colors.background }]}>
                  <Image
                    source={{ uri: h.cover_image_url ?? `https://picsum.photos/seed/${h.id}/200/200` }}
                    style={styles.highlightImg}
                  />
                </View>
              </LinearGradient>
              <Text style={[styles.highlightLabel, { color: colors.foreground }]} numberOfLines={1}>{h.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.gridTabRow, { borderBottomColor: colors.border }]}>
        {([
          { key: "posts" as ProfileTab, icon: "grid-outline", label: "Posts" },
          { key: "reels" as ProfileTab, icon: "play-circle-outline", label: "Reels" },
          { key: "tagged" as ProfileTab, icon: "pricetag-outline", label: "Tagged" },
          { key: "saved" as ProfileTab, icon: "bookmark-outline", label: "Saved" },
        ]).map((tab) => (
          <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)}
            style={[styles.gridTab, activeTab === tab.key && { borderBottomColor: "#8B5CF6", borderBottomWidth: 2.5 }]}>
            <Ionicons name={tab.icon as any} size={21} color={activeTab === tab.key ? "#8B5CF6" : colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...mainTabSwipe.panHandlers}>
      <FlatList
        data={gridData}
        keyExtractor={(item) => item.id}
        numColumns={3}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={
          activeTab === "saved"
            ? <View style={{ padding: 48, alignItems: "center", gap: 12 }}>
                <Text style={{ fontSize: 44 }}>🔖</Text>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 17, color: colors.foreground }}>No saved posts</Text>
                <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>Posts you save will appear here</Text>
              </View>
            : (activeTab === "posts" || activeTab === "reels")
              ? postsLoading
                ? <SkeletonGrid />
                : <EmptyGrid onCreatePost={() => router.navigate("/(tabs)/create" as any)} />
              : null
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            style={{ position: "relative" }}
            onPress={() => openPhoto(gridData, index)}
            onLongPress={() => {
              if (!item.isReel && !item.id.startsWith("reel_")) {
                const isPinned = (item as any).is_pinned;
                Alert.alert(
                  isPinned ? "Unpin Post" : "Pin Post",
                  isPinned ? "Remove this post from the top of your profile?" : "Pin this post to the top of your profile?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: isPinned ? "Unpin" : "Pin",
                      onPress: async () => {
                        const ok = await togglePinPost(item.id, !isPinned);
                        if (ok && session?.user?.id) {
                          await loadMyPosts(session.user.id);
                        }
                      },
                    },
                  ]
                );
              }
            }}
          >
            {item.is_video && (item.media_url ?? item.image_url) ? (
              <VideoGridCell videoUri={(item.media_url ?? item.image_url)!} style={styles.gridImage} />
            ) : (
              <Image source={{ uri: item.media_url ?? item.image_url ?? undefined }} style={styles.gridImage} resizeMode="cover" />
            )}
            {(item as any).is_pinned && (
              <View style={styles.pinBadge}>
                <Ionicons name="location" size={10} color="#fff" />
              </View>
            )}
            {(item.isReel || item.is_video) && (
              <View style={styles.reelBadge}>
                <Ionicons name="play" size={12} color="#fff" />
              </View>
            )}
            {!item.isReel && item.visibility && item.visibility !== "public" && (
              <View style={styles.visibilityBadge}>
                <Text style={styles.visibilityBadgeText}>
                  {item.visibility === "private" ? "🔒" : "👥"}
                </Text>
              </View>
            )}
            {item.duration != null && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationBadgeText}>
                  {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, "0")}
                </Text>
              </View>
            )}
            <View style={styles.gridOverlay}>
              <Ionicons name="heart" size={12} color="#fff" />
              <Text style={styles.gridLikes}>{formatCount(item.likes ?? 0)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 1.5 }} />}
        columnWrapperStyle={{ gap: 1.5 }}
        showsVerticalScrollIndicator={false}
      />

      <HighlightViewer
        highlight={activeHighlight}
        visible={!!activeHighlight}
        onClose={() => setActiveHighlight(null)}
      />

      {viewerOpen && (
        <PhotoViewer
          photos={viewerPhotos}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}

      <Modal visible={showCreateHighlight} transparent animationType="slide" onRequestClose={() => setShowCreateHighlight(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setShowCreateHighlight(false)} />
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24, gap: 16 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 4 }} />
            <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 18, color: colors.foreground }}>New Highlight</Text>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: colors.mutedForeground, lineHeight: 20 }}>
              Give your highlight a name. You can add stories to it from your story archive.
            </Text>
            <TextInput
              value={newHighlightName}
              onChangeText={setNewHighlightName}
              placeholder="e.g. Summer 2025, Travel, Food..."
              placeholderTextColor={colors.mutedForeground}
              maxLength={32}
              style={{
                backgroundColor: colors.muted,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                fontFamily: "Poppins_400Regular",
                fontSize: 15,
                color: colors.foreground,
              }}
            />
            <LinearGradient colors={["#8B5CF6", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 14 }}>
              <TouchableOpacity
                style={{ paddingVertical: 14, alignItems: "center" }}
                disabled={creatingHighlight}
                onPress={async () => {
                  if (!newHighlightName.trim()) { Alert.alert("Name required", "Please enter a name for your highlight."); return; }
                  if (!session?.user?.id) return;
                  setCreatingHighlight(true);
                  const hl = await createHighlight(session.user.id, newHighlightName.trim());
                  setCreatingHighlight(false);
                  if (hl) {
                    setHighlights((prev) => [hl, ...prev]);
                    setNewHighlightName("");
                    setShowCreateHighlight(false);
                  } else {
                    Alert.alert("Error", "Could not create highlight. Please run the DB migration in the Supabase SQL editor first.");
                  }
                }}
              >
                <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 15, color: "#fff" }}>
                  {creatingHighlight ? "Creating…" : "Create Highlight"}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  guestContainer: { flex: 1, alignItems: "center", paddingHorizontal: 32, gap: 16 },
  guestAvatar: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  guestTitle: { fontSize: 24, fontFamily: "Poppins_700Bold", textAlign: "center" },
  guestSub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 8 },
  headerGradient: { paddingHorizontal: 16, paddingBottom: 16 },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  topLeft: { gap: 2 },
  username: { fontSize: 19, fontFamily: "Poppins_700Bold" },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  verifiedText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  topActions: { flexDirection: "row", gap: 2 },
  iconBtn: { padding: 6 },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 18, marginBottom: 16 },
  profileInfo: { flex: 1, gap: 6 },
  bio: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 18 },
  shareLinkBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  shareLinkText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: 14, borderRadius: 16, padding: 14 },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontFamily: "Poppins_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  statDivider: { width: 1, height: 30 },
  actionButtons: { flexDirection: "row", gap: 8, marginBottom: 4 },
  editBtn: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  editBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  iconActionBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  highlightsSection: { paddingVertical: 10, borderBottomWidth: 0.5 },
  highlightsScroll: { paddingHorizontal: 14, gap: 14 },
  highlightNew: { alignItems: "center", gap: 5, width: 68 },
  highlightCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  highlightItem: { alignItems: "center", gap: 5, width: 68 },
  highlightRing: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  highlightInner: { width: 58, height: 58, borderRadius: 29, overflow: "hidden" },
  highlightImg: { width: "100%", height: "100%", borderRadius: 29 },
  highlightLabel: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "center" },
  walletChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  walletEmoji: { fontSize: 14 },
  walletChipText: { color: "#8B5CF6", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  findFriendsBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  findFriendsBtnText: { color: "#8B5CF6", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  gridTabRow: { flexDirection: "row", borderBottomWidth: 0.5, marginTop: 4 },
  gridTab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  gridImage: { width: GRID_ITEM, height: GRID_ITEM, backgroundColor: "#1A0A2E" },
  reelBadge: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 6, padding: 3 },
  pinBadge: { position: "absolute", top: 6, left: 6, backgroundColor: "rgba(139,92,246,0.85)", borderRadius: 6, padding: 3 },
  visibilityBadge: { position: "absolute", bottom: 28, right: 4, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2 },
  visibilityBadgeText: { fontSize: 10 },
  durationBadge: { position: "absolute", bottom: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  durationBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Poppins_600SemiBold" },
  gridOverlay: { position: "absolute", bottom: 4, left: 4, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  gridLikes: { color: "#fff", fontSize: 10, fontFamily: "Poppins_500Medium" },
  analyticsBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  analyticsBtnText: { color: "#8B5CF6", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
});
