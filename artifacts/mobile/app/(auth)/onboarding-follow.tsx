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
import { GradientButton } from "@/components/GradientButton";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  getOnboardingSuggestedFollows,
  SuggestedFollowAccount,
  toggleFollowUser,
} from "@/lib/db";
import { markFollowOnboardingSeen } from "@/lib/followOnboarding";

const DEFAULT_PRESELECTED = 4;

function fmtCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export default function OnboardingFollowScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const myId = session?.user?.id ?? "";

  const [accounts, setAccounts] = useState<SuggestedFollowAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!myId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const suggestions = await getOnboardingSuggestedFollows(myId, 15);
      if (cancelled) return;
      setAccounts(suggestions);
      // Pre-select the first few so "Continue" feels natural even if the
      // user doesn't tap anything themselves.
      setSelected(new Set(suggestions.slice(0, DEFAULT_PRESELECTED).map((a) => a.id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [myId]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const ids = Array.from(selected);
      // Batch-follow via the existing toggle-follow endpoint — fire in
      // parallel since each call is independent and idempotent.
      await Promise.all(ids.map((id) => toggleFollowUser(myId, id)));
    } catch {
      // Non-fatal — user can always follow people later.
    } finally {
      await markFollowOnboardingSeen(myId);
      router.replace("/(tabs)/feed");
    }
  };

  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["rgba(124,58,237,0.28)", "transparent"]}
        style={[styles.header, { paddingTop: topPad }]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Follow a few people</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Your feed comes alive when you follow people. You can always change this later.
        </Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color="#7C3AED" size="large" />
        </View>
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => toggleSelect(item.id)}
              >
                <UserAvatar username={item.username} url={item.avatar_url} size={52} />
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.username, { color: colors.foreground }]} numberOfLines={1}>
                      {item.full_name || item.username}
                    </Text>
                    {item.is_verified && (
                      <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
                    )}
                  </View>
                  <Text style={[styles.handle, { color: colors.mutedForeground }]} numberOfLines={1}>
                    @{item.username}
                    {item.category ? `  ·  ${item.category}` : ""}
                  </Text>
                  {item.bio ? (
                    <Text style={[styles.bio, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.bio}
                    </Text>
                  ) : item.posts_count ? (
                    <Text style={[styles.bio, { color: colors.mutedForeground }]}>
                      {fmtCount(item.posts_count)} posts
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[
                    styles.followBtn,
                    isSelected
                      ? { backgroundColor: "#7C3AED" }
                      : { borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent" },
                  ]}
                  onPress={() => toggleSelect(item.id)}
                >
                  <Text style={[styles.followBtnText, { color: isSelected ? "#fff" : colors.foreground }]}>
                    {isSelected ? "Following" : "Follow"}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 44 }}>✨</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No suggestions right now
              </Text>
            </View>
          }
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderTopColor: colors.border }]}>
        <GradientButton
          title={selected.size > 0 ? `Continue (${selected.size} selected)` : "Continue"}
          onPress={finish}
          loading={submitting}
        />
        <TouchableOpacity onPress={finish} disabled={submitting} style={styles.skipBtn}>
          <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, gap: 6 },
  title: { fontSize: 22, fontFamily: "Poppins_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 18 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
  },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  username: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  handle: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  bio: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  followBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10 },
  followBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 0.5, gap: 10 },
  skipBtn: { alignItems: "center", paddingVertical: 6 },
  skipText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
});
