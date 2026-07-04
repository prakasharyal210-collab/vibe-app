import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { readAsStringAsync } from "expo-file-system/legacy";
import { useAuth } from "@/context/AuthContext";
import PollComposer, { type PollDraft } from "@/components/PollComposer";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "");

const CATEGORIES = ["Confession", "Advice", "Story", "Venting", "Milestone"] as const;
type Category = (typeof CATEGORIES)[number];

const CAT_EMOJIS: Record<Category, string> = {
  Confession: "💕",
  Advice: "💡",
  Story: "📖",
  Milestone: "🎉",
  Venting: "💭",
};

export default function FeedCreateScreen() {
  const insets = useSafeAreaInsets();
  const { coupleId, authorId } = useLocalSearchParams<{ coupleId: string; authorId: string }>();
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("Confession");
  const [age, setAge] = useState("");
  const [location, setLocation] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [pollDraft, setPollDraft] = useState<PollDraft | null>(null);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to attach a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri: string): Promise<string> => {
    const cleanUri = uri.split("?")[0];
    const rawExt = (cleanUri.split(".").pop() ?? "jpg").toLowerCase();
    const ext = rawExt === "png" ? "png" : rawExt === "gif" ? "gif" : "jpg";
    const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";

    const base64 = await readAsStringAsync(uri, { encoding: "base64" as any });

    const uploadRes = await fetch(`${API_BASE}/api/couple-feed/upload-photo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ base64, mimeType, ext, userId: authorId }),
    });
    const uploadData = await uploadRes.json();
    if (uploadData.error) throw new Error(uploadData.error);
    return uploadData.url as string;
  };

  const handlePost = async () => {
    if (!content.trim()) {
      Alert.alert("Write something", "Your post needs some text before sharing.");
      return;
    }
    if (!coupleId || !authorId) {
      Alert.alert("Error", "Missing couple information.");
      return;
    }
    const ageNum = age.trim() ? parseInt(age.trim(), 10) : undefined;
    if (age.trim() && (isNaN(ageNum!) || ageNum! < 16 || ageNum! > 100)) {
      Alert.alert("Invalid age", "Please enter a valid age between 16 and 100.");
      return;
    }

    setPosting(true);
    try {
      let uploadedPhotoUrl: string | undefined;
      if (photoUri) {
        try {
          uploadedPhotoUrl = await uploadPhoto(photoUri);
        } catch (uploadErr: any) {
          Alert.alert("Photo upload failed", uploadErr?.message ?? "Could not upload photo. Please try again.");
          setPosting(false);
          return;
        }
      }

      const res = await fetch(`${API_BASE}/api/couple-feed/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          coupleId,
          authorId,
          content: content.trim(),
          photoUrl: uploadedPhotoUrl,
          category,
          isAnonymous: true,
          age: ageNum,
          location: location.trim() || undefined,
          poll: pollDraft
            ? {
                question: pollDraft.question?.trim() || undefined,
                options: pollDraft.options.filter((o) => o.trim()),
                duration_hours: pollDraft.duration_hours,
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        Alert.alert("Error", data.error);
        return;
      }
      router.back();
    } catch {
      Alert.alert("Error", "Failed to post. Please try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="close" size={22} color="#ffffff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>New Confession</Text>
          <TouchableOpacity
            onPress={handlePost}
            disabled={posting || !content.trim()}
            style={[s.postBtn, (posting || !content.trim()) && { opacity: 0.4 }]}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text style={s.postBtnText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.sectionLabel}>Category</Text>
          <View style={s.catRow}>
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[
                    s.catChip,
                    active
                      ? { backgroundColor: "#ffffff", borderColor: "#ffffff" }
                      : { borderColor: "rgba(255,255,255,0.15)", backgroundColor: "transparent" },
                  ]}
                >
                  <Text style={{ fontSize: 14 }}>{CAT_EMOJIS[cat]}</Text>
                  <Text style={[s.catLabel, { color: active ? "#000000" : "#888888" }]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.sectionLabel}>Your Post</Text>
          <TextInput
            style={s.textInput}
            placeholder="Share your confession, story, or ask for advice..."
            placeholderTextColor="#555555"
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />
          <Text style={s.charCount}>{content.length}/1000</Text>

          {/* Poll toggle */}
          <TouchableOpacity
            style={[s.pollToggleBtn, pollDraft !== null && s.pollToggleBtnActive]}
            onPress={() =>
              setPollDraft(
                pollDraft
                  ? null
                  : { options: ["", ""], duration_hours: 24 },
              )
            }
            activeOpacity={0.75}
          >
            <Ionicons
              name="bar-chart-outline"
              size={18}
              color={pollDraft ? "#A78BFA" : "#555555"}
            />
            <Text style={[s.pollToggleText, pollDraft !== null && { color: "#A78BFA" }]}>
              {pollDraft ? "Remove Poll" : "Add Poll"}
            </Text>
          </TouchableOpacity>

          {/* Poll composer */}
          {pollDraft && (
            <PollComposer poll={pollDraft} onChange={setPollDraft} />
          )}

          <Text style={s.sectionLabel}>Photo (optional)</Text>
          {photoUri ? (
            <View style={s.photoPreviewWrap}>
              <Image source={{ uri: photoUri }} style={s.photoPreview} resizeMode="cover" />
              <TouchableOpacity onPress={() => setPhotoUri(null)} style={s.removePhotoBtn}>
                <Ionicons name="close-circle" size={28} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={pickPhoto} style={s.photoPickerBtn} activeOpacity={0.75}>
              <Ionicons name="image-outline" size={24} color="#555555" />
              <Text style={s.photoPickerText}>Tap to add a photo</Text>
            </TouchableOpacity>
          )}

          <Text style={s.sectionLabel}>Optional Details</Text>
          <View style={s.optionalRow}>
            <View style={[s.optionalField, { flex: 0.35 }]}>
              <Text style={s.optionalLabel}>Age</Text>
              <TextInput
                style={s.optionalInput}
                placeholder="e.g. 25"
                placeholderTextColor="#555555"
                value={age}
                onChangeText={(v) => setAge(v.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
            <View style={[s.optionalField, { flex: 0.65 }]}>
              <Text style={s.optionalLabel}>Location</Text>
              <TextInput
                style={s.optionalInput}
                placeholder="e.g. Sydney"
                placeholderTextColor="#555555"
                value={location}
                onChangeText={setLocation}
                maxLength={60}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#141414", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 17, color: "#ffffff" },
  postBtn: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20, backgroundColor: "#ffffff" },
  postBtnText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: "#000000" },
  sectionLabel: { fontFamily: "Poppins_700Bold", fontSize: 11, color: "#555555", marginTop: 22, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  catLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  textInput: { backgroundColor: "#141414", borderRadius: 16, padding: 16, color: "#ffffff", fontFamily: "Poppins_400Regular", fontSize: 15, minHeight: 150, lineHeight: 24 },
  charCount: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "#555555", textAlign: "right", marginTop: 6 },
  optionalRow: { flexDirection: "row", gap: 12 },
  optionalField: { gap: 6 },
  optionalLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#888888" },
  optionalInput: { backgroundColor: "#141414", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: "#ffffff", fontFamily: "Poppins_400Regular", fontSize: 14 },
  photoPickerBtn: { height: 110, borderRadius: 16, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)", borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#141414" },
  photoPickerText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "#555555" },
  photoPreviewWrap: { position: "relative" },
  photoPreview: { width: "100%", height: 200, borderRadius: 16 },
  removePhotoBtn: { position: "absolute", top: 8, right: 8 },
  pollToggleBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "#141414" },
  pollToggleBtnActive: { borderColor: "rgba(167,139,250,0.35)", backgroundColor: "rgba(124,58,237,0.07)" },
  pollToggleText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: "#555555" },
});
