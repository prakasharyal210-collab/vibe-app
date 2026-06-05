import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  AdItem,
  getHouseAdGradient,
  handleAdCta,
  hideAd,
  trackAdClick,
  trackAdImpression,
} from "@/lib/ads";

const { width: W } = Dimensions.get("window");

// Gradient colors for real ads (non-house)
const AD_GRAD_COLORS: [string, string][] = [
  ["#7C3AED", "#EC4899"],
  ["#F97316", "#EAB308"],
  ["#059669", "#3B82F6"],
  ["#EF4444", "#F97316"],
];

function getAdGradient(adId: string): [string, string] {
  const hash = adId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AD_GRAD_COLORS[hash % AD_GRAD_COLORS.length];
}

interface AdCardProps {
  ad: AdItem;
  userId?: string;
  onHide?: (adId: string) => void;
}

export function AdCard({ ad, userId, onHide }: AdCardProps) {
  const colors = useColors();
  const [menuVisible, setMenuVisible] = useState(false);
  const [hidden, setHidden] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    trackAdImpression(ad.ad_id, userId).catch(() => {});
  }, [ad.ad_id, userId]);

  const handleHide = () => {
    setMenuVisible(false);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setHidden(true);
      hideAd(ad.ad_id, userId).catch(() => {});
      onHide?.(ad.ad_id);
    });
  };

  const handleReport = () => {
    setMenuVisible(false);
    Alert.alert(
      "Report Ad",
      "Why are you reporting this ad?",
      [
        { text: "Misleading", onPress: () => Alert.alert("Reported", "Thanks for your feedback.") },
        { text: "Inappropriate", onPress: () => Alert.alert("Reported", "Thanks for your feedback.") },
        { text: "Spam", onPress: () => Alert.alert("Reported", "Thanks for your feedback.") },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const handleWhyThis = () => {
    setMenuVisible(false);
    Alert.alert(
      "Why am I seeing this?",
      "This ad was shown based on your location and content interests.\n\nVibe uses these signals to show you relevant ads that may interest you.",
      [{ text: "Got it" }]
    );
  };

  const onCtaPress = () => {
    trackAdClick(ad.ad_id, userId).catch(() => {});
    handleAdCta(ad.cta_url);
  };

  if (hidden) return null;

  const gradientColors: [string, string] = ad.isHouseAd
    ? getHouseAdGradient(ad.ad_id)
    : getAdGradient(ad.ad_id);

  return (
    <Animated.View style={[styles.card, { backgroundColor: colors.card, opacity: fadeAnim }]}>
      {/* Header */}
      <View style={styles.header}>
        {/* Advertiser Avatar */}
        <View style={[styles.avatarWrap, { backgroundColor: gradientColors[0] }]}>
          <Text style={styles.avatarLetter}>
            {ad.advertiser_name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.advertiserName, { color: colors.foreground }]} numberOfLines={1}>
            {ad.advertiser_name}
          </Text>
          <View style={styles.sponsoredRow}>
            <Text style={[styles.sponsoredLabel, { color: colors.mutedForeground }]}>Sponsored</Text>
            <Ionicons name="globe-outline" size={11} color={colors.mutedForeground} />
          </View>
        </View>

        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => setMenuVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Media */}
      {ad.media_url ? (
        <Image
          source={{ uri: ad.media_url }}
          style={styles.media}
          contentFit="cover"
        />
      ) : (
        <LinearGradient
          colors={gradientColors}
          style={styles.media}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.houseAdMediaInner}>
            <Text style={styles.houseAdEmoji}>
              {ad.ad_id === "house-1" ? "✅" :
               ad.ad_id === "house-2" ? "🎁" :
               ad.ad_id === "house-3" ? "💜" :
               ad.ad_id === "house-4" ? "🔴" :
               ad.ad_id === "house-5" ? "🎉" : "📣"}
            </Text>
            <Text style={styles.houseAdMediaTitle}>{ad.title}</Text>
          </View>
        </LinearGradient>
      )}

      {/* Body */}
      <View style={styles.body}>
        <View style={styles.bodyText}>
          <Text style={[styles.adTitle, { color: colors.foreground }]} numberOfLines={2}>
            {ad.title}
          </Text>
          <Text style={[styles.adDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
            {ad.description}
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity onPress={onCtaPress} activeOpacity={0.85}>
          <LinearGradient
            colors={["#7C3AED", "#F97316"]}
            style={styles.ctaBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.ctaText}>{ad.cta_text}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Three-dot menu modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        />
        <View style={[styles.menuSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />

          <TouchableOpacity style={styles.menuItem} onPress={handleWhyThis}>
            <View style={[styles.menuIconWrap, { backgroundColor: "rgba(124,58,237,0.12)" }]}>
              <Ionicons name="help-circle-outline" size={22} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>Why am I seeing this?</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Learn about this ad</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleHide}>
            <View style={[styles.menuIconWrap, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
              <Ionicons name="eye-off-outline" size={22} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>Hide ad</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Don't show this ad again</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleReport}>
            <View style={[styles.menuIconWrap, { backgroundColor: "rgba(249,115,22,0.12)" }]}>
              <Ionicons name="flag-outline" size={22} color="#F97316" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>Report ad</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>Something's wrong with this ad</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 4,
    borderRadius: 0,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  avatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },
  advertiserName: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 18,
  },
  sponsoredRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  sponsoredLabel: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
  menuBtn: {
    padding: 4,
  },

  // Media
  media: {
    width: W,
    height: W * 0.6,
  },
  houseAdMediaInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 20,
  },
  houseAdEmoji: {
    fontSize: 52,
  },
  houseAdMediaTitle: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Body
  body: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  bodyText: {
    flex: 1,
    gap: 2,
  },
  adTitle: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 18,
  },
  adDesc: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    lineHeight: 17,
  },
  ctaBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    minWidth: 90,
    alignItems: "center",
  },
  ctaText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
  },

  // Menu modal
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  menuSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 12,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: 0.5,
  },
  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  menuSub: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginTop: 1,
  },
});
