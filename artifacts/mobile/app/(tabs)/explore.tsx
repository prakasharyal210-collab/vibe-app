import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useColors } from "@/hooks/useColors";
import { MOCK_NEARBY_USERS, Profile, supabase } from "@/lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_SIZE = (SCREEN_WIDTH - 3) / 3;

const EXPLORE_IMAGES = [
  "https://picsum.photos/seed/ex1/300/300",
  "https://picsum.photos/seed/ex2/300/300",
  "https://picsum.photos/seed/ex3/300/300",
  "https://picsum.photos/seed/ex4/300/300",
  "https://picsum.photos/seed/ex5/300/300",
  "https://picsum.photos/seed/ex6/300/300",
  "https://picsum.photos/seed/ex7/300/300",
  "https://picsum.photos/seed/ex8/300/300",
  "https://picsum.photos/seed/ex9/300/300",
];

export default function ExploreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [nearbyUsers, setNearbyUsers] = useState<Profile[]>(MOCK_NEARBY_USERS);
  const [locationGranted, setLocationGranted] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;

  const requestLocation = async () => {
    if (Platform.OS === "web") {
      setLocationGranted(true);
      return;
    }
    setLoadingLocation(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    setLoadingLocation(false);
    if (status === "granted") {
      setLocationGranted(true);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search people, hashtags..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCapitalize="none"
          />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <View style={styles.sectionHeader}>
          <Ionicons name="location" size={18} color="#7C3AED" />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Find Partner
          </Text>
        </View>

        {!locationGranted ? (
          <TouchableOpacity
            onPress={requestLocation}
            style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Ionicons name="location-outline" size={36} color="#7C3AED" />
            <Text style={[styles.locationTitle, { color: colors.foreground }]}>
              Discover nearby Vibers
            </Text>
            <Text style={[styles.locationSub, { color: colors.mutedForeground }]}>
              {loadingLocation ? "Requesting access..." : "Tap to enable location"}
            </Text>
          </TouchableOpacity>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.nearbyList}
          >
            {nearbyUsers.map((user) => (
              <TouchableOpacity
                key={user.id}
                style={[styles.nearbyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.85}
              >
                <UserAvatar username={user.username} size={56} showBorder />
                <Text
                  style={[styles.nearbyName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {user.username}
                </Text>
                <Text
                  style={[styles.nearbyBio, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {user.bio}
                </Text>
                <View style={[styles.distanceBadge, { backgroundColor: colors.muted }]}>
                  <Ionicons name="location" size={10} color="#7C3AED" />
                  <Text style={[styles.distanceText, { color: colors.mutedForeground }]}>
                    {user.location}
                  </Text>
                </View>
                <TouchableOpacity style={styles.connectBtn}>
                  <Text style={styles.connectText}>Vibe</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.sectionHeader}>
          <Ionicons name="compass-outline" size={18} color="#F97316" />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Explore
          </Text>
        </View>

        <View style={styles.grid}>
          {EXPLORE_IMAGES.map((uri, index) => (
            <TouchableOpacity key={index} activeOpacity={0.9}>
              <Image
                source={{ uri }}
                style={[
                  styles.gridImage,
                  index === 0 && styles.gridImageLarge,
                ]}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  locationCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  locationTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
  },
  locationSub: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  nearbyList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  nearbyCard: {
    width: 140,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  nearbyName: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
  },
  nearbyBio: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  distanceText: {
    fontSize: 10,
    fontFamily: "Poppins_400Regular",
  },
  connectBtn: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 2,
  },
  connectText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 1.5,
    paddingHorizontal: 0,
  },
  gridImage: {
    width: GRID_SIZE,
    height: GRID_SIZE,
  },
  gridImageLarge: {
    width: GRID_SIZE * 2 + 1.5,
    height: GRID_SIZE * 2 + 1.5,
  },
});
