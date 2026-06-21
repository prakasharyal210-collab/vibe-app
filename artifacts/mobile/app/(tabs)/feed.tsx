import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useMainTabSwipe } from "@/hooks/useMainTabSwipe";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  DeviceEventEmitter,
  Dimensions,
  Easing,
  FlatList,
  GestureResponderEvent,
  Image,
  Modal,
  PanResponder,
  PanResponderGestureState,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LoginPrompt } from "@/components/LoginPrompt";
import { PostCard } from "@/components/PostCard";
import { useRealtime } from "@/context/RealtimeContext";
import { SkeletonPost } from "@/components/SkeletonLoader";
import { StoryRow } from "@/components/StoryRow";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";
import {
  fetchFriendStories,
  fetchUnreadCount,
  getForYouFeed,
  getFriendsFeed,
  markPostSeen,
} from "@/lib/db";
import type { StoryEntry } from "@/lib/db";
import { Post, supabase } from "@/lib/supabase";

const { width: W, height: H } = Dimensions.get("window");
const PAGE_SIZE = 20;
const NUM_TABS = 2;
const TAB_W = W / NUM_TABS;
const INDICATOR_W = 40;

type FeedTabId = "foryou" | "friends";

// ─── Category pills ────────────────────────────────────────────────────────────
interface Category { id: string; label: string; keywords: string[] }
const CATEGORIES: Category[] = [
  { id: "explore",     label: "🧭 Explore",     keywords: [] },
  { id: "trending",    label: "🔥 Trending",     keywords: [] },
  { id: "music",       label: "🎵 Music",        keywords: ["music", "song", "beat", "artist", "track", "album", "listen"] },
  { id: "dance",       label: "💃 Dance",        keywords: ["dance", "dancing", "choreo", "moves"] },
  { id: "comedy",      label: "😂 Comedy",       keywords: ["comedy", "funny", "laugh", "humor", "joke", "lol"] },
  { id: "travel",      label: "✈️ Travel",       keywords: ["travel", "trip", "vacation", "explore", "adventure", "wanderlust"] },
  { id: "food",        label: "🍕 Food",         keywords: ["food", "eat", "recipe", "cooking", "foodie", "chef"] },
  { id: "fitness",     label: "💪 Fitness",      keywords: ["fitness", "gym", "workout", "run", "exercise", "health"] },
  { id: "gaming",      label: "🎮 Gaming",       keywords: ["gaming", "game", "play", "stream", "esports", "gamer"] },
  { id: "photography", label: "📸 Photography",  keywords: ["photo", "photography", "shot", "camera", "portrait", "landscape"] },
  { id: "art",         label: "🎨 Art",          keywords: ["art", "drawing", "painting", "sketch", "creative", "design"] },
  { id: "fashion",     label: "💄 Fashion",      keywords: ["fashion", "style", "outfit", "ootd", "clothes", "wear"] },
  { id: "pets",        label: "🐾 Pets",         keywords: ["pet", "dog", "cat", "puppy", "kitten", "animal"] },
  { id: "sports",      label: "⚽ Sports",       keywords: ["sport", "football", "basketball", "soccer", "tennis", "athlete"] },
  { id: "tech",        label: "💻 Tech",         keywords: ["tech", "ai", "coding", "developer", "startup", "software"] },
  { id: "education",   label: "📚 Education",    keywords: ["learn", "education", "study", "school", "knowledge", "tutorial"] },
  { id: "nature",      label: "🌿 Nature",       keywords: ["nature", "forest", "ocean", "mountains", "outdoor", "wildlife"] },
];

function CategoryPills({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const { theme } = useTheme();
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={pillStyles.row}
      style={pillStyles.scrollView}
    >
      {CATEGORIES.map((cat) => {
        const isActive = cat.id === active;
        return (
          <TouchableOpacity
            key={cat.id}
            onPress={() => onSelect(cat.id)}
            activeOpacity={0.75}
            style={pillStyles.pillWrap}
          >
            {isActive ? (
              <LinearGradient
                colors={theme.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={pillStyles.pill}
              >
                <Text style={[pillStyles.pillText, pillStyles.pillTextActive]}>{cat.label}</Text>
              </LinearGradient>
            ) : (
              <View style={[pillStyles.pill, pillStyles.pillInactive]}>
                <Text style={pillStyles.pillText}>{cat.label}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
const pillStyles = StyleSheet.create({
  scrollView: { flexShrink: 0 },
  row: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: "row" },
  pillWrap: { borderRadius: 20, overflow: "hidden" },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  pillInactive: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  pillText: { fontSize: 12, fontFamily: "Poppins_500Medium", color: "rgba(156,163,175,0.9)" },
  pillTextActive: { color: "#fff" },
});

// ─── Gradient GUNDRUK logo ──────────────────────────────────────────────────────
function VibeLogo() {
  const { theme } = useTheme();
  if (Platform.OS === "web") {
    return (
      <Text
        style={[logoStyles.text, {
          // @ts-ignore — web-only CSS
          background: `linear-gradient(to right, ${theme.gradient[0]}, ${theme.gradient[1]}, ${theme.gradient[2]})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }]}
      >
        GUNDRUK
      </Text>
    );
  }
  return (
    <View style={logoStyles.nativeWrap}>
      <Text style={[logoStyles.text, { color: theme.gradient[0] }]}>GUN</Text>
      <Text style={[logoStyles.text, { color: theme.gradient[1] }]}>DR</Text>
      <Text style={[logoStyles.text, { color: theme.gradient[2] }]}>UK</Text>
    </View>
  );
}
const logoStyles = StyleSheet.create({
  nativeWrap: { flexDirection: "row" },
  text: { fontSize: 22, fontFamily: "Poppins_700Bold", letterSpacing: 2 },
});

interface TabState {
  posts: Post[];
  loading: boolean;
  loadingMore: boolean;
  offset: number;
  hasMore: boolean;
}

const INIT_TAB: TabState = {
  posts: [],
  loading: true,
  loadingMore: false,
  offset: 0,
  hasMore: true,
};

const TABS: { id: FeedTabId; label: string }[] = [
  { id: "foryou", label: "For You" },
  { id: "friends", label: "Friends" },
];

type ContentType = "all" | "photo" | "video";
type SortOrder = "newest" | "most_liked" | "most_viewed";

const SORT_OPTIONS: { id: SortOrder; label: string; icon: string }[] = [
  { id: "newest",     label: "Newest",     icon: "time-outline" },
  { id: "most_liked", label: "Most Liked", icon: "heart-outline" },
  { id: "most_viewed", label: "Most Viewed", icon: "eye-outline" },
];

const CONTENT_OPTIONS: { id: ContentType; label: string; icon: string }[] = [
  { id: "all",   label: "All",   icon: "albums-outline" },
  { id: "photo", label: "Photo", icon: "image-outline" },
  { id: "video", label: "Video", icon: "videocam-outline" },
];

const WHY_REASONS = [
  "Based on your interest in #travel",
  "Popular in your area",
  "Trending right now",
  "Because you liked similar posts",
  "From a creator you might like",
  "Popular with people you follow",
  "Based on your interest in #music",
];


const MOCK_FOR_YOU: Post[] = [
  {
    id: "fy1", user_id: "u6",
    image_url: "https://picsum.photos/seed/fy1/400/400",
    images: ["https://picsum.photos/seed/fy1/400/400", "https://picsum.photos/seed/fy1b/400/400"],
    caption: "The best sunsets are the ones you didn't plan 🌅 #spontaneous #travel",
    location: "Amalfi Coast, Italy", likes_count: 4821, comments_count: 203,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    profiles: { id: "u6", username: "alex.w", is_verified: true },
  },
  {
    id: "fy2", user_id: "u7",
    image_url: "https://picsum.photos/seed/fy2/400/400",
    images: ["https://picsum.photos/seed/fy2/400/400"],
    caption: "Studio session 🎵 new music coming very soon... #music #vibes",
    likes_count: 1933, comments_count: 88,
    created_at: new Date(Date.now() - 21600000).toISOString(),
    profiles: { id: "u7", username: "maya_art" },
  },
  {
    id: "fy3", user_id: "u8",
    image_url: "https://picsum.photos/seed/fy3/400/400",
    images: ["https://picsum.photos/seed/fy3/400/400"],
    caption: "Morning run ☀️ 10km done 💪 #fitness #motivation",
    likes_count: 892, comments_count: 41,
    created_at: new Date(Date.now() - 43200000).toISOString(),
    profiles: { id: "u8", username: "kai_fit" },
  },
];


function WhyThisButton({ index }: { index: number }) {
  const reason = WHY_REASONS[index % WHY_REASONS.length];
  return (
    <TouchableOpacity
      onPress={() => Alert.alert("💡 Why you're seeing this", reason)}
      style={whyStyles.btn}
      activeOpacity={0.7}
    >
      <Ionicons name="information-circle-outline" size={12} color="rgba(255,255,255,0.35)" />
      <Text style={whyStyles.text}>Why you're seeing this</Text>
    </TouchableOpacity>
  );
}
const whyStyles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingBottom: 8, paddingTop: 2 },
  text: { fontSize: 11, fontFamily: "Poppins_400Regular", color: "rgba(255,255,255,0.35)" },
});


type TrendingPost = {
  id: string;
  image_url?: string;
  media_url?: string;
  thumbnail_url?: string;
  likes_count: number;
  views_count?: number;
  trending_score?: number;
  is_video?: boolean;
};

function TrendingFeed({ posts, colors }: { posts: TrendingPost[]; colors: any }) {
  function fmt(n: number) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }
  if (posts.length === 0) {
    return (
      <View style={{ paddingTop: 60, alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 32 }}>🔥</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 14 }}>Loading trending posts…</Text>
      </View>
    );
  }
  return (
    <View style={{ paddingBottom: 32 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 16 }}>
        <LinearGradient colors={["#7C3AED", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 3, height: 16, borderRadius: 2 }} />
        <Text style={{ color: colors.foreground, fontFamily: "Poppins_700Bold", fontSize: 15 }}>🔥 Trending</Text>
      </View>
      {posts.map((p, index) => (
        <TouchableOpacity
          key={p.id}
          activeOpacity={0.85}
          onPress={() => router.push(`/post/${p.id}` as any)}
          style={{ marginHorizontal: 14, marginBottom: 14, borderRadius: 18, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.04)" }}
        >
          <View style={{ position: "relative" }}>
            <Image
              source={{ uri: p.thumbnail_url ?? p.media_url ?? p.image_url }}
              style={{ width: "100%", aspectRatio: 4 / 3 }}
              resizeMode="cover"
            />
            <View style={{ position: "absolute", top: 10, left: 10, backgroundColor: "#7C3AED", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
              <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 12 }}>#{index + 1}</Text>
            </View>
            {p.is_video && (
              <View style={{ position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>▶ Video</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={{ fontSize: 14 }}>❤️</Text>
              <Text style={{ color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>{fmt(p.likes_count)}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={{ fontSize: 14 }}>👁️</Text>
              <Text style={{ color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>{fmt(p.views_count ?? 0)}</Text>
            </View>
            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 12 }}>🔥</Text>
              <Text style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12 }}>
                {fmt(p.trending_score ?? ((p.views_count ?? 0) + p.likes_count))} score
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function FriendsStoriesBar({ stories, colors, userId, onStoryCreated }: { stories: StoryEntry[]; colors: any; userId?: string; onStoryCreated?: () => void }) {
  return (
    <View style={{ backgroundColor: colors.background }}>
      <View style={storiesBarStyles.header}>
        <LinearGradient colors={["#7C3AED", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={storiesBarStyles.accentBar} />
        <Text style={[storiesBarStyles.title, { color: colors.foreground }]}>Stories</Text>
        <View style={storiesBarStyles.liveRow}>
          <View style={storiesBarStyles.liveDot} />
          <Text style={[storiesBarStyles.liveText, { color: colors.mutedForeground }]}>
            {stories.filter((s) => s.isOnline && !s.isOwn).length} online
          </Text>
        </View>
      </View>
      <StoryRow stories={stories} userId={userId} onStoryCreated={onStoryCreated} />
      <View style={[storiesBarStyles.divider, { backgroundColor: colors.border }]} />
    </View>
  );
}
const storiesBarStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  accentBar: { width: 3, height: 16, borderRadius: 2 },
  title: { fontSize: 15, fontFamily: "Poppins_700Bold", flex: 1 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22C55E" },
  liveText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  divider: { height: 0.5, marginTop: 8 },
});

function SuggestedCTA({ colors }: { colors: any }) {
  return (
    <View style={{ alignItems: "center", paddingTop: 20, paddingHorizontal: 32, gap: 12 }}>
      <TouchableOpacity
        onPress={() => router.push("/suggested-users" as any)}
        style={{ backgroundColor: "#7C3AED", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
      >
        <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 }}>Find People to Follow →</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/search" as any)}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13 }}>or search for creators</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Stable FlatList header components ────────────────────────────────────────
// MUST be defined at module scope so their type identity never changes between
// renders. If they were inline functions inside TABS.map or ListHeaderComponent,
// React would see a new component type on every FeedScreen re-render (e.g. from
// setVisiblePostIds firing on scroll), unmount+remount the old header, causing
// CuratedFeedList to lose state → show skeleton → refetch → re-render → loop.

type ForYouHeaderProps = {
  isTrending: boolean;
  trendingPosts: TrendingPost[];
  colors: any;
};
function ForYouListHeader({ isTrending, trendingPosts, colors }: ForYouHeaderProps) {
  if (isTrending) {
    return <TrendingFeed posts={trendingPosts} colors={colors} />;
  }
  return null;
}

type FriendsHeaderProps = {
  isTrending: boolean;
  trendingPosts: TrendingPost[];
  colors: any;
  stories: StoryEntry[];
  userId?: string;
  activeTab: FeedTabId;
  onStoryCreated: () => void;
};
function FriendsListHeader({ isTrending, trendingPosts, colors, stories, userId, activeTab, onStoryCreated }: FriendsHeaderProps) {
  return (
    <>
      {activeTab === "friends" && (
        <FriendsStoriesBar stories={stories} colors={colors} userId={userId} onStoryCreated={onStoryCreated} />
      )}
      {isTrending && (
        <TrendingFeed posts={trendingPosts} colors={colors} />
      )}
    </>
  );
}

export default function FeedScreen() {
  "use no memo";
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const userId = session?.user?.id ?? "";

  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState("explore");
  const isTrending = activeCategory === "trending";

  const [contentType, setContentType] = useState<ContentType>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const contentTypeRef = useRef<ContentType>("all");
  const sortOrderRef = useRef<SortOrder>("newest");
  const [showContentMenu, setShowContentMenu] = useState(false);
  const [tabStates, setTabStates] = useState<Record<FeedTabId, TabState>>({
    foryou: { ...INIT_TAB },
    friends: { ...INIT_TAB, loading: false },
  });
  const tabStatesRef = useRef(tabStates);
  useEffect(() => { tabStatesRef.current = tabStates; }, [tabStates]);

  // Keep content-type, sort, and category refs in sync so loadTabData (stable callback) reads current values
  useEffect(() => { contentTypeRef.current = contentType; }, [contentType]);
  useEffect(() => { sortOrderRef.current = sortOrder; }, [sortOrder]);
  const activeCategoryRef = useRef("explore");
  useEffect(() => { activeCategoryRef.current = activeCategory; }, [activeCategory]);

  // Re-fetch For You when content type, sort, or category changes (skip first mount — userId effect handles that)
  const filterInitRef = useRef(false);
  useEffect(() => {
    if (!filterInitRef.current) { filterInitRef.current = true; return; }
    if (activeCategory === "trending") return; // trending tab uses its own data, no foryou reload needed
    if (userId) loadTabData("foryou", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType, sortOrder, activeCategory]);

  // Remove a deleted post from all cached tab states immediately so it doesn't
  // appear stale before the next pull-to-refresh.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "postDeleted",
      ({ postId }: { postId: string }) => {
        setTabStates((prev) => {
          const next = { ...prev };
          for (const tabId of ["foryou", "friends"] as FeedTabId[]) {
            next[tabId] = {
              ...prev[tabId],
              posts: prev[tabId].posts.filter((p) => p.id !== postId),
            };
          }
          return next;
        });
      },
    );
    return () => sub.remove();
  }, []);

  const myUsername: string =
    session?.user?.user_metadata?.["username"] ??
    session?.user?.email?.split("@")[0] ??
    "you";
  const ownStoryPlaceholder: StoryEntry = {
    id: "own_placeholder",
    username: myUsername,
    image: "",
    hasNew: false,
    isOwn: true,
    userId: userId || undefined,
    hasExistingStory: false,
  };
  const [friendStories, setFriendStories] = useState<StoryEntry[]>([ownStoryPlaceholder]);
  const [refreshing, setRefreshing] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { notifCount: rtNotifCount, messageCount: rtMsgCount, clearNotifBadge, clearMessageBadge } = useRealtime();
  const [trendingPosts, setTrendingPosts] = useState<TrendingPost[]>([]);

  // ── Video playback lifecycle ────────────────────────────────────────────────
  // Track whether this screen is focused (no video should play while off-screen)
  const [screenFocused, setScreenFocused] = useState(true);
  // Track which post ID is currently visible in each tab's FlatList
  const [visiblePostIds, setVisiblePostIds] = useState<Record<FeedTabId, string | null>>({
    foryou: null,
    friends: null,
  });

  // Stable viewability config — item must be ≥60% visible to count as "active"
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  // Per-tab stable onViewableItemsChanged handlers (must be stable refs for FlatList)
  const viewableHandlers = useRef(
    TABS.map((tab) => ({ viewableItems }: { viewableItems: Array<{ isViewable: boolean; item: Post }> }) => {
      const top = viewableItems.find((v) => v.isViewable);
      setVisiblePostIds((prev) => ({ ...prev, [tab.id]: top?.item?.id ?? null }));
    })
  ).current;

  const pagerRef = useRef<ScrollView>(null);
  const mainTabSwipe = useMainTabSwipe("feed");
  const scrollX = useRef(new Animated.Value(0)).current;
  const pillsAnim = useRef(new Animated.Value(1)).current;
  const flatListRefs = useRef<(FlatList | null)[]>([null, null]);
  // Per-tab drag-start index for ±1 clamping (same pattern as Reels feed)
  const dragStartIndexRefs = useRef<number[]>([0, 0]);
  const loadedTabs = useRef<Set<FeedTabId>>(new Set());
  // Generation counter — incremented on every reset load for a tab.
  // Before committing fetched data we verify the generation still matches,
  // which prevents a slow unfiltered load from overwriting a faster filtered one.
  const tabLoadGen = useRef<Record<FeedTabId, number>>({ foryou: 0, friends: 0 });
  const isScrollingPager = useRef(false);
  const [headerHeight, setHeaderHeight] = useState(120);
  // Tab bar: 68px height + 10px bottom offset = 78px from screen bottom.
  // Add 10px breathing room → reserve 88px so no post content slides under the tab bar.
  const snapH = H - headerHeight - (Platform.OS === "web" ? 84 : insets.bottom + 58);
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);

  const friendsSwipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e: GestureResponderEvent, gs: PanResponderGestureState) =>
        gs.dx < -20 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderRelease: (_e: GestureResponderEvent, gs: PanResponderGestureState) => {
        if (gs.dx < -50) router.push("/inbox");
      },
    })
  ).current;

  const activeTab = TABS[activeTabIndex].id;

  const updateTab = useCallback((tab: FeedTabId, update: Partial<TabState>) => {
    setTabStates((prev) => ({ ...prev, [tab]: { ...prev[tab], ...update } }));
  }, []);

  const loadTabData = useCallback(async (tab: FeedTabId, reset = false) => {
    const state = tabStatesRef.current[tab];
    const offset = reset ? 0 : state.offset;

    if (!reset && (state.loadingMore || !state.hasMore)) return;

    // Stamp this call with a generation number so stale (slower) reset responses
    // can't overwrite results from a newer reset (e.g. filter change races
    // against the initial unfiltered load).
    const gen = reset ? ++tabLoadGen.current[tab] : tabLoadGen.current[tab];

    if (reset) updateTab(tab, { loading: true, posts: [], offset: 0, hasMore: true });
    else updateTab(tab, { loadingMore: true });

    try {
      let data: Post[] = [];
      if (tab === "foryou") {
        const catParam = activeCategoryRef.current !== "explore" && activeCategoryRef.current !== "trending"
          ? activeCategoryRef.current
          : undefined;
        data = userId ? await getForYouFeed(userId, PAGE_SIZE, offset, contentTypeRef.current, sortOrderRef.current, catParam) : MOCK_FOR_YOU;
        if (!userId) { console.log('[loadTabData] no userId, showing mock'); updateTab("foryou", { posts: MOCK_FOR_YOU, loading: false, loadingMore: false, hasMore: false }); return; }
      } else if (tab === "friends") {
        data = userId ? await getFriendsFeed(userId, PAGE_SIZE, offset) : [];
      }

      console.log('[loadTabData] tab:', tab, 'data.length:', data.length, 'reset:', reset, 'gen:', gen);

      // If a newer reset already started for this tab, discard our stale result.
      if (reset && gen !== tabLoadGen.current[tab]) {
        console.log('[loadTabData] stale reset discarded tab:', tab, 'gen:', gen, 'current:', tabLoadGen.current[tab]);
        return;
      }

      // Keep existing accumulated posts; only wipe on an explicit reset.
      // Previously a cycle-wrap (offset===0 on pagination) cleared prev which
      // erased all accumulated posts — that bug is removed.
      const prev = reset ? [] : tabStatesRef.current[tab].posts;
      const merged = [...prev, ...data];
      const seenIds = new Set<string>();
      const deduped = merged.filter((p, i) => {
        const key = p.id ? `id:${p.id}` : `idx:${i}`;
        if (seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
      });
      console.log('[loadTabData] tab:', tab, 'deduped:', deduped.length, 'posts');

      // When we reach the end of content (partial page returned), stop requesting
      // more — hasMore: false prevents further onEndReached triggers.
      // Do not cycle offset back to 0; pull-to-refresh is the correct way to restart.
      const atEnd = data.length < PAGE_SIZE;
      const nextOffset = atEnd ? offset : offset + data.length;
      const hasMore = !atEnd;

      updateTab(tab, {
        posts: deduped,
        loading: false,
        loadingMore: false,
        offset: nextOffset,
        hasMore,
      });
      loadedTabs.current.add(tab);
    } catch (e: any) {
      console.log('[loadTabData] CATCH tab:', tab, 'error:', e?.message);
    } finally {
      // Always unblock the UI — guards every path including AbortError timeouts
      // and the early-return for no-userId, ensuring loadingMore never stays stuck.
      updateTab(tab, { loading: false, loadingMore: false });
    }
  }, [userId, updateTab]);

  useEffect(() => {
    loadTabData("foryou", true);
  }, [userId]);

  // Do NOT reload data on focus — that resets scroll position mid-read.
  // Data loads on mount (useEffect above) and on pull-to-refresh only.
  // Track screen focus so videos pause when the user switches tabs.
  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    return () => {
      setScreenFocused(false);
      // Also clear visible IDs so no stale post gets "isActive" when returning
      setVisiblePostIds({ foryou: null, friends: null });
    };
  }, []));


  // Load friend stories (for Friends tab)
  useEffect(() => {
    if (!userId) return;
    // Always show the "Your Story" button immediately while we wait
    setFriendStories([{ ...ownStoryPlaceholder, userId }]);
    // Fetch with a 15 s timeout — keeps the placeholder on error / timeout.
    // The generous timeout handles Android + Replit proxy latency.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("stories_timeout")), 15000),
    );
    Promise.race([fetchFriendStories(userId, myUsername), timeout])
      .then((entries) => {
        setFriendStories(entries);
        // If own story is still showing as placeholder after fetch, do a
        // lightweight own-story check so hasExistingStory is correct even
        // when the friends-stories slice timed out or returned no own entry.
        const ownEntry = entries.find((e) => e.isOwn);
        if (ownEntry && !ownEntry.hasExistingStory && ownEntry.id === "own_placeholder") {
          fetch(`${(process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api"}/stories/check?userId=${encodeURIComponent(userId)}`)
            .then((r) => r.json())
            .then((data: any) => {
              if (data?.exists && data?.storyId) {
                setFriendStories((prev) =>
                  prev.map((s) =>
                    s.isOwn
                      ? { ...s, id: data.storyId, hasExistingStory: true, storyType: data.storyType ?? s.storyType, textContent: data.textContent ?? s.textContent, bgGradient: data.bgGradient ?? s.bgGradient, caption: data.caption ?? s.caption }
                      : s,
                  ),
                );
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {}); // keep placeholder on error / timeout
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const refreshStories = React.useCallback(() => {
    if (!userId) return;
    fetchFriendStories(userId, myUsername)
      .then(setFriendStories)
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchUnreadCount(userId).then(setUnreadCount).catch(() => {});
  }, [userId]);

  // Load trending posts whenever the Trending category is active
  useEffect(() => {
    if (activeCategory !== "trending") return;
    setTrendingPosts([]);
    (async () => {
      try {
        // Route through API server — direct anon-key reads on posts hang under RLS
        const ctParam = contentTypeRef.current !== "all" ? `&content_type=${contentTypeRef.current}` : "";
        const res = await fetch(`${(process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api"}/feed/trending?limit=9${ctParam}`);
        if (res.ok) {
          const json = await res.json();
          const posts = json.posts ?? json.data ?? [];
          setTrendingPosts(posts);
        }
      } catch {
        // leave empty — TrendingFeed shows loading state
      }
    })();
  }, [activeCategory]);

  // Animate pills in/out when tab switches
  useEffect(() => {
    Animated.timing(pillsAnim, {
      toValue: activeTabIndex === 0 ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [activeTabIndex]);

  const switchToIndex = useCallback((index: number) => {
    if (isScrollingPager.current) return;
    const tab = TABS[index].id;
    setActiveTabIndex(index);
    pagerRef.current?.scrollTo({ x: index * W, animated: true });
    if (!loadedTabs.current.has(tab)) loadTabData(tab, true);
  }, [loadTabData]);

  const onPagerMomentumEnd = useCallback((e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / W);
    const tab = TABS[index].id;
    setActiveTabIndex(index);
    isScrollingPager.current = false;
    if (!loadedTabs.current.has(tab)) loadTabData(tab, true);
  }, [loadTabData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTabData(activeTab, true);
    setRefreshing(false);
  }, [activeTab, loadTabData]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 88;
  // Tab bar is position:absolute, height = 58 + insets.bottom — reserves no layout space.
  // Shrink the pager viewport by exactly that height so no card caption can slide under the bar.
  const tabBarH = Platform.OS === "web" ? 84 : insets.bottom + 58;

  // Animated indicator — spans half-width, centered under each tab
  const indicatorLeft = scrollX.interpolate({
    inputRange: [0, W],
    outputRange: [(TAB_W - INDICATOR_W) / 2, TAB_W + (TAB_W - INDICATOR_W) / 2],
    extrapolate: "clamp",
  });

  // Two stable renderItem callbacks — one per tab — so the FlatList prop reference
  // does not change on every render. Using a factory pattern (renderTabPost(tab.id))
  // called inside render produced a new function on every render, forcing all items
  // to re-render on every scroll event.
  const renderForYouItem = useCallback(({ item }: { item: Post }) => {
    if (userId) markPostSeen(userId, item.id).catch(() => {});
    return (
      <PostCard
        post={item}
        onRequireLogin={() => setShowLoginPrompt(true)}
        isLoggedIn={isLoggedIn}
        isActive={screenFocused && activeTab === "foryou" && visiblePostIds["foryou"] === item.id}
        onPress={() => router.push(`/post/${item.id}` as any)}
      />
    );
  }, [isLoggedIn, userId, screenFocused, activeTab, visiblePostIds]);

  const renderFriendsItem = useCallback(({ item }: { item: Post }) => {
    if (userId) markPostSeen(userId, item.id).catch(() => {});
    return (
      <PostCard
        post={item}
        onRequireLogin={() => setShowLoginPrompt(true)}
        isLoggedIn={isLoggedIn}
        isActive={screenFocused && activeTab === "friends" && visiblePostIds["friends"] === item.id}
        onPress={() => router.push(`/post/${item.id}` as any)}
      />
    );
  }, [isLoggedIn, userId, screenFocused, activeTab, visiblePostIds]);

  const renderEmpty = useCallback((tabId: FeedTabId) => {
    const state = tabStates[tabId];
    if (state.loading) {
      return <View>{[1, 2].map((i) => <SkeletonPost key={i} />)}</View>;
    }
    if (tabId === "foryou") {
      if (isTrending) return null;
      return (
        <View style={emptyStyles.wrap}>
          <Text style={emptyStyles.emoji}>📸</Text>
          <Text style={[emptyStyles.title, { color: colors.foreground }]}>No posts yet</Text>
          <Text style={[emptyStyles.sub, { color: colors.mutedForeground }]}>
            Follow people to see posts here, or be the first to create one.
          </Text>
          <TouchableOpacity style={emptyStyles.actionBtn} onPress={() => router.push("/create" as any)}>
            <Text style={emptyStyles.actionBtnText}>Create a post</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (tabId === "friends") {
      return (
        <View>
          <View style={emptyStyles.wrap}>
            <Text style={emptyStyles.emoji}>👥</Text>
            <Text style={[emptyStyles.title, { color: colors.foreground }]}>No friends posts yet</Text>
            <Text style={[emptyStyles.sub, { color: colors.mutedForeground }]}>Follow people back to see their posts here</Text>
          </View>
          <SuggestedCTA colors={colors} />
        </View>
      );
    }
    return null;
  }, [tabStates, colors, isTrending, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...mainTabSwipe.panHandlers}>
      {/* Fixed Header */}
      <Animated.View
        style={[styles.header, { paddingTop: topInset + 8, backgroundColor: colors.background, transform: [{ translateY: headerTranslateY }], position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.headerTop}>
          {/* Left group: logo + content-type button sit adjacent */}
          <View style={feedControlStyles.logoGroup}>
            <VibeLogo />
            {/* Always mounted — hide via display to avoid Ionicons remount on tab switch */}
            <View style={[feedControlStyles.headerControls, { display: activeTabIndex === 0 ? "flex" : "none" }]}>
              <TouchableOpacity
                onPress={() => setShowContentMenu((v) => !v)}
                style={[feedControlStyles.sortBtn, contentType !== "all" && feedControlStyles.sortBtnActive]}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13, color: contentType !== "all" ? "#8B5CF6" : "rgba(255,255,255,0.45)", lineHeight: 18 }}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => { clearNotifBadge(); setUnreadCount(0); router.push("/notifications"); }}
            >
              <Ionicons name="notifications" size={24} color={colors.foreground} />
              {(unreadCount + rtNotifCount) > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadCount + rtNotifCount > 99 ? "99+" : String(unreadCount + rtNotifCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => { if (!isLoggedIn) { setShowLoginPrompt(true); return; } clearMessageBadge(); router.push("/inbox"); }}
            >
              <Ionicons name="chatbubble" size={24} color={colors.foreground} />
              {rtMsgCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {rtMsgCount > 99 ? "99+" : String(rtMsgCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/search")}>
              <Ionicons name="search" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Bar */}
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          {/* For You tab */}
          <TouchableOpacity style={styles.tabBtn} onPress={() => switchToIndex(0)} activeOpacity={0.7}>
            <Text style={[
              styles.tabText,
              { color: activeTabIndex === 0 ? colors.foreground : colors.mutedForeground },
              activeTabIndex === 0 && styles.tabTextActive,
            ]}>For You</Text>
          </TouchableOpacity>

          {/* Friends tab */}
          <TouchableOpacity style={styles.tabBtn} onPress={() => switchToIndex(1)} activeOpacity={0.7}>
            <Text style={[
              styles.tabText,
              { color: activeTabIndex === 1 ? colors.foreground : colors.mutedForeground },
              activeTabIndex === 1 && styles.tabTextActive,
            ]}>Friends</Text>
          </TouchableOpacity>

          {/* Sliding indicator */}
          <Animated.View style={[styles.indicator, { left: indicatorLeft }]}>
            <LinearGradient
              colors={["#7C3AED", "#F97316"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        {/* Category pills — For You only, animated */}
        <Animated.View style={{
          maxHeight: pillsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 52] }),
          opacity: pillsAnim,
          overflow: "hidden",
        }}>
          <CategoryPills
            active={activeCategory}
            onSelect={(id) => setActiveCategory(id)}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </Animated.View>
      </Animated.View>

      {/* Swipeable Tab Pages */}
      <Animated.ScrollView
        ref={pagerRef as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { isScrollingPager.current = true; }}
        onMomentumScrollEnd={onPagerMomentumEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        style={{ flex: 1, marginBottom: tabBarH }}
        contentContainerStyle={{ flexDirection: "row" }}
        nestedScrollEnabled
      >
        {TABS.map((tab, tabIndex) => {
          const state = tabStates[tab.id];
          const filteredPosts = state.posts; // category is now filtered server-side
          return (
            <View key={tab.id} style={{ width: W, flex: 1 }} {...(tab.id === "friends" ? friendsSwipePan.panHandlers : {})}>
              <FlatList
                ref={(ref) => { flatListRefs.current[tabIndex] = ref; }}
                data={state.loading ? [] : (isTrending ? [] : filteredPosts)}
                keyExtractor={(item, index) => {
                  const postId = item.id;
                  return postId ? `post_${postId}_${tab.id}` : `noid_${tab.id}_${index}`;
                }}
                renderItem={tab.id === "foryou" ? renderForYouItem : renderFriendsItem}
                onViewableItemsChanged={viewableHandlers[tabIndex]}
                viewabilityConfig={viewabilityConfig}
                decelerationRate="normal"
                onMomentumScrollEnd={(e) => {
                  dragStartIndexRefs.current[tabIndex] = Math.max(0, Math.floor(e.nativeEvent.contentOffset.y / 400));
                }}
                scrollEventThrottle={16}
                onScroll={(e) => {
                  if (activeTabIndex !== tabIndex) return;
                  const y = e.nativeEvent.contentOffset.y;
                  const dy = y - lastScrollY.current;
                  lastScrollY.current = y;
                  if (Math.abs(dy) < 2) return;
                  Animated.timing(headerTranslateY, {
                    toValue: dy > 0 ? -headerHeight : 0,
                    duration: 300,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: false,
                  }).start();
                }}
                ListHeaderComponent={
                  // Pass JSX elements (not inline functions) so React reconciles by
                  // component type identity. Module-scope ForYouListHeader /
                  // FriendsListHeader have stable type references → React re-renders
                  // (not remounts) them on every FeedScreen state update, preserving
                  // CuratedFeedList's internal state and eliminating the skeleton loop.
                  tab.id === "foryou"
                    ? <ForYouListHeader isTrending={isTrending} trendingPosts={trendingPosts} colors={colors} />
                    : <FriendsListHeader isTrending={isTrending} trendingPosts={trendingPosts} colors={colors} stories={friendStories} userId={userId} activeTab={activeTab} onStoryCreated={refreshStories} />
                }
                ListEmptyComponent={() => renderEmpty(tab.id)}
                ListFooterComponent={() => {
                  if (state.loadingMore) {
                    return (
                      <View style={{ paddingVertical: 20, alignItems: "center" }}>
                        <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13 }}>Loading more...</Text>
                      </View>
                    );
                  }
                  return null;
                }}
                contentContainerStyle={{ paddingBottom: 24, paddingTop: headerHeight }}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing && activeTab === tab.id}
                    onRefresh={onRefresh}
                    tintColor="#7C3AED"
                    colors={["#7C3AED"]}
                  />
                }
                onEndReached={() => {
                  if (activeTab === tab.id) loadTabData(tab.id);
                }}
                onEndReachedThreshold={0.4}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              />
            </View>
          );
        })}
      </Animated.ScrollView>

      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />

      {/* Content-type menu */}
      {showContentMenu && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowContentMenu(false)}>
          <TouchableOpacity
            style={sortMenuStyles.overlay}
            onPress={() => setShowContentMenu(false)}
            activeOpacity={1}
          >
            <View style={[sortMenuStyles.card, { top: topInset + 92 }]}>
              {CONTENT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={sortMenuStyles.option}
                  onPress={() => { setContentType(opt.id); setShowContentMenu(false); }}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={14}
                    color={contentType === opt.id ? "#8B5CF6" : "rgba(255,255,255,0.6)"}
                  />
                  <Text style={[sortMenuStyles.optionText, contentType === opt.id && sortMenuStyles.optionTextActive]}>
                    {opt.label}
                  </Text>
                  {contentType === opt.id && (
                    <Ionicons name="checkmark" size={12} color="#8B5CF6" style={{ marginLeft: "auto" }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

    </View>
  );
}

const feedControlStyles = StyleSheet.create({
  logoGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 6,
  },
  sortBtn: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  sortBtnActive: {
    backgroundColor: "rgba(139,92,246,0.2)",
  },
});

const sortMenuStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  card: {
    position: "absolute",
    left: 16,
    backgroundColor: "#1A1025",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "rgba(139,92,246,0.25)",
    minWidth: 160,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  optionText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
  optionTextActive: {
    color: "#8B5CF6",
    fontFamily: "Poppins_600SemiBold",
  },
});

const emptyStyles = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32, gap: 10 },
  emoji: { fontSize: 48 },
  title: { fontSize: 16, fontFamily: "Poppins_600SemiBold", textAlign: "center" },
  sub: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 20 },
  actionBtn: { marginTop: 8, backgroundColor: "#7C3AED", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  actionBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { zIndex: 10 },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  brand: { fontSize: 26, fontFamily: "Poppins_700Bold", letterSpacing: 4 },
  headerRight: { flexDirection: "row", gap: 2 },
  iconBtn: { padding: 6, position: "relative" },
  notifDot: {
    position: "absolute", top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#7C3AED", borderWidth: 1.5, borderColor: "#0A0A0F",
  },
  notifBadge: {
    position: "absolute", top: 2, right: 2,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: "#F43F5E", borderWidth: 1.5, borderColor: "#0A0A0F",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
  },
  notifBadgeText: {
    fontSize: 9, fontFamily: "Poppins_700Bold", color: "#fff", lineHeight: 13,
  },
  divider: { height: 0.5 },
  separator: { height: 0.5 },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    position: "relative",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  tabTextActive: { fontFamily: "Poppins_700Bold" },
  indicator: {
    position: "absolute",
    bottom: 0,
    width: INDICATOR_W,
    height: 2.5,
    borderRadius: 2,
    overflow: "hidden",
  },
});
