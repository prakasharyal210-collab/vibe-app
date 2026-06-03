import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradientButton } from "@/components/GradientButton";
import { LoginPrompt } from "@/components/LoginPrompt";
import { MusicPickerSheet } from "@/components/MusicPickerSheet";
import { EffectsPickerSheet, FilterConfig, FILTERS, TimerValue } from "@/components/EffectsPickerSheet";
import { VideoEditorSheet } from "@/components/VideoEditorSheet";
import { useAuth } from "@/context/AuthContext";
import { detectSpam } from "@/lib/db";
import { useColors } from "@/hooks/useColors";
import { Track } from "@/lib/music";

const { width: W, height: H } = Dimensions.get("window");

type CreateMode = "post" | "video" | "live";

interface TextOverlayItem {
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

const TOOLS = [
  { id: "editor", icon: "color-palette-outline", label: "Photo\nEditor", color: "#EC4899" },
  { id: "autocut", icon: "cut-outline", label: "AutoCut", color: "#F97316" },
  { id: "captions", icon: "text-outline", label: "Captions", color: "#3B82F6" },
  { id: "ai_self", icon: "person-outline", label: "AI Self", color: "#7C3AED" },
  { id: "ai_video", icon: "sparkles-outline", label: "AI Video", color: "#10B981" },
  { id: "templates", icon: "grid-outline", label: "Templates", color: "#F59E0B" },
];

const TEMPLATE_CATEGORIES = ["For You", "Viral Song", "Trendy", "Sports", "Travel", "Fashion"];

const TEMPLATES = Array.from({ length: 12 }, (_, i) => ({
  id: String(i),
  image: `https://picsum.photos/seed/tmpl${i + 10}/200/300`,
  label: ["Sunset Vibe", "City Night", "Dance Trend", "Workout", "Travel Log", "Food Porn", "Art Process", "Music Beat", "Friends", "Nature", "Fashion Look", "Comedy"][i],
  duration: ["15s", "30s", "60s"][i % 3],
}));

const DRAFT_ITEMS = [
  { id: "d1", image: "https://picsum.photos/seed/draft1/200/300", label: "Golden hour...", time: "2h ago" },
  { id: "d2", image: "https://picsum.photos/seed/draft2/200/300", label: "Dance challenge", time: "Yesterday" },
  { id: "d3", image: "https://picsum.photos/seed/draft3/200/300", label: "My new look", time: "3d ago" },
];

const TEXT_COLORS = ["#ffffff", "#000000", "#7C3AED", "#F97316", "#EF4444", "#10B981", "#3B82F6", "#FBBF24", "#EC4899"];
const STICKER_EMOJIS = ["🔥","💜","✨","😍","🎶","👑","💯","🌊","🦋","🌸","💫","🎉","😂","🙌","💪","🌈","⚡","🎯","🦄","🤩","😘","🍀","🌺","💎","🏆","🎵","🌟","🎸","🍕","❤️"];

function GridOverlay() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.35)" }} />
      <View style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.35)" }} />
      <View style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.35)" }} />
      <View style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.35)" }} />
    </View>
  );
}

function PostMode({ colors, isLoggedIn, onRequireLogin }: { colors: any; isLoggedIn: boolean; onRequireLogin: () => void }) {
  const { session } = useAuth();
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85, allowsEditing: true, aspect: [4, 3] });
    if (!result.canceled && result.assets[0]) setMediaUri(result.assets[0].uri);
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.postTypeRow}>
        {[
          { icon: "images-outline", label: "Photo / Video", color: "#7C3AED" },
          { icon: "musical-notes-outline", label: "Reel", color: "#F97316" },
          { icon: "text-outline", label: "Text Post", color: "#3B82F6" },
        ].map((t) => (
          <TouchableOpacity key={t.label} style={[styles.postTypeBtn, { borderColor: colors.border }]}>
            <Ionicons name={t.icon as any} size={22} color={t.color} />
            <Text style={[styles.postTypeLabel, { color: colors.foreground }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={pickMedia} style={[styles.mediaPicker, { borderColor: colors.border }]}>
        {mediaUri ? (
          <>
            <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <TouchableOpacity onPress={() => setMediaUri(null)} style={styles.removeImg}>
              <Ionicons name="close-circle" size={28} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <LinearGradient colors={["#7C3AED22", "#EA580C11"]} style={StyleSheet.absoluteFill} />
            <Ionicons name="add-circle-outline" size={44} color="#7C3AED" />
            <Text style={[styles.mediaPickerText, { color: colors.foreground }]}>Tap to add photo or video</Text>
            <Text style={[styles.mediaPickerSub, { color: colors.mutedForeground }]}>JPG, PNG, MP4 · Up to 100MB</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.postForm}>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="What's your vibe? Add hashtags, mentions..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={300}
          style={[styles.captionInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
        />

        <View style={[styles.postOptions, { borderColor: colors.border }]}>
          {[
            { icon: "location-outline", label: "Add Location", color: "#F97316" },
            { icon: "person-add-outline", label: "Tag People", color: "#7C3AED" },
            { icon: "people-outline", label: "Audience · Everyone", color: "#3B82F6" },
          ].map((opt, i, arr) => (
            <TouchableOpacity key={opt.label} onPress={() => Alert.alert(opt.label, "Coming soon")}
              style={[styles.optionRow, { borderBottomColor: colors.border }, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <Ionicons name={opt.icon as any} size={20} color={opt.color} />
              <Text style={[styles.optionText, { color: colors.foreground }]}>{opt.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.postActions}>
          <TouchableOpacity style={[styles.draftBtn, { borderColor: colors.border }]}>
            <Ionicons name="save-outline" size={18} color={colors.mutedForeground} />
            <Text style={[styles.draftBtnText, { color: colors.mutedForeground }]}>Save Draft</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <GradientButton
              title={posting ? "Checking..." : "Post Now"}
              onPress={async () => {
                if (!isLoggedIn) { onRequireLogin(); return; }
                const userId = session?.user?.id;
                if (!userId) return;
                setPosting(true);
                try {
                  const isSpam = await detectSpam(userId);
                  if (isSpam) {
                    Alert.alert("⚠️ Slow down!", "You're posting too fast. Wait a bit before posting again.");
                    return;
                  }
                  Alert.alert("Posted! 🔥", "Your post is now live on Vibe");
                } finally {
                  setPosting(false);
                }
              }}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function VideoMode({ colors, isLoggedIn, onRequireLogin }: { colors: any; isLoggedIn: boolean; onRequireLogin: () => void }) {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [flashMode, setFlashMode] = useState<"off" | "on" | "auto">("off");
  const [recording, setRecording] = useState(false);
  const [captureMode, setCaptureMode] = useState<"video" | "photo">("video");
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("For You");
  const [showDrafts, setShowDrafts] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState("15s");
  const cameraRef = useRef<CameraView>(null);
  const TEMPLATE_W = (W - 48) / 3;

  const [selectedMusic, setSelectedMusic] = useState<Track | null>(null);
  const [activeFilterConfig, setActiveFilterConfig] = useState<FilterConfig>(FILTERS[0]);
  const [showGrid, setShowGrid] = useState(false);
  const [showMirror, setShowMirror] = useState(false);
  const [timerSecs, setTimerSecs] = useState<TimerValue>(0);
  const [timerCount, setTimerCount] = useState<number | null>(null);
  const [speed, setSpeed] = useState("normal");
  const [showBeauty, setShowBeauty] = useState(false);
  const [textOverlays, setTextOverlays] = useState<TextOverlayItem[]>([]);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showEffectsPicker, setShowEffectsPicker] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [newTextColor, setNewTextColor] = useState("#ffffff");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerScaleAnim = useRef(new Animated.Value(1)).current;
  const [recordingTimeLeft, setRecordingTimeLeft] = useState<number | null>(null);

  const durationSecs: Record<string, number> = { "15s": 15, "30s": 30, "60s": 60, "3min": 180 };
  const hasPermission = camPermission?.granted;
  const needsPermission = camPermission !== null && !hasPermission;

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleRequestPermissions = async () => {
    await requestCamPermission();
    await requestMicPermission();
  };

  const runTimerCountdown = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (timerSecs === 0) { resolve(); return; }
      let remaining = timerSecs;
      setTimerCount(remaining);
      const tick = () => {
        remaining--;
        timerScaleAnim.setValue(1.6);
        Animated.timing(timerScaleAnim, { toValue: 1, duration: 750, useNativeDriver: true }).start();
        if (remaining <= 0) {
          setTimerCount(null);
          resolve();
        } else {
          setTimerCount(remaining);
          timerRef.current = setTimeout(tick, 1000);
        }
      };
      timerScaleAnim.setValue(1.6);
      Animated.timing(timerScaleAnim, { toValue: 1, duration: 750, useNativeDriver: true }).start();
      timerRef.current = setTimeout(tick, 1000);
    });
  }, [timerSecs]);

  const handleRecordToggle = async () => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    if (captureMode === "photo") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await runTimerCountdown();
      try {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85, skipProcessing: false });
        if (photo?.uri) setRecordedUri(photo.uri);
      } catch {
        Alert.alert("Photo failed", "Could not capture photo. Try again.");
      }
      return;
    }
    if (recording) {
      cameraRef.current?.stopRecording();
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
      setRecordingTimeLeft(null);
      return;
    }
    await runTimerCountdown();
    setRecording(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const maxDuration = durationSecs[selectedDuration] ?? 15;
    setRecordingTimeLeft(maxDuration);
    recordTimerRef.current = setInterval(() => {
      setRecordingTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(recordTimerRef.current!);
          recordTimerRef.current = null;
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    try {
      const result = await cameraRef.current?.recordAsync({ maxDuration });
      if (result?.uri) setRecordedUri(result.uri);
    } catch {}
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecordingTimeLeft(null);
    setRecording(false);
  };

  const cycleFlash = () => setFlashMode((f) => f === "off" ? "on" : f === "on" ? "auto" : "off");
  const flashIcon = flashMode === "off" ? "flash-off-outline" : "flash-outline";
  const flashColor = flashMode === "off" ? "rgba(255,255,255,0.6)" : flashMode === "on" ? "#EAB308" : "#60A5FA";

  const addTextOverlay = () => {
    if (!newText.trim()) return;
    setTextOverlays((prev) => [...prev, { id: Date.now().toString(), text: newText.trim(), color: newTextColor, x: 60, y: 100 + prev.length * 50 }]);
    setNewText("");
    setShowTextModal(false);
  };

  const addSticker = (emoji: string) => {
    setStickers((prev) => [...prev, { id: Date.now().toString(), emoji, x: 60 + Math.random() * 80, y: 60 + Math.random() * 120 }]);
    setShowStickerModal(false);
  };

  const timerIcon = timerSecs === 0 ? "timer-outline" : "timer";
  const timerLabel = timerSecs === 0 ? "Timer" : `${timerSecs}s`;
  const cycleTimer = () => { const opts: TimerValue[] = [0, 3, 5, 10]; const idx = opts.indexOf(timerSecs); setTimerSecs(opts[(idx + 1) % opts.length]); };

  if (camPermission === null) {
    return (
      <View style={[styles.permContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="camera-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.permTitle, { color: colors.foreground }]}>Loading camera…</Text>
      </View>
    );
  }

  if (needsPermission) {
    return (
      <View style={[styles.permContainer, { backgroundColor: colors.background }]}>
        <LinearGradient colors={["#7C3AED22", "#EA580C11"]} style={styles.permIconBg}>
          <Ionicons name="camera-outline" size={52} color="#7C3AED" />
        </LinearGradient>
        <Text style={[styles.permTitle, { color: colors.foreground }]}>Camera Access</Text>
        <Text style={[styles.permSub, { color: colors.mutedForeground }]}>Allow camera and microphone to record videos and take photos</Text>
        <GradientButton onPress={handleRequestPermissions} title="Allow Camera & Mic" style={{ width: 240, marginTop: 8 }} />
      </View>
    );
  }

  if (recordedUri) {
    return (
      <VideoEditorSheet
        uri={recordedUri}
        isPhoto={captureMode === "photo"}
        initialMusic={selectedMusic}
        initialFilter={activeFilterConfig}
        textOverlays={textOverlays}
        stickers={stickers}
        onDiscard={() => { setRecordedUri(null); setTextOverlays([]); setStickers([]); }}
        onPost={() => {
          setRecordedUri(null);
          setTextOverlays([]);
          setStickers([]);
          setSelectedMusic(null);
          Alert.alert("Posted! 🔥", "Your reel is now live on Vibe", [{ text: "Nice!" }]);
        }}
      />
    );
  }

  return (
    <>
      <View style={[styles.viewfinder, { backgroundColor: "#000" }]}>
          <View style={[StyleSheet.absoluteFill, showMirror && { transform: [{ scaleX: -1 }] }]}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              flash={flashMode}
              mode="video"
            />
          </View>

          <LinearGradient colors={["rgba(0,0,0,0.3)", "transparent", "rgba(0,0,0,0.4)"]} style={StyleSheet.absoluteFill} />

          {activeFilterConfig.id !== "none" && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: activeFilterConfig.blendHex, opacity: activeFilterConfig.opacity }]} pointerEvents="none" />
          )}

          {showGrid && <GridOverlay />}

          {timerCount !== null && (
            <View style={styles.timerOverlay} pointerEvents="none">
              <Animated.Text style={[styles.timerNumber, { transform: [{ scale: timerScaleAnim }] }]}>
                {timerCount}
              </Animated.Text>
            </View>
          )}

          {selectedMusic && (
            <View style={styles.musicIndicator}>
              <Ionicons name="musical-notes" size={12} color="#fff" />
              <Text style={styles.musicIndicatorText} numberOfLines={1}>
                {selectedMusic.title} · {selectedMusic.artist}
              </Text>
            </View>
          )}

          {textOverlays.map((t) => (
            <View key={t.id} style={[styles.cameraTextOverlay, { top: t.y, left: t.x }]}>
              <Text style={[styles.cameraOverlayText, { color: t.color }]}>{t.text}</Text>
            </View>
          ))}

          {stickers.map((s) => (
            <Text key={s.id} style={[styles.cameraStickerOverlay, { top: s.y, left: s.x }]}>{s.emoji}</Text>
          ))}

          <View style={styles.toolsOverlay}>
            {TOOLS.map((tool) => (
              <TouchableOpacity key={tool.id} onPress={() => Alert.alert(tool.label.replace("\n", " "), "Coming soon ✨")} style={styles.toolBtn}>
                <View style={[styles.toolCircle, { backgroundColor: tool.color + "33", borderColor: tool.color + "66" }]}>
                  <Ionicons name={tool.icon as any} size={20} color={tool.color} />
                </View>
                <Text style={styles.toolLabel}>{tool.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.durationRow}>
            {["15s", "30s", "60s", "3min"].map((d) => (
              <TouchableOpacity key={d} onPress={() => setSelectedDuration(d)}
                style={[styles.durationPill, selectedDuration === d && { backgroundColor: "#7C3AED" }]}>
                <Text style={[styles.durationText, selectedDuration === d && { color: "#fff" }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {recording && recordingTimeLeft !== null && (
            <View style={styles.recordingTimerBar} pointerEvents="none">
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTimeText}>{recordingTimeLeft}s</Text>
              <View style={styles.recordingProgressTrack}>
                <View style={[styles.recordingProgressFill, { width: `${(recordingTimeLeft / (durationSecs[selectedDuration] ?? 15)) * 100}%` as any }]} />
              </View>
            </View>
          )}

          <View style={styles.captureModeRow}>
            <TouchableOpacity onPress={() => setCaptureMode("video")}
              style={[styles.captureModePill, captureMode === "video" && { backgroundColor: "rgba(124,58,237,0.7)" }]}>
              <Ionicons name="videocam-outline" size={14} color="#fff" />
              <Text style={styles.captureModePillText}>Video</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCaptureMode("photo")}
              style={[styles.captureModePill, captureMode === "photo" && { backgroundColor: "rgba(124,58,237,0.7)" }]}>
              <Ionicons name="camera-outline" size={14} color="#fff" />
              <Text style={styles.captureModePillText}>Photo</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleRecordToggle}
            disabled={timerCount !== null}
            style={[styles.recordBtnWrap, recording && { borderColor: "#EF4444" }]}>
            {timerCount !== null ? (
              <View style={[styles.recordBtn, { backgroundColor: "rgba(255,255,255,0.3)" }]} />
            ) : recording ? (
              <View style={[styles.recordBtn, { backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" }]}>
                <View style={styles.recordSquare} />
              </View>
            ) : captureMode === "photo" ? (
              <View style={[styles.recordBtn, { backgroundColor: "#fff" }]} />
            ) : (
              <LinearGradient colors={["#7C3AED", "#EA580C"]} style={styles.recordBtn} />
            )}
          </TouchableOpacity>

          <View style={styles.viewfinderSideActions}>
            <TouchableOpacity style={styles.sideActionBtn} onPress={() => setFacing((f) => f === "back" ? "front" : "back")}>
              <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
              <Text style={styles.sideActionLabel}>Flip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideActionBtn} onPress={cycleFlash}>
              <Ionicons name={flashIcon as any} size={24} color={flashColor} />
              <Text style={[styles.sideActionLabel, { color: flashColor }]}>
                {flashMode === "off" ? "Flash" : flashMode === "on" ? "On" : "Auto"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideActionBtn} onPress={() => setShowMusicPicker(true)}>
              <Ionicons name="musical-notes" size={22} color={selectedMusic ? "#A78BFA" : "#fff"} />
              <Text style={[styles.sideActionLabel, selectedMusic && { color: "#A78BFA" }]}>Music</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideActionBtn} onPress={() => setShowEffectsPicker(true)}>
              <Ionicons name="sparkles-outline" size={22} color={activeFilterConfig.id !== "none" || showGrid || showMirror ? "#A78BFA" : "#fff"} />
              <Text style={styles.sideActionLabel}>Effects</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideActionBtn} onPress={cycleTimer}>
              <Ionicons name={timerIcon as any} size={22} color={timerSecs > 0 ? "#FBBF24" : "#fff"} />
              <Text style={[styles.sideActionLabel, timerSecs > 0 && { color: "#FBBF24" }]}>{timerLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideActionBtn} onPress={() => setShowTextModal(true)}>
              <Ionicons name="text-outline" size={22} color={textOverlays.length > 0 ? "#A78BFA" : "#fff"} />
              <Text style={styles.sideActionLabel}>Text</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideActionBtn} onPress={() => setShowStickerModal(true)}>
              <Ionicons name="happy-outline" size={22} color={stickers.length > 0 ? "#A78BFA" : "#fff"} />
              <Text style={styles.sideActionLabel}>Stickers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideActionBtn} onPress={() => setShowDrafts((s) => !s)}>
              <Ionicons name="document-text-outline" size={22} color="#fff" />
              <Text style={styles.sideActionLabel}>Drafts</Text>
            </TouchableOpacity>
          </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
        {showDrafts && (
          <View style={styles.draftsSection}>
            <View style={styles.draftsTitleRow}>
              <Text style={[styles.draftsTitle, { color: colors.foreground }]}>📝 Drafts ({DRAFT_ITEMS.length})</Text>
              <TouchableOpacity><Text style={{ color: "#7C3AED", fontFamily: "Poppins_500Medium", fontSize: 13 }}>Manage</Text></TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
              {DRAFT_ITEMS.map((d) => (
                <TouchableOpacity key={d.id} style={styles.draftCard} onPress={() => Alert.alert("Resume Draft", `Continue editing "${d.label}"`)}>
                  <Image source={{ uri: d.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={StyleSheet.absoluteFill} />
                  <View style={styles.draftCardInfo}>
                    <Text style={styles.draftCardLabel} numberOfLines={1}>{d.label}</Text>
                    <Text style={styles.draftCardTime}>{d.time}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.draftCard, { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => Alert.alert("New Draft", "Start recording to create a draft")}>
                <Ionicons name="add" size={32} color="#7C3AED" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        <View style={styles.templatesSection}>
          <Text style={[styles.templatesTitle, { color: colors.foreground }]}>✨ Video Templates</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 12 }}>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <TouchableOpacity key={cat} onPress={() => setSelectedCategory(cat)}
                style={[styles.catPill, selectedCategory === cat && { backgroundColor: "#7C3AED" }]}>
                <Text style={[styles.catPillText, selectedCategory === cat && { color: "#fff" }]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <FlatList
            data={TEMPLATES}
            keyExtractor={(item) => item.id}
            numColumns={3}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.templateCard, { width: TEMPLATE_W, height: TEMPLATE_W * 1.5 }]}
                onPress={() => Alert.alert("Use Template", `Using "${item.label}" template`)}>
                <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={StyleSheet.absoluteFill} />
                <View style={styles.templateInfo}>
                  <Text style={styles.templateLabel} numberOfLines={1}>{item.label}</Text>
                  <Text style={styles.templateDuration}>{item.duration}</Text>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
            columnWrapperStyle={{ gap: 6 }}
          />
        </View>
      </ScrollView>

      <MusicPickerSheet
        visible={showMusicPicker}
        onClose={() => setShowMusicPicker(false)}
        onSelect={(t) => setSelectedMusic(t)}
        selectedTrack={selectedMusic}
      />

      <EffectsPickerSheet
        visible={showEffectsPicker}
        onClose={() => setShowEffectsPicker(false)}
        activeFilter={activeFilterConfig.id}
        onFilterChange={(f) => setActiveFilterConfig(f)}
        showGrid={showGrid}
        onGridToggle={() => setShowGrid((v) => !v)}
        showMirror={showMirror}
        onMirrorToggle={() => setShowMirror((v) => !v)}
        timer={timerSecs}
        onTimerChange={(t) => setTimerSecs(t)}
        speed={speed}
        onSpeedChange={(s) => setSpeed(s)}
        showBeauty={showBeauty}
        onBeautyToggle={() => setShowBeauty((v) => !v)}
      />

      <Modal visible={showTextModal} transparent animationType="slide" onRequestClose={() => setShowTextModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowTextModal(false)} />
        <View style={[styles.textModalCard, { backgroundColor: colors.background }]}>
          <Text style={[styles.textModalTitle, { color: colors.foreground }]}>Add Text to Video</Text>
          <TextInput
            value={newText}
            onChangeText={setNewText}
            placeholder="Type something cool..."
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            maxLength={60}
            style={[styles.textInput, { color: newTextColor, backgroundColor: colors.muted, borderColor: colors.border }]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
            {TEXT_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setNewTextColor(c)}
                style={[styles.colorDot, { backgroundColor: c }, newTextColor === c && { borderColor: "#7C3AED", borderWidth: 3 }]}
              />
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={() => { setShowTextModal(false); setNewText(""); }} style={[styles.modalCancelBtn, { backgroundColor: colors.muted }]}>
              <Text style={[{ fontSize: 15, fontFamily: "Poppins_600SemiBold", color: colors.foreground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={addTextOverlay} style={{ flex: 2, borderRadius: 12, overflow: "hidden" }}>
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" }}>Add Text</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showStickerModal} transparent animationType="slide" onRequestClose={() => setShowStickerModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowStickerModal(false)} />
        <View style={[styles.textModalCard, { backgroundColor: colors.background }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Text style={[styles.textModalTitle, { color: colors.foreground }]}>Add Sticker</Text>
            <TouchableOpacity onPress={() => setShowStickerModal(false)}>
              <Ionicons name="close" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <View style={styles.stickerGrid}>
            {STICKER_EMOJIS.map((e) => (
              <TouchableOpacity key={e} onPress={() => addSticker(e)} style={[styles.stickerItem, { backgroundColor: colors.muted }]}>
                <Text style={styles.stickerEmoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

function LiveMode({ colors, isLoggedIn, onRequireLogin }: { colors: any; isLoggedIn: boolean; onRequireLogin: () => void }) {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"front" | "back">("front");

  const hasPermission = camPermission?.granted;
  const needsPermission = camPermission !== null && !hasPermission;

  const LIVE_OPTIONS = [
    { icon: "text-outline", label: "Add Title", sub: "Let viewers know what's happening", color: "#7C3AED" },
    { icon: "people-outline", label: "Audience", sub: "Everyone", color: "#3B82F6" },
    { icon: "gift-outline", label: "Gifts", sub: "Allow viewers to send gifts", color: "#F97316" },
    { icon: "chatbubbles-outline", label: "Comments", sub: "Enabled for everyone", color: "#10B981" },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}>
      <View style={styles.livePreview}>
        {hasPermission ? (
          <CameraView style={StyleSheet.absoluteFill} facing={facing} flash="off" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a0533", alignItems: "center", justifyContent: "center" }]}>
            {needsPermission ? (
              <TouchableOpacity onPress={requestCamPermission} style={styles.liveCamPermBtn}>
                <Ionicons name="camera-outline" size={28} color="#fff" />
                <Text style={styles.liveCamPermText}>Allow Camera</Text>
              </TouchableOpacity>
            ) : (
              <Ionicons name="camera-outline" size={36} color="rgba(255,255,255,0.3)" />
            )}
          </View>
        )}
        <LinearGradient colors={["rgba(0,0,0,0.4)", "transparent"]} style={StyleSheet.absoluteFill} />
        <View style={styles.liveBadge}>
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        {hasPermission && (
          <TouchableOpacity onPress={() => setFacing((f) => f === "front" ? "back" : "front")} style={styles.liveFlipBtn}>
            <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.liveSetupTitle, { color: colors.foreground }]}>Go Live Setup</Text>
      <View style={[styles.liveSetupOptions, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {LIVE_OPTIONS.map((opt, i) => (
          <TouchableOpacity key={opt.label} onPress={() => Alert.alert(opt.label, opt.sub)}
            style={[styles.liveOptionRow, { borderBottomColor: colors.border }, i === LIVE_OPTIONS.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={[styles.liveOptionIcon, { backgroundColor: opt.color + "22" }]}>
              <Ionicons name={opt.icon as any} size={20} color={opt.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.liveOptionLabel, { color: colors.foreground }]}>{opt.label}</Text>
              <Text style={[styles.liveOptionSub, { color: colors.mutedForeground }]}>{opt.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.liveStats}>
        {[
          { emoji: "💜", num: "1,284", label: "Followers" },
          { emoji: "🪙", num: "246", label: "Avg Coins" },
          { emoji: "👁", num: "3.2k", label: "Avg Viewers" },
        ].map((s) => (
          <View key={s.label} style={[styles.liveStat, { backgroundColor: colors.muted }]}>
            <Text style={styles.liveStatEmoji}>{s.emoji}</Text>
            <Text style={[styles.liveStatNum, { color: colors.foreground }]}>{s.num}</Text>
            <Text style={[styles.liveStatLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        onPress={() => { if (!isLoggedIn) { onRequireLogin(); return; } router.push("/live"); }}
        style={styles.goLiveBtn}>
        <LinearGradient colors={["#EF4444", "#DC2626"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.goLiveGrad}>
          <Ionicons name="radio" size={22} color="#fff" />
          <Text style={styles.goLiveText}>Start Live Stream</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default function CreateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const [mode, setMode] = useState<CreateMode>("video");
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const MODES: { key: CreateMode; label: string; icon: string }[] = [
    { key: "post", label: "Post", icon: "images-outline" },
    { key: "video", label: "Video", icon: "videocam-outline" },
    { key: "live", label: "Live", icon: "radio-outline" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <View style={{ width: 26 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Create</Text>
        <TouchableOpacity onPress={() => Alert.alert("Help", "Create posts, videos, and live streams on Vibe")}>
          <Ionicons name="help-circle-outline" size={26} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={[styles.modeTabs, { borderBottomColor: colors.border }]}>
        {MODES.map((m) => (
          <TouchableOpacity key={m.key} onPress={() => setMode(m.key)} style={[styles.modeTab, mode === m.key && styles.modeTabActive]}>
            {mode === m.key && (
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modeTabUnderline} />
            )}
            <Ionicons name={m.icon as any} size={18} color={mode === m.key ? "#7C3AED" : colors.mutedForeground} />
            <Text style={[styles.modeTabText, { color: mode === m.key ? "#7C3AED" : colors.mutedForeground }, mode === m.key && styles.modeTabTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === "post" && <PostMode colors={colors} isLoggedIn={isLoggedIn} onRequireLogin={() => setShowLoginPrompt(true)} />}
      {mode === "video" && <VideoMode colors={colors} isLoggedIn={isLoggedIn} onRequireLogin={() => setShowLoginPrompt(true)} />}
      {mode === "live" && <LiveMode colors={colors} isLoggedIn={isLoggedIn} onRequireLogin={() => setShowLoginPrompt(true)} />}

      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  headerTitle: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  modeTabs: { flexDirection: "row", borderBottomWidth: 0.5 },
  modeTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, gap: 6, position: "relative" },
  modeTabActive: {},
  modeTabUnderline: { position: "absolute", bottom: 0, left: 16, right: 16, height: 2, borderRadius: 1 },
  modeTabText: { fontSize: 14, fontFamily: "Poppins_500Medium" },
  modeTabTextActive: { fontFamily: "Poppins_700Bold" },
  postTypeRow: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  postTypeBtn: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  postTypeLabel: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  mediaPicker: { margin: 16, height: 220, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 8, overflow: "hidden" },
  mediaPickerText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  mediaPickerSub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  removeImg: { position: "absolute", top: 10, right: 10 },
  postForm: { paddingHorizontal: 16, gap: 12 },
  captionInput: { borderRadius: 14, padding: 14, fontSize: 14, fontFamily: "Poppins_400Regular", minHeight: 90, borderWidth: 1, textAlignVertical: "top" },
  postOptions: { borderRadius: 14, overflow: "hidden", borderWidth: 1 },
  optionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12, borderBottomWidth: 0.5 },
  optionText: { flex: 1, fontSize: 14, fontFamily: "Poppins_500Medium" },
  postActions: { flexDirection: "row", gap: 10, paddingBottom: 16 },
  draftBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  draftBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  permContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  permIconBg: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  permTitle: { fontSize: 20, fontFamily: "Poppins_700Bold", textAlign: "center" },
  permSub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },
  viewfinder: { height: H * 0.44, position: "relative", overflow: "hidden" },
  toolsOverlay: { position: "absolute", left: 12, top: 12, gap: 10 },
  toolBtn: { alignItems: "center", gap: 3, width: 52 },
  toolCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  toolLabel: { color: "#fff", fontSize: 9, fontFamily: "Poppins_500Medium", textAlign: "center" },
  recordingTimerBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "rgba(0,0,0,0.55)" },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#EF4444" },
  recordingTimeText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13, minWidth: 28 },
  recordingProgressTrack: { flex: 1, height: 4, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden" },
  recordingProgressFill: { height: 4, backgroundColor: "#EF4444", borderRadius: 2 },
  durationRow: { position: "absolute", top: 12, alignSelf: "center", flexDirection: "row", gap: 6 },
  durationPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.5)" },
  durationText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  captureModeRow: { position: "absolute", bottom: 26, left: 0, right: 0, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  captureModePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.4)" },
  captureModePillText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  recordBtnWrap: { position: "absolute", bottom: 70, alignSelf: "center", width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  recordBtn: { width: 58, height: 58, borderRadius: 29 },
  recordSquare: { width: 22, height: 22, borderRadius: 4, backgroundColor: "#fff" },
  viewfinderSideActions: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center", gap: 14 },
  sideActionBtn: { alignItems: "center", gap: 2 },
  sideActionLabel: { color: "rgba(255,255,255,0.85)", fontSize: 9, fontFamily: "Poppins_400Regular" },
  timerOverlay: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" },
  timerNumber: { fontSize: 100, fontFamily: "Poppins_700Bold", color: "#fff", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 8 },
  musicIndicator: {
    position: "absolute", bottom: 110, left: 16, right: 80,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  musicIndicatorText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_500Medium", flex: 1 },
  cameraTextOverlay: { position: "absolute" },
  cameraOverlayText: { fontSize: 22, fontFamily: "Poppins_700Bold", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
  cameraStickerOverlay: { position: "absolute", fontSize: 32 },
  draftsSection: { paddingTop: 16, paddingBottom: 4 },
  draftsTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10 },
  draftsTitle: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  draftCard: { width: 110, height: 160, borderRadius: 14, overflow: "hidden" },
  draftCardInfo: { position: "absolute", bottom: 8, left: 8, right: 8 },
  draftCardLabel: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
  draftCardTime: { color: "rgba(255,255,255,0.7)", fontSize: 10 },
  templatesSection: { paddingTop: 16 },
  templatesTitle: { fontSize: 17, fontFamily: "Poppins_700Bold", paddingHorizontal: 16, marginBottom: 12 },
  catPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)" },
  catPillText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Poppins_500Medium" },
  templateCard: { borderRadius: 12, overflow: "hidden", position: "relative" },
  templateInfo: { position: "absolute", bottom: 6, left: 6, right: 6 },
  templateLabel: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
  templateDuration: { color: "rgba(255,255,255,0.7)", fontSize: 10 },
  livePreview: { height: 220, position: "relative", alignItems: "center", justifyContent: "center", borderRadius: 16, overflow: "hidden", marginBottom: 4 },
  liveCamPermBtn: { alignItems: "center", gap: 8, backgroundColor: "rgba(124,58,237,0.6)", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
  liveCamPermText: { color: "#fff", fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  liveBadge: { position: "absolute", top: 14, left: 14, backgroundColor: "#EF4444", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  liveBadgeText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
  liveFlipBtn: { position: "absolute", top: 14, right: 14, backgroundColor: "rgba(0,0,0,0.4)", padding: 8, borderRadius: 20 },
  liveSetupTitle: { fontSize: 18, fontFamily: "Poppins_700Bold", marginTop: 18, marginBottom: 14 },
  liveSetupOptions: { borderRadius: 14, overflow: "hidden", borderWidth: 1, marginBottom: 16 },
  liveOptionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12, borderBottomWidth: 0.5 },
  liveOptionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  liveOptionLabel: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  liveOptionSub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  liveStats: { flexDirection: "row", gap: 10, marginBottom: 20 },
  liveStat: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", gap: 4 },
  liveStatEmoji: { fontSize: 22 },
  liveStatNum: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  liveStatLabel: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  goLiveBtn: { borderRadius: 16, overflow: "hidden" },
  goLiveGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16 },
  goLiveText: { color: "#fff", fontSize: 17, fontFamily: "Poppins_700Bold" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  textModalCard: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 14 },
  textModalTitle: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  textInput: { borderRadius: 12, padding: 12, fontSize: 18, fontFamily: "Poppins_700Bold", borderWidth: 1, textAlign: "center", minHeight: 56 },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "transparent" },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  stickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stickerItem: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  stickerEmoji: { fontSize: 28 },
});
