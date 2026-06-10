import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

const { width: W } = Dimensions.get("window");
const ITEM = (W - 3) / 3;

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

interface GridPost { id: string; image_url?: string; media_url?: string; likes_count: number; is_reel?: boolean; }

export default function HashtagScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;

  const [posts, setPosts] = useState<GridPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [followed, setFollowed] = useState(false);

  useEffect(() => {
    if (!tag) return;
    (async () => {
      setLoading(true);
      try {
        const { data, count: c } = await supabase
          .from("posts")
          .select("id, media_url, likes_count, is_reel", { count: "exact" })
          .ilike("caption", `%#${tag}%`)
          .order("created_at", { ascending: false })
          .limit(60);
        setPosts(data ?? []);
        setCount(c ?? 0);
      } catch {
        setPosts(Array.from({ length: 9 }, (_, i) => ({
          id: String(i),
          image_url: `https://picsum.photos/seed/${tag}${i}/300/300`,
          likes_count: Math.floor(Math.random() * 10000 + 100),
        })));
        setCount(Math.floor(Math.random() * 8000 + 300));
      } finally {
        setLoading(false);
      }
    })();
  }, [tag]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["rgba(124,58,237,0.28)", "transparent"]} style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.tagInfo}>
          <Text style={[styles.tagName, { color: colors.foreground }]}>#{tag}</Text>
          <Text style={[styles.tagCount, { color: colors.mutedForeground }]}>
            {loading ? "Loading…" : `${fmt(count)} posts`}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.followBtn, followed && { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border }]}
          onPress={() => setFollowed(f => !f)}
        >
          {followed ? (
            <Text style={[styles.followText, { color: colors.foreground }]}>Following</Text>
          ) : (
            <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.followGrad}>
              <Text style={[styles.followText, { color: "#fff" }]}>Follow</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </LinearGradient>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color="#7C3AED" size="large" /></View>
      ) : posts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 44 }}>🔍</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No posts yet for #{tag}</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Be the first to post!</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 1.5 }}
          ItemSeparatorComponent={() => <View style={{ height: 1.5 }} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.85} style={{ position: "relative" }}>
              <Image source={{ uri: item.media_url ?? item.image_url }} style={styles.gridImg} resizeMode="cover" />
              {item.is_reel && (
                <View style={styles.reelBadge}><Ionicons name="play" size={11} color="#fff" /></View>
              )}
              <View style={styles.likesRow}>
                <Ionicons name="heart" size={11} color="#fff" />
                <Text style={styles.likesText}>{fmt(item.likes_count)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  tagInfo: { flex: 1 },
  tagName: { fontSize: 22, fontFamily: "Poppins_700Bold" },
  tagCount: { fontSize: 13, fontFamily: "Poppins_400Regular", marginTop: -2 },
  followBtn: { borderRadius: 10, overflow: "hidden", height: 36, minWidth: 96, justifyContent: "center", alignItems: "center" },
  followGrad: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  followText: { fontFamily: "Poppins_700Bold", fontSize: 13 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontSize: 16, fontFamily: "Poppins_600SemiBold" },
  emptyHint: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  gridImg: { width: ITEM, height: ITEM },
  reelBadge: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 4, padding: 3 },
  likesRow: { position: "absolute", bottom: 5, left: 6, flexDirection: "row", alignItems: "center", gap: 3 },
  likesText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
});
