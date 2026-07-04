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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RAnimated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { GradientButton } from "@/components/GradientButton";
import { LoginPrompt } from "@/components/LoginPrompt";
import { MusicPickerSheet } from "@/components/MusicPickerSheet";
import { TrendingSoundsSheet, type TrendingSound } from "@/components/TrendingSoundsSheet";
import { StickerPickerModal } from "@/components/StickerPickerModal";
import { EffectsPickerSheet, FilterConfig, FILTERS, TimerValue } from "@/components/EffectsPickerSheet";
import { VideoEditorSheet } from "@/components/VideoEditorSheet";
import { BeautyPanel, BeautyOverlay, BeautySettings } from "@/components/camera/BeautyPanel";
import { CameraFilterStrip, FilterOverlay, CAMERA_FILTERS, CameraFilter } from "@/components/camera/CameraFilterStrip";
import PostPage from "@/components/camera/PostPage";
import { useAuth } from "@/context/AuthContext";
import { useCoupleStatus } from "@/context/CoupleContext";
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

interface TextOverlayItem { id: string; text: string; color: string; fontSize: number; x: number; y: number; }
interface StickerItem { id: string; emoji?: string; gifUrl?: string; x: number; y: number; }

const CONFETTI_COLORS = ["#7C3AED", "#F97316", "#EF4444", "#10B981", "#3B82F6", "#FBBF24", "#EC4899", "#A78BFA"];
const CONFETTI_COUNT = 28;

// ── Icon helper (replaces @expo/vector-icons Ionicons — font won't load with newArchEnabled) ──
const CAMERA_ICON_MAP: Record<string, string> = {
  "arrow-forward": "→",
  "add": "+",
  "remove": "−",
  "sunny": "☀",
  "sunny-outline": "○",
  "checkmark": "✓",
  "person-outline": "👤",
  "add-circle-outline": "⊕",
  "camera-outline": "📷",
  "aperture-outline": "◎",
  "moon": "🌙",
  "musical-notes": "♫",
  "musical-notes-outline": "♫",
  "close": "✕",
  "camera-reverse-outline": "🔄",
  "flash-off-outline": "⚡",
  "flash-outline": "⚡",
  "timer": "⏱",
  "timer-outline": "⏱",
  "grid-outline": "⊞",
  "color-filter-outline": "🎨",
  "color-wand-outline": "🪄",
  "text-outline": "T",
  "bulb-outline": "💡",
  "document-text-outline": "📄",
  "images-outline": "🖼",
  "sparkles": "✨",
};
function CI({ name, size, color }: { name: string; size: number; color: string }) {
  const label = CAMERA_ICON_MAP[name] ?? "•";
  return <Text style={{ fontSize: size * 0.85, color, lineHeight: size * 1.1, textAlign: "center" }}>{label}</Text>;
}

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
        <CI name="arrow-forward" size={24} color="rgba(255,255,255,0.6)" />
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
  const scale = useSharedValue(1.5);
  const opacity = useSharedValue(0);
  const focusStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  useEffect(() => {
    if (visible && point) {
      scale.value = 1.5; opacity.value = 1;
      scale.value = withSpring(1, { damping: 5, stiffness: 200 });
      opacity.value = withDelay(800, withTiming(0, { duration: 300 }));
    }
  }, [visible, point]);
  if (!point || !visible) return null;
  return (
    <RAnimated.View
      pointerEvents="none"
      style={[{
        position: "absolute",
        left: point.x - 30,
        top: point.y - 30,
        width: 60, height: 60,
        borderRadius: 30,
        borderWidth: 2,
        borderColor: "#FBBF24",
      }, focusStyle]}
    />
  );
}

// ── Zoom slider ──────────────────────────────────────────────────────────────
function ZoomSlider({ zoom, onChange }: { zoom: number; onChange: (v: number) => void }) {
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const startZoomRef = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startZoomRef.current = zoomRef.current; },
      onPanResponderMove: (_, gs) => {
        const TRACK_H = 180;
        const delta = -gs.dy / TRACK_H;
        onChange(Math.min(1, Math.max(0, startZoomRef.current + delta)));
      },
    })
  ).current;
  const label = zoom < 0.08 ? "1×" : zoom < 0.22 ? "2×" : zoom < 0.45 ? "3×" : zoom < 0.7 ? "5×" : "10×";
  return (
    <View style={zs.container}>
      <CI name="add" size={14} color="rgba(255,255,255,0.7)" />
      <View style={zs.track} {...panResponder.panHandlers}>
        <View style={[zs.fill, { height: `${zoom * 100}%` as any }]} />
        <View style={[zs.thumb, { bottom: `${zoom * 100}%` as any }]} />
      </View>
      <CI name="remove" size={14} color="rgba(255,255,255,0.7)" />
      <View style={zs.badge}>
        <Text style={zs.badgeText}>{label}</Text>
      </View>
    </View>
  );
}
const zs = StyleSheet.create({
  container: { position: "absolute", left: 12, top: "28%", bottom: "28%", alignItems: "center", gap: 8, width: 28 },
  track: { flex: 1, width: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, position: "relative" },
  fill: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#A78BFA", borderRadius: 2 },
  thumb: { position: "absolute", left: -6, width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff", borderWidth: 2, borderColor: "#A78BFA", marginBottom: -8 },
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
      <CI name="sunny" size={14} color="#FBBF24" />
      <View style={es.track}>
        <View style={[es.fill, { height: `${pct}%` as any }]} />
        {STEPS.map((v) => (
          <TouchableOpacity key={v} onPress={() => onChange(v)} style={[es.step, { bottom: `${((v + 1) / 2) * 100}%` as any }]}>
            <View style={[es.stepDot, value >= v && es.stepDotActive]} />
          </TouchableOpacity>
        ))}
      </View>
      <CI name="sunny-outline" size={10} color="rgba(255,255,255,0.5)" />
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

// ── Draggable text overlay ────────────────────────────────────────────────────
function DraggableTextOverlay({ item, onMove }: { item: TextOverlayItem; onMove: (id: string, x: number, y: number) => void }) {
  const translateX = useSharedValue(item.x);
  const translateY = useSharedValue(item.y);
  const startX = useSharedValue(item.x);
  const startY = useSharedValue(item.y);

  const overlayStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate(({ translationX, translationY }) => {
      translateX.value = Math.max(0, Math.min(W - 80, startX.value + translationX));
      translateY.value = Math.max(60, Math.min(H - 120, startY.value + translationY));
    })
    .onEnd(() => {
      runOnJS(onMove)(item.id, translateX.value, translateY.value);
    });

  return (
    <GestureDetector gesture={pan}>
      <RAnimated.View style={overlayStyle}>
        <Text style={{ color: item.color, fontSize: item.fontSize, fontFamily: "Poppins_600SemiBold", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 }}>
          {item.text}
        </Text>
      </RAnimated.View>
    </GestureDetector>
  );
}

// ── Confetti particle (pure Reanimated) ───────────────────────────────────────
type ConfettiConfig = { xTarget: number; duration: number; delay: number; color: string; size: number };

function ConfettiParticle({ index, startXPos, delay, duration, xTarget, color, size }: {
  index: number; startXPos: number; delay: number; duration: number; xTarget: number; color: string; size: number;
}) {
  const y = useSharedValue(-40);
  const x = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  const particleStyle = useAnimatedStyle(() => {
    const rotateDir = index % 2 === 0 ? 1 : -1;
    return {
      position: "absolute" as const,
      left: startXPos,
      top: H * 0.22,
      width: size,
      height: size * (index % 3 === 1 ? 2.2 : 1),
      borderRadius: index % 3 === 2 ? size / 2 : 2,
      backgroundColor: color,
      opacity: opacity.value,
      transform: [
        { translateY: y.value },
        { translateX: x.value },
        { rotate: `${rotate.value * 360 * 3 * rotateDir}deg` },
      ],
    };
  });

  useEffect(() => {
    y.value = -40; x.value = 0; rotate.value = 0; opacity.value = 1;
    y.value = withDelay(delay, withTiming(H * 0.85, { duration }));
    x.value = withDelay(delay, withTiming(xTarget, { duration }));
    rotate.value = withDelay(delay, withTiming(6, { duration }));
    opacity.value = withDelay(delay + duration * 0.6, withTiming(0, { duration: duration * 0.4 }));
  }, []);

  return <RAnimated.View style={particleStyle} />;
}

// ── Celebration modal ──────────────────────────────────────────────────────────
function CelebrationModal({ visible, onGoToProfile, onClose }: {
  visible: boolean; onGoToProfile: () => void; onClose: () => void;
}) {
  const cardScale = useSharedValue(0.5);
  const fadeIn = useSharedValue(0);
  const checkScale = useSharedValue(0);
  const fireScale = useSharedValue(1);
  const fireScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: fireScale.value }] }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fadeIn.value }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));
  const [countdown, setCountdown] = useState(5);
  const [confettiConfigs, setConfettiConfigs] = useState<ConfettiConfig[]>([]);

  useEffect(() => {
    if (!visible) {
      cardScale.value = 0.5; fadeIn.value = 0; checkScale.value = 0;
      fireScale.value = 1; setCountdown(5); setConfettiConfigs([]);
      return;
    }
    const configs: ConfettiConfig[] = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      xTarget: (Math.random() - 0.5) * W * 1.4,
      duration: 1400 + Math.random() * 800,
      delay: Math.random() * 400,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + (i % 3) * 4,
    }));
    setConfettiConfigs(configs);
    fadeIn.value = withTiming(1, { duration: 260 });
    cardScale.value = withSpring(1, { damping: 7, stiffness: 100 });
    checkScale.value = withDelay(180, withSpring(1, { damping: 5, stiffness: 120 }));
    fireScale.value = withRepeat(
      withSequence(withTiming(1.3, { duration: 500 }), withTiming(1, { duration: 500 })),
      -1, false
    );
    setCountdown(5);
    let n = 5;
    const tick = setInterval(() => { n--; setCountdown(n); if (n <= 0) { clearInterval(tick); onGoToProfile(); } }, 1000);
    return () => { cancelAnimation(fireScale); clearInterval(tick); };
  }, [visible]);

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none">
      <RAnimated.View style={[{ flex: 1, backgroundColor: "rgba(0,0,0,0.96)", alignItems: "center", justifyContent: "center" }, fadeStyle]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {confettiConfigs.map((cfg, i) => (
            <ConfettiParticle
              key={i}
              index={i}
              startXPos={(W / CONFETTI_COUNT) * i}
              delay={cfg.delay}
              duration={cfg.duration}
              xTarget={cfg.xTarget}
              color={cfg.color}
              size={cfg.size}
            />
          ))}
        </View>
        <RAnimated.View style={[{ alignItems: "center", paddingHorizontal: 32 }, cardStyle]}>
          <RAnimated.View style={[{ width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(16,185,129,0.18)", borderWidth: 2.5, borderColor: "#10B981", alignItems: "center", justifyContent: "center", marginBottom: 14 }, checkStyle]}>
            <CI name="checkmark" size={42} color="#10B981" />
          </RAnimated.View>
          <RAnimated.Text style={[{ fontSize: 52 }, fireScaleStyle]}>🔥</RAnimated.Text>
          <Text style={{ color: "#fff", fontSize: 26, fontFamily: "Poppins_700Bold", marginTop: 12, textAlign: "center", lineHeight: 34 }}>Posted!{"\n"}You're live on Gundruk!</Text>
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, fontFamily: "Poppins_400Regular", marginTop: 8 }}>Auto-closing in {countdown}s</Text>
          <View style={{ gap: 12, marginTop: 28, width: 270 }}>
            <TouchableOpacity onPress={onGoToProfile} style={{ borderRadius: 16, overflow: "hidden" }}>
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                <CI name="person-outline" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 }}>Go to Profile</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ paddingVertical: 14, alignItems: "center", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", flexDirection: "row", justifyContent: "center", gap: 8 }}>
              <CI name="add-circle-outline" size={18} color="rgba(255,255,255,0.85)" />
              <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>Post Another</Text>
            </TouchableOpacity>
          </View>
        </RAnimated.View>
      </RAnimated.View>
    </Modal>
  );
}

// ── Main create screen ────────────────────────────────────────────────────────
// ── Error boundary — camera crashes must never show pure black ────────────────
class CameraErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: "#080810", justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 10 }}>Camera failed to load</Text>
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, textAlign: "center", marginBottom: 28 }}>{this.state.error}</Text>
          <TouchableOpacity
            onPress={() => this.setState({ error: null })}
            style={{ backgroundColor: "#7C3AED", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 25 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function CreateScreenInner({ tabBarHeight = 0, onSetPagerEnabled }: { tabBarHeight?: number; onSetPagerEnabled?: (v: boolean) => void }) {
  const insets = useSafeAreaInsets();
  React.useEffect(() => { console.log("[CreateScreen] mounted"); }, []);
  const { session } = useAuth();
  const { isLinked: coupleIsLinked, coupleId: coupledId } = useCoupleStatus();
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
  const controlsOpacity = useSharedValue(1);
  const controlsStyle = useAnimatedStyle(() => ({ opacity: controlsOpacity.value }));

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
  const [isBoomerangProcessing, setIsBoomerangProcessing] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [capturedIsPhoto, setCapturedIsPhoto] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState("15s");
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [timerSecs, setTimerSecs] = useState<TimerValue>(0);
  const [timerCount, setTimerCount] = useState<number | null>(null);
  const timerScaleAnim = useSharedValue(1);
  const timerScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: timerScaleAnim.value }] }));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStartingRef = useRef(false);
  const recordPulse = useSharedValue(1);
  const recordRingStyle = useAnimatedStyle(() => ({ transform: [{ scale: recordPulse.value }] }));
  // Inner circle: animated size + radius for idle→recording transition
  const innerSize = useSharedValue(64);
  const innerRadius = useSharedValue(32);
  const innerAnimStyle = useAnimatedStyle(() => ({
    width: innerSize.value,
    height: innerSize.value,
    borderRadius: innerRadius.value,
  }));

  // ── Display toggles ────────────────────────────────────────────────────────
  const [showGrid, setShowGrid] = useState(false);
  const [showMirror, setShowMirror] = useState(false);

  // ── Beauty ────────────────────────────────────────────────────────────────
  const [showBeauty, setShowBeauty] = useState(false);
  const [beautySettings, setBeautySettings] = useState<BeautySettings>({ smooth: 0, brighten: 0, slim: 0 });

  // ── Filters ────────────────────────────────────────────────────────────────
  const [showFilterStrip, setShowFilterStrip] = useState(false);
  const [cameraFilter, setCameraFilter] = useState<CameraFilter>(CAMERA_FILTERS[0]);
  const [filterIntensity, setFilterIntensity] = useState(100);

  // ── Overlays / music / sounds ─────────────────────────────────────────────
  const [selectedMusic, setSelectedMusic] = useState<Track | null>(null);
  const [selectedSound, setSelectedSound] = useState<TrendingSound | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlayItem[]>([]);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [speed, setSpeed] = useState("normal");

  // ── Sheets ────────────────────────────────────────────────────────────────
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showSoundsPicker, setShowSoundsPicker] = useState(false);
  const [showEffectsPicker, setShowEffectsPicker] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [newTextColor, setNewTextColor] = useState("#ffffff");
  const [newTextSize, setNewTextSize] = useState<"small" | "medium" | "large">("medium");
  const [showAiTopicInput, setShowAiTopicInput] = useState(false);
  const [aiTopic, setAiTopic] = useState("");

  // ── Post / AI ─────────────────────────────────────────────────────────────
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [aiModal, setAiModal] = useState<{ type: "idea" | "script"; content: string[] } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // ── Collapsible tools menu ─────────────────────────────────────────────────
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsReveal = useSharedValue(0);
  const toolsContainerStyle = useAnimatedStyle(() => ({
    maxHeight: toolsReveal.value * 900,
    opacity: toolsReveal.value,
  }));

  // Safety timeout — if permission hooks never resolve on Android, unblock after 5s
  const [permTimeout, setPermTimeout] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPermTimeout(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const hasPermission = !!(camPermission?.granted && micPermission?.granted);
  const permissionsLoaded = permTimeout || (camPermission !== null && micPermission !== null);
  const needsPermission = permissionsLoaded && !hasPermission;

  const isVideoMode = CAPTURE_MODES.find((m) => m.key === captureMode)?.isVideo ?? false;

  // ── Fade controls during recording ────────────────────────────────────────
  useEffect(() => {
    controlsOpacity.value = withTiming(recording ? 0 : 1, { duration: 220 });
  }, [recording]);

  // ── Night mode: auto-boost exposure ────────────────────────────────────────
  useEffect(() => {
    if (captureMode === "Night") {
      setExposureValue(0.75);
      setShowExposure(true);
    } else {
      setExposureValue(0);
      setShowExposure(false);
    }
  }, [captureMode]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    };
  }, []);

  // Disable the outer Reels↔Post page-swipe while the filter strip is open so
  // the strip's own horizontal ScrollView wins the gesture on both iOS and Android.
  useEffect(() => {
    onSetPagerEnabled?.(!showFilterStrip);
  }, [showFilterStrip]);

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
        timerScaleAnim.value = 1.6;
        timerScaleAnim.value = withTiming(1, { duration: 750 });
        if (remaining <= 0) { setTimerCount(null); resolve(); }
        else { setTimerCount(remaining); timerRef.current = setTimeout(tick, 1000); }
      };
      timerScaleAnim.value = 1.6;
      timerScaleAnim.value = withTiming(1, { duration: 750 });
      timerRef.current = setTimeout(tick, 1000);
    });
  }, [timerSecs, timerScaleAnim]);

  // ── Record pulse ──────────────────────────────────────────────────────────
  const startPulse = useCallback(() => {
    recordPulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 600 }),
        withTiming(1, { duration: 600 })
      ),
      -1,
      false
    );
    // Animate inner circle → recording square
    innerSize.value = withSpring(28, { damping: 14, stiffness: 180 });
    innerRadius.value = withSpring(8, { damping: 14, stiffness: 180 });
  }, []);

  const stopPulse = useCallback(() => {
    cancelAnimation(recordPulse);
    recordPulse.value = withTiming(1, { duration: 150 });
    // Restore inner circle
    innerSize.value = withSpring(64, { damping: 14, stiffness: 180 });
    innerRadius.value = withSpring(32, { damping: 14, stiffness: 180 });
  }, []);

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
          cameraRef.current?.stopRecording();
          return prev;
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

  // ── Boomerang recording: 2.5 s, auto-stop ─────────────────────────────────
  const recordBoomerang = useCallback(async () => {
    if (recording || isStartingRef.current) return;
    isStartingRef.current = true;
    setRecording(true);
    setRecordingElapsed(0);
    startPulse();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    isStartingRef.current = false;
    const autoStop = setTimeout(() => { cameraRef.current?.stopRecording(); }, 2500);
    recordTimerRef.current = setInterval(() => {
      setRecordingElapsed((prev) => prev + 1);
    }, 1000);
    try {
      const result = await cameraRef.current?.recordAsync({ maxDuration: 3 });
      clearTimeout(autoStop);
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
      setRecording(false); setRecordingElapsed(0); stopPulse();
      if (result?.uri) {
        setIsBoomerangProcessing(true);
        await new Promise((res) => setTimeout(res, 700));
        setIsBoomerangProcessing(false);
        setCapturedIsPhoto(false);
        setRecordedUri(result.uri);
      }
    } catch {
      clearTimeout(autoStop);
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
      setRecording(false); setRecordingElapsed(0); stopPulse();
    }
  }, [recording, startPulse, stopPulse]);

  const HOLD_THRESHOLD = 280;

  const onRecordPressIn = useCallback(() => {
    if (!isLoggedIn) { setShowLoginPrompt(true); return; }
    if (recording) return; // tapping to stop — let onPressOut handle it
    pressStartRef.current = Date.now();
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (captureMode === "Boomerang") { recordBoomerang(); }
      else { startVideoRecording(); }
    }, HOLD_THRESHOLD);
  }, [isLoggedIn, recording, captureMode, startVideoRecording, recordBoomerang]);

  const onRecordPressOut = useCallback(async () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current); holdTimerRef.current = null;
      if (!recording && !isStartingRef.current) {
        if (captureMode === "Boomerang") { recordBoomerang(); }
        else if (isVideoMode) { startVideoRecording(); }
        else { await takePhoto(); }
      }
    } else if (recording || isStartingRef.current) {
      stopVideoRecording();
    }
    pressStartRef.current = null;
  }, [recording, captureMode, takePhoto, stopVideoRecording, startVideoRecording, recordBoomerang, isVideoMode]);

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
    const fs = newTextSize === "small" ? 14 : newTextSize === "large" ? 28 : 18;
    setTextOverlays((prev) => [...prev, { id: Date.now().toString(), text: newText.trim(), color: newTextColor, fontSize: fs, x: 60, y: 100 + prev.length * 56 }]);
    setNewText(""); setShowTextModal(false);
  };

  const moveTextOverlay = (id: string, x: number, y: number) => {
    setTextOverlays((prev) => prev.map((t) => t.id === id ? { ...t, x, y } : t));
  };

  const addSticker = (emoji?: string, gifUrl?: string) => {
    setStickers((prev) => [...prev, { id: Date.now().toString(), emoji, gifUrl, x: 60 + Math.random() * 80, y: 60 + Math.random() * 120 }]);
    setShowStickerModal(false);
  };

  // Flash only works on back camera; front camera has no torch hardware
  const cycleFlash = () => {
    if (facing !== "back") return;
    setFlashMode((f) => f === "off" ? "on" : f === "on" ? "auto" : "off");
  };
  const flashActive = flashMode !== "off" && facing === "back";
  const flashColor = !flashActive ? (facing === "front" ? "rgba(255,255,255,0.25)" : "#fff") : flashMode === "on" ? "#EAB308" : "#60A5FA";
  const flashIcon = flashMode === "off" ? "flash-off-outline" : "flash-outline";

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
        <CI name="camera-outline" size={48} color="rgba(255,255,255,0.3)" />
        <Text style={s.permTitle}>Loading camera…</Text>
      </View>
    );
  }

  if (needsPermission) {
    return (
      <View style={s.permBg}>
        <StatusBar style="light" />
        <LinearGradient colors={["#7C3AED22", "#EA580C11"]} style={s.permIconBg}>
          <CI name="camera-outline" size={52} color="#7C3AED" />
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
            enableTorch={flashMode === "on" && facing === "back"}
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
              <CI name="aperture-outline" size={13} color="#A78BFA" />
              <Text style={s.portraitBadgeText}>Portrait · Depth Effect</Text>
            </View>
          </View>
        )}

        {/* ── NIGHT MODE HINT ── */}
        {isNight && (
          <View style={s.nightBadge} pointerEvents="none">
            <CI name="moon" size={12} color="#60A5FA" />
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
            <RAnimated.Text style={[s.timerNumber, timerScaleStyle]}>
              {timerCount}
            </RAnimated.Text>
          </View>
        )}

        {/* ── RECORDING INDICATOR ── */}
        {recording && (
          <View style={[s.recIndicator, { top: tabBarHeight + 10 }]} pointerEvents="none">
            <View style={s.recDot} />
            <Text style={s.recTimer}>{Math.floor(recordingElapsed / 60)}:{String(recordingElapsed % 60).padStart(2, "0")}</Text>
            {isBoomerang && <Text style={s.recModeBadge}>⏩ BOM</Text>}
            {isSlowMo && <Text style={s.recModeBadge}>⚡ SLOW</Text>}
          </View>
        )}

        {/* ── BOOMERANG PROCESSING ── */}
        {isBoomerangProcessing && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)" }}>
              <ActivityIndicator size="large" color="#A78BFA" />
              <Text style={{ color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15, marginTop: 12 }}>⏩ Creating Boomerang…</Text>
            </View>
          </View>
        )}

        {/* ── RECORDING PROGRESS BAR ── */}
        {recording && (
          <View style={[s.recProgressTrack, { top: tabBarHeight + 38 }]} pointerEvents="none">
            <View style={[s.recProgressFill, { width: `${recordProgress * 100}%` as any }]} />
          </View>
        )}

        {/* ── MUSIC BADGE ── */}
        {selectedMusic && (
          <View style={[s.musicBadge, { top: tabBarHeight + (recording ? 52 : 10) }]} pointerEvents="none">
            <CI name="musical-notes" size={11} color="#fff" />
            <Text style={s.musicBadgeText} numberOfLines={1}>{selectedMusic.title} · {selectedMusic.artist}</Text>
          </View>
        )}
        {!selectedMusic && selectedSound && (
          <View style={[s.musicBadge, s.soundBadge, { top: tabBarHeight + (recording ? 52 : 10) }]} pointerEvents="none">
            <CI name="radio-outline" size={11} color="#fff" />
            <Text style={s.musicBadgeText} numberOfLines={1}>🎵 {selectedSound.title} · @{selectedSound.username}</Text>
          </View>
        )}

        {/* ── TEXT OVERLAYS (draggable) ── */}
        {textOverlays.map((t) => (
          <DraggableTextOverlay key={t.id} item={t} onMove={moveTextOverlay} />
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
        <RAnimated.View style={controlsStyle} pointerEvents={recording ? "none" : "box-none"}>
          <ZoomSlider zoom={zoom} onChange={setZoom} />
        </RAnimated.View>

        {/* ── EXPOSURE SLIDER (right, after focus) ── */}
        <RAnimated.View style={controlsStyle} pointerEvents={recording ? "none" : "box-none"}>
          <ExposureSlider value={exposureValue} onChange={setExposureValue} visible={showExposure} />
        </RAnimated.View>

        {/* ── TOP BAR ── */}
        <View style={[s.topBar, { paddingTop: tabBarHeight + 8 }]}>
          <TouchableOpacity style={s.topBtn} onPress={() => router.back()}>
            <CI name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={s.topCenter}>
            {isNight && <Text style={s.modeHint}>Night mode active</Text>}
            {isSlowMo && <Text style={s.modeHint}>0.5× slow motion</Text>}
            {isBoomerang && <Text style={s.modeHint}>Tap to record boomerang</Text>}
          </View>
          <View style={s.topRight}>
            {/* Zoom tap shortcut: 1× → 2× → 3× → 1× */}
            <TouchableOpacity style={s.topPill} onPress={() => {
              if (zoom < 0.08) setZoom(0.14);
              else if (zoom < 0.22) setZoom(0.32);
              else setZoom(0);
            }}>
              <Text style={s.topPillText}>
                {zoom < 0.08 ? "1×" : zoom < 0.22 ? "2×" : "3×"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── RIGHT SIDE TOOLS (collapsible — tap ⋯ to expand) ── */}
        <RAnimated.View
          style={[s.sideTools, { top: tabBarHeight + 48 }, controlsStyle]}
          pointerEvents={recording ? "none" : "box-none"}
        >
          {/* Always-visible toggle button */}
          <TouchableOpacity
            style={s.sideTool}
            onPress={() => {
              const next = !toolsOpen;
              setToolsOpen(next);
              toolsReveal.value = withTiming(next ? 1 : 0, { duration: 260 });
            }}
          >
            <View style={[s.sideCircle, toolsOpen && { backgroundColor: "rgba(124,58,237,0.45)", borderColor: "rgba(124,58,237,0.6)" }]}>
              <Text style={{ color: "#fff", fontSize: 19, lineHeight: 22, textAlign: "center" }}>
                {toolsOpen ? "✕" : "⋯"}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Collapsible tool list — slides open below the toggle */}
          <RAnimated.View style={[s.toolsCollapse, toolsContainerStyle]} pointerEvents={toolsOpen ? "box-none" : "none"}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              style={{ maxHeight: H * 0.58 }}
              contentContainerStyle={{ gap: 14, paddingTop: 14, paddingBottom: 8, alignItems: "center" }}
            >
              <TouchableOpacity
                style={s.sideTool}
                onPress={facing === "back" ? cycleFlash : undefined}
                activeOpacity={facing === "back" ? 0.7 : 1}
              >
                <View style={[s.sideCircle, flashActive && { backgroundColor: "#EAB30830" }]}>
                  <CI name={flashIcon} size={22} color={flashColor} />
                </View>
                <Text style={[s.sideLabel, { color: flashColor }]}>
                  {facing === "front" ? "Flash" : flashMode === "off" ? "Flash" : flashMode === "on" ? "Torch" : "Auto"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.sideTool} onPress={() => { const opts: TimerValue[] = [0, 3, 5, 10]; setTimerSecs((t) => opts[(opts.indexOf(t) + 1) % opts.length]); }}>
                <View style={[s.sideCircle, timerSecs > 0 && { backgroundColor: "#7C3AED30" }]}>
                  <CI name={timerSecs > 0 ? "timer" : "timer-outline"} size={22} color={timerSecs > 0 ? "#A78BFA" : "#fff"} />
                </View>
                <Text style={[s.sideLabel, timerSecs > 0 && { color: "#A78BFA" }]}>{timerSecs > 0 ? `${timerSecs}s` : "Timer"}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.sideTool} onPress={() => setShowGrid((v) => !v)}>
                <View style={[s.sideCircle, showGrid && { backgroundColor: "#7C3AED30" }]}>
                  <CI name="grid-outline" size={22} color={showGrid ? "#A78BFA" : "#fff"} />
                </View>
                <Text style={[s.sideLabel, showGrid && { color: "#A78BFA" }]}>Grid</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.sideTool} onPress={() => { setShowFilterStrip((v) => !v); setShowBeauty(false); }}>
                <View style={[s.sideCircle, showFilterStrip && { backgroundColor: "#EC489930" }]}>
                  <CI name="color-filter-outline" size={22} color={showFilterStrip ? "#EC4899" : cameraFilter.id !== "none" ? "#EC4899" : "#fff"} />
                </View>
                <Text style={[s.sideLabel, (showFilterStrip || cameraFilter.id !== "none") && { color: "#EC4899" }]}>Filter</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.sideTool} onPress={() => { setShowBeauty((v) => !v); setShowFilterStrip(false); }}>
                <View style={[s.sideCircle, showBeauty && { backgroundColor: "#EC489930" }]}>
                  <CI name="color-wand-outline" size={22} color={showBeauty ? "#EC4899" : "#fff"} />
                </View>
                <Text style={s.sideLabel}>Beauty</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.sideTool} onPress={() => setShowMusicPicker(true)}>
                <View style={[s.sideCircle, selectedMusic && { backgroundColor: "#7C3AED30" }]}>
                  <CI name="musical-notes-outline" size={22} color={selectedMusic ? "#A78BFA" : "#fff"} />
                </View>
                <Text style={[s.sideLabel, selectedMusic && { color: "#A78BFA" }]}>Music</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.sideTool} onPress={() => setShowSoundsPicker(true)}>
                <View style={[s.sideCircle, selectedSound && { backgroundColor: "#06B6D430" }]}>
                  <CI name="radio-outline" size={22} color={selectedSound ? "#06B6D4" : "#fff"} />
                  {selectedSound && <View style={s.soundDot} />}
                </View>
                <Text style={[s.sideLabel, selectedSound && { color: "#06B6D4" }]}>Sounds</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.sideTool} onPress={() => setShowTextModal(true)}>
                <View style={s.sideCircle}><CI name="text-outline" size={22} color="#fff" /></View>
                <Text style={s.sideLabel}>Text</Text>
              </TouchableOpacity>

              {captureMode === "Photo" || captureMode === "Portrait" || captureMode === "Night" ? (
                <TouchableOpacity style={s.sideTool} disabled={aiLoading} onPress={() => { setAiTopic(""); setShowAiTopicInput(true); }}>
                  <View style={[s.sideCircle, { backgroundColor: "rgba(124,58,237,0.35)" }]}>
                    {aiLoading ? <ActivityIndicator size="small" color="#A78BFA" /> : <CI name="bulb-outline" size={22} color="#A78BFA" />}
                  </View>
                  <Text style={[s.sideLabel, { color: "#A78BFA" }]}>AI Idea</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={s.sideTool} disabled={aiLoading} onPress={() => { setAiTopic(""); setShowAiTopicInput(true); }}>
                  <View style={[s.sideCircle, { backgroundColor: "rgba(124,58,237,0.35)" }]}>
                    {aiLoading ? <ActivityIndicator size="small" color="#A78BFA" /> : <CI name="document-text-outline" size={22} color="#A78BFA" />}
                  </View>
                  <Text style={[s.sideLabel, { color: "#A78BFA" }]}>AI Script</Text>
                </TouchableOpacity>
              )}

            </ScrollView>
          </RAnimated.View>
        </RAnimated.View>

        {/* ── FILTER STRIP ── */}
        <RAnimated.View style={[StyleSheet.absoluteFill, controlsStyle, { zIndex: 100 }]} pointerEvents="box-none">
          <CameraFilterStrip
            visible={showFilterStrip}
            activeFilter={cameraFilter.id}
            intensity={filterIntensity}
            onFilterChange={setCameraFilter}
            onIntensityChange={setFilterIntensity}
          />
        </RAnimated.View>

        {/* ── BEAUTY PANEL ── */}
        <BeautyPanel
          visible={showBeauty}
          settings={beautySettings}
          onChange={(key, val) => setBeautySettings((prev) => ({ ...prev, [key]: val }))}
          onClose={() => setShowBeauty(false)}
          bottomOffset={insets.bottom + 210}
        />

        {/* ── BOTTOM AREA ── */}
        <View style={[s.bottomArea, { paddingBottom: insets.bottom + 8 }]}>

          {/* Duration pills — video modes only */}
          {isVideoMode && (
            <RAnimated.View
              style={[s.durationRow, controlsStyle, (showFilterStrip || showBeauty) && s.panelHidden]}
              pointerEvents={recording || showFilterStrip || showBeauty ? "none" : "box-none"}
            >
              {DURATIONS.map((d) => (
                <TouchableOpacity key={d} onPress={() => setSelectedDuration(d)} style={[s.durationPill, selectedDuration === d && s.durationPillActive]}>
                  <Text style={[s.durationText, selectedDuration === d && s.durationTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </RAnimated.View>
          )}

          {/* Mode selector — horizontal scroll */}
          <RAnimated.View
            style={[controlsStyle, (showFilterStrip || showBeauty) && s.panelHidden]}
            pointerEvents={recording || showFilterStrip || showBeauty ? "none" : "box-none"}
          >
            {/* Intercept touches here so the outer Reels↔Post pager doesn't steal them */}
            <View
              onTouchStart={() => onSetPagerEnabled?.(false)}
              onTouchEnd={() => onSetPagerEnabled?.(true)}
              onTouchCancel={() => onSetPagerEnabled?.(true)}
            >
              <ScrollView
                ref={modeScrollRef}
                horizontal
                nestedScrollEnabled
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
            </View>
          </RAnimated.View>

          {/* Record row */}
          <View style={s.recordRow}>
            {/* Gallery */}
            <RAnimated.View style={controlsStyle}>
              <TouchableOpacity onPress={pickFromGallery} style={s.sideAction} disabled={recording}>
                <View style={s.sideActionCircle}>
                  <CI name="images-outline" size={26} color="#fff" />
                </View>
                <Text style={s.sideActionLabel}>Gallery</Text>
              </TouchableOpacity>
            </RAnimated.View>

            {/* Capture button */}
            <View style={s.recordWrap}>
              {/* Outer ring — pure visual, absolute */}
              <RAnimated.View style={[s.recordRing, recordRingStyle]} pointerEvents="none" />
              {/* Pressable covers the full ring for easy tapping */}
              <Pressable
                onPressIn={onRecordPressIn}
                onPressOut={onRecordPressOut}
                disabled={timerCount !== null}
                style={s.recordBtn}
              >
                {/* Animated inner circle (idle) → square (recording) */}
                <RAnimated.View
                  style={[
                    s.recordBtnInner,
                    innerAnimStyle,
                    { backgroundColor: isVideoMode ? "#FF3B30" : "#ffffff" },
                  ]}
                />
                {/* Mode icons sit above the inner circle */}
                {!recording && captureMode === "Boomerang" && <Text style={s.btnIcon}>⏩</Text>}
                {!recording && captureMode === "SlowMo" && <Text style={s.btnIcon}>⚡</Text>}
                {!recording && captureMode === "Panorama" && <Text style={s.btnIcon}>📐</Text>}
              </Pressable>
              {/* Hint — video modes only; photo mode needs no explanation */}
              {isVideoMode && (
                <RAnimated.Text style={[s.recordHint, controlsStyle]}>
                  {isBoomerang ? "Tap · 2.5 s boomerang" : "Tap · start   Tap · stop"}
                </RAnimated.Text>
              )}
            </View>

            {/* Flip */}
            <RAnimated.View style={controlsStyle}>
              <TouchableOpacity onPress={() => setFacing((f) => f === "back" ? "front" : "back")} style={s.sideAction} disabled={recording}>
                <View style={s.sideActionCircle}>
                  <CI name="camera-reverse-outline" size={26} color="#fff" />
                </View>
                <Text style={s.sideActionLabel}>Flip</Text>
              </TouchableOpacity>
            </RAnimated.View>
          </View>
        </View>

        {/* ── TEXT MODAL ── */}
        <Modal visible={showTextModal} transparent animationType="slide" onRequestClose={() => setShowTextModal(false)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowTextModal(false)} />
          <View style={s.textCard}>
            <Text style={s.textCardTitle}>Add Text</Text>
            <TextInput value={newText} onChangeText={setNewText} placeholder="Type something…" placeholderTextColor="rgba(255,255,255,0.35)" autoFocus maxLength={60} style={[s.textInput, { color: newTextColor, fontSize: newTextSize === "small" ? 14 : newTextSize === "large" ? 28 : 18 }]} />
            {/* Font size */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["small", "medium", "large"] as const).map((sz) => (
                <TouchableOpacity key={sz} onPress={() => setNewTextSize(sz)} style={[s.sizePill, newTextSize === sz && s.sizePillActive]}>
                  <Text style={[s.sizePillText, { fontSize: sz === "small" ? 12 : sz === "medium" ? 16 : 22 }, newTextSize === sz && { color: "#fff" }]}>A</Text>
                </TouchableOpacity>
              ))}
              <Text style={{ color: "rgba(255,255,255,0.3)", fontFamily: "Poppins_400Regular", fontSize: 12, alignSelf: "center", marginLeft: 4 }}>Size</Text>
            </View>
            {/* Colors */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {TEXT_COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setNewTextColor(c)} style={[s.colorDot, { backgroundColor: c }, newTextColor === c && s.colorDotActive]} />
              ))}
            </ScrollView>
            <Text style={{ color: "rgba(255,255,255,0.3)", fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: -4 }}>Drag the text anywhere on screen after adding</Text>
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
        <TrendingSoundsSheet visible={showSoundsPicker} onClose={() => setShowSoundsPicker(false)} onSelect={setSelectedSound} selectedSound={selectedSound} />
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
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]}>
          <VideoEditorSheet
            uri={recordedUri}
            isPhoto={capturedIsPhoto}
            initialMusic={selectedMusic}
            initialFilter={{ id: cameraFilter.id, label: cameraFilter.label, color: cameraFilter.blendColor, opacity: cameraFilter.blendOpacity, blendHex: cameraFilter.blendColor }}
            textOverlays={textOverlays}
            stickers={stickers}
            coupleIsLinked={coupleIsLinked}
            coupledId={coupledId}
            onDiscard={() => { setRecordedUri(null); setTextOverlays([]); setStickers([]); }}
            onPost={async (data) => {
              const uri = recordedUri;
              const wasPhoto = capturedIsPhoto;
              // Map VideoEditorSheet audience labels → DB visibility values
              const audienceToVisibility = (aud?: string): "public" | "friends" | "private" => {
                if (!aud) return "public";
                const a = aud.toLowerCase();
                if (a === "only me") return "private";
                if (a === "friends" || a === "close friends" || a === "followers") return "friends";
                return "public";
              };
              const visibility = audienceToVisibility((data as any).audience);
              try {
                if (uri && session?.user?.id) {
                  if (wasPhoto || !isVideoMode) {
                    await uploadPostMedia(session.user.id, uri, data.caption ?? "", {
                      location: data.location,
                      taggedUsers: data.taggedUsers,
                      commentsEnabled: data.commentsEnabled,
                      downloadsEnabled: data.downloadsEnabled,
                      visibility,
                      category: (data as any).category,
                      coupleId: data.coupleId,
                      isCouplePost: data.isCouplePost,
                    });
                  } else {
                    await uploadReelMedia(session.user.id, uri, data.caption ?? "", undefined, visibility, selectedSound?.postId ?? null, selectedSound?.username ?? null, { coupleId: data.coupleId, isCouplePost: data.isCouplePost });
                  }
                }
                setRecordedUri(null); setTextOverlays([]); setStickers([]); setSelectedMusic(null); setSelectedSound(null);
                setShowCelebration(true);
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Unknown error";
                Alert.alert("Post failed", msg);
              }
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

      {/* ── AI TOPIC INPUT MODAL ── */}
      <Modal visible={showAiTopicInput} transparent animationType="slide" onRequestClose={() => setShowAiTopicInput(false)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowAiTopicInput(false)} />
        <View style={s.textCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <CI name="sparkles" size={18} color="#A78BFA" />
            <Text style={s.textCardTitle}>{captureMode === "Photo" || captureMode === "Portrait" || captureMode === "Night" ? "Story Idea Topic" : "Reel Script Topic"}</Text>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, marginBottom: 8 }}>
            {captureMode === "Video" || captureMode === "SlowMo" || captureMode === "Boomerang"
              ? "What's your reel about? Claude will write 4-5 punchy lines."
              : "What kind of story do you want to tell?"}
          </Text>
          <TextInput
            value={aiTopic}
            onChangeText={setAiTopic}
            placeholder="e.g. morning skincare routine, travel in Japan…"
            placeholderTextColor="rgba(255,255,255,0.25)"
            autoFocus
            maxLength={120}
            style={[s.textInput, { color: "#fff" }]}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
            <TouchableOpacity onPress={() => setShowAiTopicInput(false)} style={s.cancelBtn}>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_600SemiBold", fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={aiLoading}
              onPress={async () => {
                const topic = aiTopic.trim() || "my content";
                setShowAiTopicInput(false);
                setAiLoading(true);
                const isIdea = captureMode === "Photo" || captureMode === "Portrait" || captureMode === "Night";
                const result = await callAI(isIdea ? "story_idea" : "reel_script", { topic, duration: selectedDuration });
                setAiLoading(false);
                if (isIdea) {
                  const parsed = parseAIJson<{ ideas?: string[] }>(result, {});
                  if (parsed.ideas) setAiModal({ type: "idea", content: parsed.ideas });
                } else {
                  const parsed = parseAIJson<{ script?: string[] }>(result, {});
                  if (parsed.script) setAiModal({ type: "script", content: parsed.script });
                }
              }}
              style={{ flex: 2, borderRadius: 12, overflow: "hidden", opacity: aiLoading ? 0.6 : 1 }}
            >
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center" }}>
                {aiLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" }}>✨ Generate</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {aiModal && (
        <Modal transparent animationType="slide" onRequestClose={() => setAiModal(null)}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" }}>
            <View style={{ backgroundColor: "#0F0F1A", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 }}>
              <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16, marginBottom: 4 }}>
                {aiModal.type === "idea" ? "✨ Story Ideas" : "✨ Reel Script"}
              </Text>
              {aiModal.type === "script" && (
                <Text style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, marginBottom: 14 }}>
                  Read each line while recording — tap a line to use it as text overlay
                </Text>
              )}
              {aiModal.content.map((item, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    if (aiModal.type === "script") {
                      const fs = 18;
                      setTextOverlays((prev) => [...prev, { id: Date.now().toString() + i, text: item, color: "#ffffff", fontSize: fs, x: 60, y: 100 + i * 60 }]);
                    }
                    setAiModal(null);
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(124,58,237,0.15)", borderWidth: 1, borderColor: "rgba(124,58,237,0.3)", marginBottom: 10 }}
                >
                  <Text style={{ color: "#fff", fontFamily: aiModal.type === "script" ? "Poppins_600SemiBold" : "Poppins_400Regular", fontSize: aiModal.type === "script" ? 15 : 14, lineHeight: 22 }}>
                    {aiModal.type === "script" ? `${i + 1}. ` : ""}{item}
                  </Text>
                  {aiModal.type === "script" && (
                    <Text style={{ color: "rgba(167,139,250,0.6)", fontFamily: "Poppins_400Regular", fontSize: 10, marginTop: 4 }}>Tap to add as text overlay</Text>
                  )}
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
const RECORD_RING_SIZE = 80;
const RECORD_BTN_SIZE = RECORD_RING_SIZE; // pressable matches ring for full hit-target coverage

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

  sideTools: { position: "absolute", right: 8, alignItems: "center" },
  sideTool: { alignItems: "center", gap: 3 },
  sideCircle: { width: SIDE_CIRCLE_SIZE, height: SIDE_CIRCLE_SIZE, borderRadius: SIDE_CIRCLE_SIZE / 2, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.2)" },
  sideLabel: { color: "#fff", fontSize: 9.5, fontFamily: "Poppins_500Medium", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  toolsCollapse: { overflow: "hidden", alignItems: "center" },

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
  soundBadge: { backgroundColor: "rgba(6,182,212,0.25)", borderWidth: 1, borderColor: "rgba(6,182,212,0.5)" },
  soundDot: { position: "absolute", top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: "#06B6D4", borderWidth: 1.5, borderColor: "#000" },

  portraitBadge: { position: "absolute", top: 60, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(139,92,246,0.2)", borderWidth: 1, borderColor: "rgba(139,92,246,0.5)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  portraitBadgeText: { color: "#A78BFA", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  nightBadge: { position: "absolute", top: 60, right: 16, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(59,130,246,0.2)", borderWidth: 1, borderColor: "rgba(59,130,246,0.4)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  nightBadgeText: { color: "#60A5FA", fontSize: 11, fontFamily: "Poppins_600SemiBold" },

  bottomArea: { position: "absolute", bottom: 0, left: 0, right: 0 },
  panelHidden: { opacity: 0 },
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

  recordWrap: { alignItems: "center", gap: 18 },
  recordRing: { position: "absolute", width: RECORD_RING_SIZE, height: RECORD_RING_SIZE, borderRadius: RECORD_RING_SIZE / 2, borderWidth: 4, borderColor: "#ffffff" },
  recordBtn: { width: RECORD_BTN_SIZE, height: RECORD_BTN_SIZE, alignItems: "center", justifyContent: "center" },
  recordBtnInner: { position: "absolute" },
  btnIcon: { fontSize: 22 },
  recordHint: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Poppins_400Regular", textAlign: "center" },

  modalBackdrop: { flex: 1 },
  textCard: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 14 },
  textCardTitle: { color: "#fff", fontSize: 16, fontFamily: "Poppins_700Bold" },
  textInput: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, fontSize: 16, fontFamily: "Poppins_500Medium", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", minHeight: 50 },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)" },
  colorDotActive: { borderColor: "#fff", borderWidth: 3 },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" },

  sizePill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", minWidth: 44 },
  sizePillActive: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  sizePillText: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_700Bold" },
});

// ── Reels page (existing camera flow wrapped in error boundary) ────────────────
function ReelsPage({ tabBarHeight, onSetPagerEnabled }: { tabBarHeight: number; onSetPagerEnabled?: (v: boolean) => void }) {
  return (
    <CameraErrorBoundary>
      <CreateScreenInner tabBarHeight={tabBarHeight} onSetPagerEnabled={onSetPagerEnabled} />
    </CameraErrorBoundary>
  );
}

// ── Tab container constants ────────────────────────────────────────────────────
const TAB_BAR_HEIGHT = 44;

// ── Segmented tab styles ───────────────────────────────────────────────────────
const ts = StyleSheet.create({
  tabWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
    height: 36,
  },
  tab: {
    paddingHorizontal: 22,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  tabActive: { backgroundColor: "rgba(124,58,237,0.45)" },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginVertical: 7,
  },
  tabText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  tabTextActive: { color: "#fff" },
});

// ── Root CreateScreen — swipeable tab container ────────────────────────────────
export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [activeTab, setActiveTab] = useState(0);
  // Disabled while the user is touching the mode-selector row inside ReelsPage,
  // so the inner touch events don't get stolen by this outer pagingEnabled ScrollView.
  const [pagerEnabled, setPagerEnabled] = useState(true);

  const tabBarTop = insets.top + 6;
  const reelsTabBarHeight = insets.top + TAB_BAR_HEIGHT;

  const scrollTo = (idx: number) => {
    scrollRef.current?.scrollTo({ x: idx * W, animated: true });
    setActiveTab(idx);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Horizontal pager — fills full screen */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={pagerEnabled}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        bounces={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / W);
          setActiveTab(idx);
          // Always re-enable pager after a page change
          setPagerEnabled(true);
        }}
        style={StyleSheet.absoluteFill}
      >
        {/* Page 0 — Post */}
        <View style={{ width: W, height: H }}>
          <PostPage topInset={reelsTabBarHeight} bottomInset={insets.bottom} isActive={activeTab === 0} />
        </View>
        {/* Page 1 — Reels */}
        <View style={{ width: W, height: H }}>
          <ReelsPage tabBarHeight={reelsTabBarHeight} onSetPagerEnabled={setPagerEnabled} />
        </View>
      </ScrollView>

      {/* Floating "Post | Reels" indicator — overlays both pages */}
      <View
        style={[ts.tabWrap, { top: tabBarTop }]}
        pointerEvents="box-none"
      >
        <View style={ts.tabBar} pointerEvents="auto">
          <TouchableOpacity
            onPress={() => scrollTo(0)}
            style={[ts.tab, activeTab === 0 && ts.tabActive]}
          >
            <Text style={[ts.tabText, activeTab === 0 && ts.tabTextActive]}>
              📸 Post
            </Text>
          </TouchableOpacity>
          <View style={ts.divider} />
          <TouchableOpacity
            onPress={() => scrollTo(1)}
            style={[ts.tab, activeTab === 1 && ts.tabActive]}
          >
            <Text style={[ts.tabText, activeTab === 1 && ts.tabTextActive]}>
              🎬 Reels
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
