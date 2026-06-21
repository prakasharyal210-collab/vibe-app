import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { UserAvatar } from "@/components/UserAvatar";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

interface SuggestedUser {
  id: string;
  username: string;
  avatar_url?: string | null;
  full_name?: string | null;
  is_verified?: boolean;
  followers_count?: number;
}

const REASONS = [
  "Suggested for you",
  "Popular on Gundruk",
  "New on Gundruk",
  "Similar interests",
  "You may know them",
  "Liked by people you follow",
  "Trending creator",
];

export function SuggestedAccountsRow() {
  const colors = useColors();
  const { session } = useAuth();
  const uid = session?.user?.id;

  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, followers_count, is_verified")
          .neq("id", uid)
          .order("followers_count", { ascending: false })
          .limit(20);
        if (data?.length) setUsers(data as SuggestedUser[]);
      } catch {}
      setLoading(false);
    })();
  }, [uid]);

  const toggleFollow = async (userId: string) => {
    if (!uid) return;
    const nowFollowing = !followed.has(userId);
    setFollowed((prev) => {
      const next = new Set(prev);
      if (nowFollowing) next.add(userId); else next.delete(userId);
      return next;
    });
    try {
      const res = await fetch(`${API_BASE}/users/social/toggle-follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followerId: uid, followingId: userId }),
      });
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

  const dismiss = (userId: string) =>
    setDismissed((prev) => new Set(prev).add(userId));

  const visible = users.filter((u) => !dismissed.has(u.id));

  if (!uid || loading) {
    return loading ? (
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <ActivityIndicator color="#7C3AED" style={{ paddingVertical: 24 }} />
      </View>
    ) : null;
  }

  if (visible.length === 0) return null;

  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Discover People</Text>
        <TouchableOpacity onPress={() => router.push("/suggested-users" as any)}>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(u) => u.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => {
          const isFollowing = followed.has(item.id);
          const reason = REASONS[index % REASONS.length];
          return (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => router.push(`/profile/${item.username}` as any)}
              activeOpacity={0.85}
            >
              <TouchableOpacity style={styles.dismissBtn} onPress={() => dismiss(item.id)} hitSlop={8}>
                <Ionicons name="close" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>

              <UserAvatar username={item.username} url={item.avatar_url ?? undefined} size={58} showBorder />

              <Text style={[styles.username, { color: colors.foreground }]} numberOfLines={1}>
                {item.username}
              </Text>
              {item.is_verified && (
                <View style={styles.verifiedRow}>
                  <Ionicons name="checkmark-circle" size={11} color="#7C3AED" />
                  <Text style={[styles.verifiedText, { color: "#7C3AED" }]}>Verified</Text>
                </View>
              )}
              <Text style={[styles.reason, { color: colors.mutedForeground }]} numberOfLines={1}>
                {reason}
              </Text>

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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 18,
    borderWidth: 0.5,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  title: { fontSize: 14, fontFamily: "Poppins_700Bold" },
  seeAll: { fontSize: 13, fontFamily: "Poppins_600SemiBold", color: "#7C3AED" },
  list: { paddingHorizontal: 10, paddingVertical: 10, gap: 10 },
  card: {
    width: 118,
    borderRadius: 16,
    borderWidth: 0.5,
    paddingHorizontal: 10,
    paddingTop: 28,
    paddingBottom: 12,
    alignItems: "center",
    gap: 5,
  },
  dismissBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  username: { fontSize: 12, fontFamily: "Poppins_600SemiBold", textAlign: "center" },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  verifiedText: { fontSize: 10, fontFamily: "Poppins_500Medium" },
  reason: { fontSize: 10, fontFamily: "Poppins_400Regular", textAlign: "center" },
  followBtn: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: "center",
  },
  followBtnText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
});
