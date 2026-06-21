import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface SuggestedUser {
  id: string;
  username: string;
  avatar_url?: string;
  bio?: string;
  followers_count?: number;
  is_verified?: boolean;
  reason?: string;
}

const MOCK_SUGGESTED: SuggestedUser[] = [
  { id: "s1", username: "luna_sky", bio: "Photographer & traveler ✨", followers_count: 124000, is_verified: true, reason: "Popular in your area" },
  { id: "s2", username: "marcus_vibe", bio: "Music producer 🎵 Dog dad", followers_count: 89000, reason: "Followed by luna_sky" },
  { id: "s3", username: "zoe.creates", bio: "Artist & content creator 🎨", followers_count: 204000, is_verified: true, reason: "Trending creator" },
  { id: "s4", username: "kai_adventures", bio: "Adventure is my middle name 🏔️", followers_count: 56000, reason: "Similar interests" },
  { id: "s5", username: "nadia.official", bio: "Actress & creator 🎬", followers_count: 432000, is_verified: true, reason: "You may know them" },
  { id: "s6", username: "alex.w", bio: "Music & art 🎵", followers_count: 67800, reason: "New on Gundruk" },
  { id: "s7", username: "maya_art", bio: "Digital art & design 🎨", followers_count: 38400, reason: "Liked by people you follow" },
  { id: "s8", username: "jay_create", bio: "Content creator & traveler", followers_count: 92100, reason: "Followed by marcus_vibe" },
];

function fmtCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export default function SuggestedUsersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;

  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (!session?.user?.id) throw new Error("no session");
        const { data } = await supabase
          .from("profiles")
          .select("id, username, avatar_url, bio, followers_count, is_verified")
          .neq("id", session.user.id)
          .order("followers_count", { ascending: false })
          .limit(20);
        if (data?.length) {
          setUsers(data.map((u: any, i: number) => ({
            ...u,
            reason: MOCK_SUGGESTED[i % MOCK_SUGGESTED.length]?.reason ?? "Suggested for you",
          })));
        } else {
          setUsers(MOCK_SUGGESTED);
        }
      } catch {
        setUsers(MOCK_SUGGESTED);
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.user?.id]);

  const toggleFollow = async (userId: string) => {
    const uid = session?.user?.id;
    if (!uid) return;
    const nowFollowing = !followed.has(userId);
    setFollowed((prev) => {
      const next = new Set(prev);
      if (nowFollowing) next.add(userId);
      else next.delete(userId);
      return next;
    });
    try {
      const res = await fetch(
        `${(process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api"}/users/social/toggle-follow`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ followerId: uid, followingId: userId }),
        },
      );
      if (!res.ok) {
        setFollowed((prev) => {
          const next = new Set(prev);
          if (nowFollowing) next.delete(userId); else next.add(userId);
          return next;
        });
      }
    } catch {
      setFollowed((prev) => {
        const next = new Set(prev);
        if (nowFollowing) next.delete(userId); else next.add(userId);
        return next;
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["rgba(124,58,237,0.28)", "transparent"]}
        style={[styles.header, { paddingTop: topPad }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Suggested for You</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color="#7C3AED" size="large" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isFollowing = followed.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.userRow, { borderBottomColor: colors.border }]}
                onPress={() => router.push(`/profile/${item.username}` as any)}
                activeOpacity={0.7}
              >
                <UserAvatar username={item.username} url={item.avatar_url} size={52} />
                <View style={styles.userInfo}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.username, { color: colors.foreground }]}>{item.username}</Text>
                    {item.is_verified && (
                      <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
                    )}
                  </View>
                  {item.bio ? (
                    <Text style={[styles.bio, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.bio}
                    </Text>
                  ) : null}
                  <Text style={[styles.reason, { color: "#7C3AED" }]}>{item.reason}</Text>
                  {item.followers_count ? (
                    <Text style={[styles.followers, { color: colors.mutedForeground }]}>
                      {fmtCount(item.followers_count)} followers
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[
                    styles.followBtn,
                    isFollowing
                      ? { borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent" }
                      : { backgroundColor: "#7C3AED" },
                  ]}
                  onPress={() => toggleFollow(item.id)}
                >
                  <Text style={[styles.followBtnText, { color: isFollowing ? colors.foreground : "#fff" }]}>
                    {isFollowing ? "Following" : "Follow"}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 44 }}>✨</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No suggestions right now</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
  },
  userInfo: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  username: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  bio: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  reason: { fontSize: 11, fontFamily: "Poppins_500Medium" },
  followers: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 10,
  },
  followBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});
