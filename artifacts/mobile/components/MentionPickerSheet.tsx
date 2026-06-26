import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { UserAvatar } from "@/components/UserAvatar";

const { height: H } = Dimensions.get("window");
const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

export interface MentionUser {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
  followers_count?: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (user: MentionUser) => void;
  viewerId?: string;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function UserRow({ item, onSelect }: { item: MentionUser; onSelect: (u: MentionUser) => void }) {
  return (
    <TouchableOpacity
      style={st.userRow}
      onPress={() => onSelect(item)}
      activeOpacity={0.75}
    >
      <UserAvatar url={item.avatar_url} username={item.username} size={42} />
      <View style={st.userMeta}>
        <View style={st.nameRow}>
          <Text style={st.username}>@{item.username}</Text>
          {item.is_verified && (
            <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
          )}
        </View>
        {!!item.full_name && (
          <Text style={st.fullName} numberOfLines={1}>{item.full_name}</Text>
        )}
      </View>
      {!!item.followers_count && item.followers_count > 0 && (
        <Text style={st.followers}>{fmtCount(item.followers_count)}</Text>
      )}
    </TouchableOpacity>
  );
}

export function MentionPickerSheet({ visible, onClose, onSelect, viewerId }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const slideAnim = useRef(new Animated.Value(H)).current;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (q: string) => {
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const params = new URLSearchParams({ q, limit: "20" });
      if (viewerId) params.set("viewer_id", viewerId);
      const res = await fetch(`${API_BASE}/users/search?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as { profiles?: MentionUser[] };
      setResults(data.profiles ?? []);
    } catch {
      setResults([]);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [viewerId]);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setResults([]);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 16,
        stiffness: 80,
        useNativeDriver: true,
      }).start();
      fetchUsers("");
    } else {
      Animated.timing(slideAnim, {
        toValue: H,
        duration: 260,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const onQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchUsers(text), 300);
  };

  const handleSelect = (user: MentionUser) => {
    onSelect(user);
    onClose();
  };

  const renderItem = useCallback(
    ({ item }: { item: MentionUser }) => (
      <UserRow item={item} onSelect={handleSelect} />
    ),
    [handleSelect]
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[st.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={st.handle} />

        <View style={st.header}>
          <Text style={st.title}>Mention Someone</Text>
          <TouchableOpacity onPress={onClose} style={st.closeBtn}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        <View style={st.searchBar}>
          <Ionicons name="at" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search by username…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={st.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(""); fetchUsers(""); }}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={st.center}>
            <ActivityIndicator color="#8B5CF6" />
          </View>
        ) : results.length === 0 ? (
          <View style={st.center}>
            <Ionicons name="people-outline" size={40} color="rgba(255,255,255,0.18)" />
            <Text style={st.emptyText}>
              {query.trim() ? "No users found" : "Search to find people"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(u) => u.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    maxHeight: "75%",
    backgroundColor: "#0F0F1A",
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderTopWidth: 1, borderTopColor: "rgba(139,92,246,0.2)",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center", marginTop: 10,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { flex: 1, color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  closeBtn: { padding: 6 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: {
    flex: 1, color: "#fff",
    fontFamily: "Poppins_400Regular", fontSize: 14,
  },
  userRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.07)",
  },
  userMeta: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  username: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  fullName: {
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1,
  },
  followers: {
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Poppins_500Medium", fontSize: 12,
  },
  center: {
    minHeight: 200, alignItems: "center", justifyContent: "center", gap: 12,
  },
  emptyText: {
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Poppins_500Medium", fontSize: 14,
  },
});
