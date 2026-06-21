import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import RAnimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const { height: H, width: W } = Dimensions.get("window");
const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

export interface TrendingSound {
  postId: string;
  username: string;
  avatarUrl?: string;
  thumbnail?: string;
  videoUrl: string;
  title: string;
  likesCount: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (sound: TrendingSound | null) => void;
  selectedSound: TrendingSound | null;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function SoundRow({
  sound,
  isSelected,
  isPlaying,
  onPlay,
  onSelect,
}: {
  sound: TrendingSound;
  isSelected: boolean;
  isPlaying: boolean;
  onPlay: (s: TrendingSound) => void;
  onSelect: (s: TrendingSound) => void;
}) {
  const colors = useColors();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (isPlaying) {
      pulse.value = withSpring(1.12, { damping: 4, stiffness: 120 });
    } else {
      pulse.value = withTiming(1, { duration: 180 });
    }
  }, [isPlaying]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <TouchableOpacity
      style={[
        styles.row,
        { backgroundColor: isSelected ? "rgba(124,58,237,0.12)" : "transparent" },
      ]}
      onPress={() => onSelect(sound)}
      activeOpacity={0.7}
    >
      <View style={styles.thumbWrap}>
        <Image
          source={{ uri: sound.thumbnail ?? sound.videoUrl }}
          style={styles.thumb}
          contentFit="cover"
        />
        <View style={styles.thumbOverlay}>
          <Ionicons name="musical-notes" size={14} color="#fff" />
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {sound.title}
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          @{sound.username} · {formatCount(sound.likesCount)} likes
        </Text>
      </View>

      <TouchableOpacity
        style={styles.playBtn}
        onPress={() => onPlay(sound)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <RAnimated.View style={iconStyle}>
          <LinearGradient
            colors={isPlaying ? ["#7C3AED", "#EC4899"] : ["rgba(255,255,255,0.15)", "rgba(255,255,255,0.08)"]}
            style={styles.playGrad}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={16}
              color="#fff"
            />
          </LinearGradient>
        </RAnimated.View>
      </TouchableOpacity>

      {isSelected && (
        <View style={styles.checkWrap}>
          <Ionicons name="checkmark-circle" size={20} color="#7C3AED" />
        </View>
      )}
    </TouchableOpacity>
  );
}

export function TrendingSoundsSheet({ visible, onClose, onSelect, selectedSound }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [sounds, setSounds] = useState<TrendingSound[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [localSelected, setLocalSelected] = useState<TrendingSound | null>(selectedSound);
  const videoRef = useRef<Video>(null);

  const slideAnim = useSharedValue(H);
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideAnim.value }],
  }));

  useEffect(() => {
    if (visible) {
      setLocalSelected(selectedSound);
      slideAnim.value = withSpring(0, { damping: 11, stiffness: 65 });
      loadSounds();
    } else {
      slideAnim.value = withTiming(H, { duration: 260 });
      stopPlayback();
    }
  }, [visible]);

  async function loadSounds() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sounds/trending?limit=20`);
      if (res.ok) {
        const json = await res.json() as { sounds: any[] };
        const mapped: TrendingSound[] = (json.sounds ?? []).map((s: any) => ({
          postId: s.id,
          username: (s.profiles as any)?.username ?? "user",
          avatarUrl: (s.profiles as any)?.avatar_url ?? undefined,
          thumbnail: s.thumbnail_url ?? undefined,
          videoUrl: s.media_url ?? "",
          title: s.caption
            ? s.caption.replace(/#\w+/g, "").trim().slice(0, 40) || "Original Sound"
            : "Original Sound",
          likesCount: s.likes_count ?? 0,
        }));
        setSounds(mapped);
      }
    } catch {
      setSounds([]);
    } finally {
      setLoading(false);
    }
  }

  function stopPlayback() {
    setPlayingId(null);
    setPlayingUrl(null);
  }

  const handlePlay = useCallback((sound: TrendingSound) => {
    if (playingId === sound.postId) {
      stopPlayback();
    } else {
      setPlayingId(sound.postId);
      setPlayingUrl(sound.videoUrl);
    }
  }, [playingId]);

  const handleSelect = useCallback((sound: TrendingSound) => {
    setLocalSelected((prev) => prev?.postId === sound.postId ? null : sound);
  }, []);

  function handleDone() {
    stopPlayback();
    onSelect(localSelected);
    onClose();
  }

  function handleClose() {
    stopPlayback();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      <RAnimated.View style={[styles.sheet, { backgroundColor: colors.card }, slideStyle]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Trending Sounds</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Top music videos from the community, ranked by likes
        </Text>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color="#7C3AED" size="large" />
          </View>
        ) : sounds.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="musical-notes-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No trending sounds yet.{"\n"}Post a music video to get started!
            </Text>
          </View>
        ) : (
          <FlatList
            data={sounds}
            keyExtractor={(s) => s.postId}
            renderItem={({ item }) => (
              <SoundRow
                sound={item}
                isSelected={localSelected?.postId === item.postId}
                isPlaying={playingId === item.postId}
                onPlay={handlePlay}
                onSelect={handleSelect}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          />
        )}

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderTopColor: colors.border }]}>
          {localSelected && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => setLocalSelected(null)}>
              <Text style={[styles.clearText, { color: colors.mutedForeground }]}>Remove sound</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
            <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.doneBtnGrad}>
              <Text style={styles.doneBtnText}>{localSelected ? "Use this sound" : "Done"}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Hidden 1×1 video for audio-only preview — opacity 0 prevents any frame flash */}
        {playingUrl ? (
          <Video
            ref={videoRef}
            source={{ uri: playingUrl }}
            shouldPlay
            isLooping={false}
            isMuted={false}
            resizeMode={ResizeMode.CONTAIN}
            style={styles.hiddenVideo}
            onPlaybackStatusUpdate={(status) => {
              if (status.isLoaded && status.didJustFinish) {
                setPlayingId(null);
                setPlayingUrl(null);
              }
            }}
          />
        ) : null}
      </RAnimated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: H * 0.72,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Poppins_700Bold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
    borderRadius: 12,
    marginHorizontal: 8,
    marginBottom: 2,
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
  },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  sub: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  playBtn: {
    borderRadius: 20,
    overflow: "hidden",
  },
  playGrad: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  checkWrap: {
    marginLeft: 2,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    backgroundColor: "transparent",
  },
  clearBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  clearText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  doneBtn: {
    flex: 2,
    borderRadius: 14,
    overflow: "hidden",
  },
  doneBtnGrad: {
    paddingVertical: 13,
    alignItems: "center",
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
  },
  hiddenVideo: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    bottom: 0,
    left: 0,
  },
});
