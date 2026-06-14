import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

interface Friend {
  id: string;
  username: string;
  avatar_url?: string | null;
  is_verified?: boolean;
  isCloseFriend?: boolean;
}

export default function CloseFriendsScreen() {
  const { session } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id;

  const [closeFriendIds, setCloseFriendIds] = useState<Set<string>>(new Set());
  const [followers, setFollowers] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [cfRes, followersRes] = await Promise.all([
        fetch(`${API}/users/social/close-friends?userId=${userId}`),
        fetch(`${API}/users/social/followers/${userId}?viewerId=${userId}`),
      ]);
      const cfJson = cfRes.ok ? await cfRes.json() : { friends: [] };
      const followersJson = followersRes.ok ? await followersRes.json() : { users: [] };

      const cfSet = new Set<string>((cfJson.friends ?? []).map((f: Friend) => f.id));
      setCloseFriendIds(cfSet);

      const followerList: Friend[] = (followersJson.users ?? []).map((u: any) => ({
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url,
        is_verified: u.is_verified,
      }));
      setFollowers(followerList);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggle = async (friend: Friend) => {
    if (!userId || saving.has(friend.id)) return;
    setSaving((s) => new Set(s).add(friend.id));
    const isNowCF = !closeFriendIds.has(friend.id);
    setCloseFriendIds((prev) => {
      const next = new Set(prev);
      isNowCF ? next.add(friend.id) : next.delete(friend.id);
      return next;
    });
    try {
      await fetch(`${API}/users/social/close-friends`, {
        method: isNowCF ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, friendId: friend.id }),
      });
    } catch {
      setCloseFriendIds((prev) => {
        const next = new Set(prev);
        isNowCF ? next.delete(friend.id) : next.add(friend.id);
        return next;
      });
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(friend.id); return n; });
    }
  };

  const filtered = followers.filter((f) =>
    !search || f.username.toLowerCase().includes(search.toLowerCase())
  );

  const closeFriends = filtered.filter((f) => closeFriendIds.has(f.id));
  const others = filtered.filter((f) => !closeFriendIds.has(f.id));

  const renderItem = ({ item }: { item: Friend }) => {
    const isCF = closeFriendIds.has(item.id);
    const isSaving = saving.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => toggle(item)}
        activeOpacity={0.7}
      >
        <UserAvatar username={item.username} size={44} url={item.avatar_url ?? undefined} />
        <View style={styles.info}>
          <Text style={[styles.username, { color: colors.foreground }]}>
            @{item.username}
            {item.is_verified && (
              <Text style={{ color: "#8B5CF6" }}> ✓</Text>
            )}
          </Text>
          {isCF && (
            <Text style={[styles.badge, { color: "#22c55e" }]}>Close Friend 💚</Text>
          )}
        </View>
        {isSaving ? (
          <ActivityIndicator size="small" color="#22c55e" />
        ) : (
          <View style={[
            styles.checkCircle,
            { backgroundColor: isCF ? "#22c55e" : "transparent", borderColor: isCF ? "#22c55e" : colors.border }
          ]}>
            {isCF && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const sections: Friend[] = [
    ...closeFriends,
    ...others,
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Close Friends</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={[styles.banner, { backgroundColor: "#052e16", borderBottomColor: "#166534" }]}>
        <Ionicons name="people" size={18} color="#22c55e" />
        <Text style={styles.bannerText}>
          Only close friends can see your 💚 Close Friends stories
        </Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={15} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search followers…"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color="#22c55e" size="large" />
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={
            closeFriends.length > 0 ? (
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                Close Friends ({closeFriends.length})
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>💚</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {search ? "No results" : "No followers yet"}
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                {search ? "Try a different name" : "Your followers will appear here"}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  banner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5,
  },
  bannerText: { fontSize: 12, color: "#86efac", fontFamily: "Poppins_400Regular", flex: 1 },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    margin: 12, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 0.5,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular", padding: 0 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5,
  },
  info: { flex: 1 },
  username: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  badge: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 2 },
  checkCircle: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionLabel: { fontSize: 12, fontFamily: "Poppins_600SemiBold", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  empty: { padding: 48, alignItems: "center", gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: "Poppins_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center" },
});
