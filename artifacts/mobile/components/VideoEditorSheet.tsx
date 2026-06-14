import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import RAnimated, { useSharedValue, useAnimatedStyle, runOnJS } from "react-native-reanimated";
import { GradientButton } from "@/components/GradientButton";
import { MusicPickerSheet } from "@/components/MusicPickerSheet";
import { AICaptionSheet } from "@/components/AICaptionSheet";
import { FilterConfig, FILTERS } from "@/components/EffectsPickerSheet";
import { useColors } from "@/hooks/useColors";
import { Track, formatDuration } from "@/lib/music";
import { supabase } from "@/lib/supabase";
import { searchProfiles } from "@/lib/db";

const { width: W } = Dimensions.get("window");

// ── Lightweight icon replacement (no font file needed) ─────────────────────
const ICON_MAP: Record<string, string> = {
  "close": "✕",
  "close-circle": "✕",
  "arrow-back-outline": "←",
  "musical-notes": "♫",
  "trash-outline": "🗑",
  "return-up-back-outline": "↩",
  "return-up-forward-outline": "↪",
  "swap-horizontal-outline": "⇄",
  "refresh-outline": "↺",
  "sparkles-outline": "✨",
  "location-outline": "📍",
  "chevron-forward": "›",
  "person-add-outline": "👤",
  "chatbubbles-outline": "💬",
  "download-outline": "↓",
  "search-outline": "🔍",
  "person": "●",
  "checkmark-circle": "✓",
};
function Icon({ name, size, color }: { name: string; size: number; color: string }) {
  const ch = ICON_MAP[name] ?? "·";
  return (
    <Text style={{ fontSize: size * 0.9, color, lineHeight: size + 6, textAlign: "center", includeFontPadding: false }}>
      {ch}
    </Text>
  );
}

// ── Draggable sticker overlay ──────────────────────────────────────────────
interface StickerItem { id: string; emoji?: string; gifUrl?: string; x: number; y: number; }

function DraggableSticker({ sticker, onMove }: { sticker: StickerItem; onMove: (id: string, x: number, y: number) => void }) {
  const translateX = useSharedValue(sticker.x);
  const translateY = useSharedValue(sticker.y);
  const startX = useSharedValue(sticker.x);
  const startY = useSharedValue(sticker.y);

  const animStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate(({ translationX, translationY }) => {
      translateX.value = startX.value + translationX;
      translateY.value = startY.value + translationY;
    })
    .onEnd(() => {
      runOnJS(onMove)(sticker.id, translateX.value, translateY.value);
    });

  return (
    <GestureDetector gesture={pan}>
      <RAnimated.View style={animStyle}>
        {sticker.gifUrl ? (
          <Image source={{ uri: sticker.gifUrl }} style={{ width: 60, height: 60 }} resizeMode="contain" />
        ) : (
          <Text style={{ fontSize: 36 }}>{sticker.emoji}</Text>
        )}
      </RAnimated.View>
    </GestureDetector>
  );
}

// ── Adjust settings ───────────────────────────────────────────────────────────
interface AdjustSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  fade: number;
  vignette: number;
}
const DEFAULT_ADJUST: AdjustSettings = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, fade: 0, vignette: 0 };
type CropRatio = "free" | "square" | "4:3" | "16:9" | "9:16";
const CROP_RATIOS: CropRatio[] = ["free", "square", "4:3", "16:9", "9:16"];

export interface PostData {
  caption: string;
  music: Track | null;
  audience: string;
  tags: string[];
  location?: string;
  taggedUsers?: string[];
  commentsEnabled?: boolean;
  downloadsEnabled?: boolean;
}

interface TaggedUser { id: string; username: string; avatar_url?: string | null; full_name?: string | null; }

interface TextOverlay { id: string; text: string; color: string; x: number; y: number; }

interface Props {
  uri: string;
  isPhoto: boolean;
  initialMusic: Track | null;
  initialFilter: FilterConfig;
  textOverlays: TextOverlay[];
  stickers: StickerItem[];
  onDiscard: () => void;
  onPost: (data: PostData) => void | Promise<void>;
}

const TEXT_COLORS = ["#ffffff", "#000000", "#7C3AED", "#F97316", "#EF4444", "#10B981", "#3B82F6", "#FBBF24", "#EC4899"];
const STICKER_EMOJIS = ["🔥", "💜", "✨", "😍", "🎶", "👑", "💯", "🌊", "🦋", "🌸", "💫", "🎉", "😂", "🙌", "💪", "🌈", "⚡", "🎯", "🦄", "🤩", "😘", "🍀", "🌺", "💎", "🏆", "🎵", "🌟", "🎸", "🍕", "❤️"];
const AUDIENCES = ["Everyone", "Close Friends", "Friends", "Followers", "Only Me"];
const TRIM_W = W - 32;

// ── Sub-components ─────────────────────────────────────────────────────────────
function FilterSwatch({ filter, active, onPress }: { filter: FilterConfig; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity style={styles.filterSwatchWrap} onPress={onPress}>
      <View style={[styles.filterSwatchBox, active && { borderColor: "#7C3AED", borderWidth: 2.5 }]}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 8, backgroundColor: "#1F1035" }]} />
        {filter.id !== "none" && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: filter.blendHex, opacity: filter.opacity * 2.5, borderRadius: 8 }]} />
        )}
        {filter.id === "none" && <Icon name="close" size={14} color="rgba(255,255,255,0.4)" />}
      </View>
      <Text style={[styles.filterSwatchLabel, active && { color: "#7C3AED" }]}>{filter.label}</Text>
    </TouchableOpacity>
  );
}

function AdjustSliderRow({
  label, emoji, value, min, max, color, onChange,
}: {
  label: string; emoji: string; value: number; min: number; max: number; color: string;
  onChange: (v: number) => void;
}) {
  const trackWidthRef = useRef(200);
  const startValRef = useRef(value);
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) + 2,
      onPanResponderGrant: () => {
        startValRef.current = valueRef.current;
      },
      onPanResponderMove: (_, g) => {
        const startX = ((startValRef.current - min) / (max - min)) * trackWidthRef.current;
        const rawX = startX + g.dx;
        const clampedX = Math.max(0, Math.min(trackWidthRef.current, rawX));
        const newVal = min + (clampedX / trackWidthRef.current) * (max - min);
        onChange(+newVal.toFixed(3));
      },
    })
  ).current;

  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const displayVal = Math.round(value * 100);

  return (
    <View style={adj.row}>
      <Text style={adj.emoji}>{emoji}</Text>
      <Text style={adj.label}>{label}</Text>
      <View
        style={adj.trackWrap}
        onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        <View style={adj.track}>
          <View style={[adj.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
        </View>
        <View style={[adj.thumb, { left: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[adj.val, { color }]}>{displayVal > 0 ? `+${displayVal}` : displayVal}</Text>
    </View>
  );
}

const adj = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  emoji: { fontSize: 16, width: 24, textAlign: "center" },
  label: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_500Medium", fontSize: 12, width: 76 },
  trackWrap: { flex: 1, position: "relative", paddingVertical: 10 },
  track: { height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2 },
  fill: { position: "absolute", left: 0, top: 10, height: 4, borderRadius: 2 },
  thumb: {
    position: "absolute",
    top: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    borderWidth: 2.5,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  val: { fontFamily: "Poppins_600SemiBold", fontSize: 11, width: 32, textAlign: "right" },
});

// ── Main component ─────────────────────────────────────────────────────────────
export function VideoEditorSheet({ uri, isPhoto, initialMusic, initialFilter, textOverlays: initialText, stickers: initialStickers, onDiscard, onPost }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState("Everyone");
  const [music, setMusic] = useState<Track | null>(initialMusic);
  const [filter, setFilter] = useState<FilterConfig>(initialFilter);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "adjust" | "caption">("edit");
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>(initialText);
  const [stickers, setStickers] = useState<StickerItem[]>(initialStickers);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [newTextColor, setNewTextColor] = useState("#ffffff");
  const [posting, setPosting] = useState(false);
  const [rotate, setRotate] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [cropRatio, setCropRatio] = useState<CropRatio>("free");
  const [adjust, setAdjust] = useState<AdjustSettings>(DEFAULT_ADJUST);

  const [showAISheet, setShowAISheet] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCaptions, setAiCaptions] = useState<string[]>([]);
  const [aiHashtags, setAiHashtags] = useState<string[]>([]);
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);

  const [location, setLocation] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [tagResults, setTagResults] = useState<TaggedUser[]>([]);
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(true);

  const sparkleAnim = useRef(new Animated.Value(1)).current;

  const animateSparkle = () => {
    Animated.sequence([
      Animated.timing(sparkleAnim, { toValue: 1.18, duration: 180, useNativeDriver: false }),
      Animated.timing(sparkleAnim, { toValue: 0.92, duration: 120, useNativeDriver: false }),
      Animated.timing(sparkleAnim, { toValue: 1, duration: 140, useNativeDriver: false }),
    ]).start();
  };

  const generateAICaptions = async () => {
    animateSparkle();
    setAiCaptions([]); setAiHashtags([]); setSelectedHashtags([]);
    setAiLoading(true); setShowAISheet(true);
    try {
      let imageBase64: string | undefined;
      let mimeType: string | undefined;
      if (isPhoto) {
        try {
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
          imageBase64 = base64;
          const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
          mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        } catch {}
      }
      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
      const res = await fetch(`${apiUrl}/api/ai/caption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType, mediaType: isPhoto ? "photo" : "video" }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json() as { captions: string[]; hashtags: string[] };
      setAiCaptions(data.captions ?? []); setAiHashtags(data.hashtags ?? []);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("ai_caption_requests").insert({ user_id: user.id, media_type: isPhoto ? "photo" : "video", captions_generated: data.captions?.length ?? 0 });
      }
    } catch {
      setShowAISheet(false);
      Alert.alert("AI Caption Error", "Could not generate captions. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSelectCaption = (cap: string) => {
    if (cap === "__hashtags_only__") {
      const tags = selectedHashtags.join(" ");
      setCaption((prev) => (prev.trim() ? prev.trim() + " " + tags : tags));
    } else {
      const tags = selectedHashtags.length > 0 ? " " + selectedHashtags.join(" ") : "";
      setCaption(cap + tags);
    }
    setSelectedHashtags([]);
  };

  const fetchLocation = async () => {
    try {
      setLocationLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location access is needed to tag your location.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync(loc.coords);
      const city = geo?.city ?? geo?.district ?? geo?.subregion ?? "";
      const country = geo?.country ?? "";
      const locationStr = [city, country].filter(Boolean).join(", ");
      setLocation(locationStr || "Unknown location");
    } catch {
      Alert.alert("Location error", "Could not get your location. Please try again.");
    } finally {
      setLocationLoading(false);
    }
  };

  const trimStartX = useRef(new Animated.Value(0)).current;
  const trimEndX = useRef(new Animated.Value(TRIM_W)).current;
  const [trimStartVal, setTrimStartVal] = useState(0);
  const [trimEndVal, setTrimEndVal] = useState(TRIM_W);

  const startPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => {
      const newX = Math.max(0, Math.min(trimEndVal - 30, g.moveX - 16));
      setTrimStartVal(newX); trimStartX.setValue(newX);
    },
  })).current;

  const endPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => {
      const newX = Math.min(TRIM_W, Math.max(trimStartVal + 30, g.moveX - 16));
      setTrimEndVal(newX); trimEndX.setValue(newX);
    },
  })).current;

  const addTextOverlay = () => {
    if (!newText.trim()) return;
    setTextOverlays((prev) => [...prev, { id: Date.now().toString(), text: newText.trim(), color: newTextColor, x: 80, y: 120 }]);
    setNewText(""); setShowTextModal(false);
  };

  const addSticker = (emoji: string) => {
    setStickers((prev) => [...prev, { id: Date.now().toString(), emoji, x: 80 + Math.random() * 100, y: 80 + Math.random() * 120 }]);
    setShowStickerModal(false);
  };

  const moveSticker = useCallback((id: string, x: number, y: number) => {
    setStickers((prev) => prev.map((s) => s.id === id ? { ...s, x, y } : s));
  }, []);

  const handlePost = async () => {
    setPosting(true);
    try {
      await onPost({
        caption,
        music,
        audience,
        tags: taggedUsers.map((u) => u.username),
        location: location || undefined,
        taggedUsers: taggedUsers.map((u) => u.id),
        commentsEnabled: allowComments,
        downloadsEnabled: allowDownloads,
      });
    } finally {
      setPosting(false);
    }
  };

  const trimStartPct = trimStartVal / TRIM_W;
  const trimEndPct = trimEndVal / TRIM_W;
  const totalSecs = isPhoto ? 0 : 30;
  const clipStart = Math.round(trimStartPct * totalSecs);
  const clipEnd = Math.round(trimEndPct * totalSecs);

  const TOOLS = [
    { id: "music", emoji: "🎵", label: "Music", color: "#7C3AED" },
    { id: "text", emoji: "✏️", label: "Text", color: "#3B82F6" },
    { id: "stickers", emoji: "😊", label: "Stickers", color: "#F97316" },
  ];

  // Build adjust overlay layers
  const brightnessOpacity = Math.abs(adjust.brightness) * 0.4;
  const warmthOpacity = adjust.warmth > 0 ? adjust.warmth * 0.3 : 0;
  const coolOpacity = adjust.warmth < 0 ? Math.abs(adjust.warmth) * 0.3 : 0;
  const fadeOpacity = adjust.fade * 0.35;
  const vignetteOpacity = adjust.vignette * 0.7;
  const hasAdjust = Object.values(adjust).some((v) => v !== 0);

  // CSS filter for web — handles all 5 adjustments natively in the browser
  const webFilterStyle: object | undefined = Platform.OS === "web" && hasAdjust ? {
    filter: [
      `brightness(${1 + adjust.brightness})`,
      `contrast(${Math.max(0.1, 1 + adjust.contrast)})`,
      `saturate(${Math.max(0, 1 + adjust.saturation)})`,
      adjust.warmth > 0 ? `sepia(${adjust.warmth * 0.55})` : (adjust.warmth < 0 ? `hue-rotate(${adjust.warmth * -40}deg)` : null),
      adjust.fade > 0 ? `opacity(${1 - adjust.fade * 0.45})` : null,
    ].filter(Boolean).join(" "),
  } : undefined;

  const ADJUST_SLIDERS = [
    { key: "brightness" as keyof AdjustSettings, label: "Brightness", emoji: "☀️", min: -1, max: 1, color: "#FBBF24" },
    { key: "contrast" as keyof AdjustSettings, label: "Contrast", emoji: "◐", min: -1, max: 1, color: "#A78BFA" },
    { key: "saturation" as keyof AdjustSettings, label: "Saturation", emoji: "🎨", min: -1, max: 1, color: "#EC4899" },
    { key: "warmth" as keyof AdjustSettings, label: "Warmth", emoji: "🌅", min: -1, max: 1, color: "#F97316" },
    { key: "fade" as keyof AdjustSettings, label: "Fade", emoji: "🌫", min: 0, max: 1, color: "#94A3B8" },
    { key: "vignette" as keyof AdjustSettings, label: "Vignette", emoji: "⬛", min: 0, max: 1, color: "#6366F1" },
  ];

  const imgTransform = [
    { rotate: `${rotate}deg` },
    { scaleX: flipH ? -1 : 1 },
  ];

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {/* ── PREVIEW ── */}
      <View style={[styles.preview, { paddingTop: insets.top }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: imgTransform }]}>
          <Image
            source={{ uri }}
            style={[StyleSheet.absoluteFill, webFilterStyle as any]}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Filter overlay */}
        {filter.id !== "none" && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: filter.blendHex, opacity: filter.opacity }]} pointerEvents="none" />
        )}

        {/* Adjust overlays — native only; web uses CSS filter above */}
        {Platform.OS !== "web" && hasAdjust && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {adjust.brightness > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${brightnessOpacity})` }]} />}
            {adjust.brightness < 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${brightnessOpacity})` }]} />}
            {adjust.contrast > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${adjust.contrast * 0.15})`, mixBlendMode: "multiply" as any }]} />}
            {adjust.contrast < 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(128,128,128,${Math.abs(adjust.contrast) * 0.2})` }]} />}
            {adjust.saturation < -0.3 && <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(128,128,128,${Math.abs(adjust.saturation) * 0.35})`, mixBlendMode: "color" as any }]} />}
            {adjust.warmth > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(249,115,22,${warmthOpacity})` }]} />}
            {adjust.warmth < 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(59,130,246,${coolOpacity})` }]} />}
            {adjust.fade > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(226,232,240,${fadeOpacity})` }]} />}
            {vignetteOpacity > 0 && (
              <View style={StyleSheet.absoluteFill}>
                <LinearGradient
                  colors={[`rgba(0,0,0,${vignetteOpacity})`, "transparent", "transparent", `rgba(0,0,0,${vignetteOpacity})`]}
                  locations={[0, 0.3, 0.7, 1]}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            )}
          </View>
        )}

        {/* Crop ratio visual guide */}
        {cropRatio !== "free" && activeTab === "adjust" && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={styles.cropOverlay} />
          </View>
        )}

        {/* Text overlays */}
        {textOverlays.map((t) => (
          <View key={t.id} style={[styles.textOverlay, { top: t.y, left: t.x }]}>
            <Text style={[styles.overlayText, { color: t.color }]}>{t.text}</Text>
          </View>
        ))}
        {stickers.map((s) => (
          <DraggableSticker key={s.id} sticker={s} onMove={moveSticker} />
        ))}

        <View style={[styles.previewTopBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onDiscard} style={styles.topBtn}>
            <View style={styles.discardXBtn}>
              <Icon name="close" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.previewTitle}>{isPhoto ? "Photo Editor" : "Video Editor"}</Text>
          {activeTab === "adjust" && hasAdjust ? (
            <TouchableOpacity onPress={() => setAdjust(DEFAULT_ADJUST)} style={styles.resetBtn}>
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 52 }} />
          )}
        </View>

        {music && (
          <View style={styles.musicBar}>
            <Icon name="musical-notes" size={13} color="#fff" />
            <Text style={styles.musicBarText} numberOfLines={1}>{music.title} · {music.artist}</Text>
          </View>
        )}
      </View>

      {/* ── EDITOR PANEL ── */}
      <View style={[styles.editorPanel, { backgroundColor: colors.background }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {(["edit", "adjust", "caption"] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setActiveTab(t)} style={[styles.tabPill, activeTab === t && { backgroundColor: "#7C3AED" }]}>
              <Text style={[styles.tabText, { color: activeTab === t ? "#fff" : colors.mutedForeground }]}>
                {t === "edit" ? "✏️ Edit" : t === "adjust" ? "🎛 Adjust" : "📝 Post"}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── EDIT TAB ── */}
        {activeTab === "edit" && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}>
            {!isPhoto && (
              <View>
                <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Trim Video</Text>
                <View style={[styles.trimContainer, { backgroundColor: colors.muted }]}>
                  <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.trimHighlight, { left: trimStartVal, width: trimEndVal - trimStartVal }]} />
                  <Animated.View {...startPan.panHandlers} style={[styles.trimHandle, { left: trimStartX }]}>
                    <View style={styles.trimHandleBar} />
                  </Animated.View>
                  <Animated.View {...endPan.panHandlers} style={[styles.trimHandle, { left: Animated.subtract(trimEndX, 16) }]}>
                    <View style={styles.trimHandleBar} />
                  </Animated.View>
                </View>
                <Text style={[styles.trimInfo, { color: colors.mutedForeground }]}>
                  {formatDuration(clipStart)} → {formatDuration(clipEnd)} ({formatDuration(clipEnd - clipStart)} selected)
                </Text>
              </View>
            )}

            <View>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Tools</Text>
              <View style={styles.toolsRow}>
                {TOOLS.map((tool) => (
                  <TouchableOpacity key={tool.id} style={styles.toolBtn} onPress={() => {
                    if (tool.id === "music") setShowMusicPicker(true);
                    if (tool.id === "text") setShowTextModal(true);
                    if (tool.id === "stickers") setShowStickerModal(true);
                  }}>
                    <View style={[styles.toolIconWrap, { backgroundColor: tool.color + "22" }]}>
                      <Text style={{ fontSize: 20 }}>{(tool as any).emoji}</Text>
                    </View>
                    <Text style={[styles.toolLabel, { color: colors.mutedForeground }]}>{tool.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {music && (
              <View style={[styles.musicCard, { backgroundColor: colors.muted, borderColor: "#7C3AED44" }]}>
                <View style={[styles.musicCardIcon, { backgroundColor: music.coverColor + "33" }]}>
                  <Icon name="musical-notes" size={18} color={music.coverColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.musicCardTitle, { color: colors.foreground }]}>{music.title}</Text>
                  <Text style={[styles.musicCardArtist, { color: colors.mutedForeground }]}>{music.artist}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowMusicPicker(true)}>
                  <Text style={{ color: "#7C3AED", fontSize: 13, fontFamily: "Poppins_600SemiBold" }}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMusic(null)} style={{ padding: 4 }}>
                  <Icon name="close-circle" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            )}

            <View>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Color Filter</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {FILTERS.map((f) => (
                  <FilterSwatch key={f.id} filter={f} active={filter.id === f.id} onPress={() => setFilter(f)} />
                ))}
              </ScrollView>
            </View>

            {textOverlays.length > 0 && (
              <View>
                <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Text Overlays</Text>
                {textOverlays.map((t) => (
                  <View key={t.id} style={[styles.overlayRow, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.overlayPreview, { color: t.color, backgroundColor: t.color + "22", borderRadius: 6, padding: 4 }]}>{t.text}</Text>
                    <TouchableOpacity onPress={() => setTextOverlays((prev) => prev.filter((x) => x.id !== t.id))}>
                      <Icon name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}

        {/* ── ADJUST TAB ── */}
        {activeTab === "adjust" && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}>
            {/* Rotate & flip */}
            <View>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Transform</Text>
              <View style={styles.toolsRow}>
                {[
                  { icon: "return-up-back-outline", label: "Rotate L", action: () => setRotate((r) => (r - 90 + 360) % 360), color: "#8B5CF6" },
                  { icon: "return-up-forward-outline", label: "Rotate R", action: () => setRotate((r) => (r + 90) % 360), color: "#8B5CF6" },
                  { icon: "swap-horizontal-outline", label: flipH ? "Un-Flip" : "Flip H", action: () => setFlipH((v) => !v), color: "#F97316" },
                  { icon: "refresh-outline", label: "Reset", action: () => { setRotate(0); setFlipH(false); }, color: "#EF4444" },
                ].map((btn) => (
                  <TouchableOpacity key={btn.label} style={styles.toolBtn} onPress={btn.action}>
                    <View style={[styles.toolIconWrap, { backgroundColor: btn.color + "22" }]}>
                      <Icon name={btn.icon} size={22} color={btn.color} />
                    </View>
                    <Text style={[styles.toolLabel, { color: colors.mutedForeground }]}>{btn.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Crop ratios */}
            <View>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Crop Ratio</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {CROP_RATIOS.map((r) => (
                  <TouchableOpacity key={r} onPress={() => setCropRatio(r)} style={[styles.cropPill, cropRatio === r && styles.cropPillActive]}>
                    <Text style={[styles.cropPillText, { color: cropRatio === r ? "#fff" : colors.mutedForeground }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Adjust sliders */}
            <View style={{ gap: 4 }}>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Adjustments</Text>
              <View style={[styles.adjustCard, { backgroundColor: colors.muted }]}>
                {ADJUST_SLIDERS.map((sl) => (
                  <AdjustSliderRow
                    key={sl.key}
                    label={sl.label}
                    emoji={sl.emoji}
                    value={adjust[sl.key]}
                    min={sl.min}
                    max={sl.max}
                    color={sl.color}
                    onChange={(v) => setAdjust((prev) => ({ ...prev, [sl.key]: v }))}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        )}

        {/* ── CAPTION TAB ── */}
        {activeTab === "caption" && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
            <View>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Caption</Text>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Describe your vibe... #hashtags @mentions"
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={300}
                style={[styles.captionInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              />
              <Text style={[styles.captionCount, { color: colors.mutedForeground }]}>{caption.length}/300</Text>

              <Animated.View style={{ transform: [{ scale: sparkleAnim }], marginTop: 10 }}>
                <TouchableOpacity onPress={generateAICaptions} style={styles.aiCaptionBtn} activeOpacity={0.82}>
                  <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.aiCaptionGrad}>
                    <Text style={{ fontSize: 16 }}>✨</Text>
                    <Text style={styles.aiCaptionText}>Generate AI Caption</Text>
                    <Icon name="sparkles-outline" size={16} color="rgba(255,255,255,0.8)" />
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </View>

            <View>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Audience</Text>
              <View style={styles.audienceRow}>
                {AUDIENCES.map((a) => (
                  <TouchableOpacity key={a} onPress={() => setAudience(a)} style={[styles.audiencePill, audience === a && { backgroundColor: "#7C3AED" }]}>
                    <Text style={[styles.audienceText, { color: audience === a ? "#fff" : colors.mutedForeground }]}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.postOptionsCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              {/* Add Location */}
              <TouchableOpacity
                style={[styles.postOptionRow, { borderBottomColor: colors.border }]}
                onPress={location ? () => setLocation("") : fetchLocation}
              >
                <Icon name="location-outline" size={18} color="#F97316" />
                <Text style={[styles.postOptionText, { color: location ? "#F97316" : colors.foreground }]} numberOfLines={1}>
                  {location || "Add Location"}
                </Text>
                {locationLoading
                  ? <ActivityIndicator size="small" color="#F97316" />
                  : location
                    ? <Icon name="close-circle" size={18} color={colors.mutedForeground} />
                    : <Icon name="chevron-forward" size={16} color={colors.mutedForeground} />
                }
              </TouchableOpacity>

              {/* Tag People */}
              <TouchableOpacity
                style={[styles.postOptionRow, { borderBottomColor: colors.border }]}
                onPress={() => setShowTagPicker(true)}
              >
                <Icon name="person-add-outline" size={18} color="#7C3AED" />
                <Text style={[styles.postOptionText, { color: taggedUsers.length > 0 ? "#7C3AED" : colors.foreground }]}>
                  {taggedUsers.length > 0
                    ? `${taggedUsers.length} ${taggedUsers.length === 1 ? "person" : "people"} tagged`
                    : "Tag People"}
                </Text>
                <Icon name="chevron-forward" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              {/* Allow Comments */}
              <View style={[styles.postOptionRow, { borderBottomColor: colors.border }]}>
                <Icon name="chatbubbles-outline" size={18} color="#10B981" />
                <Text style={[styles.postOptionText, { color: colors.foreground }]}>Allow Comments</Text>
                <Switch
                  value={allowComments}
                  onValueChange={setAllowComments}
                  trackColor={{ false: "rgba(255,255,255,0.1)", true: "#10B981" }}
                  thumbColor="#fff"
                />
              </View>

              {/* Allow Downloads */}
              <View style={[styles.postOptionRow, { borderBottomWidth: 0 }]}>
                <Icon name="download-outline" size={18} color="#3B82F6" />
                <Text style={[styles.postOptionText, { color: colors.foreground }]}>Allow Downloads</Text>
                <Switch
                  value={allowDownloads}
                  onValueChange={setAllowDownloads}
                  trackColor={{ false: "rgba(255,255,255,0.1)", true: "#3B82F6" }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            <GradientButton onPress={handlePost} title="Post to Gundruk 🔥" loading={posting} />
            <TouchableOpacity onPress={onDiscard} style={styles.discardBtn}>
              <Text style={[styles.discardText, { color: colors.mutedForeground }]}>Discard & Retake</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      {/* ── PICKERS / MODALS ── */}
      <MusicPickerSheet visible={showMusicPicker} onClose={() => setShowMusicPicker(false)} onSelect={(t) => setMusic(t)} selectedTrack={music} />
      <AICaptionSheet visible={showAISheet} loading={aiLoading} captions={aiCaptions} hashtags={aiHashtags} selectedHashtags={selectedHashtags} onSelectCaption={handleSelectCaption} onToggleHashtag={(tag) => setSelectedHashtags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])} onClose={() => setShowAISheet(false)} />

      {/* ── TAG PEOPLE MODAL ── */}
      <Modal
        visible={showTagPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTagPicker(false)}
        statusBarTranslucent
      >
        <View style={tagStyles.backdrop}>
          <View style={[tagStyles.sheet, { backgroundColor: colors.background }]}>
            <View style={tagStyles.header}>
              <Text style={[tagStyles.title, { color: colors.foreground }]}>Tag People</Text>
              <TouchableOpacity onPress={() => setShowTagPicker(false)}>
                <Icon name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={[tagStyles.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Icon name="search-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                value={tagSearch}
                onChangeText={async (q) => {
                  setTagSearch(q);
                  if (q.trim().length > 0) {
                    const results = await searchProfiles(q).catch(() => []);
                    setTagResults(results as TaggedUser[]);
                  } else {
                    setTagResults([]);
                  }
                }}
                placeholder="Search by username…"
                placeholderTextColor={colors.mutedForeground}
                style={[tagStyles.searchInput, { color: colors.foreground }]}
                autoFocus
              />
            </View>

            {taggedUsers.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={tagStyles.chipsRow}>
                {taggedUsers.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={tagStyles.chip}
                    onPress={() => setTaggedUsers((prev) => prev.filter((x) => x.id !== u.id))}
                  >
                    <Text style={tagStyles.chipText}>@{u.username}</Text>
                    <Icon name="close" size={11} color="#fff" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <FlatList
              data={tagResults}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => {
                const isSelected = taggedUsers.some((u) => u.id === item.id);
                return (
                  <TouchableOpacity
                    style={[tagStyles.resultRow, { borderBottomColor: colors.border }]}
                    onPress={() =>
                      setTaggedUsers((prev) =>
                        isSelected ? prev.filter((u) => u.id !== item.id) : [...prev, item]
                      )
                    }
                  >
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={tagStyles.avatar} />
                    ) : (
                      <View style={[tagStyles.avatar, tagStyles.avatarPlaceholder]}>
                        <Icon name="person" size={16} color="rgba(255,255,255,0.4)" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[tagStyles.username, { color: colors.foreground }]}>@{item.username}</Text>
                      {item.full_name ? <Text style={[tagStyles.fullName, { color: colors.mutedForeground }]}>{item.full_name}</Text> : null}
                    </View>
                    {isSelected && <Icon name="checkmark-circle" size={20} color="#7C3AED" />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[tagStyles.emptyText, { color: colors.mutedForeground }]}>
                  {tagSearch.length > 0 ? "No users found" : "Type a username to search"}
                </Text>
              }
            />

            <TouchableOpacity
              style={tagStyles.doneBtn}
              onPress={() => setShowTagPicker(false)}
            >
              <LinearGradient colors={["#7C3AED", "#6D28D9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={tagStyles.doneBtnGrad}>
                <Text style={tagStyles.doneBtnText}>Done{taggedUsers.length > 0 ? ` (${taggedUsers.length})` : ""}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showTextModal} transparent animationType="slide" onRequestClose={() => setShowTextModal(false)} statusBarTranslucent>
        <View style={styles.textModalBackdrop}>
          <View style={[styles.textModalCard, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <Text style={[styles.textModalTitle, { color: colors.foreground }]}>Add Text</Text>
            <TextInput value={newText} onChangeText={setNewText} placeholder="Type something..." placeholderTextColor={colors.mutedForeground} style={[styles.textModalInput, { color: newTextColor, backgroundColor: colors.muted, borderColor: colors.border }]} autoFocus={showTextModal} maxLength={60} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {TEXT_COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setNewTextColor(c)} style={[styles.colorDot, { backgroundColor: c, borderColor: newTextColor === c ? "#7C3AED" : "transparent" }]} />
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => { setShowTextModal(false); setNewText(""); }} style={[styles.modalCancelBtn, { backgroundColor: colors.muted }]}>
                <Text style={[styles.modalCancelText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addTextOverlay} style={styles.modalAddBtn}>
                <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalAddGrad}>
                  <Text style={styles.modalAddText}>Add Text</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showStickerModal} transparent animationType="slide" onRequestClose={() => setShowStickerModal(false)} statusBarTranslucent>
        <View style={styles.textModalBackdrop}>
          <View style={[styles.stickerCard, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom + 16, 36) }]}>
            <View style={styles.stickerHeader}>
              <Text style={[styles.textModalTitle, { color: colors.foreground }]}>Add Sticker</Text>
              <TouchableOpacity onPress={() => setShowStickerModal(false)}>
                <Icon name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={styles.stickerGrid}>
              {STICKER_EMOJIS.map((e) => (
                <TouchableOpacity key={e} onPress={() => addSticker(e)} style={styles.stickerItem}>
                  <Text style={styles.stickerEmoji}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  preview: { flex: 1, position: "relative", backgroundColor: "#000", overflow: "hidden" },
  previewTopBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 8 },
  topBtn: { width: 38, height: 38, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 19, alignItems: "center", justifyContent: "center" },
  discardXBtn: { width: 34, height: 34, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 17, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  previewTitle: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  resetBtn: { backgroundColor: "rgba(239,68,68,0.2)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(239,68,68,0.4)" },
  resetText: { color: "#FCA5A5", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  musicBar: { position: "absolute", bottom: 12, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  musicBarText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_500Medium", maxWidth: W * 0.6 },
  textOverlay: { position: "absolute" },
  overlayText: { fontSize: 18, fontFamily: "Poppins_600SemiBold", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
  stickerOverlay: { position: "absolute", fontSize: 36 },
  stickerGifOverlay: { position: "absolute", width: 60, height: 60 },
  cropOverlay: { flex: 1, borderWidth: 1.5, borderColor: "rgba(251,191,36,0.6)", margin: 20, borderRadius: 2 },

  editorPanel: { height: "45%", borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  tabRow: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, gap: 8 },
  tabPill: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.07)" },
  tabText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  sectionLabel: { fontSize: 13, fontFamily: "Poppins_700Bold", marginBottom: 10 },

  trimContainer: { height: 48, borderRadius: 10, marginBottom: 6, position: "relative", overflow: "hidden" },
  trimHighlight: { position: "absolute", top: 0, bottom: 0, borderRadius: 10, opacity: 0.35 },
  trimHandle: { position: "absolute", top: 0, bottom: 0, width: 16, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center", borderRadius: 4 },
  trimHandleBar: { width: 2.5, height: 22, backgroundColor: "#fff", borderRadius: 2 },
  trimInfo: { fontSize: 11, fontFamily: "Poppins_500Medium" },

  toolsRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  toolBtn: { alignItems: "center", gap: 5, minWidth: 64 },
  toolIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  toolLabel: { fontSize: 11, fontFamily: "Poppins_500Medium" },

  musicCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, padding: 12, borderWidth: 1 },
  musicCardIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  musicCardTitle: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  musicCardArtist: { fontSize: 11, fontFamily: "Poppins_400Regular" },

  filterSwatchWrap: { alignItems: "center", gap: 4 },
  filterSwatchBox: { width: 52, height: 52, borderRadius: 10, overflow: "hidden", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  filterSwatchLabel: { fontSize: 10, fontFamily: "Poppins_500Medium", color: "rgba(255,255,255,0.6)" },

  overlayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, borderRadius: 10, marginBottom: 6 },
  overlayPreview: { fontSize: 14, fontFamily: "Poppins_500Medium" },

  adjustCard: { borderRadius: 14, padding: 14, gap: 4 },
  cropPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.07)" },
  cropPillActive: { backgroundColor: "#7C3AED" },
  cropPillText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },

  captionInput: { borderRadius: 12, padding: 12, fontSize: 14, fontFamily: "Poppins_400Regular", borderWidth: 1, minHeight: 80 },
  captionCount: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "right", marginTop: 4 },
  aiCaptionBtn: { borderRadius: 14, overflow: "hidden" },
  aiCaptionGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13 },
  aiCaptionText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },

  audienceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  audiencePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.07)" },
  audienceText: { fontSize: 13, fontFamily: "Poppins_500Medium" },

  postOptionsCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  postOptionRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  postOptionText: { flex: 1, fontSize: 14, fontFamily: "Poppins_500Medium" },

  discardBtn: { alignItems: "center", paddingVertical: 14 },
  discardText: { fontSize: 14, fontFamily: "Poppins_500Medium" },

  textModalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  textModalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 12 },
  textModalTitle: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  textModalInput: { borderRadius: 12, padding: 12, fontSize: 16, fontFamily: "Poppins_500Medium", borderWidth: 1, minHeight: 50 },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  modalCancelBtn: { flex: 1, paddingVertical: 13, alignItems: "center", borderRadius: 12 },
  modalCancelText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  modalAddBtn: { flex: 2, borderRadius: 12, overflow: "hidden" },
  modalAddGrad: { paddingVertical: 14, alignItems: "center" },
  modalAddText: { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },

  stickerCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  stickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  stickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stickerItem: { width: 52, height: 52, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  stickerEmoji: { fontSize: 28 },
});

const tagStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 36, maxHeight: "80%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 18 },
  title: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular", padding: 0 },
  chipsRow: { paddingHorizontal: 16, gap: 8, alignItems: "center", paddingBottom: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#7C3AED", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_500Medium" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: { backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  username: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  fullName: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  emptyText: { textAlign: "center", fontSize: 14, fontFamily: "Poppins_400Regular", paddingVertical: 24 },
  doneBtn: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, overflow: "hidden" },
  doneBtnGrad: { paddingVertical: 15, alignItems: "center" },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Poppins_700Bold" },
});
