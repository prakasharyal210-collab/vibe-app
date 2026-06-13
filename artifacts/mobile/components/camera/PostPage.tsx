import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { uploadPostMedia } from "@/lib/db";

const { width: W } = Dimensions.get("window");
const PREVIEW_H = W * 1.1;

interface Props {
  topInset?: number;
  bottomInset?: number;
}

type Phase = "idle" | "camera" | "compose" | "uploading";

export default function PostPage({ topInset = 0, bottomInset = 0 }: Props) {
  const { session } = useAuth();
  const cameraRef = useRef<CameraView>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<"front" | "back">("back");

  const [phase, setPhase] = useState<Phase>("idle");
  const [selectedMedia, setSelectedMedia] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [previewIdx, setPreviewIdx] = useState(0);

  // ── Gallery picker ──────────────────────────────────────────────────────────
  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.9,
    });
    if (!result.canceled && result.assets.length > 0) {
      setSelectedMedia(result.assets);
      setPreviewIdx(0);
      setPhase("compose");
    }
  };

  // ── In-app camera ───────────────────────────────────────────────────────────
  const openCamera = async () => {
    if (!camPermission?.granted) {
      const { granted } = await requestCamPermission();
      if (!granted) { Alert.alert("Camera permission required"); return; }
    }
    setPhase("camera");
  };

  const takeCameraPhoto = async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (photo) {
        setSelectedMedia([{ ...photo, type: "image", fileName: "capture.jpg", assetId: null, base64: null, exif: null, duration: null, mimeType: "image/jpeg", fileSize: 0 }]);
        setPreviewIdx(0);
        setPhase("compose");
      }
    } catch {
      Alert.alert("Capture failed", "Could not take photo. Try again.");
    }
  };

  // ── Post ────────────────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!session?.user?.id || selectedMedia.length === 0) {
      if (!session?.user?.id) Alert.alert("Sign in required", "Please sign in to post.");
      return;
    }
    setPhase("uploading");
    try {
      for (const asset of selectedMedia) {
        await uploadPostMedia(session.user.id, asset.uri, caption.trim(), {
          location: location.trim() || undefined,
        });
      }
      setCaption(""); setLocation(""); setSelectedMedia([]); setPreviewIdx(0);
      setPhase("idle");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Posted! 🔥", "Your post is live on Gundruk.", [
        { text: "View Profile", onPress: () => router.navigate("/(tabs)/profile" as any) },
        { text: "Post Another", style: "cancel" },
      ]);
    } catch (err) {
      setPhase("compose");
      Alert.alert("Post failed", err instanceof Error ? err.message : "Please try again.");
    }
  };

  const discard = () => {
    setSelectedMedia([]); setCaption(""); setLocation(""); setPreviewIdx(0);
    setPhase("idle");
  };

  // ── Idle phase ──────────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <View style={[p.fill, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <StatusBar style="light" />
        <View style={p.idleInner}>
          <Text style={p.idleTitle}>New Post</Text>
          <Text style={p.idleSub}>Share to your Gundruk profile grid</Text>

          <TouchableOpacity onPress={pickFromGallery} activeOpacity={0.85}>
            <LinearGradient
              colors={["#7C3AED22", "#EA580C18"]}
              style={p.bigCard}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <View style={p.bigCardIconWrap}>
                <Text style={p.bigCardIcon}>🖼️</Text>
              </View>
              <Text style={p.bigCardTitle}>Choose from Gallery</Text>
              <Text style={p.bigCardSub}>Select up to 10 photos or videos</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={openCamera} activeOpacity={0.85}>
            <View style={[p.bigCard, { backgroundColor: "#111126" }]}>
              <View style={p.bigCardIconWrap}>
                <Text style={p.bigCardIcon}>📷</Text>
              </View>
              <Text style={p.bigCardTitle}>Take a Photo</Text>
              <Text style={p.bigCardSub}>Capture a new photo right now</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Camera phase ────────────────────────────────────────────────────────────
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
            <LinearGradient
              colors={["#7C3AED", "#EA580C"]}
              style={p.camCaptureInner}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            />
          </Pressable>
          <Text style={p.camHint}>Tap to capture</Text>
        </View>
      </View>
    );
  }

  // ── Uploading phase ─────────────────────────────────────────────────────────
  if (phase === "uploading") {
    return (
      <View style={[p.fill, p.centered]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#A78BFA" />
        <Text style={p.uploadingText}>
          Posting {selectedMedia.length > 1 ? `${selectedMedia.length} photos` : "your post"}…
        </Text>
      </View>
    );
  }

  // ── Compose phase ───────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={p.fill}
      contentContainerStyle={{ paddingTop: topInset + 8, paddingBottom: bottomInset + 32 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar style="light" />

      {/* Header */}
      <View style={p.composeHeader}>
        <TouchableOpacity onPress={discard} style={p.discardBtn}>
          <Text style={p.discardText}>Discard</Text>
        </TouchableOpacity>
        <Text style={p.composeTitle}>New Post</Text>
        <View style={{ width: 72 }} />
      </View>

      {/* Media carousel */}
      <View style={p.previewWrap}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onMomentumScrollEnd={(e) =>
            setPreviewIdx(Math.round(e.nativeEvent.contentOffset.x / (W - 32)))
          }
          style={{ borderRadius: 18, overflow: "hidden" }}
        >
          {selectedMedia.map((asset, i) => (
            <View key={i} style={{ width: W - 32, height: PREVIEW_H }}>
              {asset.type === "video" ? (
                <View style={p.videoThumb}>
                  <Text style={p.videoThumbIcon}>🎬</Text>
                  <Text style={p.videoThumbLabel}>Video</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: asset.uri }}
                  style={{ width: W - 32, height: PREVIEW_H }}
                  resizeMode="cover"
                />
              )}
            </View>
          ))}
        </ScrollView>

        {/* Dots + count */}
        {selectedMedia.length > 1 && (
          <>
            <View style={p.dotRow}>
              {selectedMedia.map((_, i) => (
                <View key={i} style={[p.dot, i === previewIdx && p.dotActive]} />
              ))}
            </View>
            <View style={p.countBadge}>
              <Text style={p.countBadgeText}>{previewIdx + 1}/{selectedMedia.length}</Text>
            </View>
          </>
        )}
      </View>

      {/* Caption */}
      <View style={p.section}>
        <Text style={p.sectionLabel}>Caption</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a caption…"
          placeholderTextColor="rgba(255,255,255,0.25)"
          multiline
          maxLength={500}
          style={p.captionInput}
        />
        <Text style={p.charCount}>{caption.length} / 500</Text>
      </View>

      {/* Location */}
      <View style={p.section}>
        <Text style={p.sectionLabel}>Location (optional)</Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Add a location…"
          placeholderTextColor="rgba(255,255,255,0.25)"
          maxLength={80}
          style={p.locationInput}
        />
      </View>

      {/* Change media */}
      <TouchableOpacity style={p.changeMedia} onPress={pickFromGallery}>
        <Text style={p.changeMediaText}>🖼️ Change selection</Text>
      </TouchableOpacity>

      {/* Post button */}
      <TouchableOpacity onPress={handlePost} activeOpacity={0.85} style={p.postBtnWrap}>
        <LinearGradient
          colors={["#7C3AED", "#EA580C"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={p.postBtn}
        >
          <Text style={p.postBtnText}>
            {selectedMedia.length > 1
              ? `Post ${selectedMedia.length} Photos 🔥`
              : "Post 🔥"}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const p = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#080810" },
  centered: { alignItems: "center", justifyContent: "center" },

  idleInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  idleTitle: {
    color: "#fff",
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    marginBottom: 4,
  },
  idleSub: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    marginBottom: 12,
  },
  bigCard: {
    width: W - 48,
    borderRadius: 20,
    padding: 24,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  bigCardIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  bigCardIcon: { fontSize: 28 },
  bigCardTitle: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Poppins_700Bold",
  },
  bigCardSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },

  camTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  camIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  camIconText: { fontSize: 18, color: "#fff" },
  camBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 10,
  },
  camCaptureRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.7)",
    padding: 5,
  },
  camCaptureInner: {
    flex: 1,
    borderRadius: 36,
  },
  camHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },

  uploadingText: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
    marginTop: 16,
  },

  composeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 44,
  },
  discardBtn: { padding: 4 },
  discardText: {
    color: "#EF4444",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  composeTitle: {
    color: "#fff",
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
  },

  previewWrap: {
    marginHorizontal: 16,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#111126",
    height: PREVIEW_H,
    marginBottom: 8,
  },
  videoThumb: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a2e",
  },
  videoThumbIcon: { fontSize: 44 },
  videoThumbLabel: {
    color: "rgba(255,255,255,0.5)",
    marginTop: 8,
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },

  dotRow: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 18,
    borderRadius: 3,
  },
  countBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countBadgeText: {
    color: "#fff",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },

  section: {
    marginHorizontal: 16,
    marginTop: 16,
    gap: 8,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  captionInput: {
    backgroundColor: "#111126",
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    color: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    minHeight: 80,
    textAlignVertical: "top",
  },
  charCount: {
    color: "rgba(255,255,255,0.25)",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    textAlign: "right",
  },
  locationInput: {
    backgroundColor: "#111126",
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    color: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    height: 50,
  },

  changeMedia: {
    marginHorizontal: 16,
    marginTop: 12,
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changeMediaText: {
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },

  postBtnWrap: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 18,
    overflow: "hidden",
  },
  postBtn: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  postBtnText: {
    color: "#fff",
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    letterSpacing: 0.3,
  },
});
