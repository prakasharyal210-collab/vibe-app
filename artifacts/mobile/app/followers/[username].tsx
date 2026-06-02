import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useColors } from "@/hooks/useColors";

type ListType = "followers" | "following";

const MOCK_FOLLOWERS = [
  { id: "f1", username: "alex.w", fullName: "Alex Williams", mutual: 3, isFollowing: false },
  { id: "f2", username: "mia_nearby", fullName: "Mia Chen", mutual: 12, isFollowing: true },
  { id: "f3", username: "luna_sky", fullName: "Luna Sky", mutual: 8, isFollowing: false },
  { id: "f4", username: "kai_adventures", fullName: "Kai Tanaka", mutual: 5, isFollowing: true },
  { id: "f5", username: "nadia.official", fullName: "Nadia Gomez", mutual: 2, isFollowing: false },
  { id: "f6", username: "zoe.creates", fullName: "Zoe Patel", mutual: 0, isFollowing: false },
  { id: "f7", username: "marcus_vibe", fullName: "Marcus Rivera", mutual: 7, isFollowing: true },
  { id: "f8", username: "sofia_near", fullName: "Sofia Bloom", mutual: 1, isFollowing: false },
  { id: "f9", username: "jay_create", fullName: "Jay Kim", mutual: 4, isFollowing: false },
  { id: "f10", username: "maya_art", fullName: "Maya Torres", mutual: 9, isFollowing: true },
];

const MOCK_FOLLOWING = [
  { id: "g1", username: "luna_sky", fullName: "Luna Sky", mutual: 8, isFollowing: true },
  { id: "g2", username: "marcus_vibe", fullName: "Marcus Rivera", mutual: 7, isFollowing: true },
  { id: "g3", username: "zoe.creates", fullName: "Zoe Patel", mutual: 0, isFollowing: true },
  { id: "g4", username: "kai_adventures", fullName: "Kai Tanaka", mutual: 5, isFollowing: true },
  { id: "g5", username: "nadia.official", fullName: "Nadia Gomez", mutual: 2, isFollowing: true },
  { id: "g6", username: "alex.w", fullName: "Alex Williams", mutual: 3, isFollowing: true },
  { id: "g7", username: "maya_art", fullName: "Maya Torres", mutual: 9, isFollowing: true },
];

function UserRow({ user, isOwn, listType }: {
  user: typeof MOCK_FOLLOWERS[0];
  isOwn: boolean;
  listType: ListType;
}) {
  const colors = useColors();
  const [following, setFollowing] = useState(user.isFollowing);
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <TouchableOpacity
        onPress={() => router.push(`/profile/${user.username}` as any)}
        style={styles.userInfo}
        activeOpacity={0.8}
      >
        <UserAvatar username={user.username} size={48} />
        <View style={styles.textCol}>
          <Text style={[styles.username, { color: colors.foreground }]}>{user.username}</Text>
          <Text style={[styles.fullName, { color: colors.mutedForeground }]}>{user.fullName}</Text>
          {user.mutual > 0 && (
            <Text style={[styles.mutual, { color: colors.mutedForeground }]}>
              {user.mutual} mutual follower{user.mutual > 1 ? "s" : ""}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.actions}>
        {listType === "followers" && isOwn ? (
          <TouchableOpacity
            onPress={() => setRemoved(true)}
            style={[styles.removeBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.removeBtnText, { color: colors.foreground }]}>Remove</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setFollowing((f) => !f)}
            style={[
              styles.followBtn,
              following && { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
            ]}
          >
            {following ? (
              <Text style={[styles.followBtnText, { color: colors.foreground }]}>Following</Text>
            ) : (
              <LinearGradient
                colors={["#7C3AED", "#EA580C"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.followGrad}
              >
                <Text style={[styles.followBtnText, { color: "#fff" }]}>Follow</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function FollowersScreen() {
  const { username, type } = useLocalSearchParams<{ username: string; type: ListType }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const listType: ListType = type === "following" ? "following" : "followers";
  const [query, setQuery] = useState("");

  const isOwn = false;

  const source = listType === "followers" ? MOCK_FOLLOWERS : MOCK_FOLLOWING;

  const filtered = useMemo(() => {
    if (!query.trim()) return source;
    const q = query.toLowerCase();
    return source.filter(
      (u) => u.username.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q)
    );
  }, [query, source]);

  const title = listType === "followers" ? "Followers" : "Following";
  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{username}</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{title}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search..."
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UserRow user={item} isOwn={isOwn} listType={listType} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {query ? "No results found" : `No ${listType} yet`}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 15, fontFamily: "Poppins_700Bold", textAlign: "center" },
  headerSub: { fontSize: 12, fontFamily: "Poppins_400Regular", textAlign: "center" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 0.5,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  userInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  textCol: { flex: 1 },
  username: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  fullName: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: -2 },
  mutual: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 1 },
  actions: {},
  followBtn: { borderRadius: 10, overflow: "hidden", height: 34, minWidth: 88, justifyContent: "center", alignItems: "center", paddingHorizontal: 8 },
  followGrad: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  followBtnText: { fontFamily: "Poppins_700Bold", fontSize: 13 },
  removeBtn: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  removeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
});
