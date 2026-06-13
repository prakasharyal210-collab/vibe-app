import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Achievement } from "@/lib/db";

interface AchievementModalProps {
  visible: boolean;
  achievement: Achievement | null;
  onClose: () => void;
}

function Sparkle({ delay, x, y }: { delay: number; x: number; y: number }) {
  const anim = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      anim.value = withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0, { duration: 400 }),
      );
    }, delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const sparkleStyle = useAnimatedStyle(() => {
    const scale = interpolate(anim.value, [0, 0.5, 1], [0, 1.2, 0]);
    return { transform: [{ scale }] };
  });

  return (
    <Animated.Text style={[styles.sparkle, { left: x, top: y }, sparkleStyle]}>
      ✨
    </Animated.Text>
  );
}

export function AchievementModal({ visible, achievement, onClose }: AchievementModalProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useSharedValue(-200);
  const opacityAnim = useSharedValue(0);
  const badgeScale = useSharedValue(0);
  const shineAnim = useSharedValue(-1);

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideAnim.value }],
    opacity: opacityAnim.value,
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));
  const shineStyle = useAnimatedStyle(() => {
    const translateX = interpolate(shineAnim.value, [-1, 2], [-120, 320]);
    return { transform: [{ translateX }, { rotate: "20deg" }] };
  });

  useEffect(() => {
    if (visible) {
      slideAnim.value = -200;
      opacityAnim.value = 0;
      badgeScale.value = 0;
      shineAnim.value = -1;

      slideAnim.value = withSpring(0, { damping: 15, stiffness: 200 });
      opacityAnim.value = withTiming(1, { duration: 300 });
      badgeScale.value = withDelay(350, withSpring(1, { damping: 10, stiffness: 200 }));
      shineAnim.value = withDelay(700, withTiming(2, { duration: 800 }));
    }
  }, [visible]);

  if (!achievement) return null;

  const SPARKLES = [
    { delay: 400, x: 30, y: 20 },
    { delay: 500, x: 260, y: 30 },
    { delay: 450, x: 140, y: 10 },
    { delay: 600, x: 80, y: 50 },
    { delay: 520, x: 220, y: 45 },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />

        <Animated.View
          style={[
            styles.banner,
            { marginTop: insets.top + 12 },
            bannerStyle,
          ]}
        >
          <LinearGradient
            colors={["#1a0533", "#0d0d1a"]}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 20 }]}
          />
          <LinearGradient
            colors={["rgba(124,58,237,0.6)", "transparent"]}
            style={styles.leftGlow}
          />

          {visible && SPARKLES.map((s, i) => <Sparkle key={i} {...s} />)}

          <Animated.View style={[styles.badgeWrap, badgeStyle]}>
            <LinearGradient
              colors={["#7C3AED", "#F97316"]}
              style={styles.badge}
            >
              <Text style={styles.badgeIcon}>{achievement.icon || "🏆"}</Text>
            </LinearGradient>
            <View style={styles.shine}>
              <Animated.View
                style={[styles.shineBar, shineStyle]}
              />
            </View>
          </Animated.View>

          <View style={styles.textWrap}>
            <Text style={styles.label}>Achievement Unlocked!</Text>
            <Text style={styles.name}>{achievement.name}</Text>
            <Text style={styles.desc}>{achievement.description}</Text>
            {achievement.coins > 0 && (
              <View style={styles.coinPill}>
                <Text style={styles.coinText}>+{achievement.coins} 🪙</Text>
              </View>
            )}
          </View>

          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>🎉</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    pointerEvents: "box-none",
  },
  banner: {
    width: 340,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.5)",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  leftGlow: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 80,
  },
  sparkle: {
    position: "absolute",
    fontSize: 16,
    zIndex: 10,
  },
  badgeWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    overflow: "hidden",
    flexShrink: 0,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeIcon: { fontSize: 26 },
  shine: { position: "absolute", inset: 0, overflow: "hidden" },
  shineBar: {
    position: "absolute",
    top: -20,
    bottom: -20,
    width: 30,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  textWrap: { flex: 1, gap: 2 },
  label: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    color: "#7C3AED",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  name: { fontSize: 15, fontFamily: "Poppins_700Bold", color: "#fff" },
  desc: { fontSize: 11, fontFamily: "Poppins_400Regular", color: "rgba(255,255,255,0.6)" },
  coinPill: {
    marginTop: 4,
    backgroundColor: "rgba(245,158,11,0.2)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
  },
  coinText: { fontSize: 11, fontFamily: "Poppins_600SemiBold", color: "#F59E0B" },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  closeBtnText: { fontSize: 20 },
});
