import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

const COUPLE_API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/couple";

interface SearchUser {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

export function CoupleLinkModal({
  visible,
  userId,
  onClose,
  onRequestSent,
}: {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onRequestSent: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .or(`username.ilike.%${q.trim()}%,full_name.ilike.%${q.trim()}%`)
          .order("followers_count", { ascending: false })
          .limit(5);
        if (error) { setResults([]); return; }
        setResults(((data ?? []) as SearchUser[]).filter((u) => u.id !== userId));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [userId]);

  const sendRequest = async (receiver: SearchUser) => {
    setSending(true);
    try {
      const res = await fetch(`${COUPLE_API}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: userId, receiverId: receiver.id }),
      });
      const data = await res.json();
      if (data.error) {
        if (data.error.includes("already exists")) {
          setSuccess(true);
          setTimeout(() => { handleClose(); onRequestSent(); }, 1500);
        }
        return;
      }
      setSuccess(true);
      setTimeout(() => { handleClose(); onRequestSent(); }, 1500);
    } catch {
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setQuery("");
    setResults([]);
    setSuccess(false);
    setSending(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.avoidWrap}>
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
          <View style={s.handle} />

          {success ? (
            <View style={s.successWrap}>
              <Text style={{ fontSize: 52, marginBottom: 16 }}>💕</Text>
              <Text style={s.successTitle}>Request sent!</Text>
              <Text style={s.successSub}>Waiting for them to accept…</Text>
            </View>
          ) : (
            <>
              <Text style={s.title}>Link with Your Partner 💑</Text>
              <Text style={s.sub}>Search by username to send a couple request</Text>

              <View style={s.searchBar}>
                <Ionicons name="search" size={18} color="rgba(255,255,255,0.35)" />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search username..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={query}
                  onChangeText={search}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                {searching && <ActivityIndicator size="small" color="#8B5CF6" />}
              </View>

              {results.length > 0 && (
                <View style={s.results}>
                  {results.map((user) => (
                    <View key={user.id} style={s.resultRow}>
                      <View style={s.avatarWrap}>
                        {user.avatar_url ? (
                          <Image source={{ uri: user.avatar_url }} style={s.avatar} />
                        ) : (
                          <View style={[s.avatar, s.avatarFallback]}>
                            <Text style={{ fontSize: 18 }}>👤</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.resultName}>{user.full_name || user.username}</Text>
                        <Text style={s.resultUsername}>@{user.username}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => sendRequest(user)}
                        disabled={sending}
                        activeOpacity={0.85}
                        style={s.sendBtnWrap}
                      >
                        <LinearGradient
                          colors={["#7C3AED", "#EC4899"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={s.sendBtn}
                        >
                          {sending ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={s.sendBtnText}>Send 💕</Text>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {query.trim().length >= 2 && !searching && results.length === 0 && (
                <View style={s.emptyWrap}>
                  <Text style={s.emptyText}>No users found for "{query}"</Text>
                </View>
              )}

              {query.trim().length === 0 && (
                <View style={s.hintWrap}>
                  <Text style={s.hintEmoji}>🔍</Text>
                  <Text style={s.hintText}>Type at least 2 characters to search</Text>
                </View>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  avoidWrap: { justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0F0F1A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    minHeight: 360,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 20 },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 22, marginBottom: 6 },
  sub: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_400Regular", fontSize: 14, marginBottom: 20 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  searchInput: { flex: 1, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 15 },
  results: { gap: 2 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  avatarWrap: {},
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: "rgba(139,92,246,0.2)", alignItems: "center", justifyContent: "center" },
  resultName: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  resultUsername: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  sendBtnWrap: { borderRadius: 14, overflow: "hidden" },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 9 },
  sendBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
  emptyWrap: { alignItems: "center", paddingVertical: 24 },
  emptyText: { color: "rgba(255,255,255,0.3)", fontFamily: "Poppins_400Regular", fontSize: 14 },
  hintWrap: { alignItems: "center", paddingVertical: 32, gap: 10 },
  hintEmoji: { fontSize: 36 },
  hintText: { color: "rgba(255,255,255,0.3)", fontFamily: "Poppins_400Regular", fontSize: 14 },
  successWrap: { alignItems: "center", paddingVertical: 40 },
  successTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 24, marginBottom: 8 },
  successSub: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_400Regular", fontSize: 15 },
});
