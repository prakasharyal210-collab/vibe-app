import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
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
import { StoryRow } from "@/components/StoryRow";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { MOCK_POSTS, MOCK_STORIES, Post, supabase } from "@/lib/supabase";

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);
  const [refreshing, setRefreshing] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const fetchPosts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*, profiles(*)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error && data && data.length > 0) {
        setPosts(data as Post[]);
      }
    } catch {
      // keep mock data
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  }, [fetchPosts]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;

  const requireLogin = () => {
    if (!isLoggedIn) {
      setShowLoginPrompt(true);
      return true;
    }
    return false;
  };

  const ListHeader = (
    <>
      <View
        style={[
          styles.header,
          { paddingTop: topInset + 8, backgroundColor: colors.background },
        ]}
      >
        <Text style={[styles.brand, { color: colors.foreground }]}>VIBE</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => requireLogin()}
          >
            <Ionicons name="heart-outline" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              if (!requireLogin()) {
                // Navigate to inbox
              }
            }}
          >
            <Ionicons name="chatbubble-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>
      <StoryRow stories={MOCK_STORIES} />
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onRequireLogin={() => setShowLoginPrompt(true)}
            isLoggedIn={isLoggedIn}
          />
        )}
        ListHeaderComponent={ListHeader}
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
      <LoginPrompt
        visible={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  brand: {
    fontSize: 26,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 4,
  },
  headerRight: {
    flexDirection: "row",
    gap: 4,
  },
  iconBtn: {
    padding: 6,
  },
  divider: {
    height: 0.5,
    marginBottom: 2,
  },
  separator: {
    height: 0.5,
  },
});
