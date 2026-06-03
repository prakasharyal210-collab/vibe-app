import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: W, height: H } = Dimensions.get("window");

const SPEED_VIBE_PEOPLE = [
  { name: "Jordan", age: 26, image: "https://picsum.photos/seed/sv1/400/600", interests: ["Music", "Travel", "Photography"] },
  { name: "Casey", age: 23, image: "https://picsum.photos/seed/sv2/400/600", interests: ["Art", "Coffee", "Gaming"] },
  { name: "Riley", age: 28, image: "https://picsum.photos/seed/sv3/400/600", interests: ["Fitness", "Yoga", "Food"] },
  { name: "Morgan", age: 25, image: "https://picsum.photos/seed/sv4/400/600", interests: ["Books", "Travel", "Music"] },
];

type Phase = "intro" | "countdown" | "result";

interface SpeedVibeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SpeedVibeModal({ visible, onClose }: SpeedVibeModalProps) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("intro");
  const [personIdx, setPersonIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [sessionResult, setSessionResult] = useState<"match" | "passed" | null>(null);
  const [dailyCount, setDailyCount] = useState(3);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 14, stiffness: 120 });
      opacity.value = withTiming(1, { duration: 300 });
      setPhase("intro");
      setTimeLeft(60);
      setSessionResult(null);
    } else {
      scale.value = withTiming(0.8, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  useEffect(() => {
    if (phase === "countdown") {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current!);
            setPhase("result");
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const handleStart = () => {
    if (dailyCount >= 10) return;
    setDailyCount((c) => c + 1);
    setTimeLeft(60);
    setPhase("countdown");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleConnect = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSessionResult("match");
  };

  const handlePass = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSessionResult("passed");
  };

  const handleNext = () => {
    setPersonIdx((i) => (i + 1) % SPEED_VIBE_PEOPLE.length);
    setTimeLeft(60);
    setSessionResult(null);
    setPhase("intro");
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const person = SPEED_VIBE_PEOPLE[personIdx];
  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;

  const timerPct = timeLeft / 60;
  const timerColor = timeLeft > 30 ? "#7C3AED" : timeLeft > 10 ? "#F97316" : "#EF4444";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.container, animStyle]}>
          <Image source={{ uri: person.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.6)", "transparent", "rgba(0,0,0,0.85)"]} style={StyleSheet.absoluteFill} />

          <View style={[styles.topBar, { paddingTop: topPad }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>⚡ Speed Vibe</Text>
              <Text style={styles.countText}>{dailyCount}/10 today</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          {phase === "countdown" && (
            <View style={styles.timerWrap}>
              <View style={[styles.timerCircle, { borderColor: timerColor }]}>
                <Text style={[styles.timerNum, { color: timerColor }]}>{timeLeft}</Text>
                <Text style={styles.timerLabel}>sec</Text>
              </View>
            </View>
          )}

          <View style={styles.bottomSection}>
            <Text style={styles.personName}>{person.name}, {person.age}</Text>
            <View style={styles.interestRow}>
              {person.interests.map((int) => (
                <View key={int} style={styles.interestPill}>
                  <Text style={styles.interestText}>{int}</Text>
                </View>
              ))}
            </View>

            {phase === "intro" && (
              <View style={styles.actions}>
                <Text style={styles.introText}>
                  You have 60 seconds to connect with {person.name}. Both choose "Connect" to match!
                </Text>
                {dailyCount >= 10 ? (
                  <View style={styles.limitWrap}>
                    <Text style={styles.limitText}>Daily limit reached — come back tomorrow! 😊</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleStart} style={styles.startBtn}>
                    <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.startGrad}>
                      <Ionicons name="videocam-outline" size={20} color="#fff" />
                      <Text style={styles.startText}>Start Speed Vibe</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {phase === "countdown" && !sessionResult && (
              <View style={styles.actions}>
                <Text style={styles.infoText}>Chat with {person.name}! Time is ticking ⏱️</Text>
                <View style={styles.choiceRow}>
                  <TouchableOpacity onPress={handlePass} style={[styles.choiceBtn, styles.passBtn]}>
                    <Ionicons name="close" size={28} color="#EF4444" />
                    <Text style={styles.passBtnText}>Pass</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleConnect} style={[styles.choiceBtn, styles.connectBtn]}>
                    <LinearGradient colors={["#7C3AED", "#EA580C"]} style={styles.connectGrad}>
                      <Ionicons name="heart" size={28} color="#fff" />
                      <Text style={styles.connectBtnText}>Connect</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {(phase === "result" || sessionResult) && (
              <View style={styles.resultWrap}>
                {sessionResult === "match" ? (
                  <>
                    <Text style={styles.resultEmoji}>🎉</Text>
                    <Text style={styles.resultTitle}>Waiting for {person.name}...</Text>
                    <Text style={styles.resultSub}>If they choose Connect too, it's a match!</Text>
                  </>
                ) : sessionResult === "passed" ? (
                  <>
                    <Text style={styles.resultEmoji}>👋</Text>
                    <Text style={styles.resultTitle}>Passed on {person.name}</Text>
                    <Text style={styles.resultSub}>On to the next vibe!</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.resultEmoji}>⏱️</Text>
                    <Text style={styles.resultTitle}>Time's up!</Text>
                    <Text style={styles.resultSub}>Choose now before {person.name} moves on</Text>
                    <View style={styles.choiceRow}>
                      <TouchableOpacity onPress={handlePass} style={[styles.choiceBtn, styles.passBtn]}>
                        <Ionicons name="close" size={28} color="#EF4444" />
                        <Text style={styles.passBtnText}>Pass</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleConnect} style={[styles.choiceBtn, styles.connectBtn]}>
                        <LinearGradient colors={["#7C3AED", "#EA580C"]} style={styles.connectGrad}>
                          <Ionicons name="heart" size={28} color="#fff" />
                          <Text style={styles.connectBtnText}>Connect</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
                {(sessionResult === "match" || sessionResult === "passed") && (
                  <TouchableOpacity onPress={handleNext} style={styles.nextBtn}>
                    <Text style={styles.nextBtnText}>Next Person →</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  container: { width: W - 24, height: H * 0.82, borderRadius: 28, overflow: "hidden" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  closeBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  titleWrap: { alignItems: "center" },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  countText: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  timerWrap: { position: "absolute", top: "35%", alignSelf: "center" },
  timerCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  timerNum: { fontFamily: "Poppins_700Bold", fontSize: 30, lineHeight: 34 },
  timerLabel: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_400Regular", fontSize: 11 },
  bottomSection: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, gap: 10 },
  personName: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 26 },
  interestRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  interestPill: { backgroundColor: "rgba(124,58,237,0.5)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  interestText: { color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 12 },
  actions: { gap: 12 },
  introText: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", lineHeight: 19 },
  startBtn: { borderRadius: 16, overflow: "hidden" },
  startGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15 },
  startText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  infoText: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center" },
  choiceRow: { flexDirection: "row", gap: 12 },
  choiceBtn: { flex: 1, borderRadius: 16, overflow: "hidden", height: 64, alignItems: "center", justifyContent: "center" },
  passBtn: { backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1.5, borderColor: "#EF4444", gap: 2 },
  passBtnText: { color: "#EF4444", fontFamily: "Poppins_700Bold", fontSize: 13 },
  connectBtn: {},
  connectGrad: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", gap: 2 },
  connectBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
  resultWrap: { alignItems: "center", gap: 8 },
  resultEmoji: { fontSize: 44 },
  resultTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 18 },
  resultSub: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center" },
  nextBtn: { backgroundColor: "rgba(124,58,237,0.3)", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 4 },
  nextBtnText: { color: "#A78BFA", fontFamily: "Poppins_700Bold", fontSize: 14 },
  limitWrap: { alignItems: "center", padding: 16 },
  limitText: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center" },
});
