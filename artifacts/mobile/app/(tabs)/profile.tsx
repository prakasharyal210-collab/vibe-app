import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Profile, supabase } from "@/lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_ITEM = (SCREEN_WIDTH - 3) / 3;

const MOCK_GRID = Array.from({ length: 9 }, (_, i) => ({
  id: String(i),
  image_url: `https://picsum.photos/seed/grid${i + 10}/300/300`,
}));

const MOCK_PROFILE: Profile = {
  id: "me",
  username: "your_vibe",
  bio: "Living, laughing, vibing",
  followers_count: 1284,
  following_count: 342,
  posts_count: 27,
};

function StatBlock({ label, value }: { label: string; value: number | string }) {
  const colors = useColors();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>
        {typeof value === "number" && value >= 1000
          ? `${(value / 1000).toFixed(1)}k`
          : value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile>(MOCK_PROFILE);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (data) setProfile(data as Profile);
    };
    fetchProfile();
  }, [session]);

  const emailUsername = session?.user?.email?.split("@")[0] ?? "your_vibe";
  const displayProfile = {
    ...profile,
    username: profile.username === "your_vibe" ? emailUsername : profile.username,
  };

  const ListHeader = (
    <View>
      <LinearGradient
        colors={["rgba(124,58,237,0.4)", "transparent"]}
        style={[styles.headerGradient, { paddingTop: topInset + 8 }]}
      >
        <View style={styles.topActions}>
          <TouchableOpacity>
            <Ionicons name="settings-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={signOut}>
            <Ionicons name="log-out-outline" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileHeader}>
          <UserAvatar
            username={displayProfile.username}
            url={displayProfile.avatar_url}
            size={88}
            showBorder
          />
          <View style={styles.profileInfo}>
            <Text style={[styles.username, { color: colors.foreground }]}>
              {displayProfile.username}
            </Text>
            {displayProfile.bio ? (
              <Text style={[styles.bio, { color: colors.mutedForeground }]}>
                {displayProfile.bio}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatBlock label="Posts" value={displayProfile.posts_count ?? MOCK_GRID.length} />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock label="Followers" value={displayProfile.followers_count ?? 1284} />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatBlock label="Following" value={displayProfile.following_count ?? 342} />
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.editBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Text style={[styles.editBtnText, { color: colors.foreground }]}>Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Ionicons name="share-outline" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={[styles.gridHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.gridTab, styles.gridTabActive]}>
          <Ionicons name="grid-outline" size={22} color="#7C3AED" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.gridTab}>
          <Ionicons name="person-outline" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={MOCK_GRID}
        keyExtractor={(item) => item.id}
        numColumns={3}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.85}>
            <Image
              source={{ uri: item.image_url }}
              style={styles.gridImage}
              resizeMode="cover"
            />
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
  container: {
    flex: 1,
  },
  headerGradient: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  topActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingBottom: 16,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginBottom: 18,
  },
  profileInfo: {
    flex: 1,
  },
  username: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    marginBottom: 4,
  },
  bio: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    padding: 14,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
  statDivider: {
    width: 1,
    height: 30,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 10,
  },
  editBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  editBtnText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  shareBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gridHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    marginTop: 8,
  },
  gridTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  gridTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#7C3AED",
  },
  gridImage: {
    width: GRID_ITEM,
    height: GRID_ITEM,
  },
});
