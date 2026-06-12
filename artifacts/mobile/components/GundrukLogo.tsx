import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import RAnimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export function GundrukLogo({ subtitle }: { subtitle: string }) {
  const fadeAnim = useSharedValue(0);
  const slideAnim = useSharedValue(24);

  useEffect(() => {
    fadeAnim.value = withTiming(1, { duration: 700 });
    slideAnim.value = withSpring(0, { damping: 18, stiffness: 140 });
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
    transform: [{ translateY: slideAnim.value }],
  }));

  return (
    <RAnimated.View style={[styles.wrap, logoStyle]}>
      <View style={styles.blobWrap} pointerEvents="none">
        <View style={styles.blobOuter} />
        <View style={styles.blobMid} />
        <View style={styles.blobInner} />
      </View>

      <View style={styles.badgeWrap}>
        <LinearGradient
          colors={["#8B5CF6", "#EC4899", "#F97316"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.badgeRing}
        >
          <View style={styles.badgeInner}>
            {Platform.OS === "web" ? (
              <Text
                style={[
                  styles.badgeLetter,
                  {
                    // @ts-ignore web only
                    background: "linear-gradient(135deg, #8B5CF6, #EC4899, #F97316)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  },
                ]}
              >
                G
              </Text>
            ) : (
              <LinearGradient
                colors={["#8B5CF6", "#EC4899", "#F97316"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.badgeLetterGrad}
              >
                <Text style={[styles.badgeLetter, { color: "#fff" }]}>G</Text>
              </LinearGradient>
            )}
          </View>
        </LinearGradient>
        <View style={[styles.sparkle, styles.sparkle1]} />
        <View style={[styles.sparkle, styles.sparkle2]} />
        <View style={[styles.sparkle, styles.sparkle3]} />
      </View>

      <View style={styles.wordmarkWrap}>
        {Platform.OS === "web" ? (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              styles.wordmark,
              {
                // @ts-ignore web only
                background: "linear-gradient(90deg, #A78BFA, #EC4899, #FB923C)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              },
            ]}
          >
            GUNDRUK
          </Text>
        ) : (
          <LinearGradient
            colors={["#A78BFA", "#EC4899", "#FB923C"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.wordmarkGrad}
          >
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.wordmark}>
              GUNDRUK
            </Text>
          </LinearGradient>
        )}
      </View>

      <Text style={styles.tagline}>Share your world, your way ✨</Text>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <View style={styles.dividerDot} />
        <View style={styles.dividerLine} />
      </View>

      <Text style={styles.subtitle}>{subtitle}</Text>
    </RAnimated.View>
  );
}

const BADGE = 96;
const BADGE_INNER = 76;

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginBottom: 36 },
  blobWrap: { position: "absolute", top: -20, alignItems: "center", justifyContent: "center" },
  blobOuter: {
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: "rgba(139,92,246,0.13)",
    ...Platform.select({ web: { filter: "blur(60px)" } as any }),
  },
  blobMid: {
    position: "absolute", width: 180, height: 180, borderRadius: 90,
    backgroundColor: "rgba(236,72,153,0.10)",
    ...Platform.select({ web: { filter: "blur(40px)" } as any }),
  },
  blobInner: {
    position: "absolute", width: 100, height: 100, borderRadius: 50,
    backgroundColor: "rgba(249,115,22,0.09)",
    ...Platform.select({ web: { filter: "blur(24px)" } as any }),
  },
  badgeWrap: { alignItems: "center", justifyContent: "center", marginBottom: 20 },
  badgeRing: {
    width: BADGE, height: BADGE, borderRadius: BADGE / 2,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#8B5CF6", shadowOpacity: 0.7, shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 }, elevation: 16,
  },
  badgeInner: {
    width: BADGE_INNER, height: BADGE_INNER, borderRadius: BADGE_INNER / 2,
    backgroundColor: "#08080f", alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  badgeLetterGrad: { width: BADGE_INNER, height: BADGE_INNER, alignItems: "center", justifyContent: "center" },
  badgeLetter: { fontSize: 42, fontFamily: "Poppins_700Bold", lineHeight: 50 },
  sparkle: { position: "absolute", borderRadius: 999, backgroundColor: "#A78BFA" },
  sparkle1: { width: 6, height: 6, top: 4, right: 6, opacity: 0.85 },
  sparkle2: { width: 4, height: 4, bottom: 8, right: 0, opacity: 0.6, backgroundColor: "#EC4899" },
  sparkle3: { width: 5, height: 5, top: 8, left: 4, opacity: 0.5, backgroundColor: "#FB923C" },
  wordmarkWrap: { overflow: "hidden", borderRadius: 4, marginBottom: 8 },
  wordmarkGrad: { paddingHorizontal: 8, paddingVertical: 2 },
  wordmark: { fontSize: 34, fontFamily: "Poppins_700Bold", color: "#fff", letterSpacing: 7 },
  tagline: {
    fontSize: 13, fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.45)", letterSpacing: 0.3, marginBottom: 24,
  },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.07)" },
  dividerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(139,92,246,0.5)" },
  subtitle: { fontSize: 22, fontFamily: "Poppins_700Bold", color: "#fff", letterSpacing: -0.3 },
});
