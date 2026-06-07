import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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
  Dimensions,
  FlatList,
  GestureResponderEvent,
  Image,
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
import { AdCard } from "@/components/AdCard";
import { LoginPrompt } from "@/components/LoginPrompt";
import { PostCard } from "@/components/PostCard";
import { CuratedFeedList } from "@/components/CuratedFeedList";
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
import { AdItem, HOUSE_ADS, insertAdsInFeed, loadFeedAds } from "@/lib/ads";

const { width: W } = Dimensions.get("window");
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

const MOCK_TRENDING_GRID = Array.from({ length: 9 }, (_, i) => ({
  id: `tr${i}`,
  image_url: `https://picsum.photos/seed/trend${i + 1}/300/300`,
  likes_count: Math.floor(Math.random() * 80000 + 5000),
}));

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


function TrendingGrid({ posts, colors, title = "Trending on Gundruk" }: { posts: { id: string; image_url: string; likes_count: number }[]; colors: any; title?: string }) {
  const ITEM = (W - 4) / 3;
  function fmt(n: number) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 10 }}>
        <LinearGradient colors={["#7C3AED", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 3, height: 16, borderRadius: 2 }} />
        <Text style={{ color: colors.foreground, fontFamily: "Poppins_700Bold", fontSize: 15 }}>{title}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
        {posts.map((p) => (
          <TouchableOpacity
            key={p.id}
            activeOpacity={0.85}
            onPress={() => router.push(`/post/${p.id}` as any)}
            style={{ position: "relative" }}
          >
            <Image source={{ uri: p.image_url }} style={{ width: ITEM, height: ITEM }} resizeMode="cover" />
            <View style={{ position: "absolute", bottom: 4, left: 5, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Text style={{ fontSize: 9 }}>❤️</Text>
                <Text style={{ color: "#fff", fontSize: 10, fontFamily: "Poppins_600SemiBold", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>{fmt(p.likes_count)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Text style={{ fontSize: 9 }}>👁️</Text>
                <Text style={{ color: "#fff", fontSize: 10, fontFamily: "Poppins_600SemiBold", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>{fmt(p.likes_count * 8)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function FriendsStoriesBar({ stories, colors }: { stories: StoryEntry[]; colors: any }) {
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
      <StoryRow stories={stories} />
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

export default function FeedScreen() {
  "use no memo";
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const userId = session?.user?.id ?? "";

  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState("explore");
  const [tabStates, setTabStates] = useState<Record<FeedTabId, TabState>>({
    foryou: { ...INIT_TAB },
    friends: { ...INIT_TAB, loading: false },
  });
  const tabStatesRef = useRef(tabStates);
  useEffect(() => { tabStatesRef.current = tabStates; }, [tabStates]);

  const [feedAds, setFeedAds] = useState<AdItem[]>(HOUSE_ADS);
  const [friendStories, setFriendStories] = useState<StoryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { notifCount: rtNotifCount, messageCount: rtMsgCount, clearNotifBadge, clearMessageBadge } = useRealtime();
  const [trendingPosts, setTrendingPosts] = useState<{ id: string; image_url: string; likes_count: number }[]>([]);

  const pagerRef = useRef<ScrollView>(null);
  const mainTabSwipe = useMainTabSwipe("feed");
  const scrollX = useRef(new Animated.Value(0)).current;
  const pillsAnim = useRef(new Animated.Value(1)).current;
  const flatListRefs = useRef<(FlatList | null)[]>([null, null]);
  const loadedTabs = useRef<Set<FeedTabId>>(new Set());
  const isScrollingPager = useRef(false);

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
    if (reset) updateTab(tab, { loading: true, posts: [], offset: 0, hasMore: true });
    else updateTab(tab, { loadingMore: true });

    try {
      let data: Post[] = [];
      if (tab === "foryou") {
        data = userId ? await getForYouFeed(userId, PAGE_SIZE, offset) : MOCK_FOR_YOU;
        if (!userId) { updateTab("foryou", { posts: MOCK_FOR_YOU, loading: false, loadingMore: false, hasMore: false }); return; }
      } else if (tab === "friends") {
        data = userId ? await getFriendsFeed(userId, PAGE_SIZE, offset) : [];
      }

      const prev = reset ? [] : tabStatesRef.current[tab].posts;
      updateTab(tab, {
        posts: [...prev, ...data],
        loading: false,
        loadingMore: false,
        offset: offset + data.length,
        hasMore: data.length === PAGE_SIZE,
      });
      loadedTabs.current.add(tab);
    } catch {
      updateTab(tab, { loading: false, loadingMore: false });
    }
  }, [userId, updateTab]);

  useEffect(() => {
    loadTabData("foryou", true);
  }, [userId]);

  useEffect(() => {
    loadFeedAds(userId || undefined, "feed_post").then(setFeedAds).catch(() => setFeedAds(HOUSE_ADS));
  }, [userId]);

  // Load friend stories (for Friends tab) + realtime subscription
  useEffect(() => {
    if (!userId) return;
    fetchFriendStories(userId).then(setFriendStories).catch(() => {});

    const channel = supabase
      .channel(`friend-stories-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stories" },
        () => { fetchFriendStories(userId).then(setFriendStories).catch(() => {}); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchUnreadCount(userId).then(setUnreadCount).catch(() => {});
  }, [userId]);

  // Load trending posts when for you tab is empty
  useEffect(() => {
    const fyState = tabStates.foryou;
    if (!fyState.loading && fyState.posts.length === 0) {
      (async () => {
        try {
          const { data } = await supabase.from("posts").select("id, image_url, likes_count")
            .order("likes_count", { ascending: false })
            .limit(9);
          setTrendingPosts(data?.length ? data : MOCK_TRENDING_GRID);
        } catch {
          setTrendingPosts(MOCK_TRENDING_GRID);
        }
      })();
    }
  }, [tabStates.foryou.loading, tabStates.foryou.posts.length]);

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
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;

  // Animated indicator — spans half-width, centered under each tab
  const indicatorLeft = scrollX.interpolate({
    inputRange: [0, W],
    outputRange: [(TAB_W - INDICATOR_W) / 2, TAB_W + (TAB_W - INDICATOR_W) / 2],
    extrapolate: "clamp",
  });

  const renderTabPost = useCallback((tabId: FeedTabId) => ({ item, index }: { item: Post | AdItem; index: number }) => {
    if ('isAd' in item && item.isAd) {
      return (
        <AdCard
          ad={item as AdItem}
          userId={userId || undefined}
          onHide={(adId) => setFeedAds((prev) => prev.filter((a) => a.ad_id !== adId))}
        />
      );
    }
    const post = item as Post;
    if (userId) markPostSeen(userId, post.id).catch(() => {});
    return (
      <View>
        <PostCard post={post} onRequireLogin={() => setShowLoginPrompt(true)} isLoggedIn={isLoggedIn} />
        {tabId === "foryou" && <WhyThisButton index={index} />}
      </View>
    );
  }, [isLoggedIn, userId]);

  const renderEmpty = useCallback((tabId: FeedTabId) => {
    const state = tabStates[tabId];
    if (tabId === "foryou") {
      // Header always shows CuratedFeedList — nothing extra needed in empty slot
      return null;
    }
    if (state.loading) {
      return <View>{[1, 2].map((i) => <SkeletonPost key={i} />)}</View>;
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
  }, [tabStates, colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...mainTabSwipe.panHandlers}>
      {/* Fixed Header */}
      <View style={[styles.header, { paddingTop: topInset + 8, backgroundColor: colors.background }]}>
        <View style={styles.headerTop}>
          <VibeLogo />
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => { clearNotifBadge(); setUnreadCount(0); router.push("/notifications"); }}
            >
              <Ionicons name="notifications-outline" size={24} color={colors.foreground} />
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
              <Ionicons name="chatbubble-outline" size={24} color={colors.foreground} />
              {rtMsgCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {rtMsgCount > 99 ? "99+" : String(rtMsgCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/search")}>
              <Ionicons name="search-outline" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Bar */}
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          {TABS.map((tab, i) => {
            const isActive = i === activeTabIndex;
            return (
              <TouchableOpacity
                key={tab.id}
                style={styles.tabBtn}
                onPress={() => switchToIndex(i)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.tabText,
                  { color: isActive ? colors.foreground : colors.mutedForeground },
                  isActive && styles.tabTextActive,
                ]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}

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
      </View>

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
        style={{ flex: 1 }}
        contentContainerStyle={{ flexDirection: "row" }}
        nestedScrollEnabled
      >
        {TABS.map((tab, tabIndex) => {
          const state = tabStates[tab.id];
          const catDef = CATEGORIES.find((c) => c.id === activeCategory);
          const isTrending = activeCategory === "trending";
          const filteredPosts = (catDef && catDef.keywords.length > 0 && !state.loading)
            ? state.posts.filter((p) => {
                const haystack = (p.caption ?? "").toLowerCase();
                return catDef.keywords.some((kw) => haystack.includes(kw));
              })
            : state.posts;
          return (
            <View key={tab.id} style={{ width: W, flex: 1 }} {...(tab.id === "friends" ? friendsSwipePan.panHandlers : {})}>
              <FlatList
                ref={(ref) => { flatListRefs.current[tabIndex] = ref; }}
                data={state.loading ? [] : (isTrending ? [] : (insertAdsInFeed(filteredPosts, feedAds) as (Post | AdItem)[]))}
                keyExtractor={(item) => (('isAd' in item && (item as AdItem).isAd) ? `ad-${(item as AdItem).ad_id}` : (item as Post).id) + tab.id}
                renderItem={renderTabPost(tab.id)}
                ListHeaderComponent={() => {
                  if (isTrending) {
                    return (
                      <>
                        {tab.id === "friends" && friendStories.length > 0 && (
                          <FriendsStoriesBar stories={friendStories} colors={colors} />
                        )}
                        <TrendingGrid
                          posts={trendingPosts.length > 0 ? trendingPosts : MOCK_TRENDING_GRID}
                          colors={colors}
                          title={`🔥 Trending — ${TABS[tabIndex].label}`}
                        />
                      </>
                    );
                  }
                  if (tab.id === "friends") {
                    return <FriendsStoriesBar stories={friendStories} colors={colors} />;
                  }
                  if (tab.id === "foryou") {
                    // Always show Pexels curated content — above user posts when they exist,
                    // or as the full feed when the app is new and DB is empty
                    return <CuratedFeedList mode="empty" maxPhotos={10} maxVideos={5} />;
                  }
                  return null;
                }}
                ListEmptyComponent={() => renderEmpty(tab.id)}
                ListFooterComponent={() => {
                  if (state.loadingMore) {
                    return (
                      <View style={{ paddingVertical: 20, alignItems: "center" }}>
                        <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13 }}>Loading more...</Text>
                      </View>
                    );
                  }
                  if (!state.hasMore && state.posts.length > 0) {
                    return (
                      <View style={{ paddingVertical: 20, alignItems: "center", gap: 4 }}>
                        <Text style={{ fontSize: 20 }}>🎉</Text>
                        <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_500Medium", fontSize: 13 }}>You're all caught up!</Text>
                        <TouchableOpacity onPress={onRefresh}>
                          <Text style={{ color: "#7C3AED", fontFamily: "Poppins_500Medium", fontSize: 12, marginTop: 4 }}>Refresh for new posts ↑</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }
                  return null;
                }}
                contentContainerStyle={{ paddingBottom: bottomInset }}
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
                ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
                nestedScrollEnabled
              />
            </View>
          );
        })}
      </Animated.ScrollView>

      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
    </View>
  );
}

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
