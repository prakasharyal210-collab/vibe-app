import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { BeautyPanel, BeautyOverlay, BeautySettings } from "@/components/camera/BeautyPanel";
import { CameraFilterStrip, FilterOverlay, CAMERA_FILTERS, CameraFilter } from "@/components/camera/CameraFilterStrip";
import { useAuth } from "@/context/AuthContext";
import { uploadPostMedia, uploadReelMedia } from "@/lib/db";
import { Track } from "@/lib/music";
import { callAI, parseAIJson } from "@/lib/ai";

const { width: W, height: H } = Dimensions.get("window");

// ── Capture modes ────────────────────────────────────────────────────────────
const CAPTURE_MODES = [
  { key: "Photo",     icon: "camera-outline" as const,        label: "📸 Photo",      isVideo: false },
  { key: "Video",     icon: "videocam-outline" as const,      label: "🎬 Video",      isVideo: true  },
  { key: "Portrait",  icon: "person-outline" as const,        label: "🎭 Portrait",   isVideo: false },
  { key: "Night",     icon: "moon-outline" as const,          label: "🌙 Night",      isVideo: false },
  { key: "SlowMo",    icon: "pause-outline" as const,         label: "⚡ Slow Mo",    isVideo: true  },
  { key: "Boomerang", icon: "sync-outline" as const,          label: "⏩ Boomerang",  isVideo: true  },
  { key: "Panorama",  icon: "expand-outline" as const,        label: "📐 Panorama",   isVideo: false },
] as const;
type CaptureMode = (typeof CAPTURE_MODES)[number]["key"];

// Legacy mode for upload logic
type UploadMode = "Post" | "Video" | "Live";
function toUploadMode(m: CaptureMode): UploadMode {
  return (m === "Video" || m === "SlowMo" || m === "Boomerang") ? "Video" : "Post";
}

const DURATIONS = ["15s", "30s", "60s", "3min"] as const;
const DURATION_SECS: Record<string, number> = { "15s": 15, "30s": 30, "60s": 60, "3min": 180 };
const TEXT_COLORS = ["#ffffff", "#000000", "#7C3AED", "#F97316", "#EF4444", "#10B981", "#3B82F6", "#FBBF24", "#EC4899"];

interface TextOverlayItem { id: string; text: string; color: string; x: number; y: number; }
interface StickerItem { id: string; emoji?: string; gifUrl?: string; x: number; y: number; }

const CONFETTI_COLORS = ["#7C3AED", "#F97316", "#EF4444", "#10B981", "#3B82F6", "#FBBF24", "#EC4899", "#A78BFA"];
const CONFETTI_COUNT = 28;

// ── Grid overlay ─────────────────────────────────────────────────────────────
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

// ── Panorama guide ───────────────────────────────────────────────────────────
function PanoramaGuide() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={pano.centerLine} />
      <View style={pano.arrowWrap}>
        <Ionicons name="arrow-forward" size={24} color="rgba(255,255,255,0.6)" />
        <Text style={pano.hint}>Pan slowly to the right</Text>
      </View>
    </View>
  );
}
const pano = StyleSheet.create({
  centerLine: { position: "absolute", top: 0, bottom: 0, left: "50%", width: 1.5, backgroundColor: "rgba(251,191,36,0.7)", marginLeft: -0.75 },
  arrowWrap: { position: "absolute", bottom: "35%", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  hint: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_500Medium", fontSize: 13 },
});

// ── Focus ring ───────────────────────────────────────────────────────────────
function FocusRing({ point, visible }: { point: { x: number; y: number } | null; visible: boolean }) {
  const scale = useRef(new Animated.Value(1.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible && point) {
      scale.setValue(1.5); opacity.setValue(1);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 200 }),
        Animated.sequence([
          Animated.delay(800),
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [visible, point]);
  if (!point || !visible) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: point.x - 30,
        top: point.y - 30,
        width: 60, height: 60,
        borderRadius: 30,
        borderWidth: 2,
        borderColor: "#FBBF24",
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

// ── Zoom slider ──────────────────────────────────────────────────────────────
function ZoomSlider({ zoom, onChange }: { zoom: number; onChange: (v: number) => void }) {
  const STEPS = [0, 0.1, 0.25, 0.5, 0.75, 1];
  return (
    <View style={zs.container}>
      <Ionicons name="add" size={14} color="rgba(255,255,255,0.7)" />
      <View style={zs.track}>
        <View style={[zs.fill, { height: `${zoom * 100}%` as any }]} />
        {STEPS.map((v) => (
          <TouchableOpacity key={v} onPress={() => onChange(v)} style={[zs.step, { bottom: `${v * 100}%` as any }]}>
            <View style={[zs.stepDot, zoom >= v && zs.stepDotActive]} />
          </TouchableOpacity>
        ))}
      </View>
      <Ionicons name="remove" size={14} color="rgba(255,255,255,0.7)" />
      <View style={zs.badge}>
        <Text style={zs.badgeText}>{zoom < 0.05 ? "1×" : zoom < 0.15 ? "2×" : zoom < 0.35 ? "3×" : zoom < 0.6 ? "5×" : "10×"}</Text>
      </View>
    </View>
  );
}
const zs = StyleSheet.create({
  container: { position: "absolute", left: 12, top: "28%", bottom: "28%", alignItems: "center", gap: 8, width: 28 },
  track: { flex: 1, width: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, position: "relative" },
  fill: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#A78BFA", borderRadius: 2 },
  step: { position: "absolute", left: -6, width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.35)" },
  stepDotActive: { backgroundColor: "#A78BFA" },
  badge: { backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 4, paddingVertical: 2 },
  badgeText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 9 },
});

// ── Exposure slider (vertical, appears after tap-focus) ───────────────────────
function ExposureSlider({ value, onChange, visible }: { value: number; onChange: (v: number) => void; visible: boolean }) {
  if (!visible) return null;
  const STEPS = [-1, -0.5, 0, 0.5, 1];
  const pct = ((value + 1) / 2) * 100;
  return (
    <View style={es.container}>
      <Ionicons name="sunny" size={14} color="#FBBF24" />
      <View style={es.track}>
        <View style={[es.fill, { height: `${pct}%` as any }]} />
        {STEPS.map((v) => (
          <TouchableOpacity key={v} onPress={() => onChange(v)} style={[es.step, { bottom: `${((v + 1) / 2) * 100}%` as any }]}>
            <View style={[es.stepDot, value >= v && es.stepDotActive]} />
          </TouchableOpacity>
        ))}
      </View>
      <Ionicons name="sunny-outline" size={10} color="rgba(255,255,255,0.5)" />
    </View>
  );
}
const es = StyleSheet.create({
  container: { position: "absolute", right: 12, top: "28%", bottom: "28%", alignItems: "center", gap: 6, width: 28 },
  track: { flex: 1, width: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, position: "relative" },
  fill: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FBBF24", borderRadius: 2 },
  step: { position: "absolute", left: -6, width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.35)" },
  stepDotActive: { backgroundColor: "#FBBF24" },
});

// ── Celebration modal (unchanged) ─────────────────────────────────────────────
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

// ── Main create screen ────────────────────────────────────────────────────────
export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [captureMode, setCaptureMode] = useState<CaptureMode>("Video");
  const modeScrollRef = useRef<ScrollView>(null);

  // ── Camera controls ────────────────────────────────────────────────────────
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [flashMode, setFlashMode] = useState<"off" | "on" | "auto">("off");
  const [zoom, setZoom] = useState(0);
  const prevPinchDist = useRef<number | null>(null);
  const baseZoom = useRef(0);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const [showZoomSlider, setShowZoomSlider] = useState(true);

  // ── Focus & exposure ──────────────────────────────────────────────────────
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [showFocusRing, setShowFocusRing] = useState(false);
  const [exposureValue, setExposureValue] = useState(0);
  const [showExposure, setShowExposure] = useState(false);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Timer / recording ─────────────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [capturedIsPhoto, setCapturedIsPhoto] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState("15s");
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [timerSecs, setTimerSecs] = useState<TimerValue>(0);
  const [timerCount, setTimerCount] = useState<number | null>(null);
  const timerScaleAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStartingRef = useRef(false);
  const recordPulse = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Display toggles ────────────────────────────────────────────────────────
  const [showGrid, setShowGrid] = useState(false);
  const [showMirror, setShowMirror] = useState(false);

  // ── Beauty ────────────────────────────────────────────────────────────────
  const [showBeauty, setShowBeauty] = useState(false);
  const [beautySettings, setBeautySettings] = useState<BeautySettings>({ smooth: 0, brighten: 0, slim: 0, eyes: 0 });

  // ── Filters ────────────────────────────────────────────────────────────────
  const [showFilterStrip, setShowFilterStrip] = useState(false);
  const [cameraFilter, setCameraFilter] = useState<CameraFilter>(CAMERA_FILTERS[0]);
  const [filterIntensity, setFilterIntensity] = useState(100);

  // ── Overlays / music ──────────────────────────────────────────────────────
  const [selectedMusic, setSelectedMusic] = useState<Track | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlayItem[]>([]);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [speed, setSpeed] = useState("normal");

  // ── Sheets ────────────────────────────────────────────────────────────────
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showEffectsPicker, setShowEffectsPicker] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [newTextColor, setNewTextColor] = useState("#ffffff");

  // ── Post / AI ─────────────────────────────────────────────────────────────
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [aiModal, setAiModal] = useState<{ type: "idea" | "script"; content: string[] } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const hasPermission = !!(camPermission?.granted && micPermission?.granted);
  const permissionsLoaded = camPermission !== null && micPermission !== null;
  const needsPermission = permissionsLoaded && !hasPermission;

  const isVideoMode = CAPTURE_MODES.find((m) => m.key === captureMode)?.isVideo ?? false;

  // ── Fade controls during recording ────────────────────────────────────────
  useEffect(() => {
    Animated.timing(controlsOpacity, { toValue: recording ? 0 : 1, duration: 220, useNativeDriver: true }).start();
  }, [recording]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    };
  }, []);

  // ── Tap to focus ──────────────────────────────────────────────────────────
  const handleCameraTap = useCallback((e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    setShowFocusRing(true);
    setShowExposure(true);
    Haptics.selectionAsync();
    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    focusTimeoutRef.current = setTimeout(() => {
      setShowFocusRing(false);
      setShowExposure(false);
    }, 3500);
  }, []);

  // ── Pinch to zoom (multi-touch) ────────────────────────────────────────────
  const cameraGestureHandlers = useMemo(() => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: any) => {
      if (e.nativeEvent.touches.length === 2) {
        const [t1, t2] = e.nativeEvent.touches;
        prevPinchDist.current = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
        baseZoom.current = zoom;
      }
    },
    onResponderMove: (e: any) => {
      const { touches } = e.nativeEvent;
      if (touches.length === 2) {
        const [t1, t2] = touches;
        const dist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
        if (prevPinchDist.current !== null) {
          const delta = (dist - prevPinchDist.current) / 400;
          setZoom((z) => Math.min(1, Math.max(0, baseZoom.current + delta)));
        }
        prevPinchDist.current = dist;
      }
    },
    onResponderRelease: (e: any) => {
      prevPinchDist.current = null;
      baseZoom.current = zoom;
      if (e.nativeEvent.touches.length === 0 && e.nativeEvent.changedTouches.length === 1) {
        handleCameraTap(e);
      }
    },
  }), [zoom, handleCameraTap]);

  // ── Timer countdown ────────────────────────────────────────────────────────
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

  // ── Record pulse ──────────────────────────────────────────────────────────
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

  // ── Photo capture ─────────────────────────────────────────────────────────
  const takePhoto = useCallback(async () => {
    try {
      await runTimerCountdown();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (photo?.uri) {
        setCapturedIsPhoto(true);
        setRecordedUri(photo.uri);
      }
    } catch {
      Alert.alert("Photo failed", "Could not capture photo. Try again.");
    }
  }, [runTimerCountdown]);

  // ── Video recording ────────────────────────────────────────────────────────
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
          clearInterval(recordTimerRef.current!); recordTimerRef.current = null;
          cameraRef.current?.stopRecording(); return prev;
        }
        return prev + 1;
      });
    }, 1000);
    try {
      const result = await cameraRef.current?.recordAsync({ maxDuration });
      if (result?.uri) { setCapturedIsPhoto(false); setRecordedUri(result.uri); }
    } catch {}
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecording(false); setRecordingElapsed(0); stopPulse();
  }, [recording, runTimerCountdown, selectedDuration, startPulse, stopPulse]);

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
      clearTimeout(holdTimerRef.current); holdTimerRef.current = null;
      if (!recording && !isStartingRef.current) {
        if (isVideoMode) { startVideoRecording(); }
        else { await takePhoto(); }
      }
    } else if (recording || isStartingRef.current) {
      stopVideoRecording();
    }
    pressStartRef.current = null;
  }, [recording, takePhoto, stopVideoRecording, startVideoRecording, isVideoMode]);

  // ── Gallery ───────────────────────────────────────────────────────────────
  const pickFromGallery = async () => {
    if (!isLoggedIn) { setShowLoginPrompt(true); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.9, allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setCapturedIsPhoto(asset.type !== "video");
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

  const cycleFlash = () => setFlashMode((f) => f === "off" ? "on" : f === "on" ? "auto" : "off");
  const flashColor = flashMode === "off" ? "#fff" : flashMode === "on" ? "#EAB308" : "#60A5FA";
  const flashIcon = flashMode === "off" ? "flash-off-outline" : flashMode === "on" ? "flash-outline" : "flash-outline";

  const maxDuration = DURATION_SECS[selectedDuration] ?? 15;
  const recordProgress = recording ? Math.min(recordingElapsed / maxDuration, 1) : 0;

  // ── Panorama mode special record handler ──────────────────────────────────
  const isBoomerang = captureMode === "Boomerang";
  const isSlowMo = captureMode === "SlowMo";
  const isPanorama = captureMode === "Panorama";
  const isPortrait = captureMode === "Portrait";
  const isNight = captureMode === "Night";

  // ── Permissions ────────────────────────────────────────────────────────────
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
        <GradientButton onPress={async () => { await requestCamPermission(); await requestMicPermission(); }} title="Allow Camera & Mic" style={{ width: 240, marginTop: 8 }} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <View style={s.root}>

        {/* ── CAMERA ── */}
        <View
          style={[StyleSheet.absoluteFill, showMirror && { transform: [{ scaleX: -1 }] }]}
          {...cameraGestureHandlers}
        >
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            flash={flashMode}
            mode="video"
            zoom={zoom}
          />
        </View>

        {/* ── GRADIENT OVERLAY ── */}
        <LinearGradient
          colors={["rgba(0,0,0,0.6)", "transparent", "transparent", "rgba(0,0,0,0.8)"]}
          locations={[0, 0.2, 0.6, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* ── FILTER OVERLAY ── */}
        <FilterOverlay filter={cameraFilter} intensity={filterIntensity} />

        {/* ── BEAUTY OVERLAY ── */}
        <BeautyOverlay settings={beautySettings} />

        {/* ── EXPOSURE OVERLAY (simulated) ── */}
        {exposureValue !== 0 && (
          <View
            style={[StyleSheet.absoluteFill, {
              backgroundColor: exposureValue > 0 ? `rgba(255,255,255,${exposureValue * 0.12})` : `rgba(0,0,0,${Math.abs(exposureValue) * 0.2})`,
            }]}
            pointerEvents="none"
          />
        )}

        {/* ── PORTRAIT BOKEH HINT ── */}
        {isPortrait && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <LinearGradient
              colors={["transparent", "transparent", "rgba(0,0,8,0.55)"]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={s.portraitBadge}>
              <Ionicons name="aperture-outline" size={13} color="#A78BFA" />
              <Text style={s.portraitBadgeText}>Portrait · Depth Effect</Text>
            </View>
          </View>
        )}

        {/* ── NIGHT MODE HINT ── */}
        {isNight && (
          <View style={s.nightBadge} pointerEvents="none">
            <Ionicons name="moon" size={12} color="#60A5FA" />
            <Text style={s.nightBadgeText}>Night Mode</Text>
          </View>
        )}

        {/* ── GRID ── */}
        {showGrid && <GridOverlay />}

        {/* ── PANORAMA GUIDE ── */}
        {isPanorama && <PanoramaGuide />}

        {/* ── TIMER COUNTDOWN ── */}
        {timerCount !== null && (
          <View style={s.timerOverlay} pointerEvents="none">
            <Animated.Text style={[s.timerNumber, { transform: [{ scale: timerScaleAnim }] }]}>
              {timerCount}
            </Animated.Text>
          </View>
        )}

        {/* ── RECORDING INDICATOR ── */}
        {recording && (
          <View style={[s.recIndicator, { top: insets.top + 10 }]} pointerEvents="none">
            <View style={s.recDot} />
            <Text style={s.recTimer}>{Math.floor(recordingElapsed / 60)}:{String(recordingElapsed % 60).padStart(2, "0")}</Text>
            {isBoomerang && <Text style={s.recModeBadge}>⏩ BOM</Text>}
            {isSlowMo && <Text style={s.recModeBadge}>⚡ SLOW</Text>}
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
            <Text style={s.musicBadgeText} numberOfLines={1}>{selectedMusic.title} · {selectedMusic.artist}</Text>
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

        {/* ── FOCUS RING ── */}
        <FocusRing point={focusPoint} visible={showFocusRing} />

        {/* ── ZOOM SLIDER (left) ── */}
        <Animated.View style={{ opacity: controlsOpacity }} pointerEvents={recording ? "none" : "box-none"}>
          <ZoomSlider zoom={zoom} onChange={setZoom} />
        </Animated.View>

        {/* ── EXPOSURE SLIDER (right, after focus) ── */}
        <Animated.View style={{ opacity: controlsOpacity }} pointerEvents={recording ? "none" : "box-none"}>
          <ExposureSlider value={exposureValue} onChange={setExposureValue} visible={showExposure} />
        </Animated.View>

        {/* ── TOP BAR ── */}
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={s.topBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={s.topCenter}>
            {isNight && <Text style={s.modeHint}>Night mode active</Text>}
            {isSlowMo && <Text style={s.modeHint}>0.5× slow motion</Text>}
            {isBoomerang && <Text style={s.modeHint}>Tap to record boomerang</Text>}
          </View>
          <View style={s.topRight}>
            {/* Zoom tap shortcut */}
            <TouchableOpacity style={s.topPill} onPress={() => { const next = zoom < 0.05 ? 0.12 : zoom < 0.2 ? 0.35 : 0; setZoom(next); }}>
              <Text style={s.topPillText}>{zoom < 0.05 ? "1×" : zoom < 0.2 ? "2×" : "3×"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── RIGHT SIDE TOOLS ── */}
        <Animated.View style={[s.sideTools, { bottom: insets.bottom + 268, opacity: controlsOpacity }]} pointerEvents={recording ? "none" : "box-none"}>

          <TouchableOpacity style={s.sideTool} onPress={() => setFacing((f) => f === "back" ? "front" : "back")}>
            <View style={s.sideCircle}><Ionicons name="camera-reverse-outline" size={22} color="#fff" /></View>
            <Text style={s.sideLabel}>Flip</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.sideTool} onPress={cycleFlash}>
            <View style={[s.sideCircle, flashMode !== "off" && { backgroundColor: "#EAB30830" }]}>
              <Ionicons name={flashIcon} size={22} color={flashColor} />
            </View>
            <Text style={[s.sideLabel, { color: flashColor }]}>{flashMode === "off" ? "Flash" : flashMode === "on" ? "On" : "Auto"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.sideTool} onPress={() => { const opts: TimerValue[] = [0, 3, 5, 10]; setTimerSecs((t) => opts[(opts.indexOf(t) + 1) % opts.length]); }}>
            <View style={[s.sideCircle, timerSecs > 0 && { backgroundColor: "#7C3AED30" }]}>
              <Ionicons name={timerSecs > 0 ? "timer" : "timer-outline"} size={22} color={timerSecs > 0 ? "#A78BFA" : "#fff"} />
            </View>
            <Text style={[s.sideLabel, timerSecs > 0 && { color: "#A78BFA" }]}>{timerSecs > 0 ? `${timerSecs}s` : "Timer"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.sideTool} onPress={() => setShowGrid((v) => !v)}>
            <View style={[s.sideCircle, showGrid && { backgroundColor: "#7C3AED30" }]}>
              <Ionicons name="grid-outline" size={22} color={showGrid ? "#A78BFA" : "#fff"} />
            </View>
            <Text style={[s.sideLabel, showGrid && { color: "#A78BFA" }]}>Grid</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.sideTool} onPress={() => { setShowFilterStrip((v) => !v); setShowBeauty(false); }}>
            <View style={[s.sideCircle, showFilterStrip && { backgroundColor: "#EC489930" }]}>
              <Ionicons name="color-filter-outline" size={22} color={showFilterStrip ? "#EC4899" : cameraFilter.id !== "none" ? "#EC4899" : "#fff"} />
            </View>
            <Text style={[s.sideLabel, (showFilterStrip || cameraFilter.id !== "none") && { color: "#EC4899" }]}>Filter</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.sideTool} onPress={() => { setShowBeauty((v) => !v); setShowFilterStrip(false); }}>
            <View style={[s.sideCircle, showBeauty && { backgroundColor: "#EC489930" }]}>
              <Ionicons name="color-wand-outline" size={22} color={showBeauty ? "#EC4899" : "#fff"} />
            </View>
            <Text style={s.sideLabel}>Beauty</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.sideTool} onPress={() => setShowMusicPicker(true)}>
            <View style={[s.sideCircle, selectedMusic && { backgroundColor: "#7C3AED30" }]}>
              <Ionicons name="musical-notes-outline" size={22} color={selectedMusic ? "#A78BFA" : "#fff"} />
            </View>
            <Text style={[s.sideLabel, selectedMusic && { color: "#A78BFA" }]}>Music</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.sideTool} onPress={() => setShowTextModal(true)}>
            <View style={s.sideCircle}><Ionicons name="text-outline" size={22} color="#fff" /></View>
            <Text style={s.sideLabel}>Text</Text>
          </TouchableOpacity>

          {captureMode === "Photo" || captureMode === "Portrait" || captureMode === "Night" ? (
            <TouchableOpacity style={s.sideTool} disabled={aiLoading} onPress={async () => {
              setAiLoading(true);
              const result = await callAI("story_idea", {});
              setAiLoading(false);
              const parsed = parseAIJson<{ ideas?: string[] }>(result, {});
              if (parsed.ideas) setAiModal({ type: "idea", content: parsed.ideas });
            }}>
              <View style={[s.sideCircle, { backgroundColor: "rgba(124,58,237,0.35)" }]}>
                {aiLoading ? <ActivityIndicator size="small" color="#A78BFA" /> : <Ionicons name="bulb-outline" size={22} color="#A78BFA" />}
              </View>
              <Text style={[s.sideLabel, { color: "#A78BFA" }]}>AI Idea</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.sideTool} disabled={aiLoading} onPress={async () => {
              setAiLoading(true);
              const result = await callAI("reel_script", { topic: "my reel", duration: selectedDuration });
              setAiLoading(false);
              const parsed = parseAIJson<{ script?: string[] }>(result, {});
              if (parsed.script) setAiModal({ type: "script", content: parsed.script });
            }}>
              <View style={[s.sideCircle, { backgroundColor: "rgba(124,58,237,0.35)" }]}>
                {aiLoading ? <ActivityIndicator size="small" color="#A78BFA" /> : <Ionicons name="document-text-outline" size={22} color="#A78BFA" />}
              </View>
              <Text style={[s.sideLabel, { color: "#A78BFA" }]}>AI Script</Text>
            </TouchableOpacity>
          )}

        </Animated.View>

        {/* ── FILTER STRIP ── */}
        <Animated.View style={{ opacity: controlsOpacity }}>
          <CameraFilterStrip
            visible={showFilterStrip}
            activeFilter={cameraFilter.id}
            intensity={filterIntensity}
            onFilterChange={setCameraFilter}
            onIntensityChange={setFilterIntensity}
          />
        </Animated.View>

        {/* ── BEAUTY PANEL ── */}
        <BeautyPanel
          visible={showBeauty}
          settings={beautySettings}
          onChange={(key, val) => setBeautySettings((prev) => ({ ...prev, [key]: val }))}
          onClose={() => setShowBeauty(false)}
        />

        {/* ── BOTTOM AREA ── */}
        <View style={[s.bottomArea, { paddingBottom: insets.bottom + 8 }]}>

          {/* Duration pills — video modes only */}
          {isVideoMode && (
            <Animated.View style={[s.durationRow, { opacity: controlsOpacity }]} pointerEvents={recording ? "none" : "box-none"}>
              {DURATIONS.map((d) => (
                <TouchableOpacity key={d} onPress={() => setSelectedDuration(d)} style={[s.durationPill, selectedDuration === d && s.durationPillActive]}>
                  <Text style={[s.durationText, selectedDuration === d && s.durationTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}

          {/* Mode selector — horizontal scroll */}
          <Animated.View style={[{ opacity: controlsOpacity }]} pointerEvents={recording ? "none" : "box-none"}>
            <ScrollView
              ref={modeScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.modeScroll}
            >
              {CAPTURE_MODES.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setCaptureMode(m.key)}
                  style={[s.modeTab, captureMode === m.key && s.modeTabActive]}
                >
                  <Text style={[s.modeTabText, captureMode === m.key && s.modeTabTextActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>

          {/* Record row */}
          <View style={s.recordRow}>
            {/* Gallery */}
            <Animated.View style={{ opacity: controlsOpacity }}>
              <TouchableOpacity onPress={pickFromGallery} style={s.sideAction} disabled={recording}>
                <View style={s.sideActionCircle}>
                  <Ionicons name="images-outline" size={26} color="#fff" />
                </View>
                <Text style={s.sideActionLabel}>Gallery</Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Capture button */}
            <View style={s.recordWrap}>
              <Animated.View style={[s.recordRing, recording && { borderColor: "#EF4444" }, { transform: [{ scale: recordPulse }] }]} />
              <Pressable
                onPressIn={onRecordPressIn}
                onPressOut={onRecordPressOut}
                disabled={timerCount !== null}
                style={s.recordBtn}
              >
                {recording ? (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#EF4444" }}>
                    {isVideoMode ? <View style={s.stopSquare} /> : <View style={s.stopSquare} />}
                  </View>
                ) : (
                  <>
                    <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    {captureMode === "Boomerang" && <Text style={s.btnIcon}>⏩</Text>}
                    {captureMode === "SlowMo" && <Text style={s.btnIcon}>⚡</Text>}
                    {captureMode === "Panorama" && <Text style={s.btnIcon}>📐</Text>}
                  </>
                )}
              </Pressable>
              <Animated.Text style={[s.recordHint, { opacity: controlsOpacity }]}>
                {isVideoMode ? "Hold · record   Tap · stop" : "Tap to capture"}
              </Animated.Text>
            </View>

            {/* Flip */}
            <Animated.View style={{ opacity: controlsOpacity }}>
              <TouchableOpacity onPress={() => setFacing((f) => f === "back" ? "front" : "back")} style={s.sideAction} disabled={recording}>
                <View style={s.sideActionCircle}>
                  <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
                </View>
                <Text style={s.sideActionLabel}>Flip</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

        {/* ── TEXT MODAL ── */}
        <Modal visible={showTextModal} transparent animationType="slide" onRequestClose={() => setShowTextModal(false)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowTextModal(false)} />
          <View style={s.textCard}>
            <Text style={s.textCardTitle}>Add Text</Text>
            <TextInput value={newText} onChangeText={setNewText} placeholder="Type something…" placeholderTextColor="rgba(255,255,255,0.35)" autoFocus maxLength={60} style={[s.textInput, { color: newTextColor }]} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {TEXT_COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setNewTextColor(c)} style={[s.colorDot, { backgroundColor: c }, newTextColor === c && s.colorDotActive]} />
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
          activeFilter={cameraFilter.id}
          onFilterChange={(f) => setCameraFilter({ id: f.id, label: f.label, blendColor: f.blendHex, blendOpacity: f.opacity })}
          showGrid={showGrid} onGridToggle={() => setShowGrid((v) => !v)}
          showMirror={showMirror} onMirrorToggle={() => setShowMirror((v) => !v)}
          timer={timerSecs} onTimerChange={setTimerSecs}
          speed={speed} onSpeedChange={setSpeed}
          showBeauty={showBeauty} onBeautyToggle={() => setShowBeauty((v) => !v)}
        />
        <StickerPickerModal visible={showStickerModal} onClose={() => setShowStickerModal(false)} onSelect={(gifUrl) => addSticker(undefined, gifUrl)} />

      </View>

      {/* ── VIDEO EDITOR (full screen overlay) ── */}
      {recordedUri && (
        <View style={StyleSheet.absoluteFill}>
          <VideoEditorSheet
            uri={recordedUri}
            isPhoto={capturedIsPhoto}
            initialMusic={selectedMusic}
            initialFilter={{ id: cameraFilter.id, label: cameraFilter.label, color: cameraFilter.blendColor, opacity: cameraFilter.blendOpacity, blendHex: cameraFilter.blendColor }}
            textOverlays={textOverlays}
            stickers={stickers}
            onDiscard={() => { setRecordedUri(null); setTextOverlays([]); setStickers([]); }}
            onPost={async (data) => {
              const uri = recordedUri;
              const wasPhoto = capturedIsPhoto;
              setRecordedUri(null); setTextOverlays([]); setStickers([]); setSelectedMusic(null);
              if (uri && session?.user?.id) {
                if (wasPhoto || !isVideoMode) {
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

      {aiModal && (
        <Modal transparent animationType="slide" onRequestClose={() => setAiModal(null)}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" }}>
            <View style={{ backgroundColor: "#0F0F1A", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 }}>
              <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16, marginBottom: 16 }}>
                {aiModal.type === "idea" ? "✨ Story Ideas" : "✨ Reel Script"}
              </Text>
              {aiModal.content.map((item, i) => (
                <TouchableOpacity key={i} onPress={() => setAiModal(null)} style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(124,58,237,0.15)", borderWidth: 1, borderColor: "rgba(124,58,237,0.3)", marginBottom: 10 }}>
                  <Text style={{ color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 20 }}>
                    {aiModal.type === "script" ? `${i + 1}. ` : ""}{item}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setAiModal(null)} style={{ marginTop: 8, alignItems: "center" }}>
                <Text style={{ color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_500Medium", fontSize: 14 }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const SIDE_CIRCLE_SIZE = 44;
const RECORD_BTN_SIZE = 78;
const RECORD_RING_SIZE = 96;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  permBg: { flex: 1, backgroundColor: "#080810", alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  permIconBg: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  permTitle: { color: "#fff", fontSize: 20, fontFamily: "Poppins_700Bold" },
  permSub: { color: "rgba(255,255,255,0.55)", fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },

  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 8, gap: 8 },
  topBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 19 },
  topCenter: { flex: 1, alignItems: "center" },
  topRight: { alignItems: "flex-end" },
  topPill: { backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  topPillText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
  modeHint: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_500Medium", fontSize: 12, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },

  sideTools: { position: "absolute", right: 8, gap: 14 },
  sideTool: { alignItems: "center", gap: 3 },
  sideCircle: { width: SIDE_CIRCLE_SIZE, height: SIDE_CIRCLE_SIZE, borderRadius: SIDE_CIRCLE_SIZE / 2, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.2)" },
  sideLabel: { color: "#fff", fontSize: 9.5, fontFamily: "Poppins_500Medium", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },

  timerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  timerNumber: { fontSize: 110, fontFamily: "Poppins_700Bold", color: "#fff", textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 8 },

  recIndicator: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },
  recTimer: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  recModeBadge: { color: "#FBBF24", fontSize: 10, fontFamily: "Poppins_700Bold" },
  recProgressTrack: { position: "absolute", left: 0, right: 0, height: 3, backgroundColor: "rgba(255,255,255,0.2)" },
  recProgressFill: { height: 3, backgroundColor: "#EF4444" },

  musicBadge: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  musicBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_500Medium", maxWidth: W * 0.55 },

  portraitBadge: { position: "absolute", top: 60, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(139,92,246,0.2)", borderWidth: 1, borderColor: "rgba(139,92,246,0.5)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  portraitBadgeText: { color: "#A78BFA", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  nightBadge: { position: "absolute", top: 60, right: 16, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(59,130,246,0.2)", borderWidth: 1, borderColor: "rgba(59,130,246,0.4)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  nightBadgeText: { color: "#60A5FA", fontSize: 11, fontFamily: "Poppins_600SemiBold" },

  bottomArea: { position: "absolute", bottom: 0, left: 0, right: 0 },
  durationRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 10 },
  durationPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  durationPillActive: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  durationText: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Poppins_500Medium" },
  durationTextActive: { color: "#fff", fontFamily: "Poppins_700Bold" },

  modeScroll: { paddingHorizontal: 16, gap: 6, marginBottom: 16, alignItems: "center" },
  modeTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)" },
  modeTabActive: { backgroundColor: "rgba(139,92,246,0.3)", borderWidth: 1, borderColor: "#8B5CF6" },
  modeTabText: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  modeTabTextActive: { color: "#fff", fontFamily: "Poppins_700Bold" },

  recordRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 28, marginBottom: 4 },
  sideAction: { alignItems: "center", gap: 5, width: 60 },
  sideActionCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  sideActionLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Poppins_500Medium" },

  recordWrap: { alignItems: "center", gap: 8 },
  recordRing: { position: "absolute", width: RECORD_RING_SIZE, height: RECORD_RING_SIZE, borderRadius: RECORD_RING_SIZE / 2, borderWidth: 3, borderColor: "rgba(255,255,255,0.7)" },
  recordBtn: { width: RECORD_BTN_SIZE, height: RECORD_BTN_SIZE, borderRadius: RECORD_BTN_SIZE / 2, overflow: "hidden", backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
  stopSquare: { width: 26, height: 26, borderRadius: 5, backgroundColor: "#fff" },
  btnIcon: { fontSize: 22 },
  recordHint: { color: "rgba(255,255,255,0.55)", fontSize: 10, fontFamily: "Poppins_400Regular", textAlign: "center" },

  modalBackdrop: { flex: 1 },
  textCard: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 14 },
  textCardTitle: { color: "#fff", fontSize: 16, fontFamily: "Poppins_700Bold" },
  textInput: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, fontSize: 16, fontFamily: "Poppins_500Medium", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", minHeight: 50 },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)" },
  colorDotActive: { borderColor: "#fff", borderWidth: 3 },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" },
});
