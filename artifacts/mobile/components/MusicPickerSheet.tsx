import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import {
  DEEZER_COUNTRIES,
  MUSIC_CATEGORIES,
  MusicCategory,
  Track,
  TRACKS,
  fetchDeezerChart,
  fetchTracksFromJamendo,
  searchTracksOnJamendo,
  saveTrackToSupabase,
  formatCount,
  formatDuration,
  getFavoriteIds,
  getTracksByCategory,
  searchTracks,
  toggleFavorite,
} from "@/lib/music";
import { useColors } from "@/hooks/useColors";

const { width: W, height: H } = Dimensions.get("window");
const PREVIEW_DURATION = 30;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (track: Track | null) => void;
  selectedTrack: Track | null;
}

function WaveAnimation({ playing }: { playing: boolean }) {
  const bars = [useRef(new Animated.Value(0.3)), useRef(new Animated.Value(0.6)), useRef(new Animated.Value(0.4)), useRef(new Animated.Value(0.8)), useRef(new Animated.Value(0.5))];
  useEffect(() => {
    if (!playing) {
      bars.forEach((b) => b.current.setValue(0.3));
      return;
    }
    const animations = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b.current, { toValue: 1, duration: 300 + i * 80, useNativeDriver: true }),
          Animated.timing(b.current, { toValue: 0.2, duration: 300 + i * 80, useNativeDriver: true }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [playing]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 16 }}>
      {bars.map((b, i) => (
        <Animated.View
          key={i}
          style={{
            width: 2,
            height: 14,
            borderRadius: 1,
            backgroundColor: "#7C3AED",
            transform: [{ scaleY: b.current }],
          }}
        />
      ))}
    </View>
  );
}

export function MusicPickerSheet({ visible, onClose, onSelect, selectedTrack }: Props) {
  const colors = useColors();
  const [category, setCategory] = useState<MusicCategory | "Favorites">("Trending");
  const [deezerCountry, setDeezerCountry] = useState("0");
  const [search, setSearch] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const [localSelected, setLocalSelected] = useState<Track | null>(selectedTrack);
  const soundRef = useRef<Audio.Sound | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideAnim = useRef(new Animated.Value(H)).current;

  useEffect(() => {
    if (visible) {
      setLocalSelected(selectedTrack);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: H, duration: 280, useNativeDriver: true }).start();
    }
  }, [visible]);

  useEffect(() => {
    loadTracks();
  }, [category, search, deezerCountry]);

  useEffect(() => {
    getFavoriteIds().then(setFavoriteIds);
  }, []);

  useEffect(() => {
    return () => { stopSound(); };
  }, []);

  const loadTracks = useCallback(async () => {
    if (search.trim()) {
      setLoading(true);
      const results = await searchTracksOnJamendo(search);
      setTracks(results);
      setLoading(false);
      return;
    }
    if (category === "Favorites") {
      const ids = await getFavoriteIds();
      setFavoriteIds(ids);
      setTracks(TRACKS.filter((t) => ids.includes(t.id)));
      return;
    }
    if (category === "Trending") {
      setLoading(true);
      const results = await fetchDeezerChart(deezerCountry);
      setTracks(results);
      setLoading(false);
      return;
    }
    setLoading(true);
    const results = await fetchTracksFromJamendo(category as MusicCategory);
    setTracks(results);
    setLoading(false);
  }, [category, search, deezerCountry]);

  const stopSound = async () => {
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
    setPlayingId(null);
    setPlayProgress(0);
  };

  const togglePlay = async (track: Track) => {
    if (playingId === track.id) { await stopSound(); return; }
    await stopSound();
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.previewUrl },
        { shouldPlay: true, positionMillis: track.trimStart * 1000 },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPlayingId(null);
            setPlayProgress(0);
            if (progressRef.current) clearInterval(progressRef.current);
          }
        }
      );
      soundRef.current = sound;
      setPlayingId(track.id);
      setPlayProgress(0);
      let elapsed = 0;
      progressRef.current = setInterval(() => {
        elapsed += 0.1;
        setPlayProgress(Math.min(elapsed / PREVIEW_DURATION, 1));
        if (elapsed >= PREVIEW_DURATION) stopSound();
      }, 100);
    } catch {
      setPlayingId(null);
    }
  };

  const handleToggleFav = async (id: string) => {
    const updated = await toggleFavorite(id);
    setFavoriteIds(updated);
    if (category === "Favorites") {
      setTracks(TRACKS.filter((t) => updated.includes(t.id)));
    }
  };

  const handleSelect = () => {
    if (localSelected) {
      saveTrackToSupabase(localSelected, category).catch(() => {});
    }
    onSelect(localSelected);
    stopSound();
    onClose();
  };

  const CATS: { key: string; icon: string }[] = [
    { key: "Favorites", icon: "heart-outline" },
    ...MUSIC_CATEGORIES,
  ];

  const renderTrack = ({ item: track }: { item: Track }) => {
    const isPlaying = playingId === track.id;
    const isSelected = localSelected?.id === track.id;
    const isFav = favoriteIds.includes(track.id);
    const pos = track.chartPosition;

    return (
      <TouchableOpacity
        style={[styles.trackRow, isSelected && { backgroundColor: "rgba(124,58,237,0.12)" }]}
        onPress={() => setLocalSelected(isSelected ? null : track)}
        activeOpacity={0.75}
      >
        {/* Album cover with optional position badge */}
        <View style={styles.coverWrapper}>
          <View style={[styles.trackCover, { backgroundColor: track.coverColor + "33", borderColor: track.coverColor + "55", overflow: "hidden" }]}>
            {track.coverUrl ? (
              <>
                <Image source={{ uri: track.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                {isPlaying && (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }]}>
                    <WaveAnimation playing={true} />
                  </View>
                )}
              </>
            ) : isPlaying ? (
              <WaveAnimation playing={true} />
            ) : (
              <Ionicons name="musical-notes" size={18} color={track.coverColor} />
            )}
          </View>
          {pos != null && pos <= 3 && (
            <View style={[styles.topBadge, { backgroundColor: pos === 1 ? "#F59E0B" : pos === 2 ? "#9CA3AF" : "#B45309" }]}>
              <Text style={styles.topBadgeText}>#{pos}</Text>
            </View>
          )}
        </View>

        <View style={styles.trackMeta}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {pos != null && pos > 3 && (
              <Text style={styles.posLabel}>#{pos}</Text>
            )}
            <Text style={[styles.trackTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
              {track.title}
            </Text>
            {isSelected && <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />}
          </View>
          <Text style={[styles.trackArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
            {track.artist}
            {track.isDeezer ? " · 30s preview" : ` · ${formatCount(track.usedInReels)} reels`}
          </Text>
          {isPlaying && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${playProgress * 100}%` as any }]} />
            </View>
          )}
        </View>

        <Text style={[styles.trackDuration, { color: colors.mutedForeground }]}>
          {formatDuration(track.durationSecs)}
        </Text>

        <TouchableOpacity
          onPress={() => handleToggleFav(track.id)}
          style={styles.favBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={isFav ? "heart" : "heart-outline"} size={18} color={isFav ? "#EF4444" : colors.mutedForeground} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => togglePlay(track)}
          style={styles.playBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <LinearGradient
            colors={isPlaying ? ["#EF4444", "#DC2626"] : ["#7C3AED", "#6D28D9"]}
            style={styles.playBtnGrad}
          >
            <Ionicons name={isPlaying ? "stop" : "play"} size={14} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => { stopSound(); onClose(); }} />
      <Animated.View
        style={[styles.sheet, { backgroundColor: colors.background, transform: [{ translateY: slideAnim }] }]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => { stopSound(); onClose(); }}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Add Music</Text>
          <TouchableOpacity onPress={handleSelect}>
            <Text style={styles.doneBtn}>{localSelected ? "Use This" : "No Music"}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => { setLocalSelected(null); handleSelect(); }}
          style={[styles.originalAudioRow, { backgroundColor: colors.muted, borderColor: colors.border }]}
        >
          <View style={styles.origIcon}>
            <Ionicons name="mic-outline" size={20} color="#7C3AED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.origTitle, { color: colors.foreground }]}>Original Audio</Text>
            <Text style={[styles.origSub, { color: colors.mutedForeground }]}>Use your device microphone</Text>
          </View>
          {!localSelected && <Ionicons name="checkmark-circle" size={20} color="#7C3AED" />}
        </TouchableOpacity>

        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search songs or artists…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {!search && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 4 }}
          >
            {CATS.map((c) => (
              <TouchableOpacity
                key={c.key}
                onPress={() => setCategory(c.key as any)}
                style={[styles.catPill, category === c.key && { backgroundColor: "#7C3AED" }]}
              >
                <Ionicons
                  name={c.icon as any}
                  size={13}
                  color={category === c.key ? "#fff" : colors.mutedForeground}
                />
                <Text style={[styles.catText, { color: category === c.key ? "#fff" : colors.mutedForeground }]}>
                  {c.key}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Country tabs — only visible when Trending is active */}
        {!search && category === "Trending" && (
          <View style={styles.trendingHeader}>
            <Text style={[styles.trendingTitle, { color: colors.foreground }]}>🔥 Trending Now</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingTop: 6 }}
            >
              {DEEZER_COUNTRIES.map((c) => {
                const active = deezerCountry === c.code;
                return (
                  <TouchableOpacity
                    key={c.code}
                    onPress={() => setDeezerCountry(c.code)}
                    style={[styles.countryPill, active && { backgroundColor: "#F97316", borderColor: "#F97316" }]}
                  >
                    <Text style={styles.countryFlag}>{c.flag}</Text>
                    <Text style={[styles.countryLabel, { color: active ? "#fff" : colors.mutedForeground }]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {localSelected && (
          <View style={[styles.selectedBar, { backgroundColor: "#7C3AED" + "22", borderColor: "#7C3AED" + "44" }]}>
            <Ionicons name="musical-notes" size={16} color="#7C3AED" />
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedBarTitle} numberOfLines={1}>
                {localSelected.title} · {localSelected.artist}
              </Text>
              <Text style={styles.selectedBarSub}>Tap "Use This" to confirm</Text>
            </View>
            <TouchableOpacity onPress={() => setLocalSelected(null)}>
              <Ionicons name="close-circle" size={18} color="#7C3AED" />
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={[styles.emptyState, { gap: 16 }]}>
            <ActivityIndicator size="large" color="#F97316" />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {category === "Trending" ? "Loading Deezer charts…" : "Finding tracks…"}
            </Text>
          </View>
        ) : tracks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {category === "Favorites" ? "No saved sounds yet" : "No tracks found"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={tracks}
            keyExtractor={(t) => t.id}
            renderItem={renderTrack}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: H * 0.85,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: "hidden",
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  sheetTitle: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  doneBtn: { color: "#7C3AED", fontSize: 15, fontFamily: "Poppins_700Bold" },
  originalAudioRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 8,
    borderRadius: 14, padding: 12, borderWidth: 1,
  },
  origIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#7C3AED22", alignItems: "center", justifyContent: "center",
  },
  origTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  origSub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular" },
  catPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  catText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  // Trending / Deezer section
  trendingHeader: {
    paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4,
  },
  trendingTitle: { fontSize: 14, fontFamily: "Poppins_700Bold" },
  countryPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(249,115,22,0.3)",
    backgroundColor: "rgba(249,115,22,0.08)",
  },
  countryFlag: { fontSize: 14 },
  countryLabel: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  // Selected bar
  selectedBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginBottom: 6, marginTop: 4,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1,
  },
  selectedBarTitle: { color: "#7C3AED", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  selectedBarSub: { color: "#A78BFA", fontSize: 11, fontFamily: "Poppins_400Regular" },
  // Track row
  trackRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginHorizontal: 8, marginVertical: 2,
  },
  coverWrapper: { position: "relative" },
  trackCover: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  topBadge: {
    position: "absolute", bottom: -4, right: -4,
    borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1,
    minWidth: 20, alignItems: "center",
  },
  topBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Poppins_700Bold" },
  trackMeta: { flex: 1, gap: 2 },
  posLabel: { color: "#F97316", fontSize: 11, fontFamily: "Poppins_700Bold", minWidth: 24 },
  trackTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  trackArtist: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  progressBar: {
    height: 2, backgroundColor: "rgba(124,58,237,0.2)", borderRadius: 1, marginTop: 4, overflow: "hidden",
  },
  progressFill: { height: 2, backgroundColor: "#7C3AED", borderRadius: 1 },
  trackDuration: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  favBtn: { padding: 4 },
  playBtn: { borderRadius: 20, overflow: "hidden" },
  playBtnGrad: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Poppins_500Medium" },
});
