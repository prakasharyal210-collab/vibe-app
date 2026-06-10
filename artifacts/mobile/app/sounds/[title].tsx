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

export default function SoundsScreen() {
  const { title } = useLocalSearchParams<{ title: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;
  const decoded = decodeURIComponent(title ?? "");

  const [posts, setPosts] = useState<GridPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!title) return;
    supabase
      .from("posts")
      .select("id, media_url, likes_count, is_reel")
      .eq("music_title", decoded)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (data?.length) {
          setPosts(data);
        } else {
          setPosts(Array.from({ length: 6 }, (_, i) => ({
            id: String(i),
            image_url: `https://picsum.photos/seed/snd${title}${i}/300/300`,
            likes_count: Math.floor(Math.random() * 5000 + 50),
          })));
        }
      })
      .finally(() => setLoading(false));
  }, [title]);

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
            <LinearGradient colors={["rgba(124,58,237,0.28)", "transparent"]} style={[styles.header, { paddingTop: topPad }]}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>Sound</Text>
              <View style={{ width: 36 }} />
            </LinearGradient>

            <View style={[styles.trackCard, { backgroundColor: colors.card }]}>
              <View style={[styles.albumArt, { backgroundColor: "rgba(124,58,237,0.15)" }]}>
                <Ionicons name="musical-notes" size={30} color="#7C3AED" />
              </View>
              <View style={styles.trackMeta}>
                <Text style={[styles.trackTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {decoded}
                </Text>
                <Text style={[styles.trackSub, { color: colors.mutedForeground }]}>
                  {loading ? "Loading…" : `${fmt(posts.length)}+ posts`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPlaying((p) => !p)} style={styles.playBtn}>
                <LinearGradient colors={["#7C3AED", "#EA580C"]} style={styles.playGrad}>
                  <Ionicons name={playing ? "pause" : "play"} size={22} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "rgba(124,58,237,0.1)", borderColor: "#7C3AED" }]}
                onPress={() => router.push("/(tabs)/create" as any)}
              >
                <Ionicons name="add-circle-outline" size={16} color="#7C3AED" />
                <Text style={styles.actionBtnText}>Use this sound</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: saved ? "rgba(124,58,237,0.2)" : "transparent", borderColor: colors.border }]}
                onPress={() => setSaved((s) => !s)}
              >
                <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={16} color={saved ? "#7C3AED" : colors.foreground} />
                <Text style={[styles.actionBtnText, { color: saved ? "#7C3AED" : colors.foreground }]}>
                  {saved ? "Saved" : "Save"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Videos with this sound</Text>
          </View>
        }
        renderItem={({ item }) => (
          loading ? null : (
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
          )
        )}
        ListEmptyComponent={
          loading ? <View style={styles.loader}><ActivityIndicator color="#7C3AED" size="large" /></View> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  trackCard: { margin: 16, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 14, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  albumArt: { width: 64, height: 64, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  trackMeta: { flex: 1 },
  trackTitle: { fontSize: 15, fontFamily: "Poppins_700Bold", lineHeight: 20 },
  trackSub: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 4 },
  playBtn: { borderRadius: 22, overflow: "hidden" },
  playGrad: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  actionRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold", color: "#7C3AED" },
  sectionLabel: { fontSize: 12, fontFamily: "Poppins_600SemiBold", paddingHorizontal: 16, paddingBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  loader: { height: 200, alignItems: "center", justifyContent: "center" },
  gridImg: { width: ITEM, height: ITEM },
  reelBadge: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 4, padding: 3 },
  likesRow: { position: "absolute", bottom: 5, left: 6, flexDirection: "row", alignItems: "center", gap: 3 },
  likesText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
});
