import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradientButton } from "@/components/GradientButton";
import { LoginPrompt } from "@/components/LoginPrompt";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { MOCK_HIGHLIGHTS, Profile, supabase } from "@/lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_ITEM = (SCREEN_WIDTH - 3) / 3;

const MOCK_GRID = Array.from({ length: 9 }, (_, i) => ({
  id: String(i),
  image_url: `https://picsum.photos/seed/grid${i + 10}/300/300`,
  isReel: i % 3 === 2,
}));

const MOCK_REELS_GRID = Array.from({ length: 6 }, (_, i) => ({
  id: String(i),
  image_url: `https://picsum.photos/seed/reel${i + 20}/300/400`,
}));

const MOCK_LIKED_GRID = Array.from({ length: 12 }, (_, i) => ({
  id: String(i),
  image_url: `https://picsum.photos/seed/liked${i + 5}/300/300`,
  isReel: i % 4 === 0,
}));

const MOCK_SAVED_GRID = Array.from({ length: 9 }, (_, i) => ({
  id: String(i),
  image_url: `https://picsum.photos/seed/saved${i + 30}/300/300`,
  isReel: i % 5 === 1,
}));

const MOCK_REPOSTS_GRID = Array.from({ length: 6 }, (_, i) => ({
  id: String(i),
  image_url: `https://picsum.photos/seed/repost${i + 50}/300/300`,
  isReel: i % 3 === 0,
}));

const MOCK_PROFILE: Profile = {
  id: "me",
  username: "your_vibe",
  bio: "Living, laughing, vibing ✨",
  followers_count: 1284,
  following_count: 342,
  posts_count: 27,
};

function StatBlock({ label, value }: { label: string; value: number | string }) {
  const colors = useColors();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>
        {typeof value === "number" && value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function GuestProfile() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.guestContainer, { paddingTop: topInset + 40 }]}>
      <View style={[styles.guestAvatar, { backgroundColor: colors.muted }]}>
        <Ionicons name="person" size={48} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.guestTitle, { color: colors.foreground }]}>Your Profile</Text>
      <Text style={[styles.guestSub, { color: colors.mutedForeground }]}>
        Sign in to see your posts, followers, and messages
      </Text>
      <GradientButton onPress={() => router.push("/(auth)/login")} title="Sign In" style={{ width: "80%" }} />
      <TouchableOpacity onPress={() => router.push("/(auth)/signup")}>
        <Text style={{ color: "#7C3AED", fontSize: 14, fontFamily: "Poppins_600SemiBold" }}>
          Create account →
        </Text>
      </TouchableOpacity>
    </View>
  );
}

type ProfileTab = "posts" | "reels" | "liked" | "saved" | "reposts";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const isLoggedIn = !!session;
  const [profile, setProfile] = useState<Profile>(MOCK_PROFILE);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;

  useEffect(() => {
    if (!session?.user) return;
    supabase.from("profiles").select("*").eq("id", session.user.id).single()
      .then(({ data }) => { if (data) setProfile(data as Profile); });
  }, [session]);

  if (!isLoggedIn) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GuestProfile />
        <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
      </View>
    );
  }

  const emailUsername = session?.user?.email?.split("@")[0] ?? "your_vibe";
  const displayUsername = profile.username === "your_vibe" ? emailUsername : profile.username;

  const ListHeader = (
    <View>
      <LinearGradient
        colors={["rgba(124,58,237,0.35)", "transparent"]}
        style={[styles.headerGradient, { paddingTop: topInset + 8 }]}
      >
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <Text style={[styles.username, { color: colors.foreground }]}>{displayUsername}</Text>
            <View style={styles.verifiedRow}>
              <Ionicons name="checkmark-circle" size={16} color="#7C3AED" />
              <Text style={[styles.verifiedText, { color: "#7C3AED" }]}>Verified</Text>
            </View>
          </View>
          <View style={styles.topActions}>
            <TouchableOpacity onPress={() => router.push("/notifications")} style={styles.iconBtn}>
              <Ionicons name="notifications-outline" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/inbox")} style={styles.iconBtn}>
              <Ionicons name="chatbubble-outline" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/settings")} style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileHeader}>
          <UserAvatar username={displayUsername} url={profile.avatar_url} size={88} showBorder />
          <View style={styles.profileInfo}>
            {profile.bio ? (
              <Text style={[styles.bio, { color: colors.mutedForeground }]}>{profile.bio}</Text>
            ) : null}
            <TouchableOpacity style={styles.shareLinkBtn} onPress={() => Alert.alert("Link copied!", `vibe.app/${displayUsername}`)}>
              <Ionicons name="link-outline" size={13} color="#7C3AED" />
              <Text style={[styles.shareLinkText, { color: "#7C3AED" }]}>vibe.app/{displayUsername}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.statsRow, { backgroundColor: "rgba(255,255,255,0.04)" }]}>
          <StatBlock label="Posts" value={profile.posts_count ?? MOCK_GRID.length} />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock label="Followers" value={profile.followers_count ?? 1284} />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock label="Following" value={profile.following_count ?? 342} />
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.editBtnText, { color: colors.foreground }]}>Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Alert.alert("Copied!", `vibe.app/${displayUsername}`)} style={[styles.iconActionBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Ionicons name="share-outline" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconActionBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Ionicons name="person-add-outline" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/wallet")} style={[styles.walletChip, { backgroundColor: "rgba(124,58,237,0.15)", borderColor: "#7C3AED" }]}>
            <Text style={styles.walletEmoji}>🪙</Text>
            <Text style={styles.walletChipText}>Wallet</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.highlightsSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsScroll}>
          <TouchableOpacity style={styles.highlightNew}>
            <View style={[styles.highlightCircle, { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1, borderStyle: "dashed" }]}>
              <Ionicons name="add" size={26} color="#7C3AED" />
            </View>
            <Text style={[styles.highlightLabel, { color: colors.mutedForeground }]}>New</Text>
          </TouchableOpacity>
          {MOCK_HIGHLIGHTS.map((h) => (
            <TouchableOpacity key={h.id} style={styles.highlightItem}>
              <LinearGradient colors={["#7C3AED", "#EA580C"]} style={styles.highlightRing}>
                <View style={[styles.highlightInner, { backgroundColor: colors.background }]}>
                  <Image source={{ uri: h.image }} style={styles.highlightImg} />
                </View>
              </LinearGradient>
              <Text style={[styles.highlightLabel, { color: colors.foreground }]}>{h.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.gridTabRow, { borderBottomColor: colors.border }]}>
        {([
          { key: "posts" as ProfileTab, icon: "grid-outline" },
          { key: "reels" as ProfileTab, icon: "play-circle-outline" },
          { key: "liked" as ProfileTab, icon: "heart-outline" },
          { key: "saved" as ProfileTab, icon: "bookmark-outline" },
          { key: "reposts" as ProfileTab, icon: "repeat-outline" },
        ]).map((tab) => (
          <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)}
            style={[styles.gridTab, activeTab === tab.key && { borderBottomColor: "#7C3AED", borderBottomWidth: 2 }]}>
            <Ionicons name={tab.icon as any} size={20} color={activeTab === tab.key ? "#7C3AED" : colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const gridData =
    activeTab === "posts" ? MOCK_GRID :
    activeTab === "reels" ? MOCK_REELS_GRID :
    activeTab === "liked" ? MOCK_LIKED_GRID :
    activeTab === "saved" ? MOCK_SAVED_GRID :
    MOCK_REPOSTS_GRID;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={gridData}
        keyExtractor={(item) => item.id}
        numColumns={3}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.85} style={{ position: "relative" }}>
            <Image source={{ uri: item.image_url }} style={styles.gridImage} resizeMode="cover" />
            {"isReel" in item && item.isReel && (
              <View style={styles.reelBadge}>
                <Ionicons name="play" size={12} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 1.5 }} />}
        columnWrapperStyle={{ gap: 1.5 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  guestContainer: { flex: 1, alignItems: "center", paddingHorizontal: 32, gap: 16 },
  guestAvatar: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  guestTitle: { fontSize: 24, fontFamily: "Poppins_700Bold", textAlign: "center" },
  guestSub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 8 },
  headerGradient: { paddingHorizontal: 16, paddingBottom: 16 },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  topLeft: { gap: 2 },
  username: { fontSize: 19, fontFamily: "Poppins_700Bold" },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  verifiedText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  topActions: { flexDirection: "row", gap: 2 },
  iconBtn: { padding: 6 },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 18, marginBottom: 16 },
  profileInfo: { flex: 1, gap: 6 },
  bio: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 18 },
  shareLinkBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  shareLinkText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: 14, borderRadius: 16, padding: 14 },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontFamily: "Poppins_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  statDivider: { width: 1, height: 30 },
  actionButtons: { flexDirection: "row", gap: 8, marginBottom: 4 },
  editBtn: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  editBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  iconActionBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  highlightsSection: { paddingVertical: 10, borderBottomWidth: 0.5 },
  highlightsScroll: { paddingHorizontal: 14, gap: 14 },
  highlightNew: { alignItems: "center", gap: 5, width: 68 },
  highlightCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  highlightItem: { alignItems: "center", gap: 5, width: 68 },
  highlightRing: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  highlightInner: { width: 58, height: 58, borderRadius: 29, overflow: "hidden" },
  highlightImg: { width: "100%", height: "100%", borderRadius: 29 },
  highlightLabel: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "center" },
  settingsPanel: { marginHorizontal: 14, marginVertical: 10, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  settingsTitle: { fontSize: 15, fontFamily: "Poppins_700Bold", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5 },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingLabel: { fontSize: 14, fontFamily: "Poppins_500Medium" },
  logoutRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  logoutText: { color: "#EF4444", fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  walletChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  walletEmoji: { fontSize: 14 },
  walletChipText: { color: "#7C3AED", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  gridTabRow: { flexDirection: "row", borderBottomWidth: 0.5, marginTop: 4 },
  gridTab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  gridImage: { width: GRID_ITEM, height: GRID_ITEM },
  reelBadge: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 6, padding: 3 },
});
