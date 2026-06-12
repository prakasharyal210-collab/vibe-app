import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import RAnimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

const { width: W, height: H } = Dimensions.get("window");
const GIPHY_KEY = "dc6zaTOxFJmzC";
const CELL_SIZE = (W - 48) / 3;
const CACHE_TTL = 5 * 60 * 1000;

export interface GiphySticker {
  id: string;
  title: string;
  gifUrl: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (gifUrl: string, title: string) => void;
}

const stickerCache = new Map<string, { data: GiphySticker[]; ts: number }>();

async function fetchGiphyStickers(query: string): Promise<GiphySticker[]> {
  const key = query.trim() || "__trending__";
  const mem = stickerCache.get(key);
  if (mem && Date.now() - mem.ts < CACHE_TTL) return mem.data;

  try {
    const url = query.trim()
      ? `https://api.giphy.com/v1/stickers/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg`
      : `https://api.giphy.com/v1/stickers/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg`;

    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Giphy ${res.status}`);
    const json = await res.json() as { data?: any[] };
    const stickers: GiphySticker[] = (json.data ?? [])
      .map((s: any) => ({
        id: s.id as string,
        title: s.title as string,
        gifUrl: (s.images?.fixed_height?.url ?? s.images?.original?.url ?? "") as string,
      }))
      .filter((s) => s.gifUrl);

    stickerCache.set(key, { data: stickers, ts: Date.now() });
    return stickers;
  } catch {
    return [];
  }
}

function SkeletonGrid({ colors }: { colors: any }) {
  const anim = useSharedValue(0.3);
  useEffect(() => {
    anim.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 700 }),
        withTiming(0.3, { duration: 700 })
      ),
      -1,
      false
    );
    return () => cancelAnimation(anim);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: anim.value }));
  return (
    <View style={styles.grid}>
      {Array.from({ length: 12 }).map((_, i) => (
        <RAnimated.View key={i} style={[styles.cell, { backgroundColor: colors.muted }, animStyle]} />
      ))}
    </View>
  );
}

const QUICK_TAGS = [
  { label: "🔥 Trending", tag: "" },
  { label: "😂 Funny", tag: "funny" },
  { label: "💜 Love", tag: "love" },
  { label: "✨ Sparkle", tag: "sparkle" },
  { label: "🎉 Party", tag: "party" },
  { label: "💃 Dance", tag: "dance" },
  { label: "😍 Heart Eyes", tag: "heart eyes" },
  { label: "👑 Royalty", tag: "crown" },
];

export function StickerPickerModal({ visible, onClose, onSelect }: Props) {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [stickers, setStickers] = useState<GiphySticker[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTag, setActiveTag] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideAnim = useRef(new Animated.Value(H)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
      loadStickers("");
    } else {
      Animated.timing(slideAnim, { toValue: H, duration: 260, useNativeDriver: true }).start();
    }
  }, [visible]);

  const loadStickers = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = await fetchGiphyStickers(q);
      setStickers(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (text: string) => {
    setQuery(text);
    setActiveTag("");
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadStickers(text), 420);
  };

  const handleQuickTag = (tag: string, label: string) => {
    setQuery("");
    setActiveTag(label);
    loadStickers(tag);
  };

  const handleClose = () => {
    setQuery("");
    setActiveTag("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
      <Animated.View
        style={[styles.sheet, { backgroundColor: colors.background, transform: [{ translateY: slideAnim }] }]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Add Sticker</Text>
          <Text style={[styles.poweredBy, { color: colors.mutedForeground }]}>via GIPHY</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={[styles.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={handleSearch}
            placeholder="Search stickers…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(""); loadStickers(""); }}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          {QUICK_TAGS.map((qt) => {
            const isActive = activeTag === qt.label || (!activeTag && !query && qt.tag === "");
            return (
              <TouchableOpacity
                key={qt.label}
                onPress={() => handleQuickTag(qt.tag, qt.label)}
                style={[styles.quickChip, isActive ? { backgroundColor: "#7C3AED" } : { backgroundColor: colors.muted }]}
              >
                <Text style={[styles.quickChipText, { color: isActive ? "#fff" : colors.foreground }]}>
                  {qt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <SkeletonGrid colors={colors} />
        ) : stickers.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 44 }}>🎨</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {query ? `No stickers for "${query}"` : "Tap a category or search"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={stickers}
            keyExtractor={(s) => s.id}
            numColumns={3}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.cell, { backgroundColor: "rgba(255,255,255,0.04)" }]}
                onPress={() => { onSelect(item.gifUrl, item.title); handleClose(); }}
                activeOpacity={0.7}
              >
                <Image source={{ uri: item.gifUrl }} style={styles.stickerImg} resizeMode="contain" />
              </TouchableOpacity>
            )}
            ListFooterComponent={
              <Text style={[styles.giphyAttrib, { color: colors.mutedForeground }]}>
                Powered by GIPHY
              </Text>
            }
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: H * 0.73,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: "hidden",
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 0.5, gap: 6,
  },
  title: { fontSize: 17, fontFamily: "Poppins_700Bold", flex: 1 },
  poweredBy: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  closeBtn: { padding: 4 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 10, marginBottom: 6,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular" },
  quickRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  quickChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  quickChipText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  grid: { padding: 12, paddingBottom: 40 },
  row: { gap: 8, marginBottom: 8 },
  cell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 12, overflow: "hidden" },
  stickerImg: { width: "100%", height: "100%" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingBottom: 60 },
  emptyText: { fontSize: 14, fontFamily: "Poppins_500Medium", textAlign: "center" },
  giphyAttrib: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "center", marginBottom: 12 },
});
