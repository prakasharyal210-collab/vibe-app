import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { StoryInteractionSheet, InteractionConfig } from "@/components/StoryInteractionSheet";
import { createStory, uploadStoryMedia } from "@/lib/db";

const { width: W, height: H } = Dimensions.get("window");

const BG_GRADIENTS: [string, string][] = [
  ["#7C3AED", "#EA580C"],
  ["#1D4ED8", "#7C3AED"],
  ["#DB2777", "#EA580C"],
  ["#059669", "#0891B2"],
  ["#DC2626", "#DB2777"],
  ["#0F172A", "#1E293B"],
  ["#F97316", "#FBBF24"],
  ["#7C3AED", "#DB2777"],
];

const FONT_SIZES = [18, 24, 32, 42];
const TEXT_ALIGNS: ("left" | "center" | "right")[] = ["left", "center", "right"];

type Mode = "sheet" | "text" | "media";

interface CreateStorySheetProps {
  visible: boolean;
  onClose: () => void;
  onPost?: () => void;
  userId?: string;
}

// ─── Text Story Editor ────────────────────────────────────────────────────────

function TextStoryEditor({ onClose, onPost }: { onClose: () => void; onPost: (opts: { textContent: string; bgGradient: string }) => void }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [bgIdx, setBgIdx] = useState(0);
  const [fontSize, setFontSize] = useState(1);
  const [alignIdx, setAlignIdx] = useState(1);
  const [showInteractions, setShowInteractions] = useState(false);
  const [activeInteraction, setActiveInteraction] = useState<InteractionConfig | null>(null);

  const gradient = BG_GRADIENTS[bgIdx];
  const align = TEXT_ALIGNS[alignIdx];

  const handlePost = () => {
    if (!text.trim()) {
      Alert.alert("Empty Story", "Add some text to your story first!");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPost({ textContent: text, bgGradient: gradient.join(",") });
  };

  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;
  const botPad = Platform.OS === "web" ? 20 : insets.bottom + 16;

  return (
    <>
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

        <View style={[editorStyles.topBar, { paddingTop: topPad }]}>
          <TouchableOpacity onPress={onClose} style={editorStyles.circleBtn}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={editorStyles.topTools}>
            <TouchableOpacity onPress={() => setFontSize((f) => (f + 1) % FONT_SIZES.length)} style={editorStyles.toolBtn}>
              <Text style={editorStyles.toolLabel}>Aa</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAlignIdx((a) => (a + 1) % TEXT_ALIGNS.length)} style={editorStyles.toolBtn}>
              <Text style={editorStyles.toolLabel}>
                {align === "left" ? "⬅" : align === "center" ? "↔" : "➡"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowInteractions(true)} style={[editorStyles.toolBtn, { backgroundColor: "rgba(139,92,246,0.5)" }]}>
              <Text style={editorStyles.toolLabel}>✨</Text>
            </TouchableOpacity>
          </View>
        </View>

        {activeInteraction && (
          <View style={editorStyles.interactionBadge} pointerEvents="none">
            <Text style={editorStyles.interactionBadgeText}>
              {activeInteraction.type === "poll" ? "📊" :
               activeInteraction.type === "question" ? "❓" :
               activeInteraction.type === "slider" ? activeInteraction.emoji ?? "❤️" :
               activeInteraction.type === "quiz" ? "🧠" : "⏰"}{" "}
              {activeInteraction.question || activeInteraction.type}
            </Text>
          </View>
        )}

        <View style={editorStyles.textArea} pointerEvents="box-none">
          <TextInput
            style={[
              editorStyles.storyText,
              { fontSize: FONT_SIZES[fontSize], textAlign: align },
            ]}
            value={text}
            onChangeText={setText}
            placeholder="Type something..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            multiline
            autoFocus
            maxLength={200}
            textAlignVertical="center"
          />
        </View>

        <View style={[editorStyles.bottomBar, { paddingBottom: botPad }]}>
          <Text style={editorStyles.bgLabel}>Background</Text>
          <View style={editorStyles.bgRow}>
            {BG_GRADIENTS.map((g, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setBgIdx(i)}
                style={[editorStyles.bgSwatch, bgIdx === i && editorStyles.bgSwatchSelected]}
              >
                <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={editorStyles.bgSwatchInner} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={editorStyles.postRow}>
            <TouchableOpacity style={editorStyles.closeFriendsBtn}>
              <Ionicons name="people-outline" size={16} color="#fff" />
              <Text style={editorStyles.closeFriendsText}>Close Friends</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePost} style={editorStyles.postBtn}>
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={editorStyles.postGrad}>
                <Text style={editorStyles.postText}>Your Story →</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <StoryInteractionSheet
        visible={showInteractions}
        onClose={() => setShowInteractions(false)}
        onSelect={(config) => {
          setActiveInteraction(config);
          setShowInteractions(false);
        }}
      />
    </>
  );
}

// ─── Media Story Editor ───────────────────────────────────────────────────────

function MediaStoryEditor({
  uri,
  storyType,
  onClose,
  onPost,
}: {
  uri: string;
  storyType: "image" | "video";
  onClose: () => void;
  onPost: (opts: { mediaUri: string; caption: string; storyType: "image" | "video" }) => void;
}) {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState("");
  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;
  const botPad = Platform.OS === "web" ? 20 : insets.bottom + 16;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={{ uri }} style={[StyleSheet.absoluteFill, { resizeMode: "cover" }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.25)" }]} />

      {/* Top bar */}
      <View style={[editorStyles.topBar, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={onClose} style={editorStyles.circleBtn}>
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={mediaStyles.typeLabel}>
          {storyType === "video" ? "🎬 Video" : "📷 Photo"}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Caption input */}
      <View style={[mediaStyles.captionWrap, { bottom: botPad + 70 }]}>
        <TextInput
          style={mediaStyles.captionInput}
          value={caption}
          onChangeText={setCaption}
          placeholder="Add a caption..."
          placeholderTextColor="rgba(255,255,255,0.55)"
          multiline
          maxLength={150}
        />
      </View>

      {/* Bottom post bar */}
      <View style={[editorStyles.postRow, { position: "absolute", left: 16, right: 16, bottom: botPad }]}>
        <TouchableOpacity style={editorStyles.closeFriendsBtn}>
          <Ionicons name="people-outline" size={16} color="#fff" />
          <Text style={editorStyles.closeFriendsText}>Close Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onPost({ mediaUri: uri, caption, storyType });
          }}
          style={editorStyles.postBtn}
        >
          <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={editorStyles.postGrad}>
            <Text style={editorStyles.postText}>Your Story →</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

export function CreateStorySheet({ visible, onClose, onPost, userId }: CreateStorySheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("sheet");
  const [showSuccess, setShowSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedType, setPickedType] = useState<"image" | "video">("image");

  const botPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  const handleTextStory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode("text");
  };

  const handleGallery = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to your gallery in Settings to pick a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
      setPickedType("image");
      setMode("media");
    }
  };

  const handleCamera = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access in Settings to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
      setPickedType("image");
      setMode("media");
    }
  };

  const handleBoomerang = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access in Settings to record a video.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: 15,
      quality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
      setPickedType("video");
      setMode("media");
    }
  };

  const handlePost = async (storyOpts?: {
    textContent?: string;
    bgGradient?: string;
    mediaUri?: string;
    caption?: string;
    storyType?: "text" | "image" | "video";
  }) => {
    setMode("sheet");
    setUploading(true);

    if (userId && storyOpts) {
      if (storyOpts.mediaUri) {
        await uploadStoryMedia(
          userId,
          storyOpts.mediaUri,
          storyOpts.caption,
          storyOpts.storyType === "video" ? "video" : "image",
        ).catch(() => null);
      } else {
        await createStory({
          userId,
          storyType: "text",
          textContent: storyOpts.textContent,
          bgGradient: storyOpts.bgGradient,
        }).catch(() => null);
      }
    }

    setUploading(false);
    setShowSuccess(true);
    setPickedUri(null);

    setTimeout(() => {
      setShowSuccess(false);
      onPost?.();
      onClose();
    }, 1600);
  };

  const handleClose = () => {
    setMode("sheet");
    setPickedUri(null);
    onClose();
  };

  const options = [
    { icon: "camera-outline", label: "Camera", sub: "Take photo or video", onPress: handleCamera, color: "#7C3AED" },
    { icon: "images-outline", label: "Gallery", sub: "Choose from your library", onPress: handleGallery, color: "#F97316" },
    { icon: "text", label: "Text Story", sub: "Colored background with text", onPress: handleTextStory, color: "#EC4899" },
    { icon: "repeat-outline", label: "Quick Clip", sub: "Short looping video", onPress: handleBoomerang, color: "#3B82F6" },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      {mode === "text" ? (
        <TextStoryEditor onClose={() => setMode("sheet")} onPost={handlePost} />
      ) : mode === "media" && pickedUri ? (
        <MediaStoryEditor
          uri={pickedUri}
          storyType={pickedType}
          onClose={() => setMode("sheet")}
          onPost={handlePost}
        />
      ) : (
        <View style={[sheetStyles.overlay]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
          <View style={[sheetStyles.sheet, { backgroundColor: colors.card, paddingBottom: botPad }]}>
            <View style={[sheetStyles.handle, { backgroundColor: colors.border }]} />

            {uploading ? (
              <View style={sheetStyles.successWrap}>
                <ActivityIndicator size="large" color="#7C3AED" />
                <Text style={[sheetStyles.successSub, { color: colors.mutedForeground, marginTop: 12 }]}>Uploading your story…</Text>
              </View>
            ) : showSuccess ? (
              <View style={sheetStyles.successWrap}>
                <Text style={sheetStyles.successEmoji}>✨</Text>
                <Text style={[sheetStyles.successTitle, { color: colors.foreground }]}>Story Posted!</Text>
                <Text style={[sheetStyles.successSub, { color: colors.mutedForeground }]}>Your story is now live for 24 hours</Text>
              </View>
            ) : (
              <>
                <Text style={[sheetStyles.title, { color: colors.foreground }]}>Create Story</Text>
                <Text style={[sheetStyles.sub, { color: colors.mutedForeground }]}>Share a moment with your followers</Text>

                <View style={sheetStyles.optionsGrid}>
                  {options.map((opt) => (
                    <TouchableOpacity key={opt.label} onPress={opt.onPress} style={[sheetStyles.optionCard, { backgroundColor: colors.muted, borderColor: colors.border }]} activeOpacity={0.8}>
                      <View style={[sheetStyles.optionIcon, { backgroundColor: opt.color + "22" }]}>
                        <Ionicons name={opt.icon as any} size={26} color={opt.color} />
                      </View>
                      <Text style={[sheetStyles.optionLabel, { color: colors.foreground }]}>{opt.label}</Text>
                      <Text style={[sheetStyles.optionSub, { color: colors.mutedForeground }]}>{opt.sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity onPress={handleClose} style={sheetStyles.cancelBtn}>
                  <Text style={[sheetStyles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 20 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 20, textAlign: "center" },
  sub: { fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", marginBottom: 20 },
  optionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  optionCard: { width: (W - 64) / 2, padding: 16, borderRadius: 18, borderWidth: 0.5, alignItems: "center", gap: 8 },
  optionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  optionLabel: { fontFamily: "Poppins_700Bold", fontSize: 14 },
  optionSub: { fontFamily: "Poppins_400Regular", fontSize: 11, textAlign: "center", lineHeight: 15 },
  cancelBtn: { paddingVertical: 18, alignItems: "center" },
  cancelText: { fontFamily: "Poppins_500Medium", fontSize: 15 },
  successWrap: { alignItems: "center", paddingVertical: 32, gap: 8 },
  successEmoji: { fontSize: 56 },
  successTitle: { fontFamily: "Poppins_700Bold", fontSize: 20 },
  successSub: { fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center" },
});

const editorStyles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, zIndex: 10 },
  circleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  topTools: { flexDirection: "row", gap: 10 },
  toolBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  toolLabel: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
  textArea: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  storyText: { color: "#fff", fontFamily: "Poppins_700Bold", textAlign: "center", width: "100%", textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  bottomBar: { paddingHorizontal: 16, gap: 12 },
  bgLabel: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_500Medium", fontSize: 12 },
  bgRow: { flexDirection: "row", gap: 8 },
  bgSwatch: { width: 32, height: 32, borderRadius: 16, padding: 2 },
  bgSwatchSelected: { padding: 2, borderWidth: 2, borderColor: "#fff" },
  bgSwatchInner: { flex: 1, borderRadius: 14 },
  postRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  closeFriendsBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, flex: 1, justifyContent: "center" },
  closeFriendsText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  postBtn: { flex: 2, borderRadius: 14, overflow: "hidden" },
  postGrad: { paddingVertical: 13, alignItems: "center" },
  postText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  interactionBadge: { position: "absolute", top: "45%", alignSelf: "center", backgroundColor: "rgba(139,92,246,0.85)", borderRadius: 16, paddingHorizontal: 18, paddingVertical: 10, zIndex: 20 },
  interactionBadgeText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
});

const mediaStyles = StyleSheet.create({
  typeLabel: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  captionWrap: { position: "absolute", left: 16, right: 16 },
  captionInput: {
    color: "#fff",
    fontFamily: "Poppins_500Medium",
    fontSize: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
