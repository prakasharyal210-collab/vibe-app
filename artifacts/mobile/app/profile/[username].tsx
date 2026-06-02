import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
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
import { UserAvatar } from "@/components/UserAvatar";
import { useColors } from "@/hooks/useColors";
import { MOCK_SEARCH_ACCOUNTS } from "@/lib/supabase";

const { width: W } = Dimensions.get("window");
const GRID_SIZE = (W - 3) / 3;

const MOCK_GRID_IMAGES = Array.from({ length: 12 }, (_, i) => ({
  id: `g${i}`,
  image: `https://picsum.photos/seed/profile${i + 1}/300/300`,
  likes: Math.floor(Math.random() * 5000) + 100,
}));

const MOCK_USER_DATA: Record<string, {
  bio: string;
  followers: number;
  following: number;
  posts: number;
  isVerified: boolean;
  location: string;
  highlights: { label: string; image: string }[];
}> = {
  "luna_sky": {
    bio: "Photographer & world traveler ✨\nAlways chasing golden hour 📸",
    followers: 124000,
    following: 892,
    posts: 347,
    isVerified: true,
    location: "Santorini, Greece",
    highlights: [
      { label: "Travel", image: "https://picsum.photos/seed/hl1/100/100" },
      { label: "Sunsets", image: "https://picsum.photos/seed/hl2/100/100" },
      { label: "Art", image: "https://picsum.photos/seed/hl3/100/100" },
      { label: "Coffee", image: "https://picsum.photos/seed/hl4/100/100" },
    ],
  },
  "marcus_vibe": {
    bio: "Music producer 🎵 Dog dad 🐕\nStudio sessions > everything",
    followers: 89000,
    following: 543,
    posts: 201,
    isVerified: false,
    location: "New York, NY",
    highlights: [
      { label: "Music", image: "https://picsum.photos/seed/hl5/100/100" },
      { label: "Dogs", image: "https://picsum.photos/seed/hl6/100/100" },
    ],
  },
  "zoe.creates": {
    bio: "Artist & content creator 🎨\nCreating worlds with color",
    followers: 204000,
    following: 1204,
    posts: 512,
    isVerified: true,
    location: "Los Angeles, CA",
    highlights: [
      { label: "Art", image: "https://picsum.photos/seed/hl7/100/100" },
      { label: "Process", image: "https://picsum.photos/seed/hl8/100/100" },
      { label: "Behind", image: "https://picsum.photos/seed/hl9/100/100" },
    ],
  },
};

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [following, setFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState<"posts" | "reels" | "tagged">("posts");

  const userData = MOCK_USER_DATA[username ?? ""] ?? {
    bio: "Vibe creator ✨",
    followers: Math.floor(Math.random() * 50000) + 1000,
    following: Math.floor(Math.random() * 500) + 100,
    posts: Math.floor(Math.random() * 200) + 10,
    isVerified: false,
    location: "",
    highlights: [],
  };

  const avatarSeed = username ?? "user";

  const StatBox = ({ value, label }: { value: string | number; label: string }) => (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{typeof value === "number" ? formatCount(value) : value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 16 : insets.top + 4 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: colors.foreground }]}>{username}</Text>
        <TouchableOpacity style={styles.moreBtn}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarSection}>
            <LinearGradient
              colors={["#7C3AED", "#F97316"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarRing}
            >
              <View style={[styles.avatarInner, { backgroundColor: colors.background }]}>
                <UserAvatar username={avatarSeed} size={80} />
              </View>
            </LinearGradient>
          </View>

          <View style={styles.statsRow}>
            <StatBox value={userData.posts} label="Posts" />
            <StatBox value={userData.followers} label="Followers" />
            <StatBox value={userData.following} label="Following" />
          </View>
        </View>

        <View style={styles.bioSection}>
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.foreground }]}>{username}</Text>
            {userData.isVerified && (
              <Ionicons name="checkmark-circle" size={18} color="#7C3AED" />
            )}
          </View>
          {userData.location ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.location, { color: colors.mutedForeground }]}>{userData.location}</Text>
            </View>
          ) : null}
          <Text style={[styles.bio, { color: colors.foreground }]}>{userData.bio}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => setFollowing((f) => !f)}
            style={[styles.followBtn, following && { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border }]}
            activeOpacity={0.85}
          >
            {following ? (
              <Text style={[styles.followBtnText, { color: colors.foreground }]}>Following ✓</Text>
            ) : (
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.followGrad}>
                <Text style={[styles.followBtnText, { color: "#fff" }]}>Follow</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.msgBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.foreground} />
            <Text style={[styles.msgBtnText, { color: colors.foreground }]}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.vibeBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={styles.vibeBtnText}>💜 Vibe</Text>
          </TouchableOpacity>
        </View>

        {userData.highlights.length > 0 && (
          <View style={styles.highlightsSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsRow}>
              {userData.highlights.map((hl, i) => (
                <TouchableOpacity key={i} style={styles.highlightItem} activeOpacity={0.8}>
                  <LinearGradient colors={["#7C3AED", "#F97316"]} style={styles.highlightRing}>
                    <View style={[styles.highlightInner, { backgroundColor: colors.background }]}>
                      <Image source={{ uri: hl.image }} style={styles.highlightImage} />
                    </View>
                  </LinearGradient>
                  <Text style={[styles.highlightLabel, { color: colors.foreground }]}>{hl.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={[styles.tabRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
          {([
            { id: "posts", icon: "grid-outline" as const },
            { id: "reels", icon: "film-outline" as const },
            { id: "tagged", icon: "person-outline" as const },
          ] as const).map((tab) => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
            >
              <Ionicons name={tab.icon} size={22} color={activeTab === tab.id ? "#7C3AED" : colors.mutedForeground} />
              {activeTab === tab.id && (
                <View style={styles.tabIndicator} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.grid}>
          {MOCK_GRID_IMAGES.map((item, i) => (
            <TouchableOpacity key={item.id} style={styles.gridItem} activeOpacity={0.85}>
              <Image source={{ uri: item.image }} style={styles.gridImage} resizeMode="cover" />
              <View style={styles.gridOverlay} pointerEvents="none">
                <Ionicons name="heart" size={13} color="#fff" />
                <Text style={styles.gridLikes}>{formatCount(item.likes)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  topBarTitle: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  moreBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  profileHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  avatarSection: {},
  avatarRing: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  avatarInner: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  statsRow: { flex: 1, flexDirection: "row", justifyContent: "space-around", marginLeft: 16 },
  statBox: { alignItems: "center" },
  statValue: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: -2 },
  bioSection: { paddingHorizontal: 16, paddingBottom: 14, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  displayName: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  location: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  bio: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 19 },
  actionRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  followBtn: { flex: 2, borderRadius: 10, overflow: "hidden", height: 38 },
  followGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  followBtnText: { fontFamily: "Poppins_700Bold", fontSize: 14 },
  msgBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, height: 38, borderWidth: 1 },
  msgBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  vibeBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 10, height: 38, borderWidth: 1 },
  vibeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#A78BFA" },
  highlightsSection: { marginBottom: 14 },
  highlightsRow: { paddingHorizontal: 16, gap: 16 },
  highlightItem: { alignItems: "center", gap: 5 },
  highlightRing: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  highlightInner: { width: 62, height: 62, borderRadius: 31, overflow: "hidden" },
  highlightImage: { width: "100%", height: "100%" },
  highlightLabel: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "center" },
  tabRow: { flexDirection: "row", borderTopWidth: 0.5, borderBottomWidth: 0.5, marginBottom: 1 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12, position: "relative" },
  tabBtnActive: {},
  tabIndicator: { position: "absolute", top: 0, left: 16, right: 16, height: 2, backgroundColor: "#7C3AED", borderRadius: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 1.5, paddingBottom: 80 },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, position: "relative" },
  gridImage: { width: "100%", height: "100%" },
  gridOverlay: { position: "absolute", bottom: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3 },
  gridLikes: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
});
