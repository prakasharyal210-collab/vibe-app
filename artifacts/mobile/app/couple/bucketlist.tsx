import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { Ionicons } from "@expo/vector-icons";

const API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/couple";

interface BucketItem {
  id: string;
  title: string;
  completed: boolean;
  created_by: string;
  created_at: string;
}

export default function BucketListScreen() {
  const insets = useSafeAreaInsets();
  const { coupleId, userId } = useLocalSearchParams<{ coupleId: string; userId: string }>();
  const [items, setItems] = useState<BucketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`${API}/bucketlist?coupleId=${encodeURIComponent(coupleId ?? "")}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [coupleId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const toggleItem = async (item: BucketItem) => {
    const next = !item.completed;
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, completed: next } : i));
    try {
      await fetch(`${API}/bucketlist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
    } catch {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, completed: !next } : i));
    }
  };

  const addItem = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await fetch(`${API}/bucketlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupleId, title, createdBy: userId }),
      });
      const data = await res.json();
      if (data.error) { Alert.alert("Error", data.error); return; }
      setNewTitle("");
      setAddModal(false);
      fetchItems();
    } catch {
      Alert.alert("Error", "Failed to add item");
    } finally {
      setAdding(false);
    }
  };

  const completed = items.filter((i) => i.completed);
  const pending = items.filter((i) => !i.completed);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>🗺️ Bucket List</Text>
        <TouchableOpacity onPress={() => setAddModal(true)} style={s.addBtn}>
          <Ionicons name="add" size={24} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#3B82F6" size="large" /></View>
      ) : items.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyEmoji}>🌍</Text>
          <Text style={s.emptyTitle}>Start dreaming together</Text>
          <Text style={s.emptySub}>Add things you want to do as a couple</Text>
          <TouchableOpacity onPress={() => setAddModal(true)} style={s.emptyBtn}>
            <Text style={s.emptyBtnText}>+ Add First Dream</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={[...pending, ...completed]}
          keyExtractor={(i) => i.id}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={
            items.length > 0 ? (
              <View style={s.statsRow}>
                <View style={s.statChip}>
                  <Text style={s.statNum}>{pending.length}</Text>
                  <Text style={s.statLabel}>to do</Text>
                </View>
                <View style={[s.statChip, { backgroundColor: "rgba(52,211,153,0.15)", borderColor: "rgba(52,211,153,0.3)" }]}>
                  <Text style={[s.statNum, { color: "#34D399" }]}>{completed.length}</Text>
                  <Text style={[s.statLabel, { color: "#34D399" }]}>done ✓</Text>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => toggleItem(item)}
              activeOpacity={0.75}
              style={[s.itemRow, item.completed && s.itemRowDone]}
            >
              <View style={[s.checkbox, item.completed && s.checkboxDone]}>
                {item.completed && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={[s.itemTitle, item.completed && s.itemTitleDone]}>{item.title}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={addModal} transparent animationType="slide" onRequestClose={() => setAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalOverlay}>
          <View style={s.addSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Add a Dream ✨</Text>
            <TextInput
              style={s.titleInput}
              placeholder="e.g. Watch the Northern Lights together"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
              multiline
            />
            <TouchableOpacity
              onPress={addItem}
              disabled={!newTitle.trim() || adding}
              style={[s.addConfirmBtn, (!newTitle.trim() || adding) && { opacity: 0.5 }]}
            >
              {adding ? <ActivityIndicator color="#fff" /> : <Text style={s.addConfirmText}>Add to List 🗺️</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setAddModal(false); setNewTitle(""); }} style={s.cancelBtn}>
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
  listContent: { padding: 16, paddingBottom: 100 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statChip: { flex: 1, alignItems: "center", backgroundColor: "rgba(59,130,246,0.12)", borderWidth: 1, borderColor: "rgba(59,130,246,0.25)", borderRadius: 14, paddingVertical: 12 },
  statNum: { color: "#3B82F6", fontFamily: "Poppins_700Bold", fontSize: 22 },
  statLabel: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 14, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  itemRowDone: { opacity: 0.55 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#3B82F6", alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxDone: { backgroundColor: "#3B82F6", borderColor: "#3B82F6" },
  itemTitle: { flex: 1, color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 15, lineHeight: 22 },
  itemTitleDone: { textDecorationLine: "line-through", color: "rgba(255,255,255,0.35)" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 20, textAlign: "center" },
  emptySub: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center" },
  emptyBtn: { marginTop: 12, backgroundColor: "rgba(59,130,246,0.2)", borderWidth: 1, borderColor: "rgba(59,130,246,0.5)", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16 },
  emptyBtnText: { color: "#3B82F6", fontFamily: "Poppins_700Bold", fontSize: 15 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  addSheet: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 40 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginTop: 14, marginBottom: 20 },
  sheetTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 20, marginBottom: 16 },
  titleInput: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 16, paddingVertical: 14, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15, marginBottom: 14, minHeight: 60 },
  addConfirmBtn: { backgroundColor: "#3B82F6", borderRadius: 16, paddingVertical: 16, alignItems: "center", marginBottom: 10 },
  addConfirmText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  cancelBtn: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 14 },
});
