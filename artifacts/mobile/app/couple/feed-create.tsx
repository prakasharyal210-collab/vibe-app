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
import { useAuth } from "@/context/AuthContext";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "");

const CATEGORIES = ["Story", "Advice", "Milestone", "Venting"] as const;
type Category = (typeof CATEGORIES)[number];

const CAT_COLORS: Record<Category, string> = {
  Story: "#EC4899",
  Advice: "#3B82F6",
  Milestone: "#F59E0B",
  Venting: "#8B5CF6",
};

const CAT_EMOJIS: Record<Category, string> = {
  Story: "📖",
  Advice: "💡",
  Milestone: "🎉",
  Venting: "💭",
};

export default function FeedCreateScreen() {
  const insets = useSafeAreaInsets();
  const { coupleId, authorId } = useLocalSearchParams<{ coupleId: string; authorId: string }>();
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("Story");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to attach a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
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
    setPosting(true);
    try {
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
          photoUrl: photoUri ?? undefined,
          category,
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
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Share with Couples</Text>
          <TouchableOpacity
            onPress={handlePost}
            disabled={posting || !content.trim()}
            style={[s.postBtn, (posting || !content.trim()) && { opacity: 0.45 }]}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
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
                      ? { backgroundColor: CAT_COLORS[cat], borderColor: CAT_COLORS[cat] }
                      : { borderColor: CAT_COLORS[cat] + "44", backgroundColor: CAT_COLORS[cat] + "11" },
                  ]}
                >
                  <Text style={{ fontSize: 14 }}>{CAT_EMOJIS[cat]}</Text>
                  <Text style={[s.catLabel, { color: active ? "#fff" : CAT_COLORS[cat] }]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.sectionLabel}>Your Post</Text>
          <TextInput
            style={s.textInput}
            placeholder="Share your story, feelings, or ask for advice..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />
          <Text style={s.charCount}>{content.length}/1000</Text>

          <Text style={s.sectionLabel}>Photo (optional)</Text>
          {photoUri ? (
            <View style={s.photoPreviewWrap}>
              <Image source={{ uri: photoUri }} style={s.photoPreview} resizeMode="cover" />
              <TouchableOpacity onPress={() => setPhotoUri(null)} style={s.removePhotoBtn}>
                <Ionicons name="close-circle" size={28} color="#EC4899" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={pickPhoto} style={s.photoPickerBtn} activeOpacity={0.75}>
              <Ionicons name="image-outline" size={24} color="rgba(255,255,255,0.4)" />
              <Text style={s.photoPickerText}>Tap to add a photo</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080810" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 17, color: "#fff" },
  postBtn: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20, backgroundColor: "#EC4899" },
  postBtnText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: "#fff" },
  sectionLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5 },
  catLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  textInput: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", padding: 16, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15, minHeight: 160, lineHeight: 24 },
  charCount: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "right", marginTop: 6 },
  photoPickerBtn: { height: 120, borderRadius: 16, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)", borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.03)" },
  photoPickerText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.3)" },
  photoPreviewWrap: { position: "relative" },
  photoPreview: { width: "100%", height: 200, borderRadius: 16 },
  removePhotoBtn: { position: "absolute", top: 8, right: 8 },
});
