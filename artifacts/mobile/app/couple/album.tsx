import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

const { width: W } = Dimensions.get("window");
const CELL = (W - 48) / 3;
const API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/couple";

interface Photo {
  id: string;
  url: string;
  caption: string | null;
  uploaded_by: string;
  created_at: string;
}

export default function AlbumScreen() {
  const insets = useSafeAreaInsets();
  const { coupleId, userId } = useLocalSearchParams<{ coupleId: string; userId: string }>();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewPhoto, setViewPhoto] = useState<Photo | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch(`${API}/photos?coupleId=${encodeURIComponent(coupleId ?? "")}`);
      const data = await res.json();
      setPhotos(data.photos ?? []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [coupleId]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission needed", "Allow photo library access"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
    }
  };

  const uploadPhoto = async () => {
    if (!pickedUri) return;
    setUploading(true);
    try {
      const res = await fetch(`${API}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupleId, uploadedBy: userId, url: pickedUri, caption: caption.trim() || null }),
      });
      const data = await res.json();
      if (data.error) { Alert.alert("Error", data.error); return; }
      setAddModal(false);
      setPickedUri(null);
      setCaption("");
      fetchPhotos();
    } catch {
      Alert.alert("Error", "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>📸 Shared Album</Text>
        <TouchableOpacity onPress={() => setAddModal(true)} style={s.addBtn}>
          <Ionicons name="add" size={24} color="#EC4899" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#EC4899" size="large" /></View>
      ) : photos.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>🌅</Text>
          <Text style={s.emptyTitle}>No photos yet</Text>
          <Text style={s.emptySub}>Add your first memory together</Text>
          <TouchableOpacity onPress={() => setAddModal(true)} style={s.emptyBtn}>
            <Text style={s.emptyBtnText}>+ Add Photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          numColumns={3}
          contentContainerStyle={s.grid}
          columnWrapperStyle={{ gap: 4 }}
          ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setViewPhoto(item)} activeOpacity={0.85}>
              <Image source={{ uri: item.url }} style={s.gridCell} resizeMode="cover" />
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!viewPhoto} transparent animationType="fade" onRequestClose={() => setViewPhoto(null)}>
        <View style={s.viewOverlay}>
          <TouchableOpacity onPress={() => setViewPhoto(null)} style={s.viewClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {viewPhoto && (
            <>
              <Image source={{ uri: viewPhoto.url }} style={s.viewImage} resizeMode="contain" />
              {viewPhoto.caption ? (
                <View style={s.viewCaption}>
                  <Text style={s.viewCaptionText}>{viewPhoto.caption}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </Modal>

      <Modal visible={addModal} transparent animationType="slide" onRequestClose={() => setAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalOverlay}>
          <View style={s.addSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Add Photo</Text>

            <TouchableOpacity onPress={pickImage} style={s.pickArea}>
              {pickedUri ? (
                <Image source={{ uri: pickedUri }} style={s.pickedPreview} resizeMode="cover" />
              ) : (
                <View style={s.pickPlaceholder}>
                  <Ionicons name="image-outline" size={40} color="rgba(255,255,255,0.3)" />
                  <Text style={s.pickText}>Tap to choose photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <TextInput
              style={s.captionInput}
              placeholder="Add a caption... (optional)"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={caption}
              onChangeText={setCaption}
            />

            <TouchableOpacity
              onPress={uploadPhoto}
              disabled={!pickedUri || uploading}
              style={[s.uploadBtn, (!pickedUri || uploading) && { opacity: 0.5 }]}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.uploadBtnText}>Save to Album 💾</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setAddModal(false); setPickedUri(null); setCaption(""); }} style={s.cancelBtn}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080810" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.08)" },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 18 },
  addBtn: { padding: 6 },
  grid: { padding: 4 },
  gridCell: { width: CELL, height: CELL, borderRadius: 4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 20, textAlign: "center" },
  emptySub: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center" },
  emptyBtn: { marginTop: 12, backgroundColor: "rgba(236,72,153,0.2)", borderWidth: 1, borderColor: "rgba(236,72,153,0.5)", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16 },
  emptyBtnText: { color: "#EC4899", fontFamily: "Poppins_700Bold", fontSize: 15 },
  viewOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewClose: { position: "absolute", top: 56, right: 20, zIndex: 10, padding: 8 },
  viewImage: { width: W, height: W * 1.2 },
  viewCaption: { position: "absolute", bottom: 80, left: 24, right: 24 },
  viewCaptionText: { color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15, textAlign: "center", backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10, padding: 10 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  addSheet: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 40 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginTop: 14, marginBottom: 20 },
  sheetTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 20, marginBottom: 16 },
  pickArea: { width: "100%", height: 200, borderRadius: 16, overflow: "hidden", marginBottom: 14 },
  pickPlaceholder: { flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)", borderStyle: "dashed", borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 10 },
  pickText: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_400Regular", fontSize: 14 },
  pickedPreview: { width: "100%", height: "100%" },
  captionInput: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 16, paddingVertical: 13, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 14, marginBottom: 14 },
  uploadBtn: { backgroundColor: "#EC4899", borderRadius: 16, paddingVertical: 16, alignItems: "center", marginBottom: 10 },
  uploadBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  cancelBtn: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 14 },
});
