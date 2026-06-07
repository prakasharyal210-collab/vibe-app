import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
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
import { StickerPickerModal } from "@/components/StickerPickerModal";
import { EffectsPickerSheet, FilterConfig, FILTERS, TimerValue } from "@/components/EffectsPickerSheet";
import { VideoEditorSheet } from "@/components/VideoEditorSheet";
import { useAuth } from "@/context/AuthContext";
import { uploadPostMedia, uploadReelMedia } from "@/lib/db";
import { Track } from "@/lib/music";

const { width: W, height: H } = Dimensions.get("window");

const MODES = ["Post", "Video", "Live"] as const;
type CreateMode = (typeof MODES)[number];

const DURATIONS = ["15s", "30s", "60s", "3min"] as const;
const DURATION_SECS: Record<string, number> = { "15s": 15, "30s": 30, "60s": 60, "3min": 180 };
const TEXT_COLORS = ["#ffffff", "#000000", "#7C3AED", "#F97316", "#EF4444", "#10B981", "#3B82F6", "#FBBF24", "#EC4899"];

interface TextOverlayItem { id: string; text: string; color: string; x: number; y: number; }
interface StickerItem { id: string; emoji?: string; gifUrl?: string; x: number; y: number; }

const CONFETTI_COLORS = ["#7C3AED", "#F97316", "#EF4444", "#10B981", "#3B82F6", "#FBBF24", "#EC4899", "#A78BFA"];
const CONFETTI_COUNT = 28;

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

function CelebrationModal({ visible, onGoToProfile, onClose }: {
  visible: boolean; onGoToProfile: () => void; onClose: () => void;
}) {
  const cardScale = useRef(new Animated.Value(0.5)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const fireScale = useRef(new Animated.Value(1)).current;
  const [countdown, setCountdown] = useState(5);
  const confettiAnims = useRef(
    Array.from({ length: CONFETTI_COUNT }, () => ({
      y: new Animated.Value(-40), x: new Animated.Value(0),
      rotate: new Animated.Value(0), opacity: new Animated.Value(1),
    }))
  ).current;

  useEffect(() => {
    if (!visible) {
      cardScale.setValue(0.5); fadeIn.setValue(0); checkScale.setValue(0);
      fireScale.setValue(1); setCountdown(5);
      confettiAnims.forEach((c) => { c.y.setValue(-40); c.opacity.setValue(1); });
      return;
    }
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 100, useNativeDriver: true }),
    ]).start();
    setTimeout(() => Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start(), 180);
    let loopRunning = true;
    const pulse = () => {
      if (!loopRunning) return;
      Animated.sequence([
        Animated.timing(fireScale, { toValue: 1.3, duration: 500, useNativeDriver: true }),
        Animated.timing(fireScale, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start(() => pulse());
    };
    pulse();
    confettiAnims.forEach((c, i) => {
      const delay = Math.random() * 400;
      const xTarget = (Math.random() - 0.5) * W * 1.4;
      const duration = 1400 + Math.random() * 800;
      c.y.setValue(-40); c.x.setValue(0); c.rotate.setValue(0); c.opacity.setValue(1);
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(c.y, { toValue: H * 0.85, duration, useNativeDriver: true }),
          Animated.timing(c.x, { toValue: xTarget, duration, useNativeDriver: true }),
          Animated.timing(c.rotate, { toValue: 6, duration, useNativeDriver: true }),
          Animated.sequence([Animated.delay(duration * 0.6), Animated.timing(c.opacity, { toValue: 0, duration: duration * 0.4, useNativeDriver: true })]),
        ]).start();
      }, delay);
    });
    setCountdown(5);
    let n = 5;
    const tick = setInterval(() => { n--; setCountdown(n); if (n <= 0) { clearInterval(tick); onGoToProfile(); } }, 1000);
    return () => { loopRunning = false; clearInterval(tick); };
  }, [visible]);

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none">
      <Animated.View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.96)", alignItems: "center", justifyContent: "center", opacity: fadeIn }}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {confettiAnims.map((c, i) => {
            const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            const size = 6 + (i % 3) * 4;
            const startX = (W / CONFETTI_COUNT) * i;
            const spin = c.rotate.interpolate({ inputRange: [0, 6], outputRange: ["0deg", `${360 * 3 * (i % 2 === 0 ? 1 : -1)}deg`] });
            return (
              <Animated.View key={i} style={{ position: "absolute", left: startX, top: H * 0.22, width: size, height: size * (i % 3 === 1 ? 2.2 : 1), borderRadius: i % 3 === 2 ? size / 2 : 2, backgroundColor: color, opacity: c.opacity, transform: [{ translateY: c.y }, { translateX: c.x }, { rotate: spin }] }} />
            );
          })}
        </View>
        <Animated.View style={{ alignItems: "center", paddingHorizontal: 32, transform: [{ scale: cardScale }] }}>
          <Animated.View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(16,185,129,0.18)", borderWidth: 2.5, borderColor: "#10B981", alignItems: "center", justifyContent: "center", marginBottom: 14, transform: [{ scale: checkScale }] }}>
            <Ionicons name="checkmark" size={42} color="#10B981" />
          </Animated.View>
          <Animated.Text style={{ fontSize: 52, transform: [{ scale: fireScale }] }}>🔥</Animated.Text>
          <Text style={{ color: "#fff", fontSize: 26, fontFamily: "Poppins_700Bold", marginTop: 12, textAlign: "center", lineHeight: 34 }}>Posted!{"\n"}You're live on Gundruk!</Text>
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, fontFamily: "Poppins_400Regular", marginTop: 8 }}>Auto-closing in {countdown}s</Text>
          <View style={{ gap: 12, marginTop: 28, width: 270 }}>
            <TouchableOpacity onPress={onGoToProfile} style={{ borderRadius: 16, overflow: "hidden" }}>
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                <Ionicons name="person-outline" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 }}>Go to Profile</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ paddingVertical: 14, alignItems: "center", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", flexDirection: "row", justifyContent: "center", gap: 8 }}>
              <Ionicons name="add-circle-outline" size={18} color="rgba(255,255,255,0.85)" />
              <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>Post Another</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);

  const [facing, setFacing] = useState<"front" | "back">("back");
  const [flashMode, setFlashMode] = useState<"off" | "on" | "auto">("off");
  const [modeIdx, setModeIdx] = useState(1);
  const slideAnim = useRef(new Animated.Value(1)).current;

  const [recording, setRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [capturedIsPhoto, setCapturedIsPhoto] = useState(false);
  const [capturedForMode, setCapturedForMode] = useState<CreateMode>("Video");
  const [selectedDuration, setSelectedDuration] = useState("15s");
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  const pressStartRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStartingRef = useRef(false);
  const recordPulse = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  const [timerSecs, setTimerSecs] = useState<TimerValue>(0);
  const [timerCount, setTimerCount] = useState<number | null>(null);
  const timerScaleAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showGrid, setShowGrid] = useState(false);
  const [showMirror, setShowMirror] = useState(false);
  const [showBeauty, setShowBeauty] = useState(false);
  const [speed, setSpeed] = useState("normal");
  const [selectedMusic, setSelectedMusic] = useState<Track | null>(null);
  const [activeFilterConfig, setActiveFilterConfig] = useState<FilterConfig>(FILTERS[0]);
  const [textOverlays, setTextOverlays] = useState<TextOverlayItem[]>([]);
  const [stickers, setStickers] = useState<StickerItem[]>([]);

  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showEffectsPicker, setShowEffectsPicker] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [newTextColor, setNewTextColor] = useState("#ffffff");

  const [liveTitle, setLiveTitle] = useState("");
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const mode = MODES[modeIdx];
  const hasPermission = !!(camPermission?.granted && micPermission?.granted);
  const permissionsLoaded = camPermission !== null && micPermission !== null;
  const needsPermission = permissionsLoaded && !hasPermission;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: modeIdx, useNativeDriver: true, tension: 120, friction: 14 }).start();
  }, [modeIdx]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  // Fade non-record controls while recording
  useEffect(() => {
    Animated.timing(controlsOpacity, {
      toValue: recording ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [recording]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) =>
      Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.8,
    onPanResponderRelease: (_, gs) => {
      if (gs.dx < -60) setModeIdx((p) => Math.min(p + 1, 2));
      else if (gs.dx > 60) setModeIdx((p) => Math.max(p - 1, 0));
    },
  }), []);

  const cycleFlash = () => setFlashMode((f) => f === "off" ? "on" : f === "on" ? "auto" : "off");
  const cycleTimerSecs = () => {
    const opts: TimerValue[] = [0, 3, 5, 10];
    setTimerSecs((t) => opts[(opts.indexOf(t) + 1) % opts.length]);
  };

  const startPulse = useCallback(() => {
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(recordPulse, { toValue: 1.18, duration: 550, useNativeDriver: true }),
        Animated.timing(recordPulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current.start();
  }, [recordPulse]);

  const stopPulse = useCallback(() => {
    pulseLoopRef.current?.stop();
    Animated.timing(recordPulse, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [recordPulse]);

  const runTimerCountdown = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (timerSecs === 0) { resolve(); return; }
      let remaining = timerSecs;
      setTimerCount(remaining);
      const tick = () => {
        remaining--;
        timerScaleAnim.setValue(1.6);
        Animated.timing(timerScaleAnim, { toValue: 1, duration: 750, useNativeDriver: true }).start();
        if (remaining <= 0) { setTimerCount(null); resolve(); }
        else { setTimerCount(remaining); timerRef.current = setTimeout(tick, 1000); }
      };
      timerScaleAnim.setValue(1.6);
      Animated.timing(timerScaleAnim, { toValue: 1, duration: 750, useNativeDriver: true }).start();
      timerRef.current = setTimeout(tick, 1000);
    });
  }, [timerSecs, timerScaleAnim]);

  const takePhoto = useCallback(async () => {
    try {
      await runTimerCountdown();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85, skipProcessing: false });
      if (photo?.uri) {
        setCapturedIsPhoto(true);
        setCapturedForMode(mode);
        setRecordedUri(photo.uri);
      }
    } catch {
      Alert.alert("Photo failed", "Could not capture photo. Try again.");
    }
  }, [runTimerCountdown, mode]);

  const startVideoRecording = useCallback(async () => {
    if (recording || isStartingRef.current) return;
    isStartingRef.current = true;
    await runTimerCountdown();
    setRecording(true);
    setRecordingElapsed(0);
    startPulse();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    isStartingRef.current = false;

    const maxDuration = DURATION_SECS[selectedDuration] ?? 15;
    recordTimerRef.current = setInterval(() => {
      setRecordingElapsed((prev) => {
        if (prev >= maxDuration - 1) {
          clearInterval(recordTimerRef.current!);
          recordTimerRef.current = null;
          cameraRef.current?.stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    try {
      setCapturedForMode(mode);
      const result = await cameraRef.current?.recordAsync({ maxDuration });
      if (result?.uri) {
        setCapturedIsPhoto(false);
        setRecordedUri(result.uri);
      }
    } catch {}

    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecording(false);
    setRecordingElapsed(0);
    stopPulse();
  }, [recording, runTimerCountdown, selectedDuration, startPulse, stopPulse, mode]);

  const stopVideoRecording = useCallback(() => {
    cameraRef.current?.stopRecording();
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
  }, []);

  const HOLD_THRESHOLD = 280;

  const onRecordPressIn = useCallback(() => {
    if (!isLoggedIn) { setShowLoginPrompt(true); return; }
    pressStartRef.current = Date.now();
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      startVideoRecording();
    }, HOLD_THRESHOLD);
  }, [isLoggedIn, startVideoRecording]);

  const onRecordPressOut = useCallback(async () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      if (!recording && !isStartingRef.current) {
        await takePhoto();
      }
    } else if (recording || isStartingRef.current) {
      stopVideoRecording();
    }
    pressStartRef.current = null;
  }, [recording, takePhoto, stopVideoRecording]);

  const pickFromGallery = async () => {
    if (!isLoggedIn) { setShowLoginPrompt(true); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setCapturedIsPhoto(asset.type !== "video");
      setCapturedForMode(mode);
      setRecordedUri(asset.uri);
    }
  };

  const addTextOverlay = () => {
    if (!newText.trim()) return;
    setTextOverlays((prev) => [...prev, { id: Date.now().toString(), text: newText.trim(), color: newTextColor, x: 60, y: 100 + prev.length * 50 }]);
    setNewText(""); setShowTextModal(false);
  };

  const addSticker = (emoji?: string, gifUrl?: string) => {
    setStickers((prev) => [...prev, { id: Date.now().toString(), emoji, gifUrl, x: 60 + Math.random() * 80, y: 60 + Math.random() * 120 }]);
    setShowStickerModal(false);
  };

  const flashColor = flashMode === "off" ? "#fff" : flashMode === "on" ? "#EAB308" : "#60A5FA";

  const maxDuration = DURATION_SECS[selectedDuration] ?? 15;
  const recordProgress = recording ? Math.min(recordingElapsed / maxDuration, 1) : 0;

  const TAB_W = W / 3;
  const underlineX = slideAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [TAB_W * 0 + TAB_W / 2 - 16, TAB_W * 1 + TAB_W / 2 - 16, TAB_W * 2 + TAB_W / 2 - 16],
  });

  if (!permissionsLoaded) {
    return (
      <View style={s.permBg}>
        <StatusBar style="light" />
        <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.3)" />
        <Text style={s.permTitle}>Loading camera…</Text>
      </View>
    );
  }

  if (needsPermission) {
    return (
      <View style={s.permBg}>
        <StatusBar style="light" />
        <LinearGradient colors={["#7C3AED22", "#EA580C11"]} style={s.permIconBg}>
          <Ionicons name="camera-outline" size={52} color="#7C3AED" />
        </LinearGradient>
        <Text style={s.permTitle}>Camera Access</Text>
        <Text style={s.permSub}>Allow camera and microphone to record videos and take photos</Text>
        <GradientButton
          onPress={async () => { await requestCamPermission(); await requestMicPermission(); }}
          title="Allow Camera & Mic"
          style={{ width: 240, marginTop: 8 }}
        />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <View style={s.root}>

        {/* ── CAMERA ── */}
        <View style={[StyleSheet.absoluteFill, showMirror && { transform: [{ scaleX: -1 }] }]}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            flash={flashMode}
            mode="video"
          />
        </View>

        {/* ── GRADIENT OVERLAY ── */}
        <LinearGradient
          colors={["rgba(0,0,0,0.55)", "transparent", "transparent", "rgba(0,0,0,0.75)"]}
          locations={[0, 0.25, 0.65, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* ── FILTER OVERLAY ── */}
        {activeFilterConfig.id !== "none" && (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: (activeFilterConfig as any).blendHex ?? "#000", opacity: (activeFilterConfig as any).opacity ?? 0 }]}
            pointerEvents="none"
          />
        )}

        {/* ── GRID ── */}
        {showGrid && <GridOverlay />}

        {/* ── LIVE DARK TINT ── */}
        {mode === "Live" && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.38)" }]} pointerEvents="none" />
        )}

        {/* ── TIMER COUNTDOWN ── */}
        {timerCount !== null && (
          <View style={s.timerOverlay} pointerEvents="none">
            <Animated.Text style={[s.timerNumber, { transform: [{ scale: timerScaleAnim }] }]}>
              {timerCount}
            </Animated.Text>
          </View>
        )}

        {/* ── RECORDING INDICATOR (top centre) ── */}
        {recording && (
          <View style={[s.recIndicator, { top: insets.top + 10 }]} pointerEvents="none">
            <View style={s.recDot} />
            <Text style={s.recTimer}>
              {Math.floor(recordingElapsed / 60)}:{String(recordingElapsed % 60).padStart(2, "0")}
            </Text>
          </View>
        )}

        {/* ── RECORDING PROGRESS BAR ── */}
        {recording && (
          <View style={[s.recProgressTrack, { top: insets.top + 38 }]} pointerEvents="none">
            <View style={[s.recProgressFill, { width: `${recordProgress * 100}%` as any }]} />
          </View>
        )}

        {/* ── MUSIC BADGE ── */}
        {selectedMusic && (
          <View style={[s.musicBadge, { top: insets.top + (recording ? 52 : 10) }]} pointerEvents="none">
            <Ionicons name="musical-notes" size={11} color="#fff" />
            <Text style={s.musicBadgeText} numberOfLines={1}>
              {selectedMusic.title} · {selectedMusic.artist}
            </Text>
          </View>
        )}

        {/* ── TEXT OVERLAYS ── */}
        {textOverlays.map((t) => (
          <View key={t.id} style={{ position: "absolute", top: t.y, left: t.x }} pointerEvents="none">
            <Text style={{ color: t.color, fontSize: 18, fontFamily: "Poppins_600SemiBold", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 }}>
              {t.text}
            </Text>
          </View>
        ))}

        {/* ── STICKERS ── */}
        {stickers.map((s2) =>
          s2.gifUrl ? (
            <Image key={s2.id} source={{ uri: s2.gifUrl }} style={{ position: "absolute", top: s2.y, left: s2.x, width: 60, height: 60 }} resizeMode="contain" />
          ) : (
            <Text key={s2.id} style={{ position: "absolute", top: s2.y, left: s2.x, fontSize: 36 }}>{s2.emoji}</Text>
          )
        )}

        {/* ── SWIPE GESTURE CAPTURE AREA ── */}
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 190 + insets.bottom }}
          {...panResponder.panHandlers}
        />

        {/* ── TOP CONTROLS ── */}
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={s.topBtn} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.topBtn} onPress={() => Alert.alert("Create", "Vibe camera · Swipe left/right to switch modes")}>
            <Ionicons name="help-circle-outline" size={24} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>

        {/* ── RIGHT SIDE TOOLS (hidden during LIVE, fades during recording) ── */}
        {mode !== "Live" && (
          <Animated.View style={[s.sideTools, { bottom: insets.bottom + 225 }, { opacity: controlsOpacity }]} pointerEvents={recording ? "none" : "box-none"}>
            <TouchableOpacity style={s.sideTool} onPress={() => setFacing((f) => f === "back" ? "front" : "back")}>
              <View style={s.sideCircle}><Ionicons name="camera-reverse-outline" size={22} color="#fff" /></View>
              <Text style={s.sideLabel}>Flip</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.sideTool} onPress={cycleFlash}>
              <View style={[s.sideCircle, flashMode !== "off" && { backgroundColor: "#EAB30830" }]}>
                <Ionicons name={flashMode === "off" ? "flash-off-outline" : "flash-outline"} size={22} color={flashColor} />
              </View>
              <Text style={[s.sideLabel, { color: flashColor }]}>
                {flashMode === "off" ? "Flash" : flashMode === "on" ? "On" : "Auto"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.sideTool} onPress={cycleTimerSecs}>
              <View style={[s.sideCircle, timerSecs > 0 && { backgroundColor: "#7C3AED30" }]}>
                <Ionicons name={timerSecs > 0 ? "timer" : "timer-outline"} size={22} color={timerSecs > 0 ? "#A78BFA" : "#fff"} />
              </View>
              <Text style={[s.sideLabel, timerSecs > 0 && { color: "#A78BFA" }]}>{timerSecs > 0 ? `${timerSecs}s` : "Timer"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.sideTool} onPress={() => setShowMusicPicker(true)}>
              <View style={[s.sideCircle, selectedMusic && { backgroundColor: "#7C3AED30" }]}>
                <Ionicons name="musical-notes-outline" size={22} color={selectedMusic ? "#A78BFA" : "#fff"} />
              </View>
              <Text style={[s.sideLabel, selectedMusic && { color: "#A78BFA" }]}>Music</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.sideTool} onPress={() => setShowEffectsPicker(true)}>
              <View style={[s.sideCircle, activeFilterConfig.id !== "none" && { backgroundColor: "#EC489930" }]}>
                <Ionicons name="sparkles-outline" size={22} color={activeFilterConfig.id !== "none" ? "#EC4899" : "#fff"} />
              </View>
              <Text style={s.sideLabel}>Effects</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.sideTool} onPress={() => setShowBeauty((b) => !b)}>
              <View style={[s.sideCircle, showBeauty && { backgroundColor: "#EC489930" }]}>
                <Ionicons name="color-wand-outline" size={22} color={showBeauty ? "#EC4899" : "#fff"} />
              </View>
              <Text style={s.sideLabel}>Beauty</Text>
            </TouchableOpacity>

          </Animated.View>
        )}

        {/* ── BOTTOM CONTROLS ── */}
        <View style={[s.bottomArea, { paddingBottom: insets.bottom + 12 }]}>

          {/* Duration pills — POST + VIDEO only, fades while recording */}
          {mode !== "Live" && (
            <Animated.View style={[s.durationRow, { opacity: controlsOpacity }]} pointerEvents={recording ? "none" : "box-none"}>
              {DURATIONS.map((d) => (
                <TouchableOpacity key={d} onPress={() => setSelectedDuration(d)}
                  style={[s.durationPill, selectedDuration === d && s.durationPillActive]}>
                  <Text style={[s.durationText, selectedDuration === d && s.durationTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}

          {/* Mode tabs — fades while recording */}
          <Animated.View style={[s.modeTabs, { opacity: controlsOpacity }]} pointerEvents={recording ? "none" : "box-none"}>
            {MODES.map((m, i) => (
              <TouchableOpacity key={m} onPress={() => setModeIdx(i)} style={s.modeTab}>
                <Text style={[s.modeTabText, modeIdx === i && s.modeTabActive]}>{m.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
            <Animated.View style={[s.modeUnderline, { transform: [{ translateX: underlineX }] }]} />
          </Animated.View>

          {/* LIVE mode bottom */}
          {mode === "Live" ? (
            <View style={s.liveBottom}>
              <TextInput
                value={liveTitle}
                onChangeText={setLiveTitle}
                placeholder="Add a title for your live…"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={s.liveTitleInput}
                maxLength={60}
              />
              <TouchableOpacity
                style={s.goLiveBtn}
                onPress={() => {
                  if (!isLoggedIn) { setShowLoginPrompt(true); return; }
                  router.push("/live");
                }}>
                <LinearGradient colors={["#EF4444", "#B91C1C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.goLiveGrad}>
                  <Ionicons name="radio" size={20} color="#fff" />
                  <Text style={s.goLiveText}>Go Live</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            /* POST + VIDEO record row */
            <View style={s.recordRow}>
              {/* Gallery — fades while recording */}
              <Animated.View style={{ opacity: controlsOpacity }}>
                <TouchableOpacity onPress={pickFromGallery} style={s.sideAction} disabled={recording}>
                  <View style={s.sideActionCircle}>
                    <Ionicons name="images-outline" size={26} color="#fff" />
                  </View>
                  <Text style={s.sideActionLabel}>Gallery</Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Record button — always visible */}
              <View style={s.recordWrap}>
                <Animated.View style={[
                  s.recordRing,
                  recording && { borderColor: "#EF4444" },
                  { transform: [{ scale: recordPulse }] },
                ]} />
                <Pressable
                  onPressIn={onRecordPressIn}
                  onPressOut={onRecordPressOut}
                  disabled={timerCount !== null}
                  style={s.recordBtn}
                >
                  {recording ? (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#EF4444" }}>
                      <View style={s.stopSquare} />
                    </View>
                  ) : (
                    <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  )}
                </Pressable>
                {/* Hint label fades while recording */}
                <Animated.Text style={[s.recordHint, { opacity: controlsOpacity }]}>
                  {mode === "Post" ? "Tap · photo  Hold · video" : "Hold to record"}
                </Animated.Text>
              </View>

              {/* Flip — fades while recording */}
              <Animated.View style={{ opacity: controlsOpacity }}>
                <TouchableOpacity onPress={() => setFacing((f) => f === "back" ? "front" : "back")} style={s.sideAction} disabled={recording}>
                  <View style={s.sideActionCircle}>
                    <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
                  </View>
                  <Text style={s.sideActionLabel}>Flip</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}
        </View>

        {/* ── TEXT MODAL ── */}
        <Modal visible={showTextModal} transparent animationType="slide" onRequestClose={() => setShowTextModal(false)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowTextModal(false)} />
          <View style={s.textCard}>
            <Text style={s.textCardTitle}>Add Text</Text>
            <TextInput
              value={newText}
              onChangeText={setNewText}
              placeholder="Type something…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoFocus
              maxLength={60}
              style={[s.textInput, { color: newTextColor }]}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {TEXT_COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setNewTextColor(c)}
                  style={[s.colorDot, { backgroundColor: c }, newTextColor === c && s.colorDotActive]} />
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <TouchableOpacity onPress={() => { setShowTextModal(false); setNewText(""); }} style={s.cancelBtn}>
                <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_600SemiBold", fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addTextOverlay} style={{ flex: 2, borderRadius: 12, overflow: "hidden" }}>
                <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" }}>Add Text</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ── PICKERS ── */}
        <MusicPickerSheet visible={showMusicPicker} onClose={() => setShowMusicPicker(false)} onSelect={setSelectedMusic} selectedTrack={selectedMusic} />
        <EffectsPickerSheet
          visible={showEffectsPicker}
          onClose={() => setShowEffectsPicker(false)}
          activeFilter={activeFilterConfig.id}
          onFilterChange={setActiveFilterConfig}
          showGrid={showGrid}
          onGridToggle={() => setShowGrid((v) => !v)}
          showMirror={showMirror}
          onMirrorToggle={() => setShowMirror((v) => !v)}
          timer={timerSecs}
          onTimerChange={setTimerSecs}
          speed={speed}
          onSpeedChange={setSpeed}
          showBeauty={showBeauty}
          onBeautyToggle={() => setShowBeauty((v) => !v)}
        />
        <StickerPickerModal visible={showStickerModal} onClose={() => setShowStickerModal(false)} onSelect={(gifUrl) => addSticker(undefined, gifUrl)} />

      </View>

      {/* ── VIDEO EDITOR (full screen overlay — must cover camera, not split with it) ── */}
      {recordedUri && (
        <View style={StyleSheet.absoluteFill}>
        <VideoEditorSheet
          uri={recordedUri}
          isPhoto={capturedIsPhoto}
          initialMusic={selectedMusic}
          initialFilter={activeFilterConfig}
          textOverlays={textOverlays}
          stickers={stickers}
          onDiscard={() => { setRecordedUri(null); setTextOverlays([]); setStickers([]); }}
          onPost={async (data) => {
            const uri = recordedUri;
            const wasPhoto = capturedIsPhoto;
            const forMode = capturedForMode;
            setRecordedUri(null);
            setTextOverlays([]);
            setStickers([]);
            setSelectedMusic(null);
            if (uri && session?.user?.id) {
              if (wasPhoto || forMode === "Post") {
                await uploadPostMedia(session.user.id, uri, data.caption ?? "");
              } else {
                await uploadReelMedia(session.user.id, uri, data.caption ?? "");
              }
            }
            setShowCelebration(true);
          }}
        />
        </View>
      )}

      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
      <CelebrationModal
        visible={showCelebration}
        onGoToProfile={() => { setShowCelebration(false); router.navigate("/(tabs)/profile" as any); }}
        onClose={() => setShowCelebration(false)}
      />
    </>
  );
}

const SIDE_CIRCLE_SIZE = 44;
const RECORD_BTN_SIZE = 80;
const RECORD_RING_SIZE = 98;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  // Permission
  permBg: { flex: 1, backgroundColor: "#080810", alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  permIconBg: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  permTitle: { color: "#fff", fontSize: 20, fontFamily: "Poppins_700Bold" },
  permSub: { color: "rgba(255,255,255,0.55)", fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },

  // Top bar
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  // Side tools
  sideTools: { position: "absolute", right: 10, gap: 18 },
  sideTool: { alignItems: "center", gap: 4 },
  sideCircle: { width: SIDE_CIRCLE_SIZE, height: SIDE_CIRCLE_SIZE, borderRadius: SIDE_CIRCLE_SIZE / 2, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.18)" },
  sideLabel: { color: "#fff", fontSize: 10, fontFamily: "Poppins_500Medium", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },

  // Timer overlay
  timerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  timerNumber: { fontSize: 120, fontFamily: "Poppins_700Bold", color: "#fff", textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 8 },

  // Recording indicator
  recIndicator: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },
  recTimer: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  recProgressTrack: { position: "absolute", left: 0, right: 0, height: 3, backgroundColor: "rgba(255,255,255,0.2)" },
  recProgressFill: { height: 3, backgroundColor: "#EF4444" },

  // Music badge
  musicBadge: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  musicBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_500Medium", maxWidth: W * 0.55 },

  // Bottom area
  bottomArea: { position: "absolute", bottom: 0, left: 0, right: 0 },
  durationRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 14 },
  durationPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  durationPillActive: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  durationText: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Poppins_500Medium" },
  durationTextActive: { color: "#fff", fontFamily: "Poppins_700Bold" },

  // Mode tabs
  modeTabs: { flexDirection: "row", marginBottom: 18, position: "relative" },
  modeTab: { flex: 1, alignItems: "center", paddingVertical: 4 },
  modeTabText: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Poppins_600SemiBold", letterSpacing: 1 },
  modeTabActive: { color: "#fff", fontFamily: "Poppins_700Bold" },
  modeUnderline: { position: "absolute", bottom: 0, width: 32, height: 2.5, borderRadius: 2, backgroundColor: "#fff" },

  // Record row
  recordRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 28, marginBottom: 4 },
  sideAction: { alignItems: "center", gap: 5, width: 60 },
  sideActionCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  sideActionLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Poppins_500Medium" },

  // Record button
  recordWrap: { alignItems: "center", gap: 8 },
  recordRing: { position: "absolute", width: RECORD_RING_SIZE, height: RECORD_RING_SIZE, borderRadius: RECORD_RING_SIZE / 2, borderWidth: 3, borderColor: "rgba(255,255,255,0.7)" },
  recordBtn: { width: RECORD_BTN_SIZE, height: RECORD_BTN_SIZE, borderRadius: RECORD_BTN_SIZE / 2, overflow: "hidden", backgroundColor: "#7C3AED" },
  stopSquare: { width: 26, height: 26, borderRadius: 5, backgroundColor: "#fff" },
  recordHint: { color: "rgba(255,255,255,0.55)", fontSize: 10, fontFamily: "Poppins_400Regular", textAlign: "center" },

  // Live bottom
  liveBottom: { paddingHorizontal: 24, gap: 14 },
  liveTitleInput: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.2)" },
  goLiveBtn: { borderRadius: 18, overflow: "hidden" },
  goLiveGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18 },
  goLiveText: { color: "#fff", fontSize: 17, fontFamily: "Poppins_700Bold" },

  // Text modal
  modalBackdrop: { flex: 1 },
  textCard: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 14 },
  textCardTitle: { color: "#fff", fontSize: 16, fontFamily: "Poppins_700Bold" },
  textInput: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, fontSize: 16, fontFamily: "Poppins_500Medium", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", minHeight: 50 },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)" },
  colorDotActive: { borderColor: "#7C3AED", borderWidth: 3 },
  cancelBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
});
