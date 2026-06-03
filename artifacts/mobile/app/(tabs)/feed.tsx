import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router } from "expo-router";
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
  Image,
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
import {
  fetchActiveStories,
  fetchUnreadCount,
  getForYouFeed,
  getFollowingFeed,
  getFriendsFeed,
  getNearbyFeed,
  getVibesFeed,
  markPostSeen,
  saveTabPreference,
} from "@/lib/db";
import { Post, supabase } from "@/lib/supabase";

const { width: W } = Dimensions.get("window");
const PAGE_SIZE = 20;
const NUM_TABS = 5;
const TAB_W = W / NUM_TABS;
const INDICATOR_W = 28;

type FeedTabId = "foryou" | "friends" | "following" | "nearby" | "vibes";

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
  { id: "following", label: "Following" },
  { id: "nearby", label: "Nearby" },
  { id: "vibes", label: "Vibes" },
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

const MOCK_DISTANCES = [0.3, 0.8, 1.2, 2.1, 3.4, 4.7, 6.2, 8.5, 11.0, 14.3];
const MOCK_INTERESTS = ["travel", "music", "photography", "art", "food", "fitness", "gaming", "comedy"];

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

function DistanceBadge({ distance }: { distance: number }) {
  return (
    <View style={badgeStyles.wrap}>
      <Ionicons name="location" size={11} color="#F97316" />
      <Text style={badgeStyles.text}>{distance.toFixed(1)} km away</Text>
    </View>
  );
}
const badgeStyles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 },
  text: { fontSize: 11, fontFamily: "Poppins_500Medium", color: "#F97316" },
});

function VibeBadge({ interest }: { interest: string }) {
  return (
    <View style={vibeBadge.wrap}>
      <LinearGradient colors={["#7C3AED33", "#F9731633"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <Text style={vibeBadge.text}>✨ #{interest} matched your interests</Text>
    </View>
  );
}
const vibeBadge = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginTop: 8, marginBottom: 2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, overflow: "hidden", borderWidth: 1, borderColor: "rgba(124,58,237,0.25)" },
  text: { fontSize: 11, fontFamily: "Poppins_500Medium", color: "rgba(255,255,255,0.7)" },
});

function TrendingGrid({ posts, colors }: { posts: { id: string; image_url: string; likes_count: number }[]; colors: any }) {
  const ITEM = (W - 4) / 3;
  function fmt(n: number) {
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 24, paddingBottom: 10 }}>
        <LinearGradient colors={["#7C3AED", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 3, height: 16, borderRadius: 2 }} />
        <Text style={{ color: colors.foreground, fontFamily: "Poppins_700Bold", fontSize: 15 }}>Trending on Vibe</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
        {posts.map((p) => (
          <View key={p.id} style={{ position: "relative" }}>
            <Image source={{ uri: p.image_url }} style={{ width: ITEM, height: ITEM }} resizeMode="cover" />
            <View style={{ position: "absolute", bottom: 4, left: 5, flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Ionicons name="heart" size={10} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 10, fontFamily: "Poppins_600SemiBold" }}>{fmt(p.likes_count)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

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
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const userId = session?.user?.id ?? "";

  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [tabStates, setTabStates] = useState<Record<FeedTabId, TabState>>({
    foryou: { ...INIT_TAB },
    friends: { ...INIT_TAB, loading: false },
    following: { ...INIT_TAB, loading: false },
    nearby: { ...INIT_TAB, loading: false },
    vibes: { ...INIT_TAB, loading: false },
  });
  const tabStatesRef = useRef(tabStates);
  useEffect(() => { tabStatesRef.current = tabStates; }, [tabStates]);

  const [stories, setStories] = useState<{ id: string; username: string; image: string; hasNew: boolean; isOwn?: boolean }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { notifCount: rtNotifCount, messageCount: rtMsgCount, clearNotifBadge, clearMessageBadge } = useRealtime();
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAsked, setLocationAsked] = useState(false);
  const [trendingPosts, setTrendingPosts] = useState<{ id: string; image_url: string; likes_count: number }[]>([]);

  const pagerRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatListRefs = useRef<(FlatList | null)[]>([null, null, null, null, null]);
  const loadedTabs = useRef<Set<FeedTabId>>(new Set());
  const isScrollingPager = useRef(false);

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
      } else if (tab === "following") {
        data = userId ? await getFollowingFeed(userId, PAGE_SIZE, offset) : [];
      } else if (tab === "friends") {
        data = userId ? await getFriendsFeed(userId, PAGE_SIZE, offset) : [];
      } else if (tab === "nearby") {
        const coords = locationCoords;
        if (!coords) { updateTab("nearby", { loading: false, loadingMore: false }); return; }
        data = await getNearbyFeed(coords.lat, coords.lng, userId, PAGE_SIZE, offset);
      } else if (tab === "vibes") {
        data = userId ? await getVibesFeed(userId, PAGE_SIZE, offset) : [];
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
  }, [userId, locationCoords, updateTab]);

  const requestLocation = useCallback(async () => {
    if (locationAsked) return;
    setLocationAsked(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocationCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {}
  }, [locationAsked]);

  useEffect(() => {
    loadTabData("foryou", true);
    fetchActiveStories(session?.user?.id).then(setStories).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchUnreadCount(userId).then(setUnreadCount).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (locationCoords && activeTab === "nearby" && !loadedTabs.current.has("nearby")) {
      loadTabData("nearby", true);
    }
  }, [locationCoords, activeTab]);

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

  const switchToIndex = useCallback((index: number) => {
    if (isScrollingPager.current) return;
    const tab = TABS[index].id;
    setActiveTabIndex(index);
    pagerRef.current?.scrollTo({ x: index * W, animated: true });

    if (userId) saveTabPreference(userId, tab).catch(() => {});

    if (tab === "nearby" && !locationAsked) {
      requestLocation();
    } else if (tab === "nearby" && locationCoords && !loadedTabs.current.has("nearby")) {
      loadTabData("nearby", true);
    }

    if (!loadedTabs.current.has(tab) && tab !== "nearby") {
      loadTabData(tab, true);
    }
  }, [userId, locationAsked, locationCoords, loadTabData, requestLocation]);

  const onPagerMomentumEnd = useCallback((e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / W);
    const tab = TABS[index].id;
    setActiveTabIndex(index);
    isScrollingPager.current = false;

    if (userId) saveTabPreference(userId, tab).catch(() => {});

    if (tab === "nearby" && !locationAsked) {
      requestLocation();
    } else if (tab === "nearby" && locationCoords && !loadedTabs.current.has("nearby")) {
      loadTabData("nearby", true);
    }

    if (!loadedTabs.current.has(tab) && tab !== "nearby") {
      loadTabData(tab, true);
    }
  }, [userId, locationAsked, locationCoords, loadTabData, requestLocation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTabData(activeTab, true);
    setRefreshing(false);
  }, [activeTab, loadTabData]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;

  // Animated indicator position
  const indicatorLeft = scrollX.interpolate({
    inputRange: TABS.map((_, i) => i * W),
    outputRange: TABS.map((_, i) => i * TAB_W + (TAB_W - INDICATOR_W) / 2),
    extrapolate: "clamp",
  });

  const renderTabPost = useCallback((tabId: FeedTabId) => ({ item, index }: { item: Post; index: number }) => {
    const distance = MOCK_DISTANCES[index % MOCK_DISTANCES.length];
    const interest = item.caption
      ? MOCK_INTERESTS.find((t) => item.caption?.toLowerCase().includes(t)) ?? MOCK_INTERESTS[index % MOCK_INTERESTS.length]
      : MOCK_INTERESTS[index % MOCK_INTERESTS.length];

    if (userId) markPostSeen(userId, item.id).catch(() => {});

    return (
      <View>
        {tabId === "nearby" && <DistanceBadge distance={distance} />}
        {tabId === "vibes" && <VibeBadge interest={interest} />}
        <PostCard post={item} onRequireLogin={() => setShowLoginPrompt(true)} isLoggedIn={isLoggedIn} />
        {tabId === "foryou" && <WhyThisButton index={index} />}
      </View>
    );
  }, [isLoggedIn, userId]);

  const renderEmpty = useCallback((tabId: FeedTabId) => {
    const state = tabStates[tabId];
    if (state.loading) {
      return <View>{[1, 2].map((i) => <SkeletonPost key={i} />)}</View>;
    }

    if (tabId === "nearby" && !locationCoords && locationAsked) {
      return (
        <View style={emptyStyles.wrap}>
          <Text style={emptyStyles.emoji}>📍</Text>
          <Text style={[emptyStyles.title, { color: colors.foreground }]}>Location access needed</Text>
          <Text style={[emptyStyles.sub, { color: colors.mutedForeground }]}>Enable location permissions to see posts near you</Text>
        </View>
      );
    }
    if (tabId === "nearby" && !locationAsked) {
      return (
        <View style={emptyStyles.wrap}>
          <Text style={emptyStyles.emoji}>📍</Text>
          <Text style={[emptyStyles.title, { color: colors.foreground }]}>Posts near you</Text>
          <Text style={[emptyStyles.sub, { color: colors.mutedForeground }]}>Allow location access to discover local content</Text>
          <TouchableOpacity
            onPress={requestLocation}
            style={{ backgroundColor: "#7C3AED", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 12 }}
          >
            <Text style={{ color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>Allow Location →</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (tabId === "foryou") {
      return (
        <View>
          <View style={[emptyStyles.wrap, { paddingBottom: 8 }]}>
            <Text style={emptyStyles.emoji}>✨</Text>
            <Text style={[emptyStyles.title, { color: colors.foreground }]}>Your feed is warming up</Text>
            <Text style={[emptyStyles.sub, { color: colors.mutedForeground }]}>Interact with a few posts to personalise your For You feed</Text>
          </View>
          {trendingPosts.length > 0 && <TrendingGrid posts={trendingPosts} colors={colors} />}
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

    if (tabId === "following") {
      return (
        <View>
          <View style={emptyStyles.wrap}>
            <Text style={emptyStyles.emoji}>💜</Text>
            <Text style={[emptyStyles.title, { color: colors.foreground }]}>Follow people to see their posts</Text>
            <Text style={[emptyStyles.sub, { color: colors.mutedForeground }]}>Discover creators and follow them to fill this tab</Text>
          </View>
          <SuggestedCTA colors={colors} />
        </View>
      );
    }

    if (tabId === "vibes") {
      return (
        <View style={emptyStyles.wrap}>
          <Text style={emptyStyles.emoji}>🔥</Text>
          <Text style={[emptyStyles.title, { color: colors.foreground }]}>Add interests in your profile</Text>
          <Text style={[emptyStyles.sub, { color: colors.mutedForeground }]}>Tell us what you're into and we'll find posts that match your vibe</Text>
          <TouchableOpacity onPress={() => router.push("/edit-profile" as any)} style={emptyStyles.actionBtn}>
            <Text style={emptyStyles.actionBtnText}>Edit Interests →</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  }, [tabStates, colors, locationCoords, locationAsked, trendingPosts, requestLocation]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Fixed Header */}
      <View style={[styles.header, { paddingTop: topInset + 8, backgroundColor: colors.background }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.brand, { color: colors.foreground }]}>VIBE</Text>
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

        <StoryRow stories={stories} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

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
          return (
            <View key={tab.id} style={{ width: W, flex: 1 }}>
              <FlatList
                ref={(ref) => { flatListRefs.current[tabIndex] = ref; }}
                data={state.loading ? [] : state.posts}
                keyExtractor={(item) => item.id + tab.id}
                renderItem={renderTabPost(tab.id)}
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
                      <View style={{ paddingVertical: 24, alignItems: "center", gap: 4 }}>
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
