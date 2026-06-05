import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AdItem, handleAdCta, trackAdClick, trackAdImpression } from "@/lib/ads";

const { width: W, height: H } = Dimensions.get("window");
const SCREEN_H = H;
const SKIP_DELAY = 5000;

const REEL_AD_GRADIENTS: Record<string, [string, string, string]> = {
  "reel-house-1": ["#1A0533", "#7C3AED", "#EC4899"],
  "reel-house-2": ["#0A1628", "#3B82F6", "#7C3AED"],
};

function getReelAdGradient(adId: string): [string, string, string] {
  if (REEL_AD_GRADIENTS[adId]) return REEL_AD_GRADIENTS[adId];
  const colors: [string, string, string][] = [
    ["#0D0D1A", "#7C3AED", "#EC4899"],
    ["#1A0A00", "#F97316", "#EAB308"],
    ["#001A12", "#059669", "#3B82F6"],
  ];
  const hash = adId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

const AD_EMOJIS: Record<string, string> = {
  "reel-house-1": "🎬",
  "reel-house-2": "✨",
};

interface ReelAdCardProps {
  ad: AdItem;
  isActive: boolean;
  userId?: string;
  onSkip: () => void;
}

export function ReelAdCard({ ad, isActive, userId, onSkip }: ReelAdCardProps) {
  const [canSkip, setCanSkip] = useState(false);
  const [skipCountdown, setSkipCountdown] = useState(Math.ceil(SKIP_DELAY / 1000));

  const ctaY = useRef(new Animated.Value(80)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const skipOpacity = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isActive) {
      ctaY.setValue(80);
      ctaOpacity.setValue(0);
      skipOpacity.setValue(0);
      progressWidth.setValue(0);
      setCanSkip(false);
      setSkipCountdown(Math.ceil(SKIP_DELAY / 1000));
      return;
    }

    trackAdImpression(ad.ad_id, userId).catch(() => {});

    // Animate CTA sliding up
    Animated.parallel([
      Animated.spring(ctaY, { toValue: 0, useNativeDriver: true, delay: 400, tension: 60, friction: 10 }),
      Animated.timing(ctaOpacity, { toValue: 1, duration: 400, useNativeDriver: true, delay: 400 }),
    ]).start();

    // Progress bar animation
    Animated.timing(progressWidth, {
      toValue: 1,
      duration: 15000,
      useNativeDriver: false,
    }).start();

    // Countdown timer
    let remaining = Math.ceil(SKIP_DELAY / 1000);
    const interval = setInterval(() => {
      remaining -= 1;
      setSkipCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        setCanSkip(true);
        Animated.timing(skipOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isActive, ad.ad_id]);

  const onCtaPress = () => {
    trackAdClick(ad.ad_id, userId).catch(() => {});
    handleAdCta(ad.cta_url);
  };

  const gradientColors = getReelAdGradient(ad.ad_id);
  const emoji = AD_EMOJIS[ad.ad_id] ?? "📣";

  return (
    <View style={[S.container, { height: SCREEN_H }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={gradientColors}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />

      {/* Decorative circles */}
      <View style={[S.circle, S.circle1]} />
      <View style={[S.circle, S.circle2]} />
      <View style={[S.circle, S.circle3]} />

      {/* Sponsored badge */}
      <View style={S.sponsoredBadge}>
        <Ionicons name="megaphone" size={11} color="#fff" />
        <Text style={S.sponsoredText}>Sponsored</Text>
      </View>

      {/* Central content */}
      <View style={S.center}>
        <Text style={S.emoji}>{emoji}</Text>
        <Text style={S.adTitle}>{ad.title}</Text>
        <Text style={S.adDesc}>{ad.description}</Text>
        <Text style={S.advertiserName}>by {ad.advertiser_name}</Text>
      </View>

      {/* CTA button (animated slide up) */}
      <Animated.View
        style={[
          S.ctaWrap,
          { transform: [{ translateY: ctaY }], opacity: ctaOpacity },
        ]}
      >
        <TouchableOpacity onPress={onCtaPress} activeOpacity={0.85} style={S.ctaBtn}>
          <LinearGradient
            colors={["#7C3AED", "#F97316"]}
            style={S.ctaBtnInner}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={S.ctaText}>{ad.cta_text}</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* Skip button */}
      <Animated.View style={[S.skipWrap, { opacity: skipOpacity }]}>
        {canSkip ? (
          <TouchableOpacity style={S.skipBtn} onPress={onSkip} activeOpacity={0.8}>
            <Text style={S.skipText}>Skip Ad</Text>
            <Ionicons name="play-skip-forward" size={14} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={S.skipCountdown}>
            <Text style={S.skipCountdownText}>Skip in {skipCountdown}s</Text>
          </View>
        )}
      </Animated.View>

      {/* Progress bar */}
      <View style={S.progressTrack}>
        <Animated.View
          style={[
            S.progressFill,
            { width: progressWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
          ]}
        />
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  container: {
    width: W,
    backgroundColor: "#0D0D1A",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  // Decorative background circles
  circle: {
    position: "absolute",
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  circle1: { width: 300, height: 300, top: -80, right: -80 },
  circle2: { width: 200, height: 200, bottom: 120, left: -60 },
  circle3: { width: 120, height: 120, top: "40%", right: 20 },

  // Sponsored badge
  sponsoredBadge: {
    position: "absolute",
    top: 100,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F97316",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  sponsoredText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.3,
  },

  // Center content
  center: {
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emoji: {
    fontSize: 72,
    marginBottom: 4,
  },
  adTitle: {
    color: "#fff",
    fontSize: 26,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
    lineHeight: 34,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  adDesc: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  advertiserName: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    marginTop: 4,
  },

  // CTA
  ctaWrap: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  ctaBtn: {
    borderRadius: 28,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  ctaBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },

  // Skip
  skipWrap: {
    position: "absolute",
    bottom: 52,
    right: 16,
  },
  skipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.3)",
  },
  skipText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  skipCountdown: {
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  skipCountdownText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
  },

  // Progress bar
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#F97316",
  },
});
