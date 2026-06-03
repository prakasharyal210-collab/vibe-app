import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
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
import { SkeletonPost } from "@/components/SkeletonLoader";
import { StoryRow } from "@/components/StoryRow";
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
import { Post } from "@/lib/supabase";

const PAGE_SIZE = 20;

type FeedTabId = "foryou" | "following" | "friends" | "nearby" | "vibes";

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
  { id: "following", label: "Following" },
  { id: "friends", label: "Friends" },
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

// For You Fallback mock posts
const MOCK_FOR_YOU: Post[] = [
  {
    id: "fy1", user_id: "u6", image_url: "https://picsum.photos/seed/fy1/400/400",
    images: ["https://picsum.photos/seed/fy1/400/400", "https://picsum.photos/seed/fy1b/400/400"],
    caption: "The best sunsets are the ones you didn't plan 🌅 #spontaneous #travel",
    location: "Amalfi Coast, Italy", likes_count: 4821, comments_count: 203,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    profiles: { id: "u6", username: "alex.w", is_verified: true },
  },
  {
    id: "fy2", user_id: "u7", image_url: "https://picsum.photos/seed/fy2/400/400",
    images: ["https://picsum.photos/seed/fy2/400/400"],
    caption: "Studio session 🎵 new music coming very soon... #music #vibes",
    likes_count: 1933, comments_count: 88,
    created_at: new Date(Date.now() - 21600000).toISOString(),
    profiles: { id: "u7", username: "maya_art" },
  },
  {
    id: "fy3", user_id: "u8", image_url: "https://picsum.photos/seed/fy3/400/400",
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

function EmptyState({ tab, colors }: { tab: FeedTabId; colors: any }) {
  const configs: Record<FeedTabId, { emoji: string; title: string; sub: string; action?: { label: string; href: string } }> = {
    foryou: { emoji: "✨", title: "Your feed is warming up", sub: "Interact with a few posts to personalise your For You feed" },
    following: { emoji: "💜", title: "Follow people to see their posts", sub: "Discover creators and follow them to fill this tab", action: { label: "Discover People →", href: "/search" } },
    friends: { emoji: "👥", title: "No mutual friends yet", sub: "When people you follow follow you back, their posts appear here" },
    nearby: { emoji: "📍", title: "No posts near you yet", sub: "Be the first to post from your area!" },
    vibes: { emoji: "🔥", title: "Add interests in your profile", sub: "Tell us what you're into and we'll find posts that match your vibe" },
  };
  const c = configs[tab];
  return (
    <View style={emptyStyles.wrap}>
      <Text style={emptyStyles.emoji}>{c.emoji}</Text>
      <Text style={[emptyStyles.title, { color: colors.foreground }]}>{c.title}</Text>
      <Text style={[emptyStyles.sub, { color: colors.mutedForeground }]}>{c.sub}</Text>
      {c.action && (
        <TouchableOpacity onPress={() => router.push(c.action!.href as any)} style={emptyStyles.btn}>
          <Text style={emptyStyles.btnText}>{c.action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const emptyStyles = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32, gap: 10 },
  emoji: { fontSize: 48 },
  title: { fontSize: 16, fontFamily: "Poppins_600SemiBold", textAlign: "center" },
  sub: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 20 },
  btn: { marginTop: 8 },
  btnText: { color: "#7C3AED", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
});

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const userId = session?.user?.id ?? "";

  const [activeTab, setActiveTab] = useState<FeedTabId>("foryou");
  const [tabStates, setTabStates] = useState<Record<FeedTabId, TabState>>({
    foryou: { ...INIT_TAB },
    following: { ...INIT_TAB, loading: false },
    friends: { ...INIT_TAB, loading: false },
    nearby: { ...INIT_TAB, loading: false },
    vibes: { ...INIT_TAB, loading: false },
  });
  const tabStatesRef = useRef(tabStates);
  useEffect(() => { tabStatesRef.current = tabStates; }, [tabStates]);

  const [stories, setStories] = useState<{ id: string; username: string; image: string; hasNew: boolean; isOwn?: boolean }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAsked, setLocationAsked] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const scrollPositions = useRef<Partial<Record<FeedTabId, number>>>({});
  const loadedTabs = useRef<Set<FeedTabId>>(new Set());

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
        if (!coords) {
          updateTab("nearby", { loading: false, loadingMore: false });
          return;
        }
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

  // Request location for Nearby
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

  // Initial load
  useEffect(() => {
    loadTabData("foryou", true);
    fetchActiveStories(session?.user?.id).then(setStories).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchUnreadCount(userId).then(setUnreadCount).catch(() => {});
  }, [userId]);

  // Load nearby feed once coords are available
  useEffect(() => {
    if (locationCoords && activeTab === "nearby" && !loadedTabs.current.has("nearby")) {
      loadTabData("nearby", true);
    }
  }, [locationCoords, activeTab]);

  const switchTab = useCallback(async (tab: FeedTabId) => {
    // Save scroll position of current tab
    scrollPositions.current[activeTab] = 0;

    setActiveTab(tab);

    // Save preference
    if (userId) saveTabPreference(userId, tab).catch(() => {});

    // Request location when Nearby is first tapped
    if (tab === "nearby") {
      if (!locationAsked) {
        await requestLocation();
      } else if (locationCoords && !loadedTabs.current.has("nearby")) {
        loadTabData("nearby", true);
      }
    }

    // Load tab if not yet loaded
    if (!loadedTabs.current.has(tab) && tab !== "nearby") {
      loadTabData(tab, true);
    }

    // Scroll to top
    setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 50);
  }, [activeTab, userId, locationAsked, locationCoords, loadTabData, requestLocation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTabData(activeTab, true);
    setRefreshing(false);
  }, [activeTab, loadTabData]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;

  const activeState = tabStates[activeTab];

  const renderPost = useCallback(({ item, index }: { item: Post; index: number }) => {
    const distance = MOCK_DISTANCES[index % MOCK_DISTANCES.length];
    const interest = item.caption
      ? MOCK_INTERESTS.find((t) => item.caption?.toLowerCase().includes(t)) ?? MOCK_INTERESTS[index % MOCK_INTERESTS.length]
      : MOCK_INTERESTS[index % MOCK_INTERESTS.length];

    if (userId) markPostSeen(userId, item.id).catch(() => {});

    return (
      <View>
        {activeTab === "nearby" && <DistanceBadge distance={distance} />}
        {activeTab === "vibes" && <VibeBadge interest={interest} />}
        <PostCard post={item} onRequireLogin={() => setShowLoginPrompt(true)} isLoggedIn={isLoggedIn} />
        {activeTab === "foryou" && <WhyThisButton index={index} />}
      </View>
    );
  }, [activeTab, isLoggedIn, userId]);

  const TabBar = (
    <View style={[styles.tabBarWrap, { borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBarScroll}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => switchTab(tab.id)}
              style={styles.tabBtn}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: isActive ? colors.foreground : colors.mutedForeground },
                  isActive && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </Text>
              {isActive && (
                <LinearGradient
                  colors={["#7C3AED", "#F97316"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.tabUnderline}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const ListHeader = useMemo(() => (
    <>
      <View style={[styles.header, { paddingTop: topInset + 8, backgroundColor: colors.background }]}>
        <Text style={[styles.brand, { color: colors.foreground }]}>VIBE</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/notifications")}>
            <Ionicons name="notifications-outline" size={24} color={colors.foreground} />
            {unreadCount > 0 && <View style={styles.notifDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => !isLoggedIn ? setShowLoginPrompt(true) : router.push("/inbox")}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/search")}>
            <Ionicons name="search-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>
      <StoryRow stories={stories} />
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      {TabBar}
    </>
  ), [colors, topInset, unreadCount, isLoggedIn, stories, activeTab]);

  const ListEmpty = useMemo(() => {
    if (activeState.loading) {
      return (
        <View>
          {[1, 2].map((i) => <SkeletonPost key={i} />)}
        </View>
      );
    }
    if (activeTab === "nearby" && !locationCoords && locationAsked) {
      return (
        <View style={emptyStyles.wrap}>
          <Text style={emptyStyles.emoji}>📍</Text>
          <Text style={[emptyStyles.title, { color: colors.foreground }]}>Location access needed</Text>
          <Text style={[emptyStyles.sub, { color: colors.mutedForeground }]}>Enable location permissions to see posts near you</Text>
        </View>
      );
    }
    if (activeTab === "nearby" && !locationAsked) {
      return (
        <View style={emptyStyles.wrap}>
          <Text style={emptyStyles.emoji}>📍</Text>
          <Text style={[emptyStyles.title, { color: colors.foreground }]}>Posts near you</Text>
          <Text style={[emptyStyles.sub, { color: colors.mutedForeground }]}>Allow location access to discover local content</Text>
          <TouchableOpacity onPress={requestLocation} style={[emptyStyles.btn, { backgroundColor: "#7C3AED", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 12 }]}>
            <Text style={{ color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>Allow Location →</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <EmptyState tab={activeTab} colors={colors} />;
  }, [activeState.loading, activeTab, locationCoords, locationAsked, colors]);

  const FooterComponent = useMemo(() => {
    if (activeState.loadingMore) {
      return (
        <View style={{ paddingVertical: 20, alignItems: "center" }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13 }}>Loading more...</Text>
        </View>
      );
    }
    if (!activeState.hasMore && activeState.posts.length > 0) {
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
  }, [activeState.loadingMore, activeState.hasMore, activeState.posts.length, colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        ref={flatListRef}
        data={activeState.loading ? [] : activeState.posts}
        keyExtractor={(item) => item.id + activeTab}
        renderItem={renderPost}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={FooterComponent}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" colors={["#7C3AED"]} />
        }
        onEndReached={() => loadTabData(activeTab)}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
      />
      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  brand: { fontSize: 26, fontFamily: "Poppins_700Bold", letterSpacing: 4 },
  headerRight: { flexDirection: "row", gap: 2 },
  iconBtn: { padding: 6, position: "relative" },
  notifDot: {
    position: "absolute", top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#7C3AED", borderWidth: 1.5, borderColor: "#0A0A0F",
  },
  divider: { height: 0.5 },
  separator: { height: 0.5 },
  tabBarWrap: { borderBottomWidth: 0.5 },
  tabBarScroll: { paddingHorizontal: 4 },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: "center",
    position: "relative",
  },
  tabText: { fontSize: 14, fontFamily: "Poppins_500Medium" },
  tabTextActive: { fontFamily: "Poppins_700Bold" },
  tabUnderline: {
    position: "absolute", bottom: 0, left: 8, right: 8,
    height: 2.5, borderRadius: 2,
  },
});
