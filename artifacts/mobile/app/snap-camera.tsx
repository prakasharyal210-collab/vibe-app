import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
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
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import type { SnapConversation } from "@/lib/db";
import { fetchConversations, fetchSnapConversations } from "@/lib/db";
import { sendSnapMessage, uploadSnapToStorage } from "@/lib/snap";
import type { Conversation } from "@/lib/supabase";

const { width: W } = Dimensions.get("window");
const MAX_VIDEO_SECS = 15;
const HOLD_THRESHOLD_MS = 280;

type Phase = "camera" | "preview" | "send";

const LENS_CATEGORIES = [
  { id: "trending",  emoji: "🔥", label: "Trending"  },
  { id: "favorites", emoji: "⭐", label: "Favorites" },
  { id: "foryou",    emoji: "✨", label: "For You"   },
  { id: "reactions", emoji: "😮", label: "Reactions" },
  { id: "aesthetic", emoji: "🌸", label: "Aesthetic" },
  { id: "cute",      emoji: "🐱", label: "Cute"      },
  { id: "vibes",     emoji: "💜", label: "Vibes"     },
];

// ── Right-toolbar button ──────────────────────────────────────────────────────
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

  // Permission timeout (unblock after 5 s if hooks don't resolve)
  const [permTimeout, setPermTimeout] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPermTimeout(true), 5_000);
    return () => clearTimeout(t);
  }, []);
  const permLoaded = permTimeout || (camPerm !== null && micPerm !== null);
  const hasPerm = !!(camPerm?.granted && micPerm?.granted);

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

  // ── Capture button: tap = photo, hold = video ─────────────────────────────
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

  // ── Gallery picker ─────────────────────────────────────────────────────────
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

  // ── Flash cycle ────────────────────────────────────────────────────────────
  const cycleFlash = useCallback(() =>
    setFlash((f) => f === "off" ? "on" : f === "on" ? "auto" : "off"), []);
  const flashIcon: React.ComponentProps<typeof Ionicons>["name"] =
    flash === "off" ? "flash-off-outline" : flash === "on" ? "flash" : "flash-outline";
  const flashColor = flash === "off" ? "#fff" : flash === "on" ? "#EAB308" : "#60A5FA";

  // ── Send snap ──────────────────────────────────────────────────────────────
  const sendSnap = useCallback(async (toId: string) => {
    if (!capturedUri || !userId || sentTo.has(toId)) return;
    setSendingTo(toId);
    try {
      let url = capturedUri;
      const uploaded = await uploadSnapToStorage(capturedUri, userId);
      if (uploaded) url = uploaded;
      await sendSnapMessage(userId, toId, url, capturedIsPhoto ? "photo" : "video");
      setSentTo((prev) => new Set([...prev, toId]));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setSendingTo(null);
  }, [capturedUri, userId, capturedIsPhoto, sentTo]);

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
  // PREVIEW + SEND PHASE (captured image fills the screen)
  // ────────────────────────────────────────────────────────────────────────────
  if (phase !== "camera" && capturedUri) {
    return (
      <View style={s.root}>
        <StatusBar style="light" hidden />

        {/* Captured image background */}
        <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient
          colors={["rgba(0,0,0,0.52)", "transparent", "transparent", "rgba(0,0,0,0.72)"]}
          locations={[0, 0.18, 0.65, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {phase === "send" ? (
          /* ── SEND-TO OVERLAY ── */
          <View style={[s.sendOverlay, { paddingTop: insets.top }]}>

            {/* Header */}
            <View style={s.sendHeader}>
              <TouchableOpacity onPress={() => setPhase("preview")} style={s.sendBackBtn} activeOpacity={0.75}>
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

            {/* Snap thumbnail row */}
            <View style={s.thumbRow}>
              <Image source={{ uri: capturedUri }} style={s.thumb} resizeMode="cover" />
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
            {/* Top: discard */}
            <View style={[s.previewTopBar, { paddingTop: insets.top + 8 }]}>
              <TouchableOpacity
                onPress={() => { setCapturedUri(null); setPhase("camera"); setSentTo(new Set()); }}
                style={s.previewCloseBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Bottom: quick-send avatars + "Send To →" button */}
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
                  onPress={() => { setSearch(defaultSearch); setPhase("send"); }}
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

      {/* Live camera feed */}
      {hasPerm && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          mode="video"
        />
      )}

      {/* Dark gradient vignette */}
      <LinearGradient
        colors={["rgba(0,0,0,0.60)", "transparent", "transparent", "rgba(0,0,0,0.72)"]}
        locations={[0, 0.22, 0.58, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Recording progress bar */}
      {recording && (
        <View style={[s.recTrack, { top: insets.top + 50 }]} pointerEvents="none">
          <View style={[s.recFill, { width: `${recordProgress * 100}%` as any }]} />
        </View>
      )}

      {/* ── TOP BAR ── */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        {/* Down-chevron: dismiss camera */}
        <TouchableOpacity onPress={() => router.back()} style={s.topCircleBtn} activeOpacity={0.8}>
          <Ionicons name="chevron-down" size={27} color="#fff" />
        </TouchableOpacity>

        {/* Center: recording timer OR recipient badge */}
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

      {/* ── RIGHT SIDE TOOLBAR (hidden while recording) ── */}
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
          <ToolbarBtn
            icon="musical-notes-outline"
            label="Music"
            onPress={() => {}}
          />
          <ToolbarBtn
            icon="people-outline"
            label="Friends"
            onPress={() => {}}
          />
          <ToolbarBtn
            icon="chevron-down"
            onPress={() => {}}
          />
        </View>
      )}

      {/* ── BOTTOM AREA ── */}
      <View style={[s.bottomArea, { paddingBottom: insets.bottom + 2 }]}>

        {/* Quick-send friend avatars (only when not recording) */}
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

        {/* ── CAPTURE ROW ── */}
        <View style={s.captureRow}>

          {/* Gallery shortcut */}
          <TouchableOpacity onPress={pickFromGallery} style={s.captureSide} disabled={recording} activeOpacity={0.75}>
            <View style={s.captureSideCircle}>
              <Ionicons name="images-outline" size={24} color="#fff" />
            </View>
            {!recording && <Text style={s.captureSideLabel}>Gallery</Text>}
          </TouchableOpacity>

          {/* Large white capture button (Snapchat-style) */}
          <View style={s.captureBtnCol}>
            <View style={s.captureBtnOuter}>
              {/* Animated pulsing ring */}
              <RAnimated.View
                style={[
                  s.captureBtnRing,
                  recording && s.captureBtnRingRec,
                  ringAnimStyle,
                ]}
              />
              {/* Inner circle */}
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

          {/* Flip camera shortcut */}
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

        {/* ── LENS CATEGORY TABS ── */}
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

      {/* ── PERMISSIONS OVERLAY ── */}
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

  // Top bar
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14,
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
  recFill: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    backgroundColor: "#EF4444",
  },

  // Right toolbar
  rightToolbar: {
    position: "absolute", right: 14, zIndex: 10,
    alignItems: "center", gap: 16,
  },

  // Bottom area
  bottomArea: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    alignItems: "center",
  },

  // Camera friend row
  camFriendRow: { paddingHorizontal: 22, gap: 14, paddingBottom: 14 },
  camFriendItem: { alignItems: "center", gap: 4, width: 52 },
  camFriendRing: {
    width: 50, height: 50, borderRadius: 25,
    borderWidth: 2.5, borderColor: "#EA580C",
    overflow: "hidden", alignItems: "center", justifyContent: "center",
  },
  camFriendName: {
    color: "rgba(255,255,255,0.88)", fontFamily: "Poppins_400Regular",
    fontSize: 10, textAlign: "center",
  },

  // Capture row
  captureRow: {
    width: "100%", flexDirection: "row",
    alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 38, paddingBottom: 6,
  },
  captureSide: { alignItems: "center", gap: 4, width: 56 },
  captureSideCircle: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.36)",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  captureSideLabel: {
    color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_400Regular", fontSize: 10,
  },

  // Large capture button
  captureBtnCol: { alignItems: "center", gap: 0 },
  captureBtnOuter: {
    width: 90, height: 90,
    alignItems: "center", justifyContent: "center",
  },
  captureBtnRing: {
    position: "absolute",
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 4, borderColor: "#ffffff",
  },
  captureBtnRingRec: { borderColor: "#EF4444" },
  captureBtnInner: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: "#ffffff",
    alignItems: "center", justifyContent: "center",
  },
  captureBtnInnerRec: { backgroundColor: "#EF4444" },
  stopSquare: { width: 22, height: 22, borderRadius: 5, backgroundColor: "#fff" },
  captureHint: {
    color: "rgba(255,255,255,0.65)", fontFamily: "Poppins_400Regular",
    fontSize: 10.5, marginTop: 8,
  },

  // Lens tabs
  lensTabBar: { width: "100%", paddingTop: 6, paddingBottom: 6 },
  lensTabScroll: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  lensTab: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.14)",
  },
  lensTabActive: {
    backgroundColor: "rgba(255,255,255,0.17)",
    borderColor: "rgba(255,255,255,0.48)",
  },
  lensTabEmoji: { fontSize: 14 },
  lensTabLabel: {
    color: "rgba(255,255,255,0.72)", fontFamily: "Poppins_500Medium", fontSize: 12,
  },
  lensTabLabelActive: { color: "#fff" },

  // Preview top bar
  previewTopBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    paddingHorizontal: 16, zIndex: 10,
  },
  previewCloseBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center", justifyContent: "center",
  },

  // Preview bottom
  previewBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16,
  },
  quickSendRow: { paddingHorizontal: 4, gap: 12 },
  quickSendItem: { alignItems: "center", gap: 5, width: 62 },
  quickSendAvatar: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2.5, borderColor: "#EA580C",
    overflow: "hidden", alignItems: "center", justifyContent: "center",
  },
  quickSendAvatarSent: { borderColor: "#10B981" },
  quickSendOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)",
    alignItems: "center", justifyContent: "center",
  },
  quickSendLabel: {
    color: "rgba(255,255,255,0.92)", fontFamily: "Poppins_400Regular",
    fontSize: 10.5, textAlign: "center",
  },
  previewActionsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10,
  },
  doneBtn: {
    paddingHorizontal: 22, paddingVertical: 14, borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
  },
  doneBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  sendToBtn: { borderRadius: 30, overflow: "hidden" },
  sendToBtnGrad: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 26, paddingVertical: 15,
  },
  sendToBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },

  // Send-to overlay
  sendOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,5,14,0.94)",
    zIndex: 20,
  },
  sendHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 10,
  },
  sendBackBtn: { padding: 6 },
  sendTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  sendDoneBtnWrap: { borderRadius: 20, overflow: "hidden" },
  sendDoneGrad: { paddingHorizontal: 18, paddingVertical: 8 },
  sendDoneText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },

  thumbRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14, padding: 10,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.09)",
  },
  thumb: { width: 50, height: 50, borderRadius: 10 },
  thumbBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(234,88,12,0.85)", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start",
  },
  thumbBadgeText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  thumbSub: {
    color: "rgba(255,255,255,0.38)", fontFamily: "Poppins_400Regular",
    fontSize: 11, flex: 1,
  },
  searchRow: { paddingHorizontal: 16, marginBottom: 8 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: {
    flex: 1, color: "#fff", fontFamily: "Poppins_400Regular",
    fontSize: 14, padding: 0,
  },

  friendRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  friendMeta: { flex: 1 },
  friendUsername: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  friendFullname: { color: "rgba(255,255,255,0.42)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  sentBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 11, paddingVertical: 6,
    backgroundColor: "rgba(16,185,129,0.1)",
    borderRadius: 16, borderWidth: 1, borderColor: "rgba(16,185,129,0.28)",
  },
  sentText: { color: "#10B981", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  snapSendBtnWrap: { borderRadius: 22, overflow: "hidden" },
  snapSendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },

  emptyState: { alignItems: "center", paddingTop: 40 },
  emptyText: {
    color: "rgba(255,255,255,0.38)", fontFamily: "Poppins_400Regular", fontSize: 14,
  },

  // Permissions
  permOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,5,14,0.97)",
    alignItems: "center", justifyContent: "center",
    gap: 12, padding: 32, zIndex: 50,
  },
  permTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 18, textAlign: "center" },
  permSub: {
    color: "rgba(255,255,255,0.48)", fontFamily: "Poppins_400Regular",
    fontSize: 14, textAlign: "center",
  },
  permBtn: {
    backgroundColor: "#7C3AED", borderRadius: 24,
    paddingHorizontal: 32, paddingVertical: 14, marginTop: 8,
  },
  permBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
});
