import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface DailyRewardModalProps {
  visible: boolean;
  coins: number;
  streak?: number;
  onClose: () => void;
}

const COIN_EMOJIS = ["🪙", "💰", "✨", "⭐", "🌟", "💫", "🎉"];

function FloatingCoin({ delay, x }: { delay: number; x: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.delay(800),
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -180] });
  const translateX = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, x * 0.6, x] });

  return (
    <Animated.Text
      style={[
        styles.floatingCoin,
        { opacity, transform: [{ translateY }, { translateX }] },
      ]}
    >
      🪙
    </Animated.Text>
  );
}

export function DailyRewardModal({ visible, coins, streak = 1, onClose }: DailyRewardModalProps) {
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const coinSpinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.6);
      opacityAnim.setValue(0);
      coinSpinAnim.setValue(0);

      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, damping: 12, stiffness: 180, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(coinSpinAnim, { toValue: 1, duration: 800, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
          ])
        ).start();
      });
    }
  }, [visible]);

  const coinScale = coinSpinAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1.3, 1] });

  const COINS = [
    { delay: 200, x: -60 },
    { delay: 350, x: 40 },
    { delay: 180, x: -20 },
    { delay: 450, x: 70 },
    { delay: 300, x: -80 },
    { delay: 500, x: 20 },
    { delay: 250, x: -45 },
    { delay: 400, x: 55 },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />

        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }], paddingBottom: insets.bottom + 24 }]}>
          <LinearGradient
            colors={["#1a0533", "#0d0d1a"]}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 28 }]}
          />
          <LinearGradient
            colors={["rgba(124,58,237,0.4)", "transparent"]}
            style={styles.topGlow}
          />

          {visible && COINS.map((c, i) => <FloatingCoin key={i} delay={c.delay} x={c.x} />)}

          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>🔥 Day {streak} Streak</Text>
          </View>

          <Animated.View style={{ transform: [{ scale: coinScale }, { scale: pulseAnim }], alignItems: "center" }}>
            <LinearGradient
              colors={["#F59E0B", "#F97316", "#FBBF24"]}
              style={styles.coinCircle}
            >
              <Text style={styles.coinEmoji}>🪙</Text>
            </LinearGradient>
          </Animated.View>

          <Text style={styles.title}>Daily Reward!</Text>
          <Text style={styles.subtitle}>You've earned your daily coins</Text>

          <View style={styles.coinsRow}>
            <Text style={styles.plus}>+</Text>
            <Text style={styles.coinsAmount}>{coins}</Text>
            <Text style={styles.coinsLabel}> coins</Text>
          </View>

          <View style={styles.bonusRow}>
            <Text style={styles.bonusText}>
              {streak >= 7 ? "🌟 7-day bonus active!" : streak >= 3 ? "⚡ 3-day streak bonus!" : "🎯 Come back tomorrow for more!"}
            </Text>
          </View>

          <TouchableOpacity onPress={onClose} activeOpacity={0.85}>
            <LinearGradient
              colors={["#7C3AED", "#F97316"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.claimBtn}
            >
              <Text style={styles.claimBtnText}>Claim Reward! 🎉</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: 320,
    borderRadius: 28,
    alignItems: "center",
    paddingTop: 32,
    paddingHorizontal: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.4)",
  },
  topGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  floatingCoin: {
    position: "absolute",
    fontSize: 24,
    bottom: 120,
  },
  streakBadge: {
    backgroundColor: "rgba(249,115,22,0.2)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.4)",
    marginBottom: 24,
  },
  streakText: {
    color: "#F97316",
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  coinCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  coinEmoji: { fontSize: 48 },
  title: {
    fontSize: 26,
    fontFamily: "Poppins_700Bold",
    color: "#fff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.55)",
    marginBottom: 20,
  },
  coinsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 12,
  },
  plus: { fontSize: 28, fontFamily: "Poppins_700Bold", color: "#F59E0B" },
  coinsAmount: { fontSize: 52, fontFamily: "Poppins_700Bold", color: "#FBBF24", lineHeight: 60 },
  coinsLabel: { fontSize: 20, fontFamily: "Poppins_600SemiBold", color: "#F59E0B" },
  bonusRow: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 24,
  },
  bonusText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
  },
  claimBtn: {
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 48,
    alignItems: "center",
    marginBottom: 12,
  },
  claimBtnText: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: "#fff",
  },
});
