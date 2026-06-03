import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
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
import { fetchActiveStories, fetchUnreadCount } from "@/lib/db";
import { Post, supabase } from "@/lib/supabase";

const FOR_YOU_EXTRA: Post[] = [
  {
    id: "fy1",
    user_id: "u6",
    image_url: "https://picsum.photos/seed/fy1/400/400",
    images: ["https://picsum.photos/seed/fy1/400/400", "https://picsum.photos/seed/fy1b/400/400"],
    caption: "The best sunsets are the ones you didn't plan 🌅 #spontaneous #travel",
    location: "Amalfi Coast, Italy",
    likes_count: 4821,
    comments_count: 203,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    profiles: { id: "u6", username: "alex.w", is_verified: true },
  },
  {
    id: "fy2",
    user_id: "u7",
    image_url: "https://picsum.photos/seed/fy2/400/400",
    images: ["https://picsum.photos/seed/fy2/400/400"],
    caption: "Studio session 🎵 new music coming very soon...",
    likes_count: 1933,
    comments_count: 88,
    created_at: new Date(Date.now() - 21600000).toISOString(),
    profiles: { id: "u7", username: "maya_art" },
  },
];

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<{ id: string; username: string; image: string; hasNew: boolean; isOwn?: boolean }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [feedTab, setFeedTab] = useState<"following" | "foryou">("foryou");

  const fetchPosts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*, profiles(*)")
        .order("created_at", { ascending: false })
        .limit(30);
      if (!error && data && data.length > 0) {
        setPosts(data as Post[]);
      }
    } catch { }
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  }, [fetchPosts]);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchUnreadCount(session.user.id).then(setUnreadCount).catch(() => {});
  }, [session?.user?.id]);

  useEffect(() => {
    fetchPosts();
    fetchActiveStories(session?.user?.id).then(setStories).catch(() => {});
  }, [fetchPosts]);

  const displayPosts = useMemo(() => {
    if (feedTab === "following") {
      return posts.filter((_, i) => i % 2 === 0);
    }
    return [...posts, ...FOR_YOU_EXTRA].sort(() => Math.random() - 0.3);
  }, [feedTab, posts]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;

  const FeedTabs = (
    <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
      {([
        { id: "foryou", label: "For You" },
        { id: "following", label: "Following" },
      ] as const).map((tab) => (
        <TouchableOpacity
          key={tab.id}
          onPress={() => setFeedTab(tab.id)}
          style={styles.tabBtn}
        >
          <Text style={[
            styles.tabText,
            { color: feedTab === tab.id ? colors.foreground : colors.mutedForeground },
            feedTab === tab.id && styles.tabTextActive,
          ]}>
            {tab.label}
          </Text>
          {feedTab === tab.id && (
            <LinearGradient
              colors={["#7C3AED", "#F97316"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tabUnderline}
            />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const ListHeader = (
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
      {FeedTabs}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={loading ? [] : displayPosts}
        keyExtractor={(item) => item.id + feedTab}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onRequireLogin={() => setShowLoginPrompt(true)}
            isLoggedIn={isLoggedIn}
          />
        )}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          loading ? (
            <View>
              {[1, 2].map((i) => <SkeletonPost key={i} />)}
            </View>
          ) : feedTab === "following" && displayPosts.length === 0 ? (
            <View style={styles.emptyFollowing}>
              <Text style={styles.emptyEmoji}>💜</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Follow people to see their posts</Text>
              <TouchableOpacity onPress={() => router.push("/search")} style={styles.discoverBtn}>
                <Text style={{ color: "#7C3AED", fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>Discover People →</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7C3AED"
            colors={["#7C3AED"]}
          />
        }
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
        )}
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
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#7C3AED",
    borderWidth: 1.5,
    borderColor: "#0A0A0F",
  },
  divider: { height: 0.5 },
  separator: { height: 0.5 },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    marginBottom: 2,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    position: "relative",
  },
  tabText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },
  tabTextActive: {
    fontFamily: "Poppins_700Bold",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 24,
    right: 24,
    height: 2.5,
    borderRadius: 2,
  },
  emptyFollowing: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, textAlign: "center", paddingHorizontal: 32 },
  discoverBtn: { marginTop: 4 },
});
