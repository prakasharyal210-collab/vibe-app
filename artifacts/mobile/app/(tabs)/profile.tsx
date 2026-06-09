import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMainTabSwipe } from "@/hooks/useMainTabSwipe";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
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
import { GradientButton } from "@/components/GradientButton";
import { LoginPrompt } from "@/components/LoginPrompt";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { fetchProfilePosts, getProfileStats, ProfileGridItem, fetchHighlights, createHighlight, deleteHighlight, togglePinPost, StoryHighlight } from "@/lib/db";
import { useProfileRealtime } from "@/context/RealtimeContext";
import { useColors } from "@/hooks/useColors";
import { Profile, supabase } from "@/lib/supabase";
import { HighlightViewer, Highlight } from "@/components/HighlightViewer";
import { shareContent } from "@/lib/share";

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
  followers_count: 1284,
  following_count: 342,
  posts_count: 27,
};

interface GridItem {
  id: string;
  image_url: string;
  isReel?: boolean;
  likes?: number;
  comments?: number;
  caption?: string;
  duration?: number;
  video_url?: string;
  created_at?: string;
}

function formatCount(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
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
            <Ionicons name="share-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Photo carousel */}
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
          {photos.map((p) => (
            <View key={p.id} style={pvStyles.photoWrap}>
              <Image source={{ uri: p.image_url }} style={pvStyles.photo} resizeMode="contain" />
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
              <Ionicons name="heart-outline" size={24} color="#fff" />
              <Text style={pvStyles.actionCount}>{formatCount(photo?.likes ?? 0)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pvStyles.actionItem}>
              <Ionicons name="chatbubble-outline" size={22} color="#fff" />
              <Text style={pvStyles.actionCount}>{formatCount(photo?.comments ?? 0)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pvStyles.actionItem}>
              <Ionicons name="paper-plane-outline" size={22} color="#fff" />
              <Text style={pvStyles.actionCount}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pvStyles.actionItem}>
              <Ionicons name="bookmark-outline" size={22} color="#fff" />
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
});

function SkeletonGrid() {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.75, duration: 850, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 850, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View>
      {[0, 3, 6].map((row) => (
        <View key={row} style={{ flexDirection: "row", gap: 1.5, marginBottom: 1.5 }}>
          {[0, 1, 2].map((col) => (
            <Animated.View
              key={col}
              style={{ width: GRID_ITEM, height: GRID_ITEM, backgroundColor: "#2D1B69", opacity: pulse }}
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

type ProfileTab = "posts" | "reels" | "tagged";

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
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;
  const mainTabSwipe = useMainTabSwipe("profile");

  useEffect(() => {
    if (!session?.user?.id || activeTab !== "tagged") return;
    const uid = session.user.id;
    (async () => {
      try {
        const { data } = await supabase
          .from("post_tags")
          .select("posts(id, image_url, caption, likes_count, comments_count)")
          .eq("tagged_user_id", uid)
          .limit(30);
        if (data && data.length > 0) {
          setTaggedPosts(
            data
              .map((r: any) => r.posts)
              .filter(Boolean)
              .map((p: any) => ({
                id: p.id,
                image_url: p.image_url,
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

  useEffect(() => {
    if (!session?.user) return;
    supabase.from("profiles").select("*").eq("id", session.user.id).single()
      .then(({ data }) => { if (data) setProfile(data as Profile); });
  }, [session]);

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
    const results = await fetchProfilePosts(uid);
    setMyPosts(results);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    setPostsLoading(true);
    loadMyPosts(session.user.id).finally(() => setPostsLoading(false));
  }, [session?.user?.id]);

  // Re-fetch posts every time this tab is focused (catches posts created on other screens)
  useFocusEffect(
    useCallback(() => {
      if (!session?.user?.id) return;
      loadMyPosts(session.user.id);
    }, [session?.user?.id, loadMyPosts])
  );

  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    const channel = supabase
      .channel(`profile-grid-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: `user_id=eq.${uid}` }, (payload) => {
        const p = payload.new as any;
        setMyPosts((prev) => [{ id: p.id, image_url: p.image_url ?? p.media_url ?? '', isReel: false, likes: 0, comments: 0, caption: p.caption ?? '', created_at: p.created_at }, ...prev]);
        setProfile((prof) => ({ ...prof, posts_count: (prof.posts_count ?? 0) + 1 }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reels', filter: `user_id=eq.${uid}` }, (payload) => {
        const r = payload.new as any;
        setMyPosts((prev) => [{ id: `reel_${r.id}`, image_url: r.thumbnail_url ?? '', video_url: r.video_url, isReel: true, likes: 0, comments: 0, caption: r.caption ?? '', duration: r.duration, created_at: r.created_at }, ...prev]);
        setProfile((prof) => ({ ...prof, posts_count: (prof.posts_count ?? 0) + 1 }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
            <TouchableOpacity style={styles.shareLinkBtn} onPress={() => Alert.alert("Link copied!", `gundruk.app/${displayUsername}`)}>
              <Ionicons name="link-outline" size={13} color="#8B5CF6" />
              <Text style={[styles.shareLinkText, { color: "#8B5CF6" }]}>gundruk.app/{displayUsername}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.statsRow, { backgroundColor: "rgba(255,255,255,0.04)" }]}>
          <StatBlock label="Posts" value={rtProfile.posts_count ?? profile.posts_count ?? MOCK_GRID.length} />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock
            label="Followers"
            value={rtProfile.followers_count ?? profile.followers_count ?? 1284}
            onPress={() => router.push(`/followers/${displayUsername}?type=followers` as any)}
          />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock
            label="Following"
            value={rtProfile.following_count ?? profile.following_count ?? 342}
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
            <Ionicons name="share-outline" size={18} color={colors.foreground} />
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
          (activeTab === "posts" || activeTab === "reels")
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
            <Image source={{ uri: item.image_url || undefined }} style={styles.gridImage} resizeMode="cover" />
            {(item as any).is_pinned && (
              <View style={styles.pinBadge}>
                <Ionicons name="pin" size={10} color="#fff" />
              </View>
            )}
            {item.isReel && (
              <View style={styles.reelBadge}>
                <Ionicons name="play" size={12} color="#fff" />
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
  gridImage: { width: GRID_ITEM, height: GRID_ITEM },
  reelBadge: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 6, padding: 3 },
  pinBadge: { position: "absolute", top: 6, left: 6, backgroundColor: "rgba(139,92,246,0.85)", borderRadius: 6, padding: 3 },
  durationBadge: { position: "absolute", bottom: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  durationBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Poppins_600SemiBold" },
  gridOverlay: { position: "absolute", bottom: 4, left: 4, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  gridLikes: { color: "#fff", fontSize: 10, fontFamily: "Poppins_500Medium" },
  analyticsBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  analyticsBtnText: { color: "#8B5CF6", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
});
