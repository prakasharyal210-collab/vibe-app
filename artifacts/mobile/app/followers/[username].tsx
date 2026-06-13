import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type ListType = "followers" | "following";

interface FollowUser {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  viewer_is_following: boolean;
  is_self: boolean;
}

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

async function fetchList(username: string, type: ListType, viewerId?: string): Promise<FollowUser[]> {
  try {
    const viewerParam = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
    const endpoint = type === "followers"
      ? `${API_BASE}/users/social/followers/${encodeURIComponent(username)}${viewerParam}`
      : `${API_BASE}/users/social/following/${encodeURIComponent(username)}${viewerParam}`;
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    const { users } = await res.json() as { users: FollowUser[] };
    return users ?? [];
  } catch {
    return [];
  }
}

async function apiFollow(followerId: string, followingId: string): Promise<void> {
  await fetch(`${API_BASE}/users/social/follow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ followerId, followingId }),
  });
}

async function apiUnfollow(followerId: string, followingId: string): Promise<void> {
  await fetch(`${API_BASE}/users/social/follow`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ followerId, followingId }),
  });
}

function UserRow({
  user,
  isOwnProfile,
  listType,
  myId,
  profileUserId,
}: {
  user: FollowUser;
  isOwnProfile: boolean;
  listType: ListType;
  myId?: string;
  profileUserId?: string;
}) {
  const colors = useColors();
  const [following, setFollowing] = useState(user.viewer_is_following);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);

  if (removed) return null;

  const handleFollowToggle = async () => {
    if (!myId || busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      if (next) {
        await apiFollow(myId, user.id);
      } else {
        await apiUnfollow(myId, user.id);
      }
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!myId || !profileUserId || busy) return;
    setBusy(true);
    try {
      // Remove follower = unfollow from follower's perspective
      await apiUnfollow(user.id, profileUserId);
      setRemoved(true);
    } catch {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <TouchableOpacity
        onPress={() => router.push(`/profile/${user.username}` as any)}
        style={styles.userInfo}
        activeOpacity={0.8}
      >
        <UserAvatar username={user.username} url={user.avatar_url} size={48} />
        <View style={styles.textCol}>
          <View style={styles.nameRow}>
            <Text style={[styles.username, { color: colors.foreground }]}>{user.username}</Text>
            {user.is_verified && (
              <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
            )}
          </View>
          {user.full_name ? (
            <Text style={[styles.fullName, { color: colors.mutedForeground }]}>{user.full_name}</Text>
          ) : null}
        </View>
      </TouchableOpacity>

      <View style={styles.actions}>
        {user.is_self ? null : listType === "followers" && isOwnProfile ? (
          <TouchableOpacity
            onPress={handleRemove}
            disabled={busy}
            style={[styles.removeBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.removeBtnText, { color: colors.foreground }]}>Remove</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleFollowToggle}
            disabled={busy || !myId}
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
  const { username, type, userId: profileUserIdParam } = useLocalSearchParams<{
    username: string;
    type: ListType;
    userId?: string;
  }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const listType: ListType = type === "following" ? "following" : "followers";
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwnProfile = !!myId && (myId === profileUserIdParam);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchList(username, listType, myId);
    setUsers(result);
    setLoading(false);
  }, [username, listType, myId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q)
    );
  }, [query, users]);

  const title = listType === "followers" ? "Followers" : "Following";
  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;

  // Find profileUserId from the loaded list for "remove follower" (own profile)
  const profileUserId = profileUserIdParam ?? myId;

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
        <Ionicons name="search" size={16} color={colors.mutedForeground} />
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

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <UserRow
              user={item}
              isOwnProfile={isOwnProfile}
              listType={listType}
              myId={myId}
              profileUserId={profileUserId}
            />
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
      )}
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
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  userInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  textCol: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  username: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  fullName: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: -2 },
  actions: {},
  followBtn: { borderRadius: 10, overflow: "hidden", height: 34, minWidth: 88, justifyContent: "center", alignItems: "center", paddingHorizontal: 8 },
  followGrad: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  followBtnText: { fontFamily: "Poppins_700Bold", fontSize: 13 },
  removeBtn: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  removeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14 },
});
