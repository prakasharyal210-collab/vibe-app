import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradientButton } from "@/components/GradientButton";
import { MusicPickerSheet } from "@/components/MusicPickerSheet";
import { FilterConfig, FILTERS } from "@/components/EffectsPickerSheet";
import { useColors } from "@/hooks/useColors";
import { Track, formatDuration } from "@/lib/music";

const { width: W } = Dimensions.get("window");

export interface PostData {
  caption: string;
  music: Track | null;
  audience: string;
  tags: string[];
}

interface TextOverlay {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
}

interface StickerItem {
  id: string;
  emoji: string;
  x: number;
  y: number;
}

interface Props {
  uri: string;
  isPhoto: boolean;
  initialMusic: Track | null;
  initialFilter: FilterConfig;
  textOverlays: TextOverlay[];
  stickers: StickerItem[];
  onDiscard: () => void;
  onPost: (data: PostData) => void;
}

const TEXT_COLORS = ["#ffffff", "#000000", "#7C3AED", "#F97316", "#EF4444", "#10B981", "#3B82F6", "#FBBF24", "#EC4899"];
const STICKER_EMOJIS = ["🔥", "💜", "✨", "😍", "🎶", "👑", "💯", "🌊", "🦋", "🌸", "💫", "🎉", "😂", "🙌", "💪", "🌈", "⚡", "🎯", "🦄", "🤩", "😘", "🍀", "🌺", "💎", "🏆", "🎵", "🌟", "🎸", "🍕", "❤️"];
const AUDIENCES = ["Everyone", "Friends", "Followers", "Only Me"];

const TRIM_W = W - 32;

function FilterSwatch({ filter, active, onPress }: { filter: FilterConfig; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity style={styles.filterSwatchWrap} onPress={onPress}>
      <View style={[styles.filterSwatchBox, active && { borderColor: "#7C3AED", borderWidth: 2.5 }]}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 8, backgroundColor: "#1F1035" }]} />
        {filter.id !== "none" && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: filter.blendHex, opacity: filter.opacity * 2.5, borderRadius: 8 }]} />
        )}
        {filter.id === "none" && <Ionicons name="close" size={14} color="rgba(255,255,255,0.4)" />}
      </View>
      <Text style={[styles.filterSwatchLabel, active && { color: "#7C3AED" }]}>{filter.label}</Text>
    </TouchableOpacity>
  );
}

export function VideoEditorSheet({ uri, isPhoto, initialMusic, initialFilter, textOverlays: initialText, stickers: initialStickers, onDiscard, onPost }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState("Everyone");
  const [music, setMusic] = useState<Track | null>(initialMusic);
  const [filter, setFilter] = useState<FilterConfig>(initialFilter);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "caption">("edit");
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>(initialText);
  const [stickers, setStickers] = useState<StickerItem[]>(initialStickers);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [newTextColor, setNewTextColor] = useState("#ffffff");
  const [posting, setPosting] = useState(false);

  const trimStartX = useRef(new Animated.Value(0)).current;
  const trimEndX = useRef(new Animated.Value(TRIM_W)).current;
  const [trimStartVal, setTrimStartVal] = useState(0);
  const [trimEndVal, setTrimEndVal] = useState(TRIM_W);

  const startPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const newX = Math.max(0, Math.min(trimEndVal - 30, g.moveX - 16));
        setTrimStartVal(newX);
        trimStartX.setValue(newX);
      },
    })
  ).current;

  const endPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const newX = Math.min(TRIM_W, Math.max(trimStartVal + 30, g.moveX - 16));
        setTrimEndVal(newX);
        trimEndX.setValue(newX);
      },
    })
  ).current;

  const addTextOverlay = () => {
    if (!newText.trim()) return;
    setTextOverlays((prev) => [
      ...prev,
      { id: Date.now().toString(), text: newText.trim(), color: newTextColor, x: 80, y: 120 },
    ]);
    setNewText("");
    setShowTextModal(false);
  };

  const addSticker = (emoji: string) => {
    setStickers((prev) => [
      ...prev,
      { id: Date.now().toString(), emoji, x: 80 + Math.random() * 100, y: 80 + Math.random() * 120 },
    ]);
    setShowStickerModal(false);
  };

  const handlePost = async () => {
    setPosting(true);
    await new Promise((r) => setTimeout(r, 1400));
    setPosting(false);
    onPost({ caption, music, audience, tags: [] });
  };

  const trimStartPct = trimStartVal / TRIM_W;
  const trimEndPct = trimEndVal / TRIM_W;
  const totalSecs = isPhoto ? 0 : 30;
  const clipStart = Math.round(trimStartPct * totalSecs);
  const clipEnd = Math.round(trimEndPct * totalSecs);

  const TOOLS = [
    { id: "music", icon: "musical-notes-outline", label: "Music", color: "#7C3AED" },
    { id: "text", icon: "text-outline", label: "Text", color: "#3B82F6" },
    { id: "stickers", icon: "happy-outline", label: "Stickers", color: "#F97316" },
    { id: "filter", icon: "color-filter-outline", label: "Filter", color: "#EC4899" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <View style={[styles.preview, { paddingTop: insets.top }]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        {filter.id !== "none" && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: filter.blendHex, opacity: filter.opacity }]} />
        )}
        {textOverlays.map((t) => (
          <View key={t.id} style={[styles.textOverlay, { top: t.y, left: t.x }]}>
            <Text style={[styles.overlayText, { color: t.color }]}>{t.text}</Text>
          </View>
        ))}
        {stickers.map((s) => (
          <Text key={s.id} style={[styles.stickerOverlay, { top: s.y, left: s.x }]}>{s.emoji}</Text>
        ))}

        <View style={[styles.previewTopBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onDiscard} style={styles.topBtn}>
            <Ionicons name="arrow-back-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.previewTitle}>{isPhoto ? "Photo Editor" : "Video Editor"}</Text>
          <View style={{ width: 38 }} />
        </View>

        {music && (
          <View style={styles.musicBar}>
            <Ionicons name="musical-notes" size={13} color="#fff" />
            <Text style={styles.musicBarText} numberOfLines={1}>
              {music.title} · {music.artist}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.editorPanel, { backgroundColor: colors.background }]}>
        <View style={styles.tabRow}>
          {(["edit", "caption"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setActiveTab(t)}
              style={[styles.tabPill, activeTab === t && { backgroundColor: "#7C3AED" }]}
            >
              <Text style={[styles.tabText, { color: activeTab === t ? "#fff" : colors.mutedForeground }]}>
                {t === "edit" ? "✏️ Edit" : "📝 Caption & Post"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === "edit" ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
            {!isPhoto && (
              <View>
                <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Trim Video</Text>
                <View style={[styles.trimContainer, { backgroundColor: colors.muted }]}>
                  <LinearGradient
                    colors={["#7C3AED", "#EA580C"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[
                      styles.trimHighlight,
                      { left: trimStartVal, width: trimEndVal - trimStartVal },
                    ]}
                  />
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
                  <TouchableOpacity
                    key={tool.id}
                    style={styles.toolBtn}
                    onPress={() => {
                      if (tool.id === "music") setShowMusicPicker(true);
                      if (tool.id === "text") setShowTextModal(true);
                      if (tool.id === "stickers") setShowStickerModal(true);
                    }}
                  >
                    <View style={[styles.toolIconWrap, { backgroundColor: tool.color + "22" }]}>
                      <Ionicons name={tool.icon as any} size={22} color={tool.color} />
                    </View>
                    <Text style={[styles.toolLabel, { color: colors.mutedForeground }]}>{tool.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {music && (
              <View style={[styles.musicCard, { backgroundColor: colors.muted, borderColor: "#7C3AED44" }]}>
                <View style={[styles.musicCardIcon, { backgroundColor: music.coverColor + "33" }]}>
                  <Ionicons name="musical-notes" size={18} color={music.coverColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.musicCardTitle, { color: colors.foreground }]}>{music.title}</Text>
                  <Text style={[styles.musicCardArtist, { color: colors.mutedForeground }]}>{music.artist}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowMusicPicker(true)}>
                  <Text style={{ color: "#7C3AED", fontSize: 13, fontFamily: "Poppins_600SemiBold" }}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMusic(null)} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
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
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
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
            </View>

            <View>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Audience</Text>
              <View style={styles.audienceRow}>
                {AUDIENCES.map((a) => (
                  <TouchableOpacity
                    key={a}
                    onPress={() => setAudience(a)}
                    style={[styles.audiencePill, audience === a && { backgroundColor: "#7C3AED" }]}
                  >
                    <Text style={[styles.audienceText, { color: audience === a ? "#fff" : colors.mutedForeground }]}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.postOptionsCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              {[
                { icon: "location-outline", label: "Add Location", color: "#F97316" },
                { icon: "person-add-outline", label: "Tag People", color: "#7C3AED" },
                { icon: "chatbubbles-outline", label: "Allow Comments", color: "#10B981" },
                { icon: "download-outline", label: "Allow Downloads", color: "#3B82F6" },
              ].map((o, i, arr) => (
                <TouchableOpacity
                  key={o.label}
                  style={[styles.postOptionRow, { borderBottomColor: colors.border }, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => Alert.alert(o.label, "Coming soon")}
                >
                  <Ionicons name={o.icon as any} size={18} color={o.color} />
                  <Text style={[styles.postOptionText, { color: colors.foreground }]}>{o.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>

            <GradientButton onPress={handlePost} title="Post to Vibe 🔥" loading={posting} />
            <TouchableOpacity onPress={onDiscard} style={styles.discardBtn}>
              <Text style={[styles.discardText, { color: colors.mutedForeground }]}>Discard & Retake</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      <MusicPickerSheet
        visible={showMusicPicker}
        onClose={() => setShowMusicPicker(false)}
        onSelect={(t) => setMusic(t)}
        selectedTrack={music}
      />

      <View style={{ display: showTextModal ? "flex" : "none" }}>
        <View style={styles.textModalBackdrop}>
          <View style={[styles.textModalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.textModalTitle, { color: colors.foreground }]}>Add Text</Text>
            <TextInput
              value={newText}
              onChangeText={setNewText}
              placeholder="Type something..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.textModalInput, { color: newTextColor, backgroundColor: colors.muted, borderColor: colors.border }]}
              autoFocus={showTextModal}
              maxLength={60}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {TEXT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setNewTextColor(c)}
                  style={[styles.colorDot, { backgroundColor: c, borderColor: newTextColor === c ? "#7C3AED" : "transparent" }]}
                />
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
      </View>

      <View style={{ display: showStickerModal ? "flex" : "none" }}>
        <View style={styles.textModalBackdrop}>
          <View style={[styles.stickerCard, { backgroundColor: colors.background }]}>
            <View style={styles.stickerHeader}>
              <Text style={[styles.textModalTitle, { color: colors.foreground }]}>Add Sticker</Text>
              <TouchableOpacity onPress={() => setShowStickerModal(false)}>
                <Ionicons name="close" size={22} color={colors.foreground} />
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  preview: { height: "45%", position: "relative" },
  previewTopBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12,
  },
  topBtn: { backgroundColor: "rgba(0,0,0,0.4)", padding: 8, borderRadius: 20 },
  previewTitle: { color: "#fff", fontSize: 16, fontFamily: "Poppins_700Bold" },
  musicBar: {
    position: "absolute", bottom: 12, left: 12, right: 12,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
  },
  musicBarText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_500Medium", flex: 1 },
  textOverlay: { position: "absolute" },
  overlayText: { fontSize: 22, fontFamily: "Poppins_700Bold", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
  stickerOverlay: { position: "absolute", fontSize: 36 },
  editorPanel: { flex: 1 },
  tabRow: { flexDirection: "row", gap: 8, padding: 12 },
  tabPill: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  tabText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  sectionLabel: { fontSize: 13, fontFamily: "Poppins_700Bold", marginBottom: 10 },
  trimContainer: { height: 44, borderRadius: 10, overflow: "visible", position: "relative", marginBottom: 6 },
  trimHighlight: { position: "absolute", top: 0, bottom: 0, borderRadius: 6 },
  trimHandle: {
    position: "absolute", top: -6, width: 16, height: 56,
    backgroundColor: "#7C3AED", borderRadius: 4, alignItems: "center", justifyContent: "center",
  },
  trimHandleBar: { width: 3, height: 20, backgroundColor: "#fff", borderRadius: 2 },
  trimInfo: { fontSize: 11, fontFamily: "Poppins_500Medium" },
  toolsRow: { flexDirection: "row", gap: 12 },
  toolBtn: { alignItems: "center", gap: 6, flex: 1 },
  toolIconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  toolLabel: { fontSize: 11, fontFamily: "Poppins_500Medium" },
  musicCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 14, padding: 12, borderWidth: 1,
  },
  musicCardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  musicCardTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  musicCardArtist: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  filterSwatchWrap: { alignItems: "center", gap: 5 },
  filterSwatchBox: { width: 52, height: 52, borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  filterSwatchLabel: { fontSize: 10, fontFamily: "Poppins_500Medium", color: "rgba(255,255,255,0.7)" },
  overlayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, borderRadius: 10, marginBottom: 4 },
  overlayPreview: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  captionInput: { borderRadius: 12, padding: 12, fontSize: 14, fontFamily: "Poppins_400Regular", minHeight: 80, textAlignVertical: "top", borderWidth: 1 },
  captionCount: { fontSize: 11, textAlign: "right", marginTop: 4, fontFamily: "Poppins_400Regular" },
  audienceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  audiencePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)" },
  audienceText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  postOptionsCard: { borderRadius: 14, overflow: "hidden", borderWidth: 1 },
  postOptionRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 0.5 },
  postOptionText: { flex: 1, fontSize: 14, fontFamily: "Poppins_500Medium" },
  discardBtn: { alignItems: "center", paddingVertical: 8 },
  discardText: { fontSize: 14, fontFamily: "Poppins_500Medium" },
  textModalBackdrop: { position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "flex-end", zIndex: 100 },
  textModalCard: { width: "100%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14 },
  textModalTitle: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  textModalInput: { borderRadius: 12, padding: 12, fontSize: 18, fontFamily: "Poppins_700Bold", borderWidth: 1, textAlign: "center" },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 3 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalCancelText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  modalAddBtn: { flex: 2, borderRadius: 12, overflow: "hidden" },
  modalAddGrad: { paddingVertical: 14, alignItems: "center" },
  modalAddText: { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
  stickerCard: { width: "100%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  stickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  stickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stickerItem: { width: 50, height: 50, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12 },
  stickerEmoji: { fontSize: 28 },
});
