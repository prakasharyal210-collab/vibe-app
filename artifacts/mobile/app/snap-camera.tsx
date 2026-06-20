import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Pressable,
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
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import type { SnapConversation } from "@/lib/db";
import { fetchConversations, fetchSnapConversations } from "@/lib/db";
import { sendSnapMessage, uploadSnapToStorage } from "@/lib/snap";
import type { Conversation } from "@/lib/supabase";

const { width: W, height: H } = Dimensions.get("window");
const MAX_VIDEO_SECS = 15;
const HOLD_THRESHOLD_MS = 280;

type Phase = "camera" | "preview" | "send";
type EditorMode = "idle" | "draw" | "caption-input";
type CaptionSize = "sm" | "md" | "lg";

// Colors available for both draw and caption
const SNAP_COLORS = ["#FFFFFF", "#1A1A1A", "#EF4444", "#EAB308", "#7C3AED"];
const CAPTION_FONT_SIZES: Record<CaptionSize, number> = { sm: 18, md: 26, lg: 36 };

// Build an SVG Path "d" attribute from an array of points
function buildPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
}

const LENS_CATEGORIES = [
  { id: "trending",  emoji: "🔥", label: "Trending"  },
  { id: "favorites", emoji: "⭐", label: "Favorites" },
  { id: "foryou",    emoji: "✨", label: "For You"   },
  { id: "reactions", emoji: "😮", label: "Reactions" },
  { id: "aesthetic", emoji: "🌸", label: "Aesthetic" },
  { id: "cute",      emoji: "🐱", label: "Cute"      },
  { id: "vibes",     emoji: "💜", label: "Vibes"     },
];

// ── Module-scope sub-components (avoids Ionicons empty-glyph bug) ─────────────

function ToolbarBtn({
  icon, label, color = "#fff", active = false, onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label?: string;
  color?: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={tb.wrap} activeOpacity={0.75}>
      <View style={[tb.circle, active && tb.circleActive]}>
        <Ionicons name={icon} size={21} color={color} />
      </View>
      {label ? <Text style={[tb.label, color !== "#fff" && { color }]}>{label}</Text> : null}
    </TouchableOpacity>
  );
}
const tb = StyleSheet.create({
  wrap: { alignItems: "center", gap: 4 },
  circle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.40)",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  circleActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  label: {
    color: "rgba(255,255,255,0.88)", fontFamily: "Poppins_500Medium",
    fontSize: 10, textAlign: "center",
  },
});

function ColorDot({
  color, active, onPress,
}: { color: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={cdSt.wrap}>
      <View style={[
        cdSt.dot,
        { backgroundColor: color },
        color === "#1A1A1A" && cdSt.darkBorder,
        active && cdSt.active,
      ]} />
    </TouchableOpacity>
  );
}
const cdSt = StyleSheet.create({
  wrap: { padding: 4 },
  dot: { width: 28, height: 28, borderRadius: 14 },
  darkBorder: { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.4)" },
  active: { borderWidth: 3, borderColor: "#fff", transform: [{ scale: 1.15 }] },
});

function SizeBtn({
  label, active, onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={[szSt.btn, active && szSt.btnActive]}>
      <Text style={[szSt.label, active && szSt.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}
const szSt = StyleSheet.create({
  btn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  btnActive: { backgroundColor: "rgba(124,58,237,0.85)" },
  label: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_700Bold", fontSize: 13 },
  labelActive: { color: "#fff" },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SnapCameraScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { toUsername: paramUsername } = useLocalSearchParams<{ toUsername?: string }>();
  const defaultSearch = paramUsername ?? "";
  const userId = session?.user?.id;

  const [phase, setPhase] = useState<Phase>("camera");
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedIsPhoto, setCapturedIsPhoto] = useState(true);

  // Camera controls
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [flash, setFlash] = useState<"off" | "on" | "auto">("off");
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStartingRef = useRef(false);

  // Lens category
  const [activeLensCat, setActiveLensCat] = useState("trending");

  // Send-to state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [recentSnaps, setRecentSnaps] = useState<SnapConversation[]>([]);
  const [search, setSearch] = useState(defaultSearch);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  // Capture-ring Reanimated pulse
  const ringScale = useSharedValue(1);
  const ringAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
  }));

  // Permission timeout
  const [permTimeout, setPermTimeout] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPermTimeout(true), 5_000);
    return () => clearTimeout(t);
  }, []);
  const permLoaded = permTimeout || (camPerm !== null && micPerm !== null);
  const hasPerm = !!(camPerm?.granted && micPerm?.granted);

  // ── Editor state ─────────────────────────────────────────────────────────
  const [editorMode, setEditorMode] = useState<EditorMode>("idle");

  // Drawing
  const [strokes, setStrokes] = useState<Array<{ points: { x: number; y: number }[]; color: string }>>([]);
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);
  const [currentStrokePoints, setCurrentStrokePoints] = useState<{ x: number; y: number }[]>([]);
  const [drawColor, setDrawColor] = useState(SNAP_COLORS[0]);
  const drawColorRef = useRef(drawColor);

  // Caption
  const [captionText, setCaptionText] = useState("");
  const [captionInput, setCaptionInput] = useState("");
  const [captionColor, setCaptionColor] = useState(SNAP_COLORS[0]);
  const [captionSize, setCaptionSize] = useState<CaptionSize>("md");
  const captionPos = useRef(new Animated.ValueXY({ x: W / 2 - 80, y: H * 0.45 })).current;

  // Caption drag — PanResponder on the caption text itself (inside compositing view)
  const captionPanRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { captionPos.extractOffset(); },
      onPanResponderMove: Animated.event(
        [null, { dx: captionPos.x, dy: captionPos.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => { captionPos.flattenOffset(); },
    })
  ).current;

  // Compositing ref + composed URI (the captured flat image sent to recipients)
  const snapRef = useRef<View>(null);
  const [composedUri, setComposedUri] = useState<string | null>(null);

  // Load conversations + recent snap contacts
  useEffect(() => {
    if (!userId) return;
    fetchConversations(userId).then(setConversations).catch(() => {});
    fetchSnapConversations(userId).then(setRecentSnaps).catch(() => {});
  }, [userId]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
  }, []);

  // ── Photo capture ──────────────────────────────────────────────────────────
  const takePhoto = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        setCapturedUri(photo.uri);
        setCapturedIsPhoto(true);
        setPhase("preview");
      }
    } catch {}
  }, []);

  // ── Video recording ────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (recording || isStartingRef.current) return;
    isStartingRef.current = true;
    setRecording(true);
    setRecSecs(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    ringScale.value = withRepeat(
      withSequence(withTiming(1.15, { duration: 550 }), withTiming(1, { duration: 550 })),
      -1, false,
    );
    isStartingRef.current = false;
    recordTimerRef.current = setInterval(() => {
      setRecSecs((prev) => {
        if (prev >= MAX_VIDEO_SECS - 1) {
          clearInterval(recordTimerRef.current!);
          recordTimerRef.current = null;
          cameraRef.current?.stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1_000);
    try {
      const result = await cameraRef.current?.recordAsync({ maxDuration: MAX_VIDEO_SECS });
      if (result?.uri) {
        setCapturedUri(result.uri);
        setCapturedIsPhoto(false);
        setPhase("preview");
      }
    } catch {}
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecording(false);
    setRecSecs(0);
    cancelAnimation(ringScale);
    ringScale.value = withSpring(1);
  }, [recording, ringScale]);

  const stopRecording = useCallback(() => {
    cameraRef.current?.stopRecording();
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
  }, []);

  // Tap = photo, hold = video
  const onCapturePressIn = useCallback(() => {
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      startRecording();
    }, HOLD_THRESHOLD_MS);
  }, [startRecording]);

  const onCapturePressOut = useCallback(async () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      if (!recording && !isStartingRef.current) await takePhoto();
    } else if (recording || isStartingRef.current) {
      stopRecording();
    }
  }, [recording, takePhoto, stopRecording]);

  // Gallery picker
  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as ImagePicker.MediaType[], quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri);
      setCapturedIsPhoto(true);
      setPhase("preview");
    }
  }, []);

  // Flash cycle
  const cycleFlash = useCallback(() =>
    setFlash((f) => f === "off" ? "on" : f === "on" ? "auto" : "off"), []);
  const flashIcon: React.ComponentProps<typeof Ionicons>["name"] =
    flash === "off" ? "flash-off-outline" : flash === "on" ? "flash" : "flash-outline";
  const flashColor = flash === "off" ? "#fff" : flash === "on" ? "#EAB308" : "#60A5FA";

  // ── Discard preview ────────────────────────────────────────────────────────
  const discardPreview = useCallback(() => {
    setCapturedUri(null);
    setPhase("camera");
    setSentTo(new Set());
    setStrokes([]);
    setCurrentStrokePoints([]);
    currentStrokeRef.current = [];
    setCaptionText("");
    setCaptionInput("");
    setEditorMode("idle");
    setComposedUri(null);
    captionPos.setValue({ x: W / 2 - 80, y: H * 0.45 });
  }, [captionPos]);

  // ── Enter send phase: capture composited image first ───────────────────────
  const enterSendPhase = useCallback(async () => {
    setEditorMode("idle");
    try {
      // Small delay to ensure the View has fully rendered before capturing
      await new Promise<void>((r) => setTimeout(r, 80));
      const uri = await captureRef(snapRef, { format: "jpg", quality: 0.92 });
      setComposedUri(uri);
    } catch {
      setComposedUri(capturedUri);
    }
    setSearch(defaultSearch);
    setPhase("send");
  }, [capturedUri, defaultSearch]);

  // ── Send snap ──────────────────────────────────────────────────────────────
  const sendSnap = useCallback(async (toId: string) => {
    const uriToSend = composedUri ?? capturedUri;
    if (!uriToSend || !userId || sentTo.has(toId)) return;
    setSendingTo(toId);
    try {
      const uploaded = await uploadSnapToStorage(uriToSend, userId);
      const url = uploaded ?? uriToSend;
      await sendSnapMessage(userId, toId, url, capturedIsPhoto ? "photo" : "video");
      setSentTo((prev) => new Set([...prev, toId]));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setSendingTo(null);
  }, [composedUri, capturedUri, userId, capturedIsPhoto, sentTo]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const filteredConvos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.other_user.username ?? "").toLowerCase().includes(q));
  }, [conversations, search]);

  const quickSendUsers = useMemo(() => {
    const seen = new Set<string>();
    return recentSnaps.filter((c) => {
      if (seen.has(c.other_user.id)) return false;
      seen.add(c.other_user.id);
      return true;
    }).slice(0, 6);
  }, [recentSnaps]);

  const recordProgress = recording ? Math.min(recSecs / MAX_VIDEO_SECS, 1) : 0;

  // ────────────────────────────────────────────────────────────────────────────
  // PREVIEW + SEND PHASE
  // ────────────────────────────────────────────────────────────────────────────
  if (phase !== "camera" && capturedUri) {
    const thumbUri = composedUri ?? capturedUri;

    return (
      <View style={s.root}>
        <StatusBar style="light" hidden />

        {/* ── COMPOSITING CONTAINER ──────────────────────────────────────────
            Only this View gets captured by captureRef.
            Contains: source image + SVG drawing layer + caption overlay.
            UI chrome (gradient, toolbars) lives OUTSIDE this container.
        ──────────────────────────────────────────────────────────────────── */}
        <View ref={snapRef} style={StyleSheet.absoluteFill} collapsable={false}>
          <Image
            source={{ uri: capturedUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />

          {/* SVG drawing layer — renders all completed strokes + in-progress stroke */}
          <Svg
            width={W}
            height={H}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            {strokes.map((stroke, i) => (
              <Path
                key={i}
                d={buildPath(stroke.points)}
                stroke={stroke.color}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
            {currentStrokePoints.length > 1 && (
              <Path
                d={buildPath(currentStrokePoints)}
                stroke={drawColor}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}
          </Svg>

          {/* Caption overlay — draggable via PanResponder */}
          {captionText ? (
            <Animated.View
              style={[s.captionWrap, captionPos.getLayout()]}
              {...captionPanRef.panHandlers}
            >
              <Text
                style={[
                  s.captionText,
                  {
                    color: captionColor,
                    fontSize: CAPTION_FONT_SIZES[captionSize],
                    textShadowColor: captionColor === "#1A1A1A"
                      ? "rgba(255,255,255,0.6)"
                      : "rgba(0,0,0,0.85)",
                  },
                ]}
              >
                {captionText}
              </Text>
            </Animated.View>
          ) : null}
        </View>

        {/* ── Gradient vignette — outside compositing container ── */}
        <LinearGradient
          colors={["rgba(0,0,0,0.52)", "transparent", "transparent", "rgba(0,0,0,0.72)"]}
          locations={[0, 0.18, 0.65, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* ── Draw touch area — full-screen responder, only active in draw mode ──
            Positioned OUTSIDE compositing container so it isn't captured.
            Uses React Native's Responder system for reliable freehand drawing. */}
        {editorMode === "draw" && (
          <View
            style={StyleSheet.absoluteFill}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => {
              const { locationX, locationY } = e.nativeEvent;
              currentStrokeRef.current = [{ x: locationX, y: locationY }];
              setCurrentStrokePoints([{ x: locationX, y: locationY }]);
            }}
            onResponderMove={(e) => {
              const { locationX, locationY } = e.nativeEvent;
              currentStrokeRef.current.push({ x: locationX, y: locationY });
              setCurrentStrokePoints([...currentStrokeRef.current]);
            }}
            onResponderRelease={() => {
              if (currentStrokeRef.current.length > 1) {
                const color = drawColorRef.current;
                setStrokes((prev) => [...prev, { points: currentStrokeRef.current, color }]);
              }
              currentStrokeRef.current = [];
              setCurrentStrokePoints([]);
            }}
          />
        )}

        {/* ── SEND PHASE ── */}
        {phase === "send" ? (
          <View style={[s.sendOverlay, { paddingTop: insets.top }]}>
            <View style={s.sendHeader}>
              <TouchableOpacity
                onPress={() => { setPhase("preview"); setComposedUri(null); }}
                style={s.sendBackBtn}
                activeOpacity={0.75}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={s.sendTitle}>Send To</Text>
              {sentTo.size > 0 ? (
                <TouchableOpacity onPress={() => router.back()} style={s.sendDoneBtnWrap} activeOpacity={0.85}>
                  <LinearGradient colors={["#EA580C", "#DC2626"]} style={s.sendDoneGrad}>
                    <Text style={s.sendDoneText}>Done ({sentTo.size})</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : <View style={{ width: 80 }} />}
            </View>

            {/* Snap thumbnail */}
            <View style={s.thumbRow}>
              <Image source={{ uri: thumbUri }} style={s.thumb} resizeMode="cover" />
              <View style={s.thumbBadge}>
                <Ionicons name="camera" size={11} color="#fff" />
                <Text style={s.thumbBadgeText}>{capturedIsPhoto ? "Photo Snap" : "Video Snap"}</Text>
              </View>
              <Text style={s.thumbSub}>Disappears after viewing once</Text>
            </View>

            {/* Search */}
            <View style={s.searchRow}>
              <View style={s.searchBar}>
                <Ionicons name="search-outline" size={15} color="rgba(255,255,255,0.4)" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search friends…"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={s.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch("")}>
                    <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.35)" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Friend list */}
            <FlatList
              data={filteredConvos}
              keyExtractor={(c) => c.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              renderItem={({ item: c }) => {
                const isSending = sendingTo === c.other_user.id;
                const isSent = sentTo.has(c.other_user.id);
                return (
                  <TouchableOpacity
                    style={s.friendRow}
                    onPress={() => sendSnap(c.other_user.id)}
                    disabled={!!sendingTo || isSent}
                    activeOpacity={0.75}
                  >
                    <UserAvatar username={c.other_user.username} url={c.other_user.avatar_url} size={44} />
                    <View style={s.friendMeta}>
                      <Text style={s.friendUsername}>{c.other_user.username ?? "User"}</Text>
                      {!!c.other_user.full_name && (
                        <Text style={s.friendFullname}>{c.other_user.full_name}</Text>
                      )}
                    </View>
                    {isSent ? (
                      <View style={s.sentBadge}>
                        <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                        <Text style={s.sentText}>Sent</Text>
                      </View>
                    ) : (
                      <View style={s.snapSendBtnWrap}>
                        <LinearGradient colors={["#EA580C", "#DC2626"]} style={s.snapSendBtn}>
                          {isSending
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Ionicons name="camera" size={15} color="#fff" />}
                        </LinearGradient>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={s.emptyState}>
                  <Text style={s.emptyText}>No friends found</Text>
                </View>
              }
            />
          </View>
        ) : (
          /* ── PREVIEW PHASE UI ── */
          <>
            {/* ── TOP BAR ── */}
            <View style={[s.previewTopBar, { paddingTop: insets.top + 8 }]}>
              {/* Close / discard */}
              <TouchableOpacity onPress={discardPreview} style={s.previewCloseBtn} activeOpacity={0.8}>
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>

              {/* Editor toolbar buttons (top-right) */}
              <View style={s.editorToolbar}>
                {editorMode === "idle" && (
                  <>
                    <ToolbarBtn
                      icon={captionText ? "text" : "text-outline"}
                      label="Caption"
                      active={!!captionText}
                      onPress={() => { setCaptionInput(captionText); setEditorMode("caption-input"); }}
                    />
                    <ToolbarBtn
                      icon="pencil-outline"
                      label="Draw"
                      active={strokes.length > 0}
                      onPress={() => setEditorMode("draw")}
                    />
                  </>
                )}
                {editorMode === "draw" && (
                  <>
                    <ToolbarBtn
                      icon="arrow-undo-outline"
                      label="Undo"
                      onPress={() => setStrokes((prev) => prev.slice(0, -1))}
                    />
                    <ToolbarBtn
                      icon="checkmark-circle-outline"
                      label="Done"
                      onPress={() => setEditorMode("idle")}
                    />
                  </>
                )}
              </View>
            </View>

            {/* ── DRAW COLOR BAR (vertical, right side) ── */}
            {editorMode === "draw" && (
              <View style={[s.drawColorBar, { top: insets.top + 110 }]}>
                {SNAP_COLORS.map((c) => (
                  <ColorDot
                    key={c}
                    color={c}
                    active={drawColor === c}
                    onPress={() => { setDrawColor(c); drawColorRef.current = c; }}
                  />
                ))}
              </View>
            )}

            {/* ── CAPTION INPUT OVERLAY ── */}
            {editorMode === "caption-input" && (
              <KeyboardAvoidingView
                style={StyleSheet.absoluteFill}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                pointerEvents="box-none"
              >
                <View style={s.captionInputOverlay}>
                  {/* Text preview + input */}
                  <View style={s.captionInputBox}>
                    <TextInput
                      value={captionInput}
                      onChangeText={setCaptionInput}
                      placeholder="Type something…"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={[
                        s.captionInputField,
                        {
                          color: captionColor,
                          fontSize: CAPTION_FONT_SIZES[captionSize],
                          textShadowColor: captionColor === "#1A1A1A"
                            ? "rgba(255,255,255,0.5)"
                            : "rgba(0,0,0,0.8)",
                          textShadowOffset: { width: 1, height: 1 },
                          textShadowRadius: 3,
                        },
                      ]}
                      autoFocus
                      multiline
                      maxLength={80}
                      textAlign="center"
                    />
                  </View>

                  {/* Controls row */}
                  <View style={s.captionControls}>
                    {/* Color picker */}
                    <View style={s.captionColorRow}>
                      {SNAP_COLORS.map((c) => (
                        <ColorDot
                          key={c}
                          color={c}
                          active={captionColor === c}
                          onPress={() => setCaptionColor(c)}
                        />
                      ))}
                    </View>

                    {/* Size + Done */}
                    <View style={s.captionSizeRow}>
                      <SizeBtn label="S" active={captionSize === "sm"} onPress={() => setCaptionSize("sm")} />
                      <SizeBtn label="M" active={captionSize === "md"} onPress={() => setCaptionSize("md")} />
                      <SizeBtn label="L" active={captionSize === "lg"} onPress={() => setCaptionSize("lg")} />
                      <TouchableOpacity
                        onPress={() => { setCaptionText(captionInput.trim()); setEditorMode("idle"); }}
                        style={s.captionDoneBtn}
                        activeOpacity={0.85}
                      >
                        <LinearGradient
                          colors={["#7C3AED", "#EC4899"]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={s.captionDoneGrad}
                        >
                          <Text style={s.captionDoneText}>Done</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </KeyboardAvoidingView>
            )}

            {/* ── BOTTOM: quick-send + Send To button ── */}
            {editorMode !== "caption-input" && editorMode !== "draw" && (
              <View style={[s.previewBottom, { paddingBottom: insets.bottom + 20 }]}>
                {quickSendUsers.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.quickSendRow}
                    style={{ marginBottom: 16 }}
                  >
                    {quickSendUsers.map((convo) => {
                      const isSent = sentTo.has(convo.other_user.id);
                      const isSending = sendingTo === convo.other_user.id;
                      return (
                        <TouchableOpacity
                          key={convo.other_user.id}
                          style={s.quickSendItem}
                          onPress={() => sendSnap(convo.other_user.id)}
                          disabled={!!sendingTo || isSent}
                          activeOpacity={0.75}
                        >
                          <View style={[s.quickSendAvatar, isSent && s.quickSendAvatarSent]}>
                            <UserAvatar
                              username={convo.other_user.username}
                              url={convo.other_user.avatar_url}
                              size={46}
                            />
                            {(isSent || isSending) && (
                              <View style={s.quickSendOverlay}>
                                {isSending
                                  ? <ActivityIndicator size="small" color="#fff" />
                                  : <Ionicons name="checkmark" size={18} color="#fff" />}
                              </View>
                            )}
                          </View>
                          <Text style={s.quickSendLabel} numberOfLines={1}>{convo.other_user.username}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                <View style={s.previewActionsRow}>
                  {sentTo.size > 0 && (
                    <TouchableOpacity onPress={() => router.back()} style={s.doneBtn} activeOpacity={0.85}>
                      <Text style={s.doneBtnText}>Done</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={enterSendPhase}
                    style={s.sendToBtn}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={["#EA580C", "#DC2626"]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={s.sendToBtnGrad}
                    >
                      <Ionicons name="camera" size={17} color="#fff" />
                      <Text style={s.sendToBtnText}>Send To</Text>
                      <Ionicons name="chevron-forward" size={17} color="#fff" />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </View>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CAMERA PHASE
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar style="light" hidden />

      {hasPerm && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          mode="video"
        />
      )}

      <LinearGradient
        colors={["rgba(0,0,0,0.60)", "transparent", "transparent", "rgba(0,0,0,0.72)"]}
        locations={[0, 0.22, 0.58, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {recording && (
        <View style={[s.recTrack, { top: insets.top + 50 }]} pointerEvents="none">
          <View style={[s.recFill, { width: `${recordProgress * 100}%` as any }]} />
        </View>
      )}

      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.topCircleBtn} activeOpacity={0.8}>
          <Ionicons name="chevron-down" size={27} color="#fff" />
        </TouchableOpacity>
        <View style={s.topCenter}>
          {recording ? (
            <View style={s.recBadge}>
              <View style={s.recDot} />
              <Text style={s.recTimer}>
                {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
              </Text>
            </View>
          ) : defaultSearch ? (
            <View style={s.recipientBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
              <Text style={s.recipientText}>To @{defaultSearch}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ width: 44 }} />
      </View>

      {!recording && (
        <View style={[s.rightToolbar, { top: insets.top + 72 }]}>
          <ToolbarBtn
            icon="camera-reverse-outline"
            label="Flip"
            onPress={() => setFacing((f) => f === "back" ? "front" : "back")}
          />
          <ToolbarBtn
            icon={flashIcon}
            label={flash === "off" ? "Flash" : flash === "on" ? "On" : "Auto"}
            color={flashColor}
            active={flash !== "off"}
            onPress={cycleFlash}
          />
          <ToolbarBtn icon="musical-notes-outline" label="Music" onPress={() => {}} />
          <ToolbarBtn icon="people-outline" label="Friends" onPress={() => {}} />
          <ToolbarBtn icon="chevron-down" onPress={() => {}} />
        </View>
      )}

      <View style={[s.bottomArea, { paddingBottom: insets.bottom + 2 }]}>
        {!recording && quickSendUsers.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.camFriendRow}
          >
            {quickSendUsers.map((convo) => (
              <View key={convo.other_user.id} style={s.camFriendItem}>
                <View style={s.camFriendRing}>
                  <UserAvatar
                    username={convo.other_user.username}
                    url={convo.other_user.avatar_url}
                    size={40}
                  />
                </View>
                <Text style={s.camFriendName} numberOfLines={1}>{convo.other_user.username}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={s.captureRow}>
          <TouchableOpacity onPress={pickFromGallery} style={s.captureSide} disabled={recording} activeOpacity={0.75}>
            <View style={s.captureSideCircle}>
              <Ionicons name="images-outline" size={24} color="#fff" />
            </View>
            {!recording && <Text style={s.captureSideLabel}>Gallery</Text>}
          </TouchableOpacity>

          <View style={s.captureBtnCol}>
            <View style={s.captureBtnOuter}>
              <RAnimated.View style={[s.captureBtnRing, recording && s.captureBtnRingRec, ringAnimStyle]} />
              <Pressable
                onPressIn={onCapturePressIn}
                onPressOut={onCapturePressOut}
                style={[s.captureBtnInner, recording && s.captureBtnInnerRec]}
              >
                {recording && <View style={s.stopSquare} />}
              </Pressable>
            </View>
            {!recording && <Text style={s.captureHint}>Hold for video</Text>}
          </View>

          <TouchableOpacity
            onPress={() => setFacing((f) => f === "back" ? "front" : "back")}
            style={s.captureSide}
            disabled={recording}
            activeOpacity={0.75}
          >
            <View style={s.captureSideCircle}>
              <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
            </View>
            {!recording && <Text style={s.captureSideLabel}>Flip</Text>}
          </TouchableOpacity>
        </View>

        {!recording && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.lensTabScroll}
            style={s.lensTabBar}
          >
            {LENS_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setActiveLensCat(cat.id)}
                style={[s.lensTab, activeLensCat === cat.id && s.lensTabActive]}
                activeOpacity={0.75}
              >
                <Text style={s.lensTabEmoji}>{cat.emoji}</Text>
                <Text style={[s.lensTabLabel, activeLensCat === cat.id && s.lensTabLabelActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {permLoaded && !hasPerm && (
        <View style={s.permOverlay}>
          <Ionicons name="camera-outline" size={52} color="#7C3AED" />
          <Text style={s.permTitle}>Camera & Mic Needed</Text>
          <Text style={s.permSub}>Allow access to send Snaps to your friends</Text>
          <TouchableOpacity
            onPress={() => requestCamPerm().then(() => requestMicPerm())}
            style={s.permBtn}
            activeOpacity={0.85}
          >
            <Text style={s.permBtnText}>Allow Access</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  // Top bar (camera phase)
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: "row", alignItems: "center", paddingHorizontal: 14,
  },
  topCircleBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.30)",
    alignItems: "center", justifyContent: "center",
  },
  topCenter: { flex: 1, alignItems: "center" },
  recipientBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,0,0,0.50)", borderRadius: 14,
    paddingHorizontal: 13, paddingVertical: 6,
  },
  recipientText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 12.5 },
  recBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.50)", borderRadius: 14,
    paddingHorizontal: 13, paddingVertical: 6,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },
  recTimer: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 12.5 },

  // Recording progress bar
  recTrack: {
    position: "absolute", left: 0, right: 0, height: 3,
    backgroundColor: "rgba(255,255,255,0.22)", zIndex: 8,
  },
  recFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "#EF4444" },

  // Right toolbar (camera phase)
  rightToolbar: { position: "absolute", right: 14, zIndex: 10, alignItems: "center", gap: 16 },

  // Bottom area (camera phase)
  bottomArea: { position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center" },
  camFriendRow: { paddingHorizontal: 22, gap: 14, paddingBottom: 14 },
  camFriendItem: { alignItems: "center", gap: 4, width: 52 },
  camFriendRing: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.55)",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  camFriendName: {
    color: "rgba(255,255,255,0.88)", fontFamily: "Poppins_500Medium",
    fontSize: 10.5, textAlign: "center",
  },

  // Capture row
  captureRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", width: "100%", paddingHorizontal: 28,
  },
  captureSide: { alignItems: "center", gap: 5, width: 60 },
  captureSideCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "rgba(0,0,0,0.32)", borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center",
  },
  captureSideLabel: {
    color: "rgba(255,255,255,0.75)", fontFamily: "Poppins_500Medium", fontSize: 10.5,
  },
  captureBtnCol: { alignItems: "center", gap: 6 },
  captureBtnOuter: { width: 82, height: 82, alignItems: "center", justifyContent: "center" },
  captureBtnRing: {
    position: "absolute", width: 82, height: 82, borderRadius: 41,
    borderWidth: 3, borderColor: "rgba(255,255,255,0.75)",
  },
  captureBtnRingRec: { borderColor: "#EF4444" },
  captureBtnInner: {
    width: 66, height: 66, borderRadius: 33, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  captureBtnInnerRec: { backgroundColor: "#EF4444" },
  stopSquare: { width: 22, height: 22, borderRadius: 4, backgroundColor: "#fff" },
  captureHint: {
    color: "rgba(255,255,255,0.55)", fontFamily: "Poppins_400Regular", fontSize: 10.5,
  },

  // Lens tab bar
  lensTabBar: { marginTop: 14, marginBottom: 6, maxHeight: 54 },
  lensTabScroll: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  lensTab: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 13, paddingVertical: 7,
    borderRadius: 20, backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.12)",
  },
  lensTabActive: {
    backgroundColor: "rgba(124,58,237,0.50)",
    borderColor: "rgba(124,58,237,0.60)",
  },
  lensTabEmoji: { fontSize: 15 },
  lensTabLabel: { color: "rgba(255,255,255,0.70)", fontFamily: "Poppins_500Medium", fontSize: 12 },
  lensTabLabelActive: { color: "#fff" },

  // Permissions overlay
  permOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32,
  },
  permTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 20, textAlign: "center" },
  permSub: {
    color: "rgba(255,255,255,0.55)", fontFamily: "Poppins_400Regular",
    fontSize: 14, textAlign: "center",
  },
  permBtn: {
    marginTop: 8, backgroundColor: "#7C3AED",
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 22,
  },
  permBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },

  // ── PREVIEW PHASE ──────────────────────────────────────────────────────────
  previewTopBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: "row", alignItems: "flex-start",
    justifyContent: "space-between", paddingHorizontal: 14,
  },
  previewCloseBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center",
  },

  // Editor toolbar (right side of top bar)
  editorToolbar: { alignItems: "center", gap: 12 },

  // Draw color bar (vertical, right side)
  drawColorBar: {
    position: "absolute", right: 14, zIndex: 25,
    alignItems: "center", gap: 4,
  },

  // Caption overlay (inside compositing view)
  captionWrap: {
    position: "absolute", maxWidth: W - 40,
    alignItems: "center", justifyContent: "center",
  },
  captionText: {
    fontFamily: "Poppins_700Bold",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },

  // Caption input overlay
  captionInputOverlay: {
    flex: 1, justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  captionInputBox: {
    minHeight: 120, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 16,
  },
  captionInputField: {
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
    minHeight: 60,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  captionControls: {
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28,
    gap: 12,
  },
  captionColorRow: {
    flexDirection: "row", justifyContent: "center", gap: 4,
  },
  captionSizeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  captionDoneBtn: { marginLeft: 16 },
  captionDoneGrad: {
    paddingHorizontal: 22, paddingVertical: 10, borderRadius: 20,
  },
  captionDoneText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },

  // Preview bottom (quick-send + send-to button)
  previewBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
  },
  quickSendRow: { paddingHorizontal: 20, gap: 18, paddingBottom: 4 },
  quickSendItem: { alignItems: "center", gap: 5, width: 60 },
  quickSendAvatar: { borderRadius: 25, overflow: "hidden" },
  quickSendAvatarSent: { opacity: 0.6 },
  quickSendOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.50)",
    alignItems: "center", justifyContent: "center",
  },
  quickSendLabel: {
    color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 11,
    textAlign: "center",
  },
  previewActionsRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "flex-end", paddingHorizontal: 20, gap: 10,
  },
  doneBtn: {
    paddingHorizontal: 18, paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 22,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  doneBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  sendToBtn: { borderRadius: 26, overflow: "hidden" },
  sendToBtnGrad: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 22, paddingVertical: 13,
  },
  sendToBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },

  // ── SEND PHASE ─────────────────────────────────────────────────────────────
  sendOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 30,
    backgroundColor: "rgba(5,0,15,0.96)",
  },
  sendHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12,
  },
  sendBackBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center",
  },
  sendTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  sendDoneBtnWrap: { borderRadius: 20, overflow: "hidden" },
  sendDoneGrad: { paddingHorizontal: 16, paddingVertical: 8 },
  sendDoneText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13.5 },
  thumbRow: {
    alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, gap: 6,
  },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  thumbBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(234,88,12,0.25)", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  thumbBadgeText: { color: "#EA580C", fontFamily: "Poppins_600SemiBold", fontSize: 11.5 },
  thumbSub: {
    color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_400Regular", fontSize: 11.5,
  },
  searchRow: { paddingHorizontal: 16, marginBottom: 6 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: {
    flex: 1, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 14,
  },
  friendRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  friendMeta: { flex: 1 },
  friendUsername: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14.5 },
  friendFullname: {
    color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12,
  },
  sentBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  sentText: { color: "#10B981", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  snapSendBtnWrap: { borderRadius: 20, overflow: "hidden" },
  snapSendBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyText: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_400Regular", fontSize: 14 },
});
