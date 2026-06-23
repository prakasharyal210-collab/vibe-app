import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
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

interface Note {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NotesScreen() {
  const insets = useSafeAreaInsets();
  const { coupleId, userId } = useLocalSearchParams<{ coupleId: string; userId: string }>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`${API}/notes?coupleId=${encodeURIComponent(coupleId ?? "")}`);
      const data = await res.json();
      setNotes(data.notes ?? []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [coupleId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const sendNote = async () => {
    const content = text.trim();
    if (!content) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupleId, authorId: userId, content }),
      });
      const data = await res.json();
      if (data.success) {
        setText("");
        fetchNotes();
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
      }
    } catch {
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>📝 Notes</Text>
        <View style={{ width: 34 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#8B5CF6" size="large" /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={notes}
          keyExtractor={(n) => n.id}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyEmoji}>💌</Text>
              <Text style={s.emptyTitle}>Leave your first note</Text>
              <Text style={s.emptySub}>Write little messages to each other</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMine = item.author_id === userId;
            return (
              <View style={[s.noteRow, isMine ? s.noteRowMine : s.noteRowTheirs]}>
                <View style={[s.noteBubble, isMine ? s.bubbleMine : s.bubbleTheirs]}>
                  <Text style={s.noteText}>{item.content}</Text>
                  <Text style={s.noteTime}>{formatDate(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={insets.bottom + 16}>
        <View style={[s.inputRow, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={s.input}
            placeholder="Write a note... 💜"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            onPress={sendNote}
            disabled={!text.trim() || sending}
            style={[s.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080810" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.08)" },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 18 },
  listContent: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 20, textAlign: "center" },
  emptySub: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center" },
  noteRow: { marginBottom: 10, maxWidth: "78%" },
  noteRowMine: { alignSelf: "flex-end" },
  noteRowTheirs: { alignSelf: "flex-start" },
  noteBubble: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleMine: { backgroundColor: "#7C3AED", borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "rgba(255,255,255,0.1)", borderBottomLeftRadius: 4 },
  noteText: { color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15, lineHeight: 22 },
  noteTime: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 5, textAlign: "right" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 14, paddingTop: 10, backgroundColor: "#080810", borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.08)" },
  input: { flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15, maxHeight: 120, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
});
