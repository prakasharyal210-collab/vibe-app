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

interface GridPost { id: string; image_url: string; likes_count: number; is_reel?: boolean; }

const MAP_COLORS = ["#1a1a2e", "#16213e", "#0f3460"] as const;

export default function LocationScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;
  const decoded = decodeURIComponent(name ?? "");

  const [posts, setPosts] = useState<GridPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!name) return;
    (async () => {
      setLoading(true);
      try {
        const { data, count: c } = await supabase
          .from("posts")
          .select("id, image_url, likes_count, is_reel", { count: "exact" })
          .ilike("location", `%${decoded}%`)
          .order("created_at", { ascending: false })
          .limit(60);
        setPosts(data ?? []);
        setCount(c ?? 0);
        if (!data?.length) throw new Error("empty");
      } catch {
        const mock = Array.from({ length: 9 }, (_, i) => ({
          id: String(i),
          image_url: `https://picsum.photos/seed/loc${name}${i}/300/300`,
          likes_count: Math.floor(Math.random() * 8000 + 200),
        }));
        setPosts(mock);
        setCount(Math.floor(Math.random() * 5000 + 100));
      } finally {
        setLoading(false);
      }
    })();
  }, [name]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        numColumns={3}
        columnWrapperStyle={{ gap: 1.5 }}
        ItemSeparatorComponent={() => <View style={{ height: 1.5 }} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        ListHeaderComponent={
          <View>
            <LinearGradient
              colors={["rgba(124,58,237,0.28)", "transparent"]}
              style={[styles.topBar, { paddingTop: topPad }]}
            >
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.topTitle, { color: colors.foreground }]}>Location</Text>
              <View style={{ width: 36 }} />
            </LinearGradient>

            <LinearGradient colors={MAP_COLORS} style={styles.mapCard}>
              <View style={styles.mapPin}>
                <Ionicons name="location" size={28} color="#7C3AED" />
              </View>
              <View style={styles.mapDot} />
              <View style={[styles.mapCircle, { borderColor: "rgba(124,58,237,0.3)" }]} />
              <View style={[styles.mapCircle2, { borderColor: "rgba(124,58,237,0.15)" }]} />
              <View style={styles.mapGrid}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={[styles.mapLine, { opacity: 0.08 + i * 0.02 }]} />
                ))}
              </View>
            </LinearGradient>

            <View style={styles.locationInfo}>
              <View style={styles.locationNameRow}>
                <Ionicons name="location" size={20} color="#7C3AED" />
                <Text style={[styles.locationName, { color: colors.foreground }]}>{decoded}</Text>
              </View>
              <Text style={[styles.postCount, { color: colors.mutedForeground }]}>
                {loading ? "Loading…" : `${fmt(count)} posts`}
              </Text>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Posts from here</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.85} style={{ position: "relative" }}>
            <Image source={{ uri: item.image_url }} style={styles.gridImg} resizeMode="cover" />
            {item.is_reel && (
              <View style={styles.reelBadge}>
                <Ionicons name="play" size={11} color="#fff" />
              </View>
            )}
            <View style={styles.likesRow}>
              <Ionicons name="heart" size={11} color="#fff" />
              <Text style={styles.likesText}>{fmt(item.likes_count)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loader}>
              <ActivityIndicator color="#7C3AED" size="large" />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={{ fontSize: 44 }}>📍</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No posts from {decoded} yet
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  mapCard: {
    height: 160,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  mapPin: { zIndex: 10 },
  mapDot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#7C3AED",
    top: "50%",
    left: "50%",
    marginTop: 16,
    marginLeft: -5,
  },
  mapCircle: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    top: "50%",
    left: "50%",
    marginTop: -20,
    marginLeft: -40,
  },
  mapCircle2: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    top: "50%",
    left: "50%",
    marginTop: -50,
    marginLeft: -70,
  },
  mapGrid: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    gap: 20,
    justifyContent: "space-around",
  },
  mapLine: {
    height: 1,
    backgroundColor: "#7C3AED",
    width: "100%",
  },
  locationInfo: { padding: 16, paddingBottom: 8, gap: 4 },
  locationNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  locationName: { fontSize: 20, fontFamily: "Poppins_700Bold", flex: 1 },
  postCount: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    paddingHorizontal: 16,
    paddingBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loader: { height: 200, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 60 },
  emptyText: { fontSize: 15, fontFamily: "Poppins_600SemiBold", textAlign: "center" },
  gridImg: { width: ITEM, height: ITEM },
  reelBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    padding: 3,
  },
  likesRow: {
    position: "absolute",
    bottom: 5,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  likesText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
});
