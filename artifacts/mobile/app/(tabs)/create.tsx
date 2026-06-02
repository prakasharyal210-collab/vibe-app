import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const { width: W, height: H } = Dimensions.get("window");

type CreateMode = "post" | "video" | "live";

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
  { id: "d2", image: "https://picsum.photos/seed/draft2/200/300", label: "City vibes reel", time: "1d ago" },
];

function PostMode({ colors, isLoggedIn, onRequireLogin }: { colors: any; isLoggedIn: boolean; onRequireLogin: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", allowsEditing: true, quality: 0.85 });
    if (!result.canceled && result.assets[0]) setImage(result.assets[0].uri);
  };

  const handlePost = async () => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    if (!image) { Alert.alert("No media", "Please select a photo first"); return; }
    setUploading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setUploading(false);
    setImage(null);
    setCaption("");
    Alert.alert("Posted! 🎉", "Your post is now live on Vibe");
  };

  const POST_TYPES = [
    { icon: "camera-outline", label: "Photo" },
    { icon: "videocam-outline", label: "Video" },
    { icon: "radio-outline", label: "Story" },
    { icon: "images-outline", label: "Album" },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.postTypeRow}>
        {POST_TYPES.map((t) => (
          <TouchableOpacity key={t.label} onPress={pickImage} style={[styles.postTypeBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Ionicons name={t.icon as any} size={22} color="#7C3AED" />
            <Text style={[styles.postTypeLabel, { color: colors.foreground }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={pickImage} style={[styles.mediaPicker, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        {image ? (
          <>
            <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <TouchableOpacity style={styles.removeImg} onPress={() => setImage(null)}>
              <Ionicons name="close-circle" size={26} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Ionicons name="images-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.mediaPickerText, { color: colors.mutedForeground }]}>Tap to select from gallery</Text>
            <Text style={[styles.mediaPickerSub, { color: colors.mutedForeground }]}>Photos & videos up to 60s</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.postForm}>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a caption... #hashtags @mentions"
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={500}
          style={[styles.captionInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
        />
        <View style={[styles.postOptions, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {[
            { icon: "person-add-outline", label: "Tag people", color: "#7C3AED" },
            { icon: "location-outline", label: "Add location", color: "#F97316" },
            { icon: "color-filter-outline", label: "Filters", color: "#EC4899" },
            { icon: "earth-outline", label: "Audience: Everyone", color: "#3B82F6" },
          ].map((opt, i, arr) => (
            <TouchableOpacity key={opt.label} onPress={() => Alert.alert(opt.label, "Coming soon")}
              style={[styles.optionRow, { borderBottomColor: colors.border }, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <Ionicons name={opt.icon as any} size={18} color={opt.color} />
              <Text style={[styles.optionText, { color: colors.foreground }]}>{opt.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.postActions}>
          <TouchableOpacity onPress={() => Alert.alert("Saved!", "Draft saved locally")}
            style={[styles.draftBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}>
            <Ionicons name="document-outline" size={16} color={colors.foreground} />
            <Text style={[styles.draftBtnText, { color: colors.foreground }]}>Save Draft</Text>
          </TouchableOpacity>
          <GradientButton onPress={handlePost} title="Post Now" loading={uploading} style={{ flex: 1 }} />
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

  const durationSecs: Record<string, number> = { "15s": 15, "30s": 30, "60s": 60, "3min": 180 };

  const hasPermission = camPermission?.granted;
  const needsPermission = camPermission !== null && !hasPermission;

  const handleRequestPermissions = async () => {
    await requestCamPermission();
    await requestMicPermission();
  };

  const handleRecordToggle = async () => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    if (captureMode === "photo") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85, skipProcessing: false });
        if (photo?.uri) setRecordedUri(photo.uri);
      } catch (e) {
        Alert.alert("Photo failed", "Could not capture photo. Try again.");
      }
      return;
    }
    if (recording) {
      cameraRef.current?.stopRecording();
    } else {
      setRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      try {
        const maxDuration = durationSecs[selectedDuration] ?? 15;
        const result = await cameraRef.current?.recordAsync({ maxDuration });
        if (result?.uri) setRecordedUri(result.uri);
      } catch (e) {}
      setRecording(false);
    }
  };

  const cycleFlash = () => {
    setFlashMode((f) => f === "off" ? "on" : f === "on" ? "auto" : "off");
  };

  const flashIcon = flashMode === "off" ? "flash-off-outline" : flashMode === "on" ? "flash-outline" : "flash-outline";
  const flashColor = flashMode === "off" ? "rgba(255,255,255,0.6)" : flashMode === "on" ? "#EAB308" : "#60A5FA";

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
        <Text style={[styles.permSub, { color: colors.mutedForeground }]}>
          Allow camera and microphone to record videos and take photos
        </Text>
        <GradientButton onPress={handleRequestPermissions} title="Allow Camera & Mic" style={{ width: 240, marginTop: 8 }} />
      </View>
    );
  }

  if (recordedUri) {
    const isPhoto = captureMode === "photo";
    return (
      <View style={[styles.previewWrap, { backgroundColor: "#000" }]}>
        <Image source={{ uri: recordedUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        <View style={styles.previewTop}>
          <TouchableOpacity onPress={() => setRecordedUri(null)} style={styles.previewBtn}>
            <Ionicons name="close" size={22} color="#fff" />
            <Text style={styles.previewBtnText}>Discard</Text>
          </TouchableOpacity>
          <Text style={styles.previewTitle}>{isPhoto ? "Photo Preview" : "Video Preview"}</Text>
          <TouchableOpacity
            onPress={() => {
              setRecordedUri(null);
              Alert.alert("Posted! 🔥", "Your " + (isPhoto ? "photo" : "reel") + " is now live on Vibe");
            }}
            style={styles.previewPostBtn}>
            <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.previewPostGrad}>
              <Text style={styles.previewPostText}>Post</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <View style={styles.previewActions}>
          <TouchableOpacity onPress={() => Alert.alert("Music", "Add music coming soon")} style={styles.previewAction}>
            <Ionicons name="musical-notes" size={22} color="#fff" />
            <Text style={styles.previewActionLabel}>Music</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Alert.alert("Text", "Add text coming soon")} style={styles.previewAction}>
            <Ionicons name="text-outline" size={22} color="#fff" />
            <Text style={styles.previewActionLabel}>Text</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Alert.alert("Filters", "Filters coming soon")} style={styles.previewAction}>
            <Ionicons name="color-filter-outline" size={22} color="#fff" />
            <Text style={styles.previewActionLabel}>Filter</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Alert.alert("Stickers", "Stickers coming soon")} style={styles.previewAction}>
            <Ionicons name="happy-outline" size={22} color="#fff" />
            <Text style={styles.previewActionLabel}>Stickers</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={[styles.viewfinder, { backgroundColor: "#000" }]}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flashMode}
          mode="video"
        />
        <LinearGradient colors={["rgba(0,0,0,0.3)", "transparent", "rgba(0,0,0,0.4)"]} style={StyleSheet.absoluteFill} />

        <View style={styles.toolsOverlay}>
          {TOOLS.map((tool) => (
            <TouchableOpacity key={tool.id} onPress={() => Alert.alert(tool.label.replace("\n", " "), "Tool coming soon ✨")} style={styles.toolBtn}>
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

        <TouchableOpacity onPress={handleRecordToggle}
          style={[styles.recordBtnWrap, recording && { borderColor: "#EF4444" }]}>
          {recording ? (
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
              {flashMode === "off" ? "Flash" : flashMode === "on" ? "Flash On" : "Auto"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity key="music" style={styles.sideActionBtn} onPress={() => Alert.alert("Music", "Music tool coming soon")}>
            <Ionicons name="musical-notes" size={22} color="#fff" />
            <Text style={styles.sideActionLabel}>Music</Text>
          </TouchableOpacity>
          <TouchableOpacity key="effects" style={styles.sideActionBtn} onPress={() => Alert.alert("Effects", "Effects tool coming soon")}>
            <Ionicons name="sparkles-outline" size={22} color="#fff" />
            <Text style={styles.sideActionLabel}>Effects</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sideActionBtn} onPress={() => setShowDrafts((s) => !s)}>
            <Ionicons name="document-text" size={22} color="#fff" />
            <Text style={styles.sideActionLabel}>Drafts</Text>
          </TouchableOpacity>
        </View>
      </View>

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
  durationRow: { position: "absolute", top: 12, alignSelf: "center", flexDirection: "row", gap: 6 },
  durationPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.5)" },
  durationText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  captureModeRow: { position: "absolute", bottom: 26, left: 0, right: 0, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  captureModePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.4)" },
  captureModePillText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  recordBtnWrap: { position: "absolute", bottom: 70, alignSelf: "center", width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  recordBtn: { width: 58, height: 58, borderRadius: 29 },
  recordSquare: { width: 22, height: 22, borderRadius: 4, backgroundColor: "#fff" },
  viewfinderSideActions: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center", gap: 18 },
  sideActionBtn: { alignItems: "center", gap: 2 },
  sideActionLabel: { color: "rgba(255,255,255,0.85)", fontSize: 9, fontFamily: "Poppins_400Regular" },
  previewWrap: { flex: 1, minHeight: H * 0.6 },
  previewTop: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  previewBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  previewBtnText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  previewTitle: { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
  previewPostBtn: { borderRadius: 16, overflow: "hidden" },
  previewPostGrad: { paddingHorizontal: 18, paddingVertical: 8 },
  previewPostText: { color: "#fff", fontSize: 14, fontFamily: "Poppins_700Bold" },
  previewActions: { position: "absolute", bottom: 40, left: 0, right: 0, flexDirection: "row", justifyContent: "space-evenly" },
  previewAction: { alignItems: "center", gap: 4 },
  previewActionLabel: { color: "#fff", fontSize: 11, fontFamily: "Poppins_500Medium" },
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
});
