"use no memo";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import React, { useState, useRef } from "react";
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

const { width: W } = Dimensions.get("window");

export interface PexelsPhoto {
  id: number;
  photographer: string;
  photographerUrl: string;
  url: string;
  avgColor: string;
  src: {
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  alt: string;
  width: number;
  height: number;
}

const CATEGORY_TAGS: Record<string, string> = {
  nature: "🌿 Nature",
  lifestyle: "✨ Lifestyle",
  travel: "✈️ Travel",
  food: "🍽 Food",
  fashion: "👗 Fashion",
  technology: "💻 Tech",
};

function getCategoryHint(alt: string): string {
  const lower = alt.toLowerCase();
  for (const [key, label] of Object.entries(CATEGORY_TAGS)) {
    if (lower.includes(key)) return label;
  }
  return "📸 Featured";
}

interface Props {
  photo: PexelsPhoto;
  category?: string;
}

export function PexelsCard({ photo, category }: Props) {
  const colors = useColors();
  const [liked, setLiked] = useState(false);
  const [likeCount] = useState(() => Math.floor(Math.random() * 8000) + 200);
  const [bookmarked, setBookmarked] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLiked((v) => !v);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.35, useNativeDriver: true, speed: 200 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 200 }),
    ]).start();
  };

  const openPhoto = () => {
    WebBrowser.openBrowserAsync(photo.url, {
      toolbarColor: "#0F0F1A",
      controlsColor: "#7C3AED",
    });
  };

  const imageH = Math.min((W - 24) * (photo.height / Math.max(photo.width, 1)), (W - 24) * 1.25);
  const clampedH = Math.max(imageH, (W - 24) * 0.65);

  const categoryLabel = category ? (CATEGORY_TAGS[category] ?? "📸 Featured") : getCategoryHint(photo.alt);

  const initials = photo.photographer
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card ?? "#0F0F1A", borderColor: "rgba(255,255,255,0.07)" },
      ]}
    >
      {/* Header — mimics PostCard user row */}
      <View style={styles.header}>
        {/* Avatar with gradient ring */}
        <LinearGradient
          colors={["#7C3AED", "#EC4899"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarRing}
        >
          <View style={[styles.avatarInner, { backgroundColor: photo.avgColor || "#1a1a2e" }]}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        </LinearGradient>

        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text style={[styles.photographer, { color: colors.foreground }]} numberOfLines={1}>
              {photo.photographer}
            </Text>
            {/* Featured badge */}
            <View style={styles.featuredBadge}>
              <LinearGradient
                colors={["#7C3AED", "#EC4899"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.featuredGrad}
              >
                <Text style={styles.featuredText}>✦ Featured</Text>
              </LinearGradient>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {categoryLabel}
            </Text>
            <Text style={[styles.metaDot, { color: colors.mutedForeground }]}>·</Text>
            <Ionicons name="camera-outline" size={11} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Pexels</Text>
          </View>
        </View>

        {/* More options placeholder */}
        <TouchableOpacity onPress={openPhoto} style={styles.moreBtn} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Ionicons name="open-outline" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Photo */}
      <TouchableOpacity activeOpacity={0.96} onPress={openPhoto} onLongPress={handleLike}>
        <View style={[styles.imageWrap, { height: clampedH, backgroundColor: photo.avgColor || "#111" }]}>
          <Image
            source={{ uri: photo.src.large ?? photo.src.medium }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {/* Subtle bottom gradient */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.45)"]}
            style={[styles.imageGrad, { pointerEvents: "none" }]}
          />
          {/* Pexels watermark */}
          <View style={styles.pexelsBadge}>
            <Ionicons name="aperture-outline" size={11} color="#fff" />
            <Text style={styles.pexelsBadgeText}>Pexels</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Action bar — mirrors PostCard */}
      <View style={styles.actions}>
        <View style={styles.leftActions}>
          <TouchableOpacity onPress={handleLike} style={styles.actionBtn}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={26}
                color={liked ? "#EC4899" : colors.foreground}
              />
            </Animated.View>
          </TouchableOpacity>
          <Text style={[styles.actionCount, { color: liked ? "#EC4899" : colors.mutedForeground }]}>
            {liked ? likeCount + 1 : likeCount}
          </Text>

          <TouchableOpacity style={styles.actionBtn} onPress={openPhoto}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>
            {Math.floor(Math.random() * 300) + 10}
          </Text>

          <TouchableOpacity style={styles.actionBtn} onPress={openPhoto}>
            <Ionicons name="paper-plane-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={styles.rightIcons}>
          <TouchableOpacity onPress={() => { setBookmarked((b) => !b); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
            <Ionicons
              name={bookmarked ? "bookmark" : "bookmark-outline"}
              size={23}
              color={bookmarked ? "#8B5CF6" : colors.foreground}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Caption */}
      {photo.alt ? (
        <View style={styles.caption}>
          <Text style={[styles.captionText, { color: colors.foreground }]} numberOfLines={3}>
            <Text style={styles.captionBold}>{photo.photographer} </Text>
            {photo.alt}
          </Text>
          <TouchableOpacity onPress={openPhoto} style={styles.viewOnPexels}>
            <Text style={styles.viewOnPexelsText}>View on Pexels →</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  avatarRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    padding: 2,
    flexShrink: 0,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#0F0F1A",
  },
  avatarInitials: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
  },
  headerText: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  photographer: { fontSize: 14, fontFamily: "Poppins_600SemiBold", flexShrink: 1 },
  featuredBadge: { borderRadius: 6, overflow: "hidden" },
  featuredGrad: { paddingHorizontal: 7, paddingVertical: 2 },
  featuredText: { color: "#fff", fontSize: 9, fontFamily: "Poppins_700Bold", letterSpacing: 0.3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  metaText: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  metaDot: { fontSize: 11 },
  moreBtn: { padding: 4 },
  imageWrap: { width: "100%", position: "relative" },
  imageGrad: { position: "absolute", left: 0, right: 0, bottom: 0, height: "40%" },
  pexelsBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pexelsBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Poppins_600SemiBold" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  leftActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionBtn: { padding: 4 },
  actionCount: { fontSize: 13, fontFamily: "Poppins_500Medium", marginRight: 8, minWidth: 20 },
  rightIcons: { flexDirection: "row", gap: 10 },
  caption: { paddingHorizontal: 14, paddingBottom: 12 },
  captionText: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 19 },
  captionBold: { fontFamily: "Poppins_600SemiBold" },
  viewOnPexels: { marginTop: 5 },
  viewOnPexelsText: { color: "#8B5CF6", fontSize: 12, fontFamily: "Poppins_500Medium" },
});
