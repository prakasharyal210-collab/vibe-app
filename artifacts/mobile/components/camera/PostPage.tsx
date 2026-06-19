import * as Haptics from "expo-haptics";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Video, ResizeMode } from "expo-av";
import * as VideoThumbnails from "expo-video-thumbnails";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { CAMERA_FILTERS, type CameraFilter } from "@/components/camera/CameraFilterStrip";
import { searchVibeUsers, type SocialMatchUser, uploadPostMedia } from "@/lib/db";
import { MusicPickerSheet } from "@/components/MusicPickerSheet";
import type { Track } from "@/lib/music";

const { width: W } = Dimensions.get("window");
const PREVIEW_W = W - 32;

// ── Types ─────────────────────────────────────────────────────────────────────
type CropRatio = "original" | "1:1" | "4:5";
type Phase = "idle" | "camera" | "compose" | "uploading";
type Visibility = "public" | "friends" | "private";

const AUDIENCE_OPTIONS: { key: Visibility; icon: string; label: string; desc: string }[] = [
  { key: "public",  icon: "🌍", label: "Public",   desc: "Everyone on Gundruk" },
  { key: "friends", icon: "👥", label: "Friends",  desc: "Followers & people you follow" },
  { key: "private", icon: "🔒", label: "Only Me",  desc: "Only visible to you" },
];

const FEELINGS: { emoji: string; label: string }[] = [
  { emoji: "😊", label: "Happy" },
  { emoji: "🥰", label: "In Love" },
  { emoji: "🔥", label: "Motivated" },
  { emoji: "😎", label: "Confident" },
  { emoji: "🌟", label: "Inspired" },
  { emoji: "🎉", label: "Celebrating" },
  { emoji: "😌", label: "Peaceful" },
  { emoji: "💪", label: "Strong" },
  { emoji: "🙏", label: "Grateful" },
  { emoji: "💭", label: "Thoughtful" },
  { emoji: "😄", label: "Excited" },
  { emoji: "😴", label: "Tired" },
  { emoji: "🥲", label: "Nostalgic" },
  { emoji: "😤", label: "Frustrated" },
  { emoji: "😢", label: "Sad" },
  { emoji: "🌈", label: "Creative" },
];

interface TaggedUser { id: string; username: string; avatar_url?: string | null; }

interface Props {
  topInset?: number;
  bottomInset?: number;
  isActive?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const CROP_RATIOS: { key: CropRatio; label: string; icon: string }[] = [
  { key: "original", label: "Original", icon: "⬛" },
  { key: "1:1",     label: "1:1",      icon: "⬜" },
  { key: "4:5",     label: "4:5",      icon: "📱" },
];

function previewHeight(ratio: CropRatio): number {
  if (ratio === "1:1") return PREVIEW_W;
  if (ratio === "4:5") return Math.round(PREVIEW_W * 5 / 4);
  return Math.round(PREVIEW_W * 4 / 3);
}

async function cropToRatio(uri: string, imgW: number, imgH: number, ratio: CropRatio): Promise<string> {
  if (ratio === "original" || !imgW || !imgH) return uri;
  const target = ratio === "1:1" ? 1 : 4 / 5;
  const imgAR = imgW / imgH;
  if (Math.abs(imgAR - target) < 0.02) return uri;
  let cropW: number, cropH: number, originX: number, originY: number;
  if (imgAR > target) {
    cropH = imgH; cropW = Math.round(imgH * target); originX = Math.round((imgW - cropW) / 2); originY = 0;
  } else {
    cropW = imgW; cropH = Math.round(imgW / target); originX = 0; originY = Math.round((imgH - cropH) / 2);
  }
  const result = await manipulateAsync(uri, [{ crop: { originX, originY, width: cropW, height: cropH } }], { compress: 0.92, format: SaveFormat.JPEG });
  return result.uri;
}

// ── Module-scope sub-components ───────────────────────────────────────────────
// Must stay at module scope so React doesn't remount them on every render,
// which would cause Ionicons to lose their font reference (□ tofu glyphs).

function AddPostBtn({
  iconName,
  label,
  active,
  onPress,
  useTextIcon,
  textIcon,
}: {
  iconName?: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
  useTextIcon?: boolean;
  textIcon?: string;
}) {
  return (
    <TouchableOpacity style={p.addBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={[p.addBtnCircle, active && p.addBtnCircleActive]}>
        {useTextIcon ? (
          <Text style={[p.addBtnTextIcon, active && p.addBtnTextIconActive]}>{textIcon}</Text>
        ) : iconName ? (
          <Ionicons name={iconName} size={22} color={active ? "#A78BFA" : "rgba(255,255,255,0.6)"} />
        ) : null}
      </View>
      <Text style={[p.addBtnLabel, active && p.addBtnLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TagResultRow({
  item,
  isTagged,
  onToggle,
}: {
  item: SocialMatchUser;
  isTagged: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={p.tagResultRow} onPress={onToggle} activeOpacity={0.8}>
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={p.tagAvatar} />
      ) : (
        <View style={[p.tagAvatar, p.tagAvatarFallback]}>
          <Text style={{ fontSize: 16 }}>👤</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={p.tagResultUsername}>@{item.username}</Text>
        {item.bio ? <Text style={p.tagResultBio} numberOfLines={1}>{item.bio}</Text> : null}
      </View>
      <View style={[p.tagCheckCircle, isTagged && p.tagCheckCircleActive]}>
        {isTagged && <Ionicons name="checkmark" size={13} color="#fff" />}
      </View>
    </TouchableOpacity>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PostPage({ topInset = 0, bottomInset = 0, isActive = false }: Props) {
  const { session } = useAuth();
  const username: string = (session?.user?.user_metadata?.username as string | undefined) ?? session?.user?.email?.split("@")[0] ?? "you";
  const avatarUrl: string | null = (session?.user?.user_metadata?.avatar_url as string | undefined) ?? null;
  const initials = username.slice(0, 2).toUpperCase();

  // Phase
  const [phase, setPhase] = useState<Phase>("idle");

  // Media
  const [rawMedia, setRawMedia] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [previewIdx, setPreviewIdx] = useState(0);
  const carouselRef = useRef<ScrollView>(null);

  // Editing
  const [cropRatio, setCropRatio] = useState<CropRatio>("original");
  const [activeFilter, setActiveFilter] = useState<CameraFilter>(CAMERA_FILTERS[0]!);

  // Video preview
  const [videoThumbnails, setVideoThumbnails] = useState<Record<number, string>>({});
  const [playingVideoIdx, setPlayingVideoIdx] = useState<number | null>(null);

  // Metadata
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);

  // Audience / visibility
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [showAudienceModal, setShowAudienceModal] = useState(false);

  // Tag modal
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [tagResults, setTagResults] = useState<SocialMatchUser[]>([]);
  const [tagLoading, setTagLoading] = useState(false);

  // Location modal
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");

  // Music
  const [selectedMusic, setSelectedMusic] = useState<Track | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);

  // Feeling
  const [feeling, setFeeling] = useState<{ emoji: string; label: string } | null>(null);
  const [showFeelingModal, setShowFeelingModal] = useState(false);

  // Camera
  const cameraRef = useRef<CameraView>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<"front" | "back">("back");

  const PREV_H = previewHeight(cropRatio);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // prevIsActive removed — auto-open gallery on tab switch replaced by the
  // CapCut-style entry screen that lets the user choose their post type.

  // ── Tag search debounce ──────────────────────────────────────────────────
  useEffect(() => {
    if (!showTagModal || tagSearch.trim().length < 2) { setTagResults([]); return; }
    const t = setTimeout(async () => {
      setTagLoading(true);
      try {
        const res = await searchVibeUsers(tagSearch.trim(), session?.user?.id ?? "");
        setTagResults(res);
      } finally { setTagLoading(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [tagSearch, showTagModal, session?.user?.id]);

  // ── Video thumbnails ────────────────────────────────────────────────────
  useEffect(() => {
    if (!rawMedia.some((a) => a.type === "video")) return;
    let cancelled = false;
    (async () => {
      const updates: Record<number, string> = {};
      for (let i = 0; i < rawMedia.length; i++) {
        if (cancelled) return;
        const asset = rawMedia[i];
        if (asset?.type === "video") {
          try {
            const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0 });
            updates[i] = uri;
          } catch {}
        }
      }
      if (!cancelled) setVideoThumbnails(updates);
    })();
    return () => { cancelled = true; };
  }, [rawMedia]);

  // ── Gallery picker ──────────────────────────────────────────────────────
  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"] as ImagePicker.MediaType[],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.9,
    });
    if (!result.canceled && result.assets.length > 0) {
      setRawMedia(result.assets);
      setPreviewIdx(0);
      setCropRatio("original");
      setActiveFilter(CAMERA_FILTERS[0]!);
      setPhase("compose");
    }
  }, []);

  // Auto-open removed — the CapCut-style entry screen now shows on idle so
  // users can choose between Video Post, Photo Post, Gallery, and Camera.

  // ── Camera ──────────────────────────────────────────────────────────────
  const openCamera = useCallback(async () => {
    if (!camPermission?.granted) {
      const { granted } = await requestCamPermission();
      if (!granted) { Alert.alert("Camera permission required"); return; }
    }
    setPhase("camera");
  }, [camPermission, requestCamPermission]);

  const takeCameraPhoto = useCallback(async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (photo) {
        const asset: ImagePicker.ImagePickerAsset = {
          ...photo, type: "image", fileName: "capture.jpg", assetId: null,
          base64: null, exif: null, duration: null, mimeType: "image/jpeg", fileSize: 0,
        };
        setRawMedia([asset]); setPreviewIdx(0); setCropRatio("original");
        setActiveFilter(CAMERA_FILTERS[0]!); setPhase("compose");
      }
    } catch { Alert.alert("Capture failed", "Could not take photo. Try again."); }
  }, []);

  // ── Tag helpers ─────────────────────────────────────────────────────────
  const toggleTag = useCallback((user: SocialMatchUser) => {
    setTaggedUsers((prev) => {
      const exists = prev.some((t) => t.id === user.id);
      if (exists) return prev.filter((t) => t.id !== user.id);
      if (prev.length >= 20) return prev;
      return [...prev, { id: user.id, username: user.username, avatar_url: user.avatar_url }];
    });
  }, []);

  const removeTag = useCallback((id: string) => setTaggedUsers((prev) => prev.filter((t) => t.id !== id)), []);

  // ── Post ────────────────────────────────────────────────────────────────
  const handlePost = useCallback(async () => {
    if (!session?.user?.id) { Alert.alert("Sign in required"); return; }
    if (rawMedia.length === 0) return;
    setPhase("uploading");
    try {
      const finalUris = await Promise.all(
        rawMedia.map(async (asset) => {
          if (asset.type === "video") return asset.uri;
          return cropToRatio(asset.uri, asset.width ?? 0, asset.height ?? 0, cropRatio);
        }),
      );
      const finalCaption = [
        caption.trim(),
        feeling ? `Feeling ${feeling.emoji} ${feeling.label}` : null,
      ].filter(Boolean).join("\n");

      for (const uri of finalUris) {
        await uploadPostMedia(session.user.id, uri, finalCaption, {
          location: location.trim() || undefined,
          taggedUsers: taggedUsers.length ? taggedUsers.map((t) => t.id) : undefined,
          filterId: activeFilter.id !== "none" ? activeFilter.id : undefined,
          visibility,
        });
      }
      setCaption(""); setLocation(""); setTaggedUsers([]);
      setRawMedia([]); setPreviewIdx(0); setCropRatio("original");
      setActiveFilter(CAMERA_FILTERS[0]!); setVisibility("public");
      setSelectedMusic(null); setFeeling(null);
      setPhase("idle");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        rawMedia.length > 1 ? `${rawMedia.length} photos posted! 🔥` : "Posted! 🔥",
        "Your post is live on Gundruk.",
        [
          { text: "View Profile", onPress: () => router.navigate("/(tabs)/profile" as any) },
          { text: "Post Another", style: "cancel" },
        ],
      );
    } catch (err) {
      setPhase("compose");
      Alert.alert("Post failed", err instanceof Error ? err.message : "Please try again.");
    }
  }, [session, rawMedia, cropRatio, activeFilter, caption, location, taggedUsers, visibility, feeling]);

  const discard = useCallback(() => {
    setRawMedia([]); setCaption(""); setLocation("");
    setTaggedUsers([]); setPreviewIdx(0); setCropRatio("original");
    setActiveFilter(CAMERA_FILTERS[0]!); setSelectedMusic(null); setFeeling(null);
    setPhase("idle");
  }, []);

  // ── Audience helper ─────────────────────────────────────────────────────
  const audienceSel = AUDIENCE_OPTIONS.find((o) => o.key === visibility) ?? AUDIENCE_OPTIONS[0]!;

  // ── Idle — CapCut-style entry screen ─────────────────────────────────────
  if (phase === "idle") {
    return (
      <View style={[p.fill, { paddingTop: topInset + 20, paddingBottom: bottomInset + 16 }]}>
        <StatusBar style="light" />

        {/* Header */}
        <Text style={p.homeTitle}>Create Post</Text>
        <Text style={p.homeSub}>What do you want to share?</Text>

        {/* ── Two big action cards ── */}
        <View style={p.bigCardRow}>

          {/* Video Post — gradient card */}
          <TouchableOpacity style={p.bigCard} onPress={pickFromGallery} activeOpacity={0.86}>
            <LinearGradient
              colors={["#EA580C", "#9333EA", "#7C3AED"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={p.bigCardGrad}
            >
              <View style={p.bigCardIconWrap}>
                <Ionicons name="videocam" size={30} color="#fff" />
              </View>
              <Text style={p.bigCardTitle}>Video Post</Text>
              <Text style={p.bigCardSub}>Share a video{"\n"}to your profile</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Photo Post — dark card with accent border */}
          <TouchableOpacity style={p.bigCard} onPress={pickFromGallery} activeOpacity={0.86}>
            <LinearGradient
              colors={["#18102e", "#0e0b1e"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[p.bigCardGrad, p.bigCardDark]}
            >
              <View style={[p.bigCardIconWrap, p.bigCardIconAccent]}>
                <Ionicons name="image" size={30} color="#A78BFA" />
              </View>
              <Text style={p.bigCardTitle}>Photo Post</Text>
              <Text style={p.bigCardSub}>Add a photo{"\n"}to your grid</Text>
            </LinearGradient>
          </TouchableOpacity>

        </View>

        {/* ── Quick-access tiles ── */}
        <Text style={p.quickSectionLabel}>Quick Access</Text>
        <View style={p.quickRow}>

          <TouchableOpacity style={p.quickTile} onPress={pickFromGallery} activeOpacity={0.8}>
            <LinearGradient
              colors={["#EA580C", "#7C3AED"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={p.quickIconCircle}
            >
              <Ionicons name="images-outline" size={22} color="#fff" />
            </LinearGradient>
            <Text style={p.quickTileLabel}>Gallery</Text>
            <Text style={p.quickTileSub}>Choose from library</Text>
          </TouchableOpacity>

          <TouchableOpacity style={p.quickTile} onPress={openCamera} activeOpacity={0.8}>
            <View style={p.quickIconCircleAccent}>
              <Ionicons name="camera-outline" size={22} color="#A78BFA" />
            </View>
            <Text style={p.quickTileLabel}>Camera</Text>
            <Text style={p.quickTileSub}>Take a photo or video</Text>
          </TouchableOpacity>

        </View>
      </View>
    );
  }

  // ── Camera ──────────────────────────────────────────────────────────────
  if (phase === "camera") {
    return (
      <View style={p.fill}>
        <StatusBar style="light" />
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={cameraFacing} />
        <View style={[p.camTopBar, { paddingTop: topInset + 8 }]}>
          <TouchableOpacity style={p.camIconBtn} onPress={() => setPhase("idle")}>
            <Text style={p.camIconText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={p.camIconBtn} onPress={() => setCameraFacing(f => f === "back" ? "front" : "back")}>
            <Text style={p.camIconText}>🔄</Text>
          </TouchableOpacity>
        </View>
        <View style={[p.camBottom, { paddingBottom: bottomInset + 32 }]}>
          <Pressable style={p.camCaptureRing} onPress={takeCameraPhoto}>
            <LinearGradient colors={["#7C3AED", "#EA580C"]} style={p.camCaptureInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          </Pressable>
          <Text style={p.camHint}>Tap to capture</Text>
        </View>
      </View>
    );
  }

  // ── Uploading ────────────────────────────────────────────────────────────
  if (phase === "uploading") {
    return (
      <View style={[p.fill, p.centered]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#A78BFA" />
        <Text style={p.uploadingText}>
          Uploading {rawMedia.length > 1 ? `${rawMedia.length} photos` : "your post"}…
        </Text>
      </View>
    );
  }

  // ── Compose ──────────────────────────────────────────────────────────────
  const hasActiveAddons = !!(selectedMusic || location.trim() || feeling || taggedUsers.length);

  return (
    <View style={p.fill}>
      <StatusBar style="light" />
      <ScrollView
        style={p.fill}
        contentContainerStyle={{ paddingBottom: bottomInset + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Safe-area spacer */}
        <View style={{ height: topInset + 8 }} />

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={p.header}>
          <TouchableOpacity onPress={discard} style={p.discardBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={p.discardText}>Discard</Text>
          </TouchableOpacity>
          <Text style={p.headerTitle}>New Post</Text>
          {/* Audience pill in header */}
          <TouchableOpacity style={p.audiencePill} onPress={() => setShowAudienceModal(true)} activeOpacity={0.8}>
            <Text style={p.audiencePillIcon}>{audienceSel.icon}</Text>
            <Text style={p.audiencePillLabel}>{audienceSel.label}</Text>
            <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        {/* ── Author row ──────────────────────────────────────────────── */}
        <View style={p.authorRow}>
          {/* Gradient-ring avatar */}
          <LinearGradient colors={["#EA580C", "#7C3AED"]} style={p.avatarRing} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={p.avatarInner}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={p.avatarImg} />
              ) : (
                <Text style={p.avatarInitials}>{initials}</Text>
              )}
            </View>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={p.authorName}>{username}</Text>
            <Text style={p.authorSub}>Posting to Gundruk</Text>
          </View>
          {/* Camera button shortcut */}
          <TouchableOpacity style={p.cameraShortcut} onPress={openCamera} activeOpacity={0.8}>
            <Ionicons name="camera-outline" size={20} color="rgba(255,255,255,0.55)" />
          </TouchableOpacity>
        </View>

        {/* ── Caption card ────────────────────────────────────────────── */}
        <View style={p.captionCard}>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder={`What's on your mind, ${username}?`}
            placeholderTextColor="rgba(255,255,255,0.22)"
            multiline
            maxLength={500}
            style={p.captionInput}
          />
          <Text style={p.charCount}>{caption.length} / 500</Text>
        </View>

        {/* ── Crop ratio selector ─────────────────────────────────────── */}
        <View style={p.ratioRow}>
          {CROP_RATIOS.map(({ key, label, icon }) => (
            <TouchableOpacity
              key={key}
              style={[p.ratioBtn, cropRatio === key && p.ratioBtnActive]}
              onPress={() => setCropRatio(key)}
              activeOpacity={0.8}
            >
              <Text style={p.ratioIcon}>{icon}</Text>
              <Text style={[p.ratioLabel, cropRatio === key && p.ratioLabelActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Media carousel ──────────────────────────────────────────── */}
        <View style={[p.previewWrap, { height: PREV_H }]}>
          <ScrollView
            ref={carouselRef}
            horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / PREVIEW_W);
              setPreviewIdx(idx);
              setPlayingVideoIdx(null);
            }}
            style={{ flex: 1 }}
          >
            {rawMedia.map((asset, i) => (
              <View key={i} style={{ width: PREVIEW_W, height: PREV_H, overflow: "hidden" }}>
                {asset.type === "video" ? (
                  playingVideoIdx === i ? (
                    <Video source={{ uri: asset.uri }} style={StyleSheet.absoluteFill}
                      resizeMode={ResizeMode.COVER} useNativeControls shouldPlay
                      onPlaybackStatusUpdate={(s) => { if (s.isLoaded && (s as any).didJustFinish) setPlayingVideoIdx(null); }} />
                  ) : (
                    <>
                      {videoThumbnails[i] ? (
                        <Image source={{ uri: videoThumbnails[i] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      ) : (
                        <View style={p.videoThumb}><ActivityIndicator color="#A78BFA" size="large" /></View>
                      )}
                      <TouchableOpacity style={p.videoPlayOverlay} onPress={() => setPlayingVideoIdx(i)} activeOpacity={0.85}>
                        <View style={p.videoPlayBtn}><Text style={p.videoPlayIcon}>▶</Text></View>
                        <View style={p.videoBadge}><Text style={p.videoBadgeText}>VIDEO</Text></View>
                      </TouchableOpacity>
                    </>
                  )
                ) : (
                  <>
                    <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    {activeFilter.id !== "none" && (
                      activeFilter.grayscale ? (
                        <>
                          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: 0.08 }]} />
                          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#9ca3af", opacity: 0.55, mixBlendMode: "saturation" } as any]} />
                        </>
                      ) : (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: activeFilter.blendColor, opacity: activeFilter.blendOpacity }]} />
                      )
                    )}
                  </>
                )}
              </View>
            ))}
          </ScrollView>

          {rawMedia.length > 1 && (
            <View style={p.dotRow}>
              {rawMedia.map((_, i) => <View key={i} style={[p.dot, i === previewIdx && p.dotActive]} />)}
            </View>
          )}
          {rawMedia.length > 1 && (
            <View style={p.countBadge}><Text style={p.countBadgeText}>{previewIdx + 1}/{rawMedia.length}</Text></View>
          )}

          {/* ── Clear media X button ─────────────────────────────────── */}
          <TouchableOpacity
            style={p.mediaCloseBtn}
            onPress={() => { setRawMedia([]); setPreviewIdx(0); setVideoThumbnails({}); }}
            activeOpacity={0.8}
            hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Filter strip ────────────────────────────────────────────── */}
        <View style={p.filterSection}>
          <View style={p.filterHeaderRow}>
            <Text style={p.sectionLabel}>Filter</Text>
            <Text style={p.filterActiveName}>{activeFilter.label}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.filterScroll}>
            {CAMERA_FILTERS.map((f) => (
              <TouchableOpacity key={f.id} onPress={() => setActiveFilter(f)} style={p.filterThumbWrap} activeOpacity={0.8}>
                <View style={[p.filterThumb, activeFilter.id === f.id && p.filterThumbActive]}>
                  <LinearGradient colors={["#1a0a2e", "#2d1b55"]} style={StyleSheet.absoluteFill} />
                  {f.id === "none" ? (
                    <Text style={p.filterNoneText}>✕</Text>
                  ) : f.grayscale ? (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(180,180,180,0.6)", borderRadius: 12 }]} />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: f.blendColor, opacity: Math.min(1, f.blendOpacity * 3.5), borderRadius: 12 }]} />
                  )}
                  {activeFilter.id === f.id && (
                    <View style={p.filterCheck}>
                      <Text style={{ fontSize: 8, color: "#fff", lineHeight: 11 }}>✓</Text>
                    </View>
                  )}
                </View>
                <Text style={[p.filterLabel, activeFilter.id === f.id && p.filterLabelActive]} numberOfLines={1}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Add to post ─────────────────────────────────────────────── */}
        <View style={p.addToPostCard}>
          <Text style={p.addToPostHeader}>ADD TO POST</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={p.addToPostScroll}
          >
            <AddPostBtn
              iconName="musical-notes-outline"
              label="Music"
              active={!!selectedMusic}
              onPress={() => setShowMusicPicker(true)}
            />
            <AddPostBtn
              iconName="people-outline"
              label="People"
              active={taggedUsers.length > 0}
              onPress={() => { setTagSearch(""); setShowTagModal(true); }}
            />
            <AddPostBtn
              iconName="location-outline"
              label="Location"
              active={!!location.trim()}
              onPress={() => { setLocationDraft(location); setShowLocationModal(true); }}
            />
            <AddPostBtn
              iconName="happy-outline"
              label="Feeling"
              active={!!feeling}
              onPress={() => setShowFeelingModal(true)}
            />
            <AddPostBtn
              useTextIcon
              textIcon="GIF"
              label="GIF"
              active={false}
              onPress={() => Alert.alert("GIF", "GIF attachments are coming soon! 🎞️")}
            />
            <AddPostBtn
              iconName="star-outline"
              label="Effects"
              active={false}
              onPress={() => Alert.alert("Effects", "AR effects and stickers are coming soon! ✨")}
            />
          </ScrollView>

          {/* Active selection chips */}
          {hasActiveAddons && (
            <View style={p.chipRow}>
              {selectedMusic && (
                <TouchableOpacity style={p.chip} onPress={() => setSelectedMusic(null)}>
                  <Ionicons name="musical-notes" size={12} color="#A78BFA" />
                  <Text style={p.chipText} numberOfLines={1}>{selectedMusic.title}</Text>
                  <Ionicons name="close" size={12} color="rgba(167,139,250,0.6)" />
                </TouchableOpacity>
              )}
              {location.trim() ? (
                <TouchableOpacity style={p.chip} onPress={() => setLocation("")}>
                  <Ionicons name="location" size={12} color="#34D399" />
                  <Text style={[p.chipText, { color: "#6EE7B7" }]} numberOfLines={1}>{location}</Text>
                  <Ionicons name="close" size={12} color="rgba(110,231,183,0.6)" />
                </TouchableOpacity>
              ) : null}
              {feeling && (
                <TouchableOpacity style={p.chip} onPress={() => setFeeling(null)}>
                  <Text style={{ fontSize: 12 }}>{feeling.emoji}</Text>
                  <Text style={[p.chipText, { color: "#FCD34D" }]}>{feeling.label}</Text>
                  <Ionicons name="close" size={12} color="rgba(252,211,77,0.6)" />
                </TouchableOpacity>
              )}
              {taggedUsers.length > 0 && (
                <TouchableOpacity style={p.chip} onPress={() => { setTagSearch(""); setShowTagModal(true); }}>
                  <Ionicons name="people" size={12} color="#60A5FA" />
                  <Text style={[p.chipText, { color: "#93C5FD" }]}>
                    {taggedUsers.length === 1 ? `@${taggedUsers[0]!.username}` : `${taggedUsers.length} people`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* ── Change media & post ─────────────────────────────────────── */}
        <TouchableOpacity style={p.changeMedia} onPress={pickFromGallery}>
          <Ionicons name="images-outline" size={14} color="rgba(255,255,255,0.3)" />
          <Text style={p.changeMediaText}>Change selection</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handlePost} activeOpacity={0.85} style={p.postBtnWrap}>
          <LinearGradient
            colors={["#EA580C", "#7C3AED"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={p.postBtn}
          >
            <Text style={p.postBtnText}>
              {rawMedia.length > 1 ? `Share ${rawMedia.length} Photos 🔥` : "Share Post 🔥"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Audience Modal ────────────────────────────────────────────── */}
      <Modal visible={showAudienceModal} transparent animationType="slide" onRequestClose={() => setShowAudienceModal(false)}>
        <View style={p.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowAudienceModal(false)} />
          <View style={[p.sheet, { paddingBottom: bottomInset + 24 }]}>
            <View style={p.sheetHandle} />
            <View style={p.sheetHeader}>
              <Text style={p.sheetTitle}>Who can see this?</Text>
              <TouchableOpacity onPress={() => setShowAudienceModal(false)} style={p.sheetDoneBtn}>
                <Text style={p.sheetDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            {AUDIENCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[p.audienceOption, visibility === opt.key && p.audienceOptionActive]}
                onPress={() => { setVisibility(opt.key); setShowAudienceModal(false); }}
                activeOpacity={0.8}
              >
                <Text style={p.audienceOptionIcon}>{opt.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={p.audienceOptionLabel}>{opt.label}</Text>
                  <Text style={p.audienceOptionDesc}>{opt.desc}</Text>
                </View>
                {visibility === opt.key && (
                  <View style={p.audienceCheck}>
                    <Ionicons name="checkmark" size={13} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Location Modal ────────────────────────────────────────────── */}
      <Modal visible={showLocationModal} transparent animationType="slide" onRequestClose={() => setShowLocationModal(false)}>
        <View style={p.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowLocationModal(false)} />
          <View style={[p.sheet, { paddingBottom: bottomInset + 24 }]}>
            <View style={p.sheetHandle} />
            <View style={p.sheetHeader}>
              <Text style={p.sheetTitle}>Add Location</Text>
              <TouchableOpacity
                onPress={() => { setLocation(locationDraft); setShowLocationModal(false); }}
                style={p.sheetDoneBtn}
              >
                <Text style={p.sheetDoneText}>Save</Text>
              </TouchableOpacity>
            </View>
            <View style={p.locationRow}>
              <Ionicons name="location-outline" size={20} color="#34D399" />
              <TextInput
                value={locationDraft}
                onChangeText={setLocationDraft}
                placeholder="City, neighbourhood, venue…"
                placeholderTextColor="rgba(255,255,255,0.28)"
                autoCorrect={false}
                autoFocus
                maxLength={80}
                style={p.locationInput}
              />
              {locationDraft.length > 0 && (
                <TouchableOpacity onPress={() => setLocationDraft("")}>
                  <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              )}
            </View>
            {location.trim() ? (
              <TouchableOpacity style={p.locationClear} onPress={() => { setLocation(""); setShowLocationModal(false); }}>
                <Text style={p.locationClearText}>Remove location</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ── Tag People Modal ──────────────────────────────────────────── */}
      <Modal visible={showTagModal} transparent animationType="slide" onRequestClose={() => setShowTagModal(false)}>
        <View style={p.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowTagModal(false)} />
          <View style={[p.sheet, { paddingBottom: bottomInset + 16 }]}>
            <View style={p.sheetHandle} />
            <View style={p.sheetHeader}>
              <Text style={p.sheetTitle}>Tag People</Text>
              <TouchableOpacity onPress={() => setShowTagModal(false)} style={p.sheetDoneBtn}>
                <Text style={p.sheetDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={p.tagSearchRow}>
              <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.4)" />
              <TextInput
                value={tagSearch} onChangeText={setTagSearch}
                placeholder="Search username…" placeholderTextColor="rgba(255,255,255,0.3)"
                autoCorrect={false} autoCapitalize="none" style={p.tagSearchInput} autoFocus
              />
              {tagSearch.length > 0 && (
                <TouchableOpacity onPress={() => setTagSearch("")}>
                  <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              )}
            </View>
            {taggedUsers.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.tagChipScroll} style={{ maxHeight: 44 }}>
                {taggedUsers.map((u) => (
                  <TouchableOpacity key={u.id} style={p.tagChip} onPress={() => removeTag(u.id)}>
                    <Text style={p.tagChipText}>@{u.username}</Text>
                    <Ionicons name="close" size={11} color="rgba(167,139,250,0.6)" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {tagLoading ? (
              <ActivityIndicator color="#A78BFA" style={{ marginTop: 24 }} />
            ) : (
              <FlatList
                data={tagResults}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <TagResultRow
                    item={item}
                    isTagged={taggedUsers.some((t) => t.id === item.id)}
                    onToggle={() => toggleTag(item)}
                  />
                )}
                ListEmptyComponent={
                  <Text style={p.tagEmptyText}>
                    {tagSearch.length >= 2 ? `No users found for "${tagSearch}"` : "Type at least 2 characters to search"}
                  </Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Feeling Modal ─────────────────────────────────────────────── */}
      <Modal visible={showFeelingModal} transparent animationType="slide" onRequestClose={() => setShowFeelingModal(false)}>
        <View style={p.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowFeelingModal(false)} />
          <View style={[p.sheet, { paddingBottom: bottomInset + 24 }]}>
            <View style={p.sheetHandle} />
            <View style={p.sheetHeader}>
              <Text style={p.sheetTitle}>How are you feeling?</Text>
              <TouchableOpacity onPress={() => setShowFeelingModal(false)} style={p.sheetDoneBtn}>
                <Text style={p.sheetDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            {feeling && (
              <TouchableOpacity style={p.feelingClearBtn} onPress={() => { setFeeling(null); setShowFeelingModal(false); }}>
                <Text style={p.feelingClearText}>Clear feeling</Text>
              </TouchableOpacity>
            )}
            <FlatList
              data={FEELINGS}
              numColumns={4}
              keyExtractor={(item) => item.label}
              style={{ maxHeight: 280 }}
              contentContainerStyle={{ paddingHorizontal: 4 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[p.feelingOption, feeling?.label === item.label && p.feelingOptionActive]}
                  onPress={() => { setFeeling(item); setShowFeelingModal(false); }}
                  activeOpacity={0.75}
                >
                  <Text style={p.feelingEmoji}>{item.emoji}</Text>
                  <Text style={[p.feelingLabel, feeling?.label === item.label && p.feelingLabelActive]} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── Music Picker ──────────────────────────────────────────────── */}
      <MusicPickerSheet
        visible={showMusicPicker}
        onClose={() => setShowMusicPicker(false)}
        onSelect={setSelectedMusic}
        selectedTrack={selectedMusic}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const p = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#080810" },
  centered: { alignItems: "center", justifyContent: "center" },

  // ── CapCut-style home entry screen ───────────────────────────────────────
  homeTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 24, paddingHorizontal: 20, marginBottom: 4 },
  homeSub: { color: "rgba(255,255,255,0.38)", fontFamily: "Poppins_400Regular", fontSize: 13, paddingHorizontal: 20, marginBottom: 24 },

  // Big cards
  bigCardRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginBottom: 28 },
  bigCard: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  bigCardGrad: { padding: 18, minHeight: 170, justifyContent: "flex-end", gap: 4 },
  bigCardDark: { borderWidth: 1, borderColor: "rgba(124,58,237,0.4)" },
  bigCardIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  bigCardIconAccent: { backgroundColor: "rgba(124,58,237,0.28)" },
  bigCardTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  bigCardSub: { color: "rgba(255,255,255,0.55)", fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 17 },

  // Quick-access tiles
  quickSectionLabel: {
    color: "rgba(255,255,255,0.28)",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  quickRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16 },
  quickTile: {
    flex: 1,
    backgroundColor: "#0F0F1E",
    borderRadius: 18,
    padding: 18,
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.07)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  quickIconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  quickIconCircleAccent: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(124,58,237,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.35)",
  },
  quickTileLabel: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  quickTileSub: { color: "rgba(255,255,255,0.3)", fontFamily: "Poppins_400Regular", fontSize: 10, textAlign: "center" },

  // Legacy fallback keys kept so any residual references don't break
  fallbackEmoji: { fontSize: 44, marginBottom: 12 },
  fallbackTitle: { color: "#fff", fontSize: 20, fontFamily: "Poppins_700Bold", marginBottom: 6 },
  fallbackSub: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", paddingHorizontal: 32, marginBottom: 28 },
  fallbackRow: { flexDirection: "row", gap: 12 },
  fallbackBtn: { borderRadius: 16, overflow: "hidden" },
  fallbackBtnGrad: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 13, paddingHorizontal: 22 },
  fallbackBtnSecondary: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 13, paddingHorizontal: 22, backgroundColor: "#111126", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)" },
  fallbackBtnIcon: { fontSize: 18 },
  fallbackBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },

  // Camera
  camTopBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  camIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  camIconText: { fontSize: 18, color: "#fff" },
  camBottom: { position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center", gap: 10 },
  camCaptureRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: "rgba(255,255,255,0.7)", padding: 5 },
  camCaptureInner: { flex: 1, borderRadius: 36 },
  camHint: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: "Poppins_400Regular" },

  // Uploading
  uploadingText: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_500Medium", fontSize: 15, marginTop: 16, textAlign: "center", paddingHorizontal: 32 },

  // ── Compose ──
  // Header
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, height: 50 },
  discardBtn: { paddingVertical: 4, paddingRight: 8 },
  discardText: { color: "#EF4444", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  headerTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  audiencePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#111126", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)" },
  audiencePillIcon: { fontSize: 13 },
  audiencePillLabel: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_600SemiBold", fontSize: 12 },

  // Author row
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  avatarRing: { width: 50, height: 50, borderRadius: 25, padding: 2.5, alignItems: "center", justifyContent: "center" },
  avatarInner: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: "#1a1a32", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 45, height: 45, borderRadius: 22.5 },
  avatarInitials: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  authorName: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  authorSub: { color: "rgba(255,255,255,0.38)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  cameraShortcut: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#111126", alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" },

  // Caption card
  captionCard: { marginHorizontal: 16, marginBottom: 14, backgroundColor: "#0F0F1E", borderRadius: 20, borderWidth: 1, borderColor: "rgba(124,58,237,0.25)", padding: 16 },
  captionInput: { fontSize: 16, fontFamily: "Poppins_400Regular", color: "#F8F8FF", minHeight: 110, textAlignVertical: "top", lineHeight: 24 },
  charCount: { color: "rgba(255,255,255,0.2)", fontFamily: "Poppins_400Regular", fontSize: 11, textAlign: "right", marginTop: 8 },

  // Crop ratio
  ratioRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginHorizontal: 16, marginBottom: 12 },
  ratioBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12, backgroundColor: "#111126", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)", gap: 3 },
  ratioBtnActive: { backgroundColor: "rgba(124,58,237,0.25)", borderColor: "#7C3AED" },
  ratioIcon: { fontSize: 16 },
  ratioLabel: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
  ratioLabelActive: { color: "#A78BFA" },

  // Preview
  previewWrap: { marginHorizontal: 16, borderRadius: 18, overflow: "hidden", backgroundColor: "#111126", marginBottom: 4 },
  videoThumb: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a2e" },
  videoPlayOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  videoPlayBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(0,0,0,0.58)", alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: "rgba(255,255,255,0.8)" },
  videoPlayIcon: { fontSize: 26, color: "#fff", marginLeft: 5 },
  videoBadge: { position: "absolute", bottom: 12, right: 12, backgroundColor: "rgba(0,0,0,0.58)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  videoBadgeText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 10, letterSpacing: 0.8 },
  dotRow: { position: "absolute", bottom: 10, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)" },
  dotActive: { backgroundColor: "#fff", width: 18, borderRadius: 3 },
  countBadge: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  countBadgeText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  mediaCloseBtn: {
    position: "absolute", top: 10, left: 10,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },

  // Filter
  filterSection: { marginHorizontal: 16, marginTop: 14, marginBottom: 4 },
  filterHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionLabel: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_600SemiBold", fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  filterActiveName: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  filterScroll: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  filterThumbWrap: { alignItems: "center", gap: 5, width: 58 },
  filterThumb: { width: 52, height: 52, borderRadius: 12, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  filterThumbActive: { borderColor: "#A78BFA" },
  filterCheck: { position: "absolute", bottom: 3, right: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
  filterNoneText: { color: "rgba(255,255,255,0.4)", fontSize: 14 },
  filterLabel: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "Poppins_500Medium", textAlign: "center" },
  filterLabelActive: { color: "#A78BFA" },

  // Add to post card
  addToPostCard: { marginHorizontal: 16, marginTop: 18, backgroundColor: "#0F0F1E", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", paddingTop: 16, paddingBottom: 12, overflow: "hidden" },
  addToPostHeader: { color: "rgba(255,255,255,0.38)", fontFamily: "Poppins_600SemiBold", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", paddingHorizontal: 16, marginBottom: 12 },
  addToPostScroll: { paddingHorizontal: 12, gap: 4 },

  // Add post buttons (rendered at module scope as AddPostBtn component)
  addBtn: { alignItems: "center", gap: 6, width: 68, paddingVertical: 4 },
  addBtnCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#16162A", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", alignItems: "center", justifyContent: "center" },
  addBtnCircleActive: { backgroundColor: "rgba(124,58,237,0.22)", borderColor: "#7C3AED" },
  addBtnTextIcon: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_700Bold", fontSize: 13, letterSpacing: 0.5 },
  addBtnTextIconActive: { color: "#A78BFA" },
  addBtnLabel: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_500Medium", fontSize: 11, textAlign: "center" },
  addBtnLabelActive: { color: "#A78BFA" },

  // Chips
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(124,58,237,0.18)", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(124,58,237,0.35)", maxWidth: 180 },
  chipText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 12, flexShrink: 1 },

  // Change media
  changeMedia: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 16, marginTop: 14, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12 },
  changeMediaText: { color: "rgba(255,255,255,0.3)", fontFamily: "Poppins_500Medium", fontSize: 13 },

  // Post button
  postBtnWrap: { marginHorizontal: 16, marginTop: 12, borderRadius: 20, overflow: "hidden" },
  postBtn: { paddingVertical: 18, alignItems: "center", justifyContent: "center" },
  postBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17, letterSpacing: 0.3 },

  // Shared modal styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingHorizontal: 16, maxHeight: "85%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "center", marginBottom: 16 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  sheetTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  sheetDoneBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "rgba(124,58,237,0.28)", borderRadius: 14 },
  sheetDoneText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 14 },

  // Audience
  audienceOption: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.06)" },
  audienceOptionActive: { backgroundColor: "rgba(124,58,237,0.08)", borderRadius: 12, paddingHorizontal: 10 },
  audienceOptionIcon: { fontSize: 24, width: 34, textAlign: "center" },
  audienceOptionLabel: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  audienceOptionDesc: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  audienceCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },

  // Location modal
  locationRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#1a1a2e", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" },
  locationInput: { flex: 1, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15, paddingVertical: 14 },
  locationClear: { marginTop: 14, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16 },
  locationClearText: { color: "#EF4444", fontFamily: "Poppins_500Medium", fontSize: 14 },

  // Tag modal
  tagSearchRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1a1a2e", borderRadius: 14, paddingHorizontal: 12, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" },
  tagSearchInput: { flex: 1, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15, paddingVertical: 12 },
  tagChipScroll: { gap: 8, paddingVertical: 4, paddingHorizontal: 2 },
  tagChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(124,58,237,0.3)", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(124,58,237,0.5)" },
  tagChipText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  tagResultRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.06)" },
  tagAvatar: { width: 44, height: 44, borderRadius: 22 },
  tagAvatarFallback: { backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" },
  tagResultUsername: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  tagResultBio: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  tagCheckCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  tagCheckCircleActive: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  tagEmptyText: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", marginTop: 24, paddingHorizontal: 16 },

  // Feeling modal
  feelingClearBtn: { alignSelf: "flex-start", marginBottom: 12, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(239,68,68,0.15)", borderRadius: 12 },
  feelingClearText: { color: "#FCA5A5", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  feelingOption: { flex: 1, margin: 5, alignItems: "center", paddingVertical: 12, borderRadius: 16, backgroundColor: "#16162A", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", gap: 4 },
  feelingOptionActive: { backgroundColor: "rgba(124,58,237,0.25)", borderColor: "#7C3AED" },
  feelingEmoji: { fontSize: 26 },
  feelingLabel: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_500Medium", fontSize: 10, textAlign: "center" },
  feelingLabelActive: { color: "#A78BFA" },
});
