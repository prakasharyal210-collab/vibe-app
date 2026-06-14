import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { StoryInteractionSheet, InteractionConfig } from "@/components/StoryInteractionSheet";
import { createStory, uploadStoryMedia, createFeedPost } from "@/lib/db";
import { UserAvatar } from "@/components/UserAvatar";

const { width: W } = Dimensions.get("window");

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

type Mode = "sheet" | "text" | "media-edit" | "share-options" | "uploading" | "posted-viewer";
type Audience = "public" | "friends" | "close_friends";

export interface PendingStory {
  textContent?: string;
  bgGradient?: string;
  mediaUri?: string;
  caption?: string;
  storyType: "text" | "image" | "video";
}

interface CreateStorySheetProps {
  visible: boolean;
  onClose: () => void;
  onPost?: () => void;
  userId?: string;
  username?: string;
}

// ─── Text Story Editor ────────────────────────────────────────────────────────

function TextStoryEditor({
  onClose,
  onNext,
}: {
  onClose: () => void;
  onNext: (opts: { textContent: string; bgGradient: string }) => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [bgIdx, setBgIdx] = useState(0);
  const [fontSize, setFontSize] = useState(1);
  const [alignIdx, setAlignIdx] = useState(1);
  const [showInteractions, setShowInteractions] = useState(false);
  const [activeInteraction, setActiveInteraction] = useState<InteractionConfig | null>(null);

  const gradient = BG_GRADIENTS[bgIdx];
  const align = TEXT_ALIGNS[alignIdx];
  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;
  const botPad = Platform.OS === "web" ? 20 : insets.bottom + 16;

  const handleNext = () => {
    if (!text.trim()) {
      Alert.alert("Empty Story", "Add some text first!");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onNext({ textContent: text, bgGradient: gradient.join(",") });
  };

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
            style={[editorStyles.storyText, { fontSize: FONT_SIZES[fontSize], textAlign: align }]}
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
              <TouchableOpacity key={i} onPress={() => setBgIdx(i)} style={[editorStyles.bgSwatch, bgIdx === i && editorStyles.bgSwatchSelected]}>
                <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={editorStyles.bgSwatchInner} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={editorStyles.nextRow}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={handleNext} style={editorStyles.nextBtn}>
              <Text style={editorStyles.nextBtnText}>Next  →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <StoryInteractionSheet
        visible={showInteractions}
        onClose={() => setShowInteractions(false)}
        onSelect={(config) => { setActiveInteraction(config); setShowInteractions(false); }}
      />
    </>
  );
}

// ─── Media Edit Screen ────────────────────────────────────────────────────────

const EDIT_TOOLS = [
  { icon: "musical-notes", label: "Music" },
  { icon: "heart", label: "Stickers" },
  { icon: "chatbubble", label: "Text" },
  { icon: "sparkles", label: "Effects" },
  { icon: "person-add", label: "Mention" },
] as const;

function MediaEditScreen({
  uri,
  storyType,
  username,
  onBack,
  onNext,
}: {
  uri: string;
  storyType: "image" | "video";
  username: string;
  onBack: () => void;
  onNext: (caption: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState("");
  const [showCaption, setShowCaption] = useState(false);
  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;
  const botPad = Platform.OS === "web" ? 20 : insets.bottom + 16;

  const stub = (name: string) =>
    Alert.alert(name, "Coming soon ✨", [{ text: "OK" }]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={{ uri }} style={[StyleSheet.absoluteFill, { resizeMode: "cover" }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.15)" }]} />

      {/* Top bar */}
      <View style={[meStyles.topBar, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={onBack} style={meStyles.circleBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => stub("Music")} style={meStyles.musicChip}>
          <Ionicons name="musical-notes" size={14} color="#fff" />
          <Text style={meStyles.musicChipText}>Add music</Text>
        </TouchableOpacity>
        <View style={meStyles.topRight}>
          <TouchableOpacity onPress={() => stub("More options")} style={meStyles.circleBtn}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onBack} style={meStyles.circleBtn}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Caption text input (if text tool tapped) */}
      {showCaption && (
        <View style={meStyles.captionWrap}>
          <TextInput
            style={meStyles.captionInput}
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption..."
            placeholderTextColor="rgba(255,255,255,0.55)"
            multiline
            maxLength={150}
            autoFocus
            onBlur={() => { if (!caption.trim()) setShowCaption(false); }}
          />
        </View>
      )}

      {/* Bottom toolbar */}
      <View style={[meStyles.toolbar, { paddingBottom: botPad + 68 }]}>
        {EDIT_TOOLS.map((tool) => (
          <TouchableOpacity
            key={tool.label}
            style={meStyles.toolItem}
            onPress={() => {
              if (tool.label === "Text") { setShowCaption(true); return; }
              stub(tool.label);
            }}
          >
            <View style={meStyles.toolIconWrap}>
              <Ionicons name={tool.icon as any} size={22} color="#fff" />
            </View>
            <Text style={meStyles.toolLabel}>{tool.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bottom posting bar */}
      <View style={[meStyles.bottomBar, { paddingBottom: botPad }]}>
        <View style={meStyles.yourStoryChip}>
          <UserAvatar username={username} size={28} />
          <Text style={meStyles.yourStoryText}>Your story</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onNext(caption);
          }}
          style={meStyles.nextBtn}
        >
          <Text style={meStyles.nextBtnText}>Next</Text>
          <Ionicons name="chevron-forward" size={18} color="#000" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Share Options Screen ─────────────────────────────────────────────────────

const AUDIENCE_LABELS: Record<Audience, string> = {
  public: "🌍  Public",
  friends: "👥  Friends",
  close_friends: "💚  Close Friends",
};

function ShareOptionsScreen({
  pending,
  username,
  audience,
  alsoShareFeed,
  onAudienceChange,
  onAlsoShareChange,
  onBack,
  onShare,
}: {
  pending: PendingStory;
  username: string;
  audience: Audience;
  alsoShareFeed: boolean;
  onAudienceChange: (a: Audience) => void;
  onAlsoShareChange: (v: boolean) => void;
  onBack: () => void;
  onShare: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const botPad = Platform.OS === "web" ? 24 : insets.bottom + 16;
  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;

  const isText = pending.storyType === "text";
  const bgColors: [string, string] = pending.bgGradient
    ? (pending.bgGradient.split(",").slice(0, 2) as [string, string])
    : ["#7C3AED", "#EA580C"];

  const pickAudience = () => {
    const opts = Object.entries(AUDIENCE_LABELS) as [Audience, string][];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...opts.map(([, l]) => l), "Cancel"], cancelButtonIndex: opts.length },
        (idx) => { if (idx < opts.length) onAudienceChange(opts[idx][0]); },
      );
    } else {
      Alert.alert("Story Audience", "Who can see your story?",
        [...opts.map(([k, l]) => ({ text: l, onPress: () => onAudienceChange(k) })),
         { text: "Cancel", style: "cancel" as const }],
      );
    }
  };

  return (
    <View style={[soStyles.container, { backgroundColor: colors.background }]}>
      {/* Top bar */}
      <View style={[soStyles.topBar, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={onBack} style={soStyles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[soStyles.title, { color: colors.foreground }]}>Share to</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Story preview thumbnail */}
      <View style={soStyles.previewWrap}>
        <View style={soStyles.previewCard}>
          {isText ? (
            <LinearGradient colors={bgColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
              {pending.textContent ? (
                <View style={soStyles.previewTextWrap}>
                  <Text style={soStyles.previewText} numberOfLines={4}>{pending.textContent}</Text>
                </View>
              ) : null}
            </LinearGradient>
          ) : pending.mediaUri ? (
            <Image source={{ uri: pending.mediaUri }} style={[StyleSheet.absoluteFill, { resizeMode: "cover" }]} />
          ) : null}
          {/* Story label overlay */}
          <View style={soStyles.previewOverlay}>
            <UserAvatar username={username} size={22} />
            <Text style={soStyles.previewUsername} numberOfLines={1}>{username}</Text>
          </View>
        </View>
      </View>

      {/* Options */}
      <View style={[soStyles.section, { borderColor: colors.border }]}>
        <Text style={[soStyles.sectionLabel, { color: colors.mutedForeground }]}>Sharing options</Text>

        {/* Audience */}
        <TouchableOpacity onPress={pickAudience} style={[soStyles.row, { borderBottomColor: colors.border }]}>
          <Ionicons name="earth-outline" size={20} color={colors.foreground} />
          <View style={soStyles.rowBody}>
            <Text style={[soStyles.rowTitle, { color: colors.foreground }]}>Story audience</Text>
            <Text style={[soStyles.rowValue, { color: colors.mutedForeground }]}>{AUDIENCE_LABELS[audience]}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* Also share to feed */}
        <View style={[soStyles.row, { borderBottomColor: colors.border }]}>
          <Ionicons name="grid-outline" size={20} color={colors.foreground} />
          <View style={soStyles.rowBody}>
            <Text style={[soStyles.rowTitle, { color: colors.foreground }]}>Also share to feed</Text>
            <Text style={[soStyles.rowValue, { color: colors.mutedForeground }]}>Post to your profile grid</Text>
          </View>
          <Switch
            value={alsoShareFeed}
            onValueChange={onAlsoShareChange}
            trackColor={{ false: colors.border, true: "#7C3AED" }}
            thumbColor="#fff"
          />
        </View>

        {/* Send as message */}
        <TouchableOpacity
          onPress={() => Alert.alert("Send as message", "Coming soon ✨")}
          style={[soStyles.row, { borderBottomWidth: 0 }]}
        >
          <Ionicons name="chatbubble-outline" size={20} color={colors.foreground} />
          <View style={soStyles.rowBody}>
            <Text style={[soStyles.rowTitle, { color: colors.foreground }]}>Send as message</Text>
            <Text style={[soStyles.rowValue, { color: colors.mutedForeground }]}>Share directly with a friend</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Share button */}
      <View style={[soStyles.shareWrap, { paddingBottom: botPad }]}>
        <TouchableOpacity
          onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onShare(); }}
          style={soStyles.shareBtn}
          activeOpacity={0.85}
        >
          <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={soStyles.shareGrad}>
            <Text style={soStyles.shareBtnText}>Share  ✦</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Posted Story Viewer ──────────────────────────────────────────────────────

export function PostedStoryViewer({
  pending,
  username,
  onClose,
  onAddNew,
}: {
  pending: PendingStory;
  username: string;
  onClose: () => void;
  onAddNew: () => void;
}) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;
  const botPad = Platform.OS === "web" ? 20 : insets.bottom + 16;

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 8000,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => { if (finished) onClose(); });
    return () => anim.stop();
  }, []);

  const isText = pending.storyType === "text" || !!pending.textContent;
  const bgColors: [string, string] = pending.bgGradient
    ? (pending.bgGradient.split(",").slice(0, 2) as [string, string])
    : ["#7C3AED", "#EA580C"];

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={StyleSheet.absoluteFill}>
      {isText ? (
        <LinearGradient colors={bgColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : pending.mediaUri ? (
        <>
          <Image source={{ uri: pending.mediaUri }} style={[StyleSheet.absoluteFill, { resizeMode: "cover" }]} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.18)" }]} />
        </>
      ) : null}

      {/* Progress bar */}
      <View style={[pvStyles.progressWrap, { paddingTop: topPad - 4 }]}>
        <View style={pvStyles.progressTrack}>
          <Animated.View style={[pvStyles.progressFill, { width: progressWidth }]} />
        </View>
      </View>

      {/* Top bar */}
      <View style={[pvStyles.topBar, { paddingTop: topPad + 8 }]}>
        <View style={pvStyles.userRow}>
          <UserAvatar username={username} size={34} />
          <View style={{ marginLeft: 10 }}>
            <Text style={pvStyles.username}>{username || "Your story"}</Text>
            <Text style={pvStyles.timestamp}>Just now · Your story</Text>
          </View>
        </View>
        <View style={pvStyles.topActions}>
          <TouchableOpacity style={pvStyles.circleBtn}>
            <Ionicons name="ellipsis-horizontal" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={pvStyles.circleBtn}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Text content overlay */}
      {isText && pending.textContent ? (
        <View style={pvStyles.textContent} pointerEvents="none">
          <Text style={pvStyles.textStory}>{pending.textContent}</Text>
        </View>
      ) : null}

      {/* Caption for media stories */}
      {!isText && pending.caption ? (
        <View style={pvStyles.captionBadge} pointerEvents="none">
          <Text style={pvStyles.captionText}>{pending.caption}</Text>
        </View>
      ) : null}

      {/* Bottom viewer bar */}
      <View style={[pvStyles.bottomBar, { paddingBottom: botPad }]}>
        <View style={pvStyles.viewersChip}>
          <Ionicons name="eye-outline" size={15} color="rgba(255,255,255,0.75)" />
          <Text style={pvStyles.viewersText}>No viewers yet</Text>
        </View>
        <View style={pvStyles.actions}>
          <TouchableOpacity onPress={onAddNew} style={pvStyles.actionBtn}>
            <View style={pvStyles.actionIconWrap}>
              <Ionicons name="add" size={20} color="#fff" />
            </View>
            <Text style={pvStyles.actionLabel}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Alert.alert("Share", "Coming soon ✨")} style={pvStyles.actionBtn}>
            <View style={pvStyles.actionIconWrap}>
              <Ionicons name="paper-plane-outline" size={18} color="#fff" />
            </View>
            <Text style={pvStyles.actionLabel}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Alert.alert("Share as post", "Coming soon ✨")} style={pvStyles.actionBtn}>
            <View style={pvStyles.actionIconWrap}>
              <Ionicons name="grid-outline" size={18} color="#fff" />
            </View>
            <Text style={pvStyles.actionLabel}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Uploading overlay ────────────────────────────────────────────────────────

function UploadingOverlay() {
  return (
    <View style={uploadStyles.wrap}>
      <LinearGradient colors={["#0F172A", "#1E1B4B"]} style={StyleSheet.absoluteFill} />
      <View style={uploadStyles.card}>
        <View style={uploadStyles.spinner}>
          <Ionicons name="cloud-upload-outline" size={40} color="#7C3AED" />
        </View>
        <Text style={uploadStyles.title}>Sharing your story…</Text>
        <Text style={uploadStyles.sub}>This only takes a moment</Text>
      </View>
    </View>
  );
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

export function CreateStorySheet({ visible, onClose, onPost, userId, username = "" }: CreateStorySheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("sheet");
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedType, setPickedType] = useState<"image" | "video">("image");
  const [pending, setPending] = useState<PendingStory | null>(null);
  const [audience, setAudience] = useState<Audience>("public");
  const [alsoShareFeed, setAlsoShareFeed] = useState(false);

  const botPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  const resetAndClose = () => {
    setMode("sheet");
    setPickedUri(null);
    setPending(null);
    onClose();
  };

  // ── Pickers ──────────────────────────────────────────────────────────────

  const handleGallery = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow gallery access in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true, aspect: [9, 16] });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
      setPickedType("image");
      setMode("media-edit");
    }
  };

  const handleCamera = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access in Settings.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true, aspect: [9, 16] });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
      setPickedType("image");
      setMode("media-edit");
    }
  };

  const handleQuickClip = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access in Settings.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 15, quality: ImagePicker.UIImagePickerControllerQualityType.Medium });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
      setPickedType("video");
      setMode("media-edit");
    }
  };

  // ── Editing done → share options ─────────────────────────────────────────

  const handleTextNext = (opts: { textContent: string; bgGradient: string }) => {
    setPending({ storyType: "text", textContent: opts.textContent, bgGradient: opts.bgGradient });
    setMode("share-options");
  };

  const handleMediaNext = (caption: string) => {
    if (!pickedUri) return;
    setPending({ storyType: pickedType, mediaUri: pickedUri, caption });
    setMode("share-options");
  };

  // ── Share ─────────────────────────────────────────────────────────────────

  const handleShare = async () => {
    if (!pending || !userId) return;
    setMode("uploading");

    // Create the story
    if (pending.storyType === "text") {
      await createStory({
        userId,
        storyType: "text",
        textContent: pending.textContent,
        bgGradient: pending.bgGradient,
      }).catch(() => null);
    } else {
      await uploadStoryMedia(userId, pending.mediaUri!, pending.caption, pending.storyType).catch(() => null);
    }

    // Cross-post to feed if requested
    if (alsoShareFeed) {
      if (pending.storyType === "text") {
        await createFeedPost({ userId, caption: pending.textContent ?? "" }).catch(() => null);
      } else if (pending.mediaUri) {
        await createFeedPost({ userId, caption: pending.caption, mediaUri: pending.mediaUri }).catch(() => null);
      }
    }

    setMode("posted-viewer");
  };

  // ── Options grid ──────────────────────────────────────────────────────────

  const options = [
    { icon: "camera-outline", label: "Camera", sub: "Take a photo", onPress: handleCamera, color: "#7C3AED" },
    { icon: "image-outline", label: "Gallery", sub: "Choose from library", onPress: handleGallery, color: "#F97316" },
    { icon: "chatbubble", label: "Text Story", sub: "Colored background", onPress: () => setMode("text"), color: "#EC4899" },
    { icon: "refresh", label: "Quick Clip", sub: "Short looping video", onPress: handleQuickClip, color: "#3B82F6" },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      {mode === "text" ? (
        <TextStoryEditor
          onClose={() => setMode("sheet")}
          onNext={handleTextNext}
        />
      ) : mode === "media-edit" && pickedUri ? (
        <MediaEditScreen
          uri={pickedUri}
          storyType={pickedType}
          username={username}
          onBack={() => setMode("sheet")}
          onNext={handleMediaNext}
        />
      ) : mode === "share-options" && pending ? (
        <ShareOptionsScreen
          pending={pending}
          username={username}
          audience={audience}
          alsoShareFeed={alsoShareFeed}
          onAudienceChange={setAudience}
          onAlsoShareChange={setAlsoShareFeed}
          onBack={() => setMode(pending.storyType === "text" ? "text" : "media-edit")}
          onShare={handleShare}
        />
      ) : mode === "uploading" ? (
        <UploadingOverlay />
      ) : mode === "posted-viewer" && pending ? (
        <PostedStoryViewer
          pending={pending}
          username={username}
          onClose={() => { setMode("sheet"); setPending(null); onPost?.(); onClose(); }}
          onAddNew={() => { setMode("sheet"); setPending(null); }}
        />
      ) : (
        /* ── Initial picker sheet ── */
        <View style={sheetStyles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={resetAndClose} />
          <View style={[sheetStyles.sheet, { backgroundColor: colors.card, paddingBottom: botPad }]}>
            <View style={[sheetStyles.handle, { backgroundColor: colors.border }]} />
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

            <TouchableOpacity onPress={resetAndClose} style={sheetStyles.cancelBtn}>
              <Text style={[sheetStyles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Modal>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────

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
  nextRow: { flexDirection: "row", justifyContent: "flex-end" },
  nextBtn: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 22, paddingHorizontal: 22, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  nextBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  interactionBadge: { position: "absolute", top: "45%", alignSelf: "center", backgroundColor: "rgba(139,92,246,0.85)", borderRadius: 16, paddingHorizontal: 18, paddingVertical: 10, zIndex: 20 },
  interactionBadgeText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
});

const meStyles = StyleSheet.create({
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, zIndex: 10, gap: 10 },
  circleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  musicChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 8 },
  musicChipText: { color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 13 },
  topRight: { flexDirection: "row", gap: 8 },
  captionWrap: { position: "absolute", left: 20, right: 20, top: "40%" },
  captionInput: { backgroundColor: "rgba(0,0,0,0.5)", color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 16, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  toolbar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 16 },
  toolItem: { alignItems: "center", gap: 4 },
  toolIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  toolLabel: { color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_500Medium", fontSize: 11 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 12 },
  yourStoryChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8, flex: 1 },
  yourStoryText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  nextBtn: { backgroundColor: "#fff", borderRadius: 22, paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 4 },
  nextBtnText: { color: "#000", fontFamily: "Poppins_700Bold", fontSize: 16 },
});

const soStyles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 18, textAlign: "center" },
  previewWrap: { alignItems: "center", paddingVertical: 20 },
  previewCard: { width: 110, height: 195, borderRadius: 16, overflow: "hidden", position: "relative" },
  previewTextWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  previewText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13, textAlign: "center" },
  previewOverlay: { position: "absolute", bottom: 6, left: 6, right: 6, flexDirection: "row", alignItems: "center", gap: 4 },
  previewUsername: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 10, flex: 1 },
  section: { marginHorizontal: 16, borderRadius: 16, borderWidth: 0.5, overflow: "hidden" },
  sectionLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: 0.5 },
  rowBody: { flex: 1 },
  rowTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  rowValue: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  shareWrap: { paddingHorizontal: 20, paddingTop: 24 },
  shareBtn: { borderRadius: 16, overflow: "hidden" },
  shareGrad: { paddingVertical: 16, alignItems: "center" },
  shareBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17, letterSpacing: 0.5 },
});

const pvStyles = StyleSheet.create({
  progressWrap: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 10, zIndex: 20 },
  progressTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 2 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, zIndex: 10 },
  userRow: { flexDirection: "row", alignItems: "center" },
  topActions: { flexDirection: "row", gap: 8 },
  circleBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  username: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
  timestamp: { color: "rgba(255,255,255,0.65)", fontFamily: "Poppins_400Regular", fontSize: 11 },
  textContent: { ...StyleSheet.absoluteFillObject as any, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  textStory: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 28, textAlign: "center", textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8, lineHeight: 38 },
  captionBadge: { position: "absolute", bottom: 140, left: 0, right: 0, paddingHorizontal: 20 },
  captionText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15, textAlign: "center", textShadowColor: "rgba(0,0,0,0.7)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 14, backgroundColor: "rgba(0,0,0,0.55)" },
  viewersChip: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  viewersText: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_500Medium", fontSize: 13 },
  actions: { flexDirection: "row", gap: 6 },
  actionBtn: { alignItems: "center", gap: 3, paddingHorizontal: 10 },
  actionIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  actionLabel: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_500Medium", fontSize: 11 },
});

const uploadStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { alignItems: "center", gap: 12, padding: 32 },
  spinner: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(124,58,237,0.15)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 18 },
  sub: { color: "rgba(255,255,255,0.55)", fontFamily: "Poppins_400Regular", fontSize: 14 },
});
