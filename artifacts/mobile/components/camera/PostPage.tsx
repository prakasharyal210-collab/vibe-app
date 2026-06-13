import * as Haptics from "expo-haptics";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
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

const { width: W } = Dimensions.get("window");
const PREVIEW_W = W - 32;

// ── Types ─────────────────────────────────────────────────────────────────────
type CropRatio = "original" | "1:1" | "4:5";
type Phase = "idle" | "camera" | "compose" | "uploading";

interface TaggedUser {
  id: string;
  username: string;
  avatar_url?: string | null;
}

interface Props {
  topInset?: number;
  bottomInset?: number;
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
  return Math.round(PREVIEW_W * 4 / 3);   // original ≈ 4:3
}

async function cropToRatio(
  uri: string,
  imgW: number,
  imgH: number,
  ratio: CropRatio,
): Promise<string> {
  if (ratio === "original" || !imgW || !imgH) return uri;
  const target = ratio === "1:1" ? 1 : 4 / 5;
  const imgAR = imgW / imgH;
  if (Math.abs(imgAR - target) < 0.02) return uri;

  let cropW: number, cropH: number, originX: number, originY: number;
  if (imgAR > target) {
    cropH = imgH;
    cropW = Math.round(imgH * target);
    originX = Math.round((imgW - cropW) / 2);
    originY = 0;
  } else {
    cropW = imgW;
    cropH = Math.round(imgW / target);
    originX = 0;
    originY = Math.round((imgH - cropH) / 2);
  }

  const result = await manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: cropW, height: cropH } }],
    { compress: 0.92, format: SaveFormat.JPEG },
  );
  return result.uri;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PostPage({ topInset = 0, bottomInset = 0 }: Props) {
  const { session } = useAuth();

  // Phase
  const [phase, setPhase] = useState<Phase>("idle");

  // Media
  const [rawMedia, setRawMedia] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [previewIdx, setPreviewIdx] = useState(0);
  const carouselRef = useRef<ScrollView>(null);

  // Editing
  const [cropRatio, setCropRatio] = useState<CropRatio>("original");
  const [activeFilter, setActiveFilter] = useState<CameraFilter>(CAMERA_FILTERS[0]!);

  // Metadata
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);

  // Tag modal
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [tagResults, setTagResults] = useState<SocialMatchUser[]>([]);
  const [tagLoading, setTagLoading] = useState(false);

  // Camera
  const cameraRef = useRef<CameraView>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<"front" | "back">("back");

  const PREV_H = previewHeight(cropRatio);

  // ── Tag search debounce ────────────────────────────────────────────────────
  useEffect(() => {
    if (!showTagModal || tagSearch.trim().length < 2) {
      setTagResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setTagLoading(true);
      try {
        const res = await searchVibeUsers(tagSearch.trim(), session?.user?.id ?? "");
        setTagResults(res);
      } finally {
        setTagLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [tagSearch, showTagModal, session?.user?.id]);

  // ── Gallery picker ─────────────────────────────────────────────────────────
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

  // ── Camera ─────────────────────────────────────────────────────────────────
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
          ...photo,
          type: "image",
          fileName: "capture.jpg",
          assetId: null,
          base64: null,
          exif: null,
          duration: null,
          mimeType: "image/jpeg",
          fileSize: 0,
        };
        setRawMedia([asset]);
        setPreviewIdx(0);
        setCropRatio("original");
        setActiveFilter(CAMERA_FILTERS[0]!);
        setPhase("compose");
      }
    } catch {
      Alert.alert("Capture failed", "Could not take photo. Try again.");
    }
  }, []);

  // ── Tag helpers ────────────────────────────────────────────────────────────
  const toggleTag = useCallback((user: SocialMatchUser) => {
    setTaggedUsers((prev) => {
      const exists = prev.some((t) => t.id === user.id);
      if (exists) return prev.filter((t) => t.id !== user.id);
      if (prev.length >= 20) return prev;
      return [...prev, { id: user.id, username: user.username, avatar_url: user.avatar_url }];
    });
  }, []);

  const removeTag = useCallback((id: string) => {
    setTaggedUsers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Post ───────────────────────────────────────────────────────────────────
  const handlePost = useCallback(async () => {
    if (!session?.user?.id) { Alert.alert("Sign in required"); return; }
    if (rawMedia.length === 0) return;
    setPhase("uploading");

    try {
      // 1. Crop images to selected ratio
      const finalUris = await Promise.all(
        rawMedia.map(async (asset) => {
          if (asset.type === "video") return asset.uri;
          return cropToRatio(asset.uri, asset.width ?? 0, asset.height ?? 0, cropRatio);
        }),
      );

      // 2. Upload each
      for (const uri of finalUris) {
        await uploadPostMedia(session.user.id, uri, caption.trim(), {
          location: location.trim() || undefined,
          taggedUsers: taggedUsers.length ? taggedUsers.map((t) => t.id) : undefined,
          filterId: activeFilter.id !== "none" ? activeFilter.id : undefined,
        });
      }

      // 3. Reset & celebrate
      setCaption(""); setLocation(""); setTaggedUsers([]);
      setRawMedia([]); setPreviewIdx(0); setCropRatio("original");
      setActiveFilter(CAMERA_FILTERS[0]!);
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
  }, [session, rawMedia, cropRatio, activeFilter, caption, location, taggedUsers]);

  const discard = useCallback(() => {
    setRawMedia([]); setCaption(""); setLocation("");
    setTaggedUsers([]); setPreviewIdx(0); setCropRatio("original");
    setActiveFilter(CAMERA_FILTERS[0]!);
    setPhase("idle");
  }, []);

  // ── Idle ───────────────────────────────────────────────────────────────────
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
              <View style={p.bigCardIconWrap}><Text style={p.bigCardIcon}>🖼️</Text></View>
              <Text style={p.bigCardTitle}>Choose from Gallery</Text>
              <Text style={p.bigCardSub}>Select up to 10 photos or videos</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={openCamera} activeOpacity={0.85}>
            <View style={[p.bigCard, { backgroundColor: "#111126" }]}>
              <View style={p.bigCardIconWrap}><Text style={p.bigCardIcon}>📷</Text></View>
              <Text style={p.bigCardTitle}>Take a Photo</Text>
              <Text style={p.bigCardSub}>Capture a new photo right now</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
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

  // ── Uploading ──────────────────────────────────────────────────────────────
  if (phase === "uploading") {
    return (
      <View style={[p.fill, p.centered]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#A78BFA" />
        <Text style={p.uploadingText}>
          Cropping &amp; uploading {rawMedia.length > 1 ? `${rawMedia.length} photos` : "your post"}{"\u2026"}
        </Text>
      </View>
    );
  }

  // ── Compose ────────────────────────────────────────────────────────────────
  return (
    <View style={p.fill}>
      <StatusBar style="light" />
      <ScrollView
        style={p.fill}
        contentContainerStyle={{ paddingTop: topInset + 8, paddingBottom: bottomInset + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={p.composeHeader}>
          <TouchableOpacity onPress={discard} style={p.discardBtn}>
            <Text style={p.discardText}>Discard</Text>
          </TouchableOpacity>
          <Text style={p.composeTitle}>New Post</Text>
          <View style={{ width: 72 }} />
        </View>

        {/* ── Crop ratio selector ── */}
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

        {/* ── Media carousel ── */}
        <View style={[p.previewWrap, { height: PREV_H }]}>
          <ScrollView
            ref={carouselRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            onMomentumScrollEnd={(e) =>
              setPreviewIdx(Math.round(e.nativeEvent.contentOffset.x / PREVIEW_W))
            }
            style={{ flex: 1 }}
          >
            {rawMedia.map((asset, i) => (
              <View key={i} style={{ width: PREVIEW_W, height: PREV_H, overflow: "hidden" }}>
                {asset.type === "video" ? (
                  <View style={p.videoThumb}>
                    <Text style={p.videoThumbIcon}>🎬</Text>
                    <Text style={p.videoThumbLabel}>Video</Text>
                  </View>
                ) : (
                  <>
                    <Image
                      source={{ uri: asset.uri }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                    {/* Filter overlay */}
                    {activeFilter.id !== "none" && (
                      activeFilter.grayscale ? (
                        <>
                          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: 0.08 }]} />
                          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#9ca3af", opacity: 0.55, mixBlendMode: "saturation" } as any]} />
                        </>
                      ) : (
                        <View
                          style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: activeFilter.blendColor, opacity: activeFilter.blendOpacity },
                          ]}
                        />
                      )
                    )}
                  </>
                )}
              </View>
            ))}
          </ScrollView>

          {/* Dots */}
          {rawMedia.length > 1 && (
            <View style={p.dotRow}>
              {rawMedia.map((_, i) => (
                <View key={i} style={[p.dot, i === previewIdx && p.dotActive]} />
              ))}
            </View>
          )}

          {/* Count badge */}
          {rawMedia.length > 1 && (
            <View style={p.countBadge}>
              <Text style={p.countBadgeText}>{previewIdx + 1}/{rawMedia.length}</Text>
            </View>
          )}
        </View>

        {/* ── Filter strip ── */}
        <View style={p.filterSection}>
          <View style={p.filterHeaderRow}>
            <Text style={p.sectionLabel}>Filter</Text>
            <Text style={p.filterActiveName}>{activeFilter.label}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={p.filterScroll}
          >
            {CAMERA_FILTERS.map((f) => (
              <TouchableOpacity
                key={f.id}
                onPress={() => setActiveFilter(f)}
                style={p.filterThumbWrap}
                activeOpacity={0.8}
              >
                <View style={[p.filterThumb, activeFilter.id === f.id && p.filterThumbActive]}>
                  <LinearGradient colors={["#1a0a2e", "#2d1b55"]} style={StyleSheet.absoluteFill} />
                  {f.id === "none" ? (
                    <Text style={p.filterNoneText}>✕</Text>
                  ) : f.grayscale ? (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(180,180,180,0.6)", borderRadius: 12 }]} />
                  ) : (
                    <View
                      style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: f.blendColor, opacity: Math.min(1, f.blendOpacity * 3.5), borderRadius: 12 },
                      ]}
                    />
                  )}
                  {activeFilter.id === f.id && (
                    <View style={p.filterCheck}>
                      <Text style={{ fontSize: 8, color: "#fff", lineHeight: 11 }}>✓</Text>
                    </View>
                  )}
                </View>
                <Text style={[p.filterLabel, activeFilter.id === f.id && p.filterLabelActive]} numberOfLines={1}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Caption ── */}
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

        {/* ── Location ── */}
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

        {/* ── Tag People ── */}
        <View style={p.section}>
          <TouchableOpacity style={p.tagBtn} onPress={() => { setTagSearch(""); setShowTagModal(true); }}>
            <Text style={p.tagBtnIcon}>🏷️</Text>
            <Text style={p.tagBtnText}>Tag People</Text>
            {taggedUsers.length > 0 && (
              <View style={p.tagCountBadge}>
                <Text style={p.tagCountText}>{taggedUsers.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          {taggedUsers.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.tagChipScroll}>
              {taggedUsers.map((u) => (
                <TouchableOpacity key={u.id} style={p.tagChip} onPress={() => removeTag(u.id)}>
                  <Text style={p.tagChipText}>@{u.username}</Text>
                  <Text style={p.tagChipX}>×</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Actions ── */}
        <TouchableOpacity style={p.changeMedia} onPress={pickFromGallery}>
          <Text style={p.changeMediaText}>🖼️ Change selection</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handlePost} activeOpacity={0.85} style={p.postBtnWrap}>
          <LinearGradient
            colors={["#7C3AED", "#EA580C"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={p.postBtn}
          >
            <Text style={p.postBtnText}>
              {rawMedia.length > 1 ? `Post ${rawMedia.length} Photos 🔥` : "Post 🔥"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Tag People Modal ── */}
      <Modal
        visible={showTagModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTagModal(false)}
      >
        <View style={p.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowTagModal(false)} />
          <View style={[p.tagModalSheet, { paddingBottom: bottomInset + 16 }]}>
            {/* Handle */}
            <View style={p.sheetHandle} />

            <View style={p.tagModalHeader}>
              <Text style={p.tagModalTitle}>Tag People</Text>
              <TouchableOpacity onPress={() => setShowTagModal(false)} style={p.tagModalDone}>
                <Text style={p.tagModalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Search input */}
            <View style={p.tagSearchRow}>
              <Text style={p.tagSearchIcon}>🔍</Text>
              <TextInput
                value={tagSearch}
                onChangeText={setTagSearch}
                placeholder="Search username…"
                placeholderTextColor="rgba(255,255,255,0.3)"
                autoCorrect={false}
                autoCapitalize="none"
                style={p.tagSearchInput}
                autoFocus
              />
              {tagSearch.length > 0 && (
                <TouchableOpacity onPress={() => setTagSearch("")}>
                  <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 16, paddingHorizontal: 8 }}>×</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Selected chips */}
            {taggedUsers.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.tagChipScroll} style={{ maxHeight: 44 }}>
                {taggedUsers.map((u) => (
                  <TouchableOpacity key={u.id} style={[p.tagChip, { backgroundColor: "rgba(124,58,237,0.4)" }]} onPress={() => removeTag(u.id)}>
                    <Text style={p.tagChipText}>@{u.username}</Text>
                    <Text style={p.tagChipX}>×</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Results */}
            {tagLoading ? (
              <ActivityIndicator color="#A78BFA" style={{ marginTop: 24 }} />
            ) : (
              <FlatList
                data={tagResults}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => {
                  const isTagged = taggedUsers.some((t) => t.id === item.id);
                  return (
                    <TouchableOpacity style={p.tagResultRow} onPress={() => toggleTag(item)} activeOpacity={0.8}>
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={p.tagAvatar} />
                      ) : (
                        <View style={[p.tagAvatar, { backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" }]}>
                          <Text style={{ fontSize: 16 }}>👤</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={p.tagResultUsername}>@{item.username}</Text>
                        {item.bio ? <Text style={p.tagResultBio} numberOfLines={1}>{item.bio}</Text> : null}
                      </View>
                      <View style={[p.tagCheckCircle, isTagged && p.tagCheckCircleActive]}>
                        {isTagged && <Text style={{ fontSize: 11, color: "#fff" }}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  tagSearch.length >= 2 ? (
                    <Text style={p.tagEmptyText}>No users found for "{tagSearch}"</Text>
                  ) : (
                    <Text style={p.tagEmptyText}>Type at least 2 characters to search</Text>
                  )
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const p = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#080810" },
  centered: { alignItems: "center", justifyContent: "center" },

  // Idle
  idleInner: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 16 },
  idleTitle: { color: "#fff", fontSize: 24, fontFamily: "Poppins_700Bold", marginBottom: 4 },
  idleSub: { color: "rgba(255,255,255,0.4)", fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", marginBottom: 12 },
  bigCard: { width: W - 48, borderRadius: 20, padding: 24, gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)", alignItems: "center" },
  bigCardIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  bigCardIcon: { fontSize: 28 },
  bigCardTitle: { color: "#fff", fontSize: 17, fontFamily: "Poppins_700Bold" },
  bigCardSub: { color: "rgba(255,255,255,0.45)", fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center" },

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

  // Compose header
  composeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12, height: 44 },
  discardBtn: { padding: 4 },
  discardText: { color: "#EF4444", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  composeTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },

  // Crop ratio
  ratioRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginHorizontal: 16, marginBottom: 12 },
  ratioBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12, backgroundColor: "#111126", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)", gap: 3 },
  ratioBtnActive: { backgroundColor: "rgba(124,58,237,0.3)", borderColor: "#7C3AED" },
  ratioIcon: { fontSize: 16 },
  ratioLabel: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
  ratioLabelActive: { color: "#A78BFA" },

  // Preview
  previewWrap: { marginHorizontal: 16, borderRadius: 18, overflow: "hidden", backgroundColor: "#111126", marginBottom: 4 },
  videoThumb: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a2e" },
  videoThumbIcon: { fontSize: 44 },
  videoThumbLabel: { color: "rgba(255,255,255,0.5)", marginTop: 8, fontFamily: "Poppins_500Medium", fontSize: 14 },
  dotRow: { position: "absolute", bottom: 10, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)" },
  dotActive: { backgroundColor: "#fff", width: 18, borderRadius: 3 },
  countBadge: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  countBadgeText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 11 },

  // Filter
  filterSection: { marginHorizontal: 16, marginTop: 14, marginBottom: 4 },
  filterHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  filterActiveName: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  filterScroll: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  filterThumbWrap: { alignItems: "center", gap: 5, width: 58 },
  filterThumb: { width: 52, height: 52, borderRadius: 12, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  filterThumbActive: { borderColor: "#A78BFA" },
  filterCheck: { position: "absolute", bottom: 3, right: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
  filterNoneText: { color: "rgba(255,255,255,0.4)", fontSize: 14 },
  filterLabel: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "Poppins_500Medium", textAlign: "center" },
  filterLabelActive: { color: "#A78BFA" },

  // Section
  section: { marginHorizontal: 16, marginTop: 16, gap: 8 },
  sectionLabel: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_600SemiBold", fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  captionInput: { backgroundColor: "#111126", borderRadius: 14, padding: 14, fontSize: 15, fontFamily: "Poppins_400Regular", color: "#fff", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)", minHeight: 80, textAlignVertical: "top" },
  charCount: { color: "rgba(255,255,255,0.2)", fontFamily: "Poppins_400Regular", fontSize: 11, textAlign: "right" },
  locationInput: { backgroundColor: "#111126", borderRadius: 14, padding: 14, fontSize: 15, fontFamily: "Poppins_400Regular", color: "#fff", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)", height: 50 },

  // Tag button
  tagBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#111126", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" },
  tagBtnIcon: { fontSize: 18 },
  tagBtnText: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_500Medium", fontSize: 15, flex: 1 },
  tagCountBadge: { backgroundColor: "#7C3AED", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  tagCountText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_700Bold" },
  tagChipScroll: { gap: 8, paddingVertical: 4, paddingHorizontal: 2 },
  tagChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(124,58,237,0.25)", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(124,58,237,0.4)" },
  tagChipText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  tagChipX: { color: "rgba(167,139,250,0.6)", fontSize: 14, lineHeight: 16 },

  // Actions
  changeMedia: { marginHorizontal: 16, marginTop: 14, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16 },
  changeMediaText: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_500Medium", fontSize: 13 },
  postBtnWrap: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, overflow: "hidden" },
  postBtn: { paddingVertical: 18, alignItems: "center", justifyContent: "center" },
  postBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17, letterSpacing: 0.3 },

  // Tag modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  tagModalSheet: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingHorizontal: 16, maxHeight: "85%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 16 },
  tagModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  tagModalTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  tagModalDone: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(124,58,237,0.3)", borderRadius: 12 },
  tagModalDoneText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  tagSearchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 14, paddingHorizontal: 12, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" },
  tagSearchIcon: { fontSize: 16, marginRight: 6 },
  tagSearchInput: { flex: 1, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15, paddingVertical: 12 },
  tagResultRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.06)" },
  tagAvatar: { width: 44, height: 44, borderRadius: 22 },
  tagResultUsername: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  tagResultBio: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  tagCheckCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  tagCheckCircleActive: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  tagEmptyText: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", marginTop: 24, paddingHorizontal: 16 },
});
