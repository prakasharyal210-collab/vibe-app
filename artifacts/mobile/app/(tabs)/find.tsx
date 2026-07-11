import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { callAI, parseAIJson } from "@/lib/ai";
import { useMainTabSwipe } from "@/hooks/useMainTabSwipe";
import React, { Component, ErrorInfo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { cardUrl, thumbUrl } from "@/lib/imageUrl";
import { getNetworkConfig } from "@/lib/networkTier";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import {
  Achievement,
  checkAchievements,
  COOLDOWN_CONSECUTIVE_LEFTS,
  COOLDOWN_DURATION_MS,
  FREE_DAILY_SWIPE_LIMIT,
  getDailySwipeCount,
  getGoalInfo,
  getGundrukProfile,
  fetchMessages,
  getMyVibeMatches,
  getOrCreateConversation,
  getNearbyUsers,
  getUserGoals,
  getVibeMatches,
  getUsersByIntention,
  getVibePreferences,
  getSwipedIds,
  markMessagesRead,
  resetVibeDeck,
  sendMessageToUser,
  fetchSuggestedAccounts,
  RELATIONSHIP_GOALS,
  saveGundrukProfile,
  saveUserGoals,
  vibeSwipe,
  SuggestedAccount,
  updateVibeScore,
  VibeMatchProfile,
  VibePrefsRow,
} from "@/lib/db";
import { getCachedVibeDeck, setCachedVibeDeck } from "@/lib/vibeCache";
import { AchievementModal } from "@/components/AchievementModal";
import { VibeCardDisplay } from "@/components/VibeCardDisplay";
import { GradientButton } from "@/components/GradientButton";
import { LoginPrompt } from "@/components/LoginPrompt";
import { SpeedVibeModal } from "@/components/SpeedVibeModal";
import { VibeRoomsTab } from "@/components/VibeRoomsTab";
import { JyotishaTab } from "@/components/JyotishaTab";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import { CoupleTab } from "@/components/CoupleTab";
import { useCoupleStatus } from "@/context/CoupleContext";

// ── Error Boundary ──────────────────────────────────────────────────────────
class FindVibeErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.log("FindVibe Error:", error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: "#080810", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Text style={{ fontSize: 52 }}>💜</Text>
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700", marginTop: 16, textAlign: "center", fontFamily: "Poppins_700Bold" }}>
            Find Vibe needs a moment
          </Text>
          <Text style={{ color: "#9CA3AF", fontSize: 14, marginTop: 8, textAlign: "center", lineHeight: 22 }}>
            Something went wrong. Please try again.
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ marginTop: 28, backgroundColor: "#8B5CF6", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 25 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Mode selection sheet ─────────────────────────────────────────────────────

const MODE_OPTIONS = [
  { value: "dating",     emoji: "❤️",  label: "Dating",       desc: "Find romantic connections and your perfect match" },
  { value: "friends",    emoji: "👫",  label: "Friends",      desc: "Meet new people and expand your social circle" },
  { value: "networking", emoji: "🤝",  label: "Networking",   desc: "Connect with professionals and grow your network" },
  { value: "browsing",   emoji: "👀",  label: "Just Browsing",desc: "Explore without any specific intention" },
  { value: "hide",       emoji: "❌",  label: "Hide Me",      desc: "Don't show me in Find Vibe at all" },
];

function ModeSelectionSheet({
  visible,
  userId,
  onSave,
}: {
  visible: boolean;
  userId: string;
  onSave: (mode: string) => void;
}) {
  const [selected, setSelected] = useState("dating");
  const slideY = useSharedValue(700);

  useEffect(() => { return () => cancelAnimation(slideY); }, []);

  useEffect(() => {
    if (visible) {
      slideY.value = 700;
      slideY.value = withSpring(0, { damping: 22, stiffness: 220 });
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }] }));

  const handleSave = () => {
    const showInMatching = selected !== "hide";
    // Dismiss immediately — don't block on network
    onSave(selected);
    // Persist in background (fire-and-forget)
    AsyncStorage.setItem(`gundruk_mode_selected_${userId}`, new Date().toISOString()).catch(() => {});
    saveGundrukProfile(userId, { find_gundruk_mode: selected, show_in_matching: showInMatching }).catch(() => {});
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={modeStyles.overlay}>
        <Animated.View style={[modeStyles.sheet, sheetStyle]}>
          <View style={modeStyles.handle} />
          <View style={modeStyles.header}>
            <Text style={modeStyles.title}>What are you looking for?</Text>
            <Text style={modeStyles.subtitle}>This helps us show you the right people</Text>
          </View>
          <View style={modeStyles.optionsList}>
            {MODE_OPTIONS.map((opt) => {
              const active = selected === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => { setSelected(opt.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  activeOpacity={0.82}
                  style={[modeStyles.optionRow, active && modeStyles.optionRowActive]}
                >
                  <Text style={modeStyles.optionEmoji}>{opt.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[modeStyles.optionLabel, active && { color: "#A78BFA" }]}>{opt.label}</Text>
                    <Text style={modeStyles.optionDesc}>{opt.desc}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={22} color="#7C3AED" />}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity onPress={handleSave} activeOpacity={0.9} style={modeStyles.saveBtn}>
            <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={modeStyles.saveGrad}>
              <Text style={modeStyles.saveText}>Continue →</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const modeStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingBottom: 44 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginTop: 14, marginBottom: 22 },
  header: { paddingHorizontal: 24, marginBottom: 18 },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 22, marginBottom: 5 },
  subtitle: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_400Regular", fontSize: 14 },
  optionsList: { paddingHorizontal: 16, gap: 8 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, borderRadius: 18, borderWidth: 1.5, backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" },
  optionRowActive: { backgroundColor: "rgba(124,58,237,0.18)", borderColor: "#7C3AED" },
  optionEmoji: { fontSize: 24, width: 32, textAlign: "center" },
  optionLabel: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15, marginBottom: 2 },
  optionDesc: { color: "rgba(255,255,255,0.38)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  saveBtn: { marginHorizontal: 16, marginTop: 20, borderRadius: 18, overflow: "hidden" },
  saveGrad: { paddingVertical: 16, alignItems: "center" },
  saveText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
});


const { width: W, height: H } = Dimensions.get("window");
const SWIPE_THRESHOLD = W * 0.3;

type VibeCard = VibeMatchProfile;

const MY_INTERESTS = ["Photography", "Travel", "Music", "Art", "Coffee"];

const DAILY_VIBE_CARD: VibeCard = {
  id: "daily1",
  name: "Ariana",
  age: 24,
  image: "https://picsum.photos/seed/daily1/400/600",
  bio: "✨ Today's special connection. Your vibes align perfectly across photography, travel, and music.",
  interests: ["Photography", "Travel", "Music", "Coffee"],
  vibe: "Today's Vibe",
  matchInterests: ["Photography", "Travel", "Music"],
};

const SKIP_CARDS: VibeCard[] = [
  DAILY_VIBE_CARD,
  {
    id: "daily2",
    name: "Sofia",
    age: 26,
    image: "https://picsum.photos/seed/daily2/400/600",
    bio: "✨ Your vibes match on travel, art, and coffee culture.",
    interests: ["Travel", "Art", "Coffee", "Photography"],
    vibe: "Today's Vibe",
    matchInterests: ["Travel", "Art", "Coffee"],
  },
  {
    id: "daily3",
    name: "Maya",
    age: 23,
    image: "https://picsum.photos/seed/daily3/400/600",
    bio: "✨ Music and creativity bring you together perfectly.",
    interests: ["Music", "Art", "Travel", "Coffee"],
    vibe: "Today's Vibe",
    matchInterests: ["Music", "Art"],
  },
  {
    id: "daily4",
    name: "Zara",
    age: 25,
    image: "https://picsum.photos/seed/daily4/400/600",
    bio: "✨ Adventure seekers unite — hiking, coffee and good vibes.",
    interests: ["Coffee", "Photography", "Travel", "Music"],
    vibe: "Today's Vibe",
    matchInterests: ["Coffee", "Photography"],
  },
];

const THIS_OR_THAT = [
  { a: "🏖️ Beach", b: "⛰️ Mountains" },
  { a: "☕ Coffee", b: "🍵 Tea" },
  { a: "🌙 Night Owl", b: "🌅 Early Bird" },
  { a: "🎵 Music", b: "🎬 Movies" },
  { a: "🏠 Stay In", b: "🎉 Go Out" },
];

const THEIR_ANSWERS = [0, 1, 0, 0, 1];

function getDailyCountdown(): string {
  const now = new Date();
  const next8 = new Date();
  next8.setHours(20, 0, 0, 0);
  if (now >= next8) next8.setDate(next8.getDate() + 1);
  const diff = next8.getTime() - now.getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function calcMatch(card: VibeCard, myGoals?: string[]): number {
  const shared = (card.matchInterests ?? []).length;
  const total = new Set([...MY_INTERESTS, ...card.interests]).size;
  let pct = total > 0 ? Math.round((shared / total) * 100) : 0;
  if (myGoals?.length && card.goal && myGoals.includes(card.goal)) {
    pct = Math.min(pct + 20, 99);
  }
  return pct;
}

function GoalPill({ goal, size = "sm" }: { goal: string; size?: "sm" | "md" }) {
  const info = getGoalInfo(goal);
  if (!info) return null;
  const pad = size === "md" ? { px: 12, py: 6, fs: 13 } : { px: 9, py: 3, fs: 11 };
  return (
    <View style={[gpStyles.pill, { backgroundColor: info.color + "25", borderColor: info.color + "55", paddingHorizontal: pad.px, paddingVertical: pad.py }]}>
      <Text style={{ fontSize: size === "md" ? 14 : 12 }}>{info.emoji}</Text>
      <Text style={[gpStyles.text, { color: info.color, fontSize: pad.fs }]}>{info.shortLabel}</Text>
    </View>
  );
}

const gpStyles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, borderWidth: 1, alignSelf: "flex-start" },
  text: { fontFamily: "Poppins_600SemiBold" },
});

function VibeGamesModal({ card, visible, onComplete, onSkip }: {
  card: VibeCard | null;
  visible: boolean;
  onComplete: (score: number, card: VibeCard) => void;
  onSkip: () => void;
}) {
  const [qIdx, setQIdx] = useState(0);
  const [myAnswers, setMyAnswers] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const slideX = useSharedValue(W);

  useEffect(() => { return () => cancelAnimation(slideX); }, []);

  useEffect(() => {
    if (visible) {
      setQIdx(0);
      setMyAnswers([]);
      setShowResult(false);
      slideX.value = W;
      slideX.value = withSpring(0, { damping: 20, stiffness: 220 });
    }
  }, [visible]);

  const qSlideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slideX.value }] }));

  const nextQ = (idx: number) => {
    slideX.value = W;
    slideX.value = withSpring(0, { damping: 20, stiffness: 220 });
    setQIdx(idx);
  };

  const pick = (choice: number) => {
    if (!card) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newAnswers = [...myAnswers, choice];
    setMyAnswers(newAnswers);
    if (qIdx < THIS_OR_THAT.length - 1) {
      slideX.value = withTiming(-W * 0.7, { duration: 200 }, () => {
        runOnJS(nextQ)(qIdx + 1);
      });
    } else {
      const matches = newAnswers.filter((a, i) => a === THEIR_ANSWERS[i]).length;
      const pct = Math.round((matches / THIS_OR_THAT.length) * 100) + Math.floor(Math.random() * 20);
      setScore(Math.min(pct, 99));
      setShowResult(true);
    }
  };

  if (!card || !visible) return null;

  const q = THIS_OR_THAT[qIdx];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <View style={gameStyles.overlay}>
        <View style={gameStyles.sheet}>
          <TouchableOpacity onPress={onSkip} style={gameStyles.skipBtn}>
            <Text style={gameStyles.skipText}>Skip game →</Text>
          </TouchableOpacity>

          {!showResult ? (
            <>
              <View style={gameStyles.progressRow}>
                {THIS_OR_THAT.map((_, i) => (
                  <View key={i} style={[gameStyles.progressSeg, { backgroundColor: i < qIdx ? "#7C3AED" : i === qIdx ? "#A78BFA" : "rgba(255,255,255,0.15)" }]} />
                ))}
              </View>

              <View style={gameStyles.photoRow}>
                <View style={gameStyles.photoWrap}>
                  <ExpoImage source={thumbUrl(card.image)} style={gameStyles.playerPhoto} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                  <Text style={gameStyles.photoLabel}>{card.name}</Text>
                </View>
                <Text style={gameStyles.vsText}>⚡</Text>
                <View style={gameStyles.photoWrap}>
                  <ExpoImage source="https://picsum.photos/seed/myprofile/100/100" style={gameStyles.playerPhoto} contentFit="cover" cachePolicy="memory-disk" />
                  <Text style={gameStyles.photoLabel}>You</Text>
                </View>
              </View>

              <Text style={gameStyles.questionLabel}>This or That? ({qIdx + 1}/{THIS_OR_THAT.length})</Text>

              <Animated.View style={[gameStyles.choiceContainer, qSlideStyle]}>
                <TouchableOpacity onPress={() => pick(0)} style={gameStyles.choiceA} activeOpacity={0.8}>
                  <Text style={gameStyles.choiceText}>{q.a}</Text>
                </TouchableOpacity>
                <View style={gameStyles.orWrap}>
                  <Text style={gameStyles.orText}>or</Text>
                </View>
                <TouchableOpacity onPress={() => pick(1)} style={gameStyles.choiceB} activeOpacity={0.8}>
                  <Text style={gameStyles.choiceText}>{q.b}</Text>
                </TouchableOpacity>
              </Animated.View>
            </>
          ) : (
            <View style={gameStyles.resultContainer}>
              <Text style={gameStyles.resultEmoji}>{score >= 75 ? "🔥" : score >= 55 ? "✨" : "😊"}</Text>
              <Text style={gameStyles.resultScore}>{score}% Compatible!</Text>
              <LinearGradient colors={["#7C3AED22", "#EA580C22"]} style={gameStyles.resultBar}>
                <View style={[gameStyles.resultFill, { width: `${score}%` as any }]} />
              </LinearGradient>
              <Text style={gameStyles.resultSub}>
                {score >= 75 ? "You two are a real vibe! 💜" : score >= 55 ? "Definitely worth connecting!" : "Hey, opposites attract!"}
              </Text>
              <TouchableOpacity onPress={() => onComplete(score, card)} activeOpacity={0.9} style={{ width: "100%" }}>
                <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gameStyles.connectGrad}>
                  <Text style={gameStyles.connectText}>Connect 💜</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSkip} style={{ marginTop: 10 }}>
                <Text style={gameStyles.skipText}>Maybe later</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const gameStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", alignItems: "center", justifyContent: "center" },
  sheet: { width: W - 32, backgroundColor: "#12122A", borderRadius: 28, padding: 24, alignItems: "center" },
  skipBtn: { alignSelf: "flex-end", marginBottom: 12 },
  skipText: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_500Medium", fontSize: 13 },
  progressRow: { flexDirection: "row", gap: 6, marginBottom: 20, width: "100%" },
  progressSeg: { flex: 1, height: 4, borderRadius: 2 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 20 },
  photoWrap: { alignItems: "center", gap: 6 },
  playerPhoto: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: "#7C3AED" },
  photoLabel: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_500Medium", fontSize: 12 },
  vsText: { fontSize: 26 },
  questionLabel: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_600SemiBold", fontSize: 13, marginBottom: 18, letterSpacing: 0.3 },
  choiceContainer: { width: "100%", gap: 12 },
  choiceA: { backgroundColor: "rgba(124,58,237,0.25)", borderWidth: 1.5, borderColor: "#7C3AED", borderRadius: 18, paddingVertical: 18, alignItems: "center" },
  orWrap: { alignItems: "center" },
  orText: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_500Medium", fontSize: 13 },
  choiceB: { backgroundColor: "rgba(249,115,22,0.2)", borderWidth: 1.5, borderColor: "#F97316", borderRadius: 18, paddingVertical: 18, alignItems: "center" },
  choiceText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  resultContainer: { alignItems: "center", width: "100%" },
  resultEmoji: { fontSize: 56, marginBottom: 10 },
  resultScore: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 26, marginBottom: 12 },
  resultBar: { width: "100%", height: 8, borderRadius: 4, marginBottom: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.1)" },
  resultFill: { height: 8, backgroundColor: "#7C3AED", borderRadius: 4 },
  resultSub: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_400Regular", fontSize: 14, marginBottom: 24, textAlign: "center" },
  connectGrad: { paddingVertical: 16, borderRadius: 28, alignItems: "center" },
  connectText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
});

function DailyVibeSection({ onViewProfile, onConnect }: { onViewProfile: (card: VibeCard) => void; onConnect: () => void }) {
  const colors = useColors();
  const [countdown, setCountdown] = useState(getDailyCountdown());
  const [connected, setConnected] = useState(false);
  const [skipIdx, setSkipIdx] = useState(0);
  const pulse = useSharedValue(1);

  const activeCard = SKIP_CARDS[skipIdx % SKIP_CARDS.length];

  useEffect(() => {
    const countdownTimer = setInterval(() => setCountdown(getDailyCountdown()), 1000);
    // Use withSequence + JS-thread setInterval — avoids calling setTimeout
    // inside a withSpring callback (which runs on the UI thread and has no
    // access to JS globals like setTimeout).
    const doPulse = () => {
      pulse.value = withSequence(
        withSpring(1.03, { damping: 8, stiffness: 100 }),
        withSpring(1, { damping: 8, stiffness: 100 }),
      );
    };
    doPulse();
    const pulseTimer = setInterval(doPulse, 2500);
    return () => { clearInterval(countdownTimer); clearInterval(pulseTimer); cancelAnimation(pulse); };
  }, []);

  const cardAnim = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const match = calcMatch(activeCard);
  const sharedInterests = activeCard.matchInterests ?? [];

  return (
    <View style={dailyStyles.container}>
      <View style={dailyStyles.headerRow}>
        <View>
          <Text style={dailyStyles.sectionTitle}>🌟 Today's Vibe</Text>
          <Text style={dailyStyles.sectionSub}>Your special daily connection</Text>
        </View>
        <View style={dailyStyles.countdownBox}>
          <Ionicons name="time-outline" size={12} color="#EAB308" />
          <Text style={dailyStyles.countdown}>New in: {countdown}</Text>
        </View>
      </View>

      <Animated.View style={cardAnim}>
        <TouchableOpacity onPress={() => onViewProfile(activeCard)} activeOpacity={0.92} style={dailyStyles.card}>
          <ExpoImage source={cardUrl(activeCard.image)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={200} recyclingKey={activeCard.id} />
          <LinearGradient colors={["rgba(234,179,8,0.3)", "transparent", "rgba(0,0,0,0.9)"]} style={StyleSheet.absoluteFill} />

          <View style={dailyStyles.goldBorderOverlay} pointerEvents="none" />

          <View style={dailyStyles.sparkleRow} pointerEvents="none">
            <LinearGradient colors={["#EAB308", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={dailyStyles.sparkleTag}>
              <Text style={dailyStyles.sparkleText}>⭐ Today's Vibe</Text>
            </LinearGradient>
            <View style={dailyStyles.matchPill}>
              <Text style={dailyStyles.matchPillText}>{match}% Match</Text>
            </View>
          </View>

          <View style={dailyStyles.cardInfo} pointerEvents="none">
            <Text style={dailyStyles.cardName}>{activeCard.name}, {activeCard.age}</Text>
            {sharedInterests.length > 0 && (
              <Text style={dailyStyles.sharedText}>You both love: {sharedInterests.join(", ")}</Text>
            )}
            <View style={dailyStyles.tagsRow}>
              {activeCard.interests.slice(0, 3).map((t) => (
                <View key={t} style={[dailyStyles.tag, sharedInterests.includes(t) && dailyStyles.tagMatch]}>
                  <Text style={dailyStyles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {connected ? (
        <View style={dailyStyles.connectedRow}>
          <Text style={dailyStyles.connectedText}>🎉 You vibed with {activeCard.name}!</Text>
          <TouchableOpacity
            style={dailyStyles.msgBtn}
            onPress={() => router.push({ pathname: "/chat/[userId]", params: { userId: activeCard.id, username: activeCard.name, isVibeMatch: "true" } })}
          >
            <Text style={dailyStyles.msgBtnText}>💬 Message</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={dailyStyles.actionRow}>
          <TouchableOpacity
            onPress={() => { setConnected(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); onConnect(); }}
            activeOpacity={0.9}
            style={{ flex: 1 }}
          >
            <LinearGradient colors={["#EAB308", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={dailyStyles.connectGrad}>
              <Text style={dailyStyles.connectText}>💜 Vibe</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setSkipIdx((i) => i + 1); setConnected(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            activeOpacity={0.85}
            style={dailyStyles.skipBtn}
          >
            <Text style={dailyStyles.skipText}>Skip →</Text>
          </TouchableOpacity>
        </View>
      )}
      <Text style={dailyStyles.expireText}>⏳ Resets at midnight</Text>
    </View>
  );
}

const dailyStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 8 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 18 },
  sectionSub: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: -2 },
  countdownBox: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(234,179,8,0.15)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: "rgba(234,179,8,0.3)" },
  countdown: { color: "#EAB308", fontFamily: "Poppins_700Bold", fontSize: 12 },
  card: { height: H * 0.32, borderRadius: 22, overflow: "hidden", position: "relative" },
  goldBorderOverlay: { ...StyleSheet.absoluteFillObject as any, borderRadius: 22, borderWidth: 2, borderColor: "rgba(234,179,8,0.7)" },
  sparkleRow: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  sparkleTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  sparkleText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 12 },
  matchPill: { backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: "rgba(234,179,8,0.4)" },
  matchPillText: { color: "#EAB308", fontFamily: "Poppins_700Bold", fontSize: 12 },
  cardInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 14, gap: 4 },
  cardName: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 20 },
  cardBio: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 17 },
  tagsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  tagMatch: { backgroundColor: "rgba(234,179,8,0.5)" },
  tagText: { color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 11 },
  connectedRow: { marginTop: 12, alignItems: "center", gap: 10 },
  connectedText: { color: "#EAB308", fontFamily: "Poppins_700Bold", fontSize: 15 },
  msgBtn: { backgroundColor: "rgba(124,58,237,0.3)", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: "#7C3AED" },
  msgBtnText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  expireText: { color: "rgba(255,255,255,0.3)", fontFamily: "Poppins_400Regular", fontSize: 11, textAlign: "center", marginTop: 8 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  connectGrad: { paddingVertical: 15, borderRadius: 24, alignItems: "center" },
  connectText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  skipBtn: { paddingHorizontal: 22, paddingVertical: 15, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  skipText: { color: "rgba(255,255,255,0.55)", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  sharedText: { color: "rgba(234,179,8,0.9)", fontFamily: "Poppins_500Medium", fontSize: 12, lineHeight: 16 },
});

function ProfileModal({ card, onClose, onVibe, onSkip }: { card: VibeCard; onClose: () => void; onVibe: () => void; onSkip: () => void }) {
  const colors = useColors();
  const match = calcMatch(card);

  const photos = React.useMemo(() => {
    const extras = (card.vibe_photos ?? []).filter((url) => Boolean(url) && url !== card.image);
    return [card.image, ...extras];
  }, [card.id, card.image, card.vibe_photos]);

  const [photoIdx, setPhotoIdx] = React.useState(0);

  React.useEffect(() => {
    setPhotoIdx(0);
  }, [card.id]);

  React.useEffect(() => {
    const nextUrl = photos[photoIdx + 1];
    if (nextUrl && getNetworkConfig().imgBuf > 0) ExpoImage.prefetch(nextUrl).catch(() => {});
  }, [photos, photoIdx]);

  const currentPhoto = photos[Math.min(photoIdx, photos.length - 1)] ?? card.image;
  const hasMultiple = photos.length > 1;

  const goNext = () => setPhotoIdx((i) => Math.min(i + 1, photos.length - 1));
  const goPrev = () => setPhotoIdx((i) => Math.max(i - 1, 0));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={profileStyles.overlay}>
        <View style={[profileStyles.sheet, { backgroundColor: colors.card }]}>
          <ExpoImage source={cardUrl(currentPhoto)} style={profileStyles.photo} contentFit="cover" cachePolicy="memory-disk" transition={200} recyclingKey={currentPhoto} />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} style={StyleSheet.absoluteFill} />

          {hasMultiple && (
            <>
              <TouchableOpacity style={profileStyles.tapZoneLeft} onPress={goPrev} activeOpacity={1} />
              <TouchableOpacity style={profileStyles.tapZoneRight} onPress={goNext} activeOpacity={1} />
              <View style={profileStyles.photoBars} pointerEvents="none">
                {photos.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      profileStyles.photoBar,
                      i < photoIdx && profileStyles.photoBarSeen,
                      i === photoIdx && profileStyles.photoBarActive,
                    ]}
                  />
                ))}
              </View>
            </>
          )}

          <TouchableOpacity onPress={onClose} style={profileStyles.closeBtn}>
            <Ionicons name="chevron-down" size={28} color="#fff" />
          </TouchableOpacity>

          <View style={profileStyles.matchBadge}>
            <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={profileStyles.matchGrad}>
              <Text style={profileStyles.matchText}>{match}% Match</Text>
            </LinearGradient>
          </View>

          <View style={profileStyles.info}>
            <Text style={profileStyles.name}>{card.name}, {card.age}</Text>
            {card.distance && (
              <View style={profileStyles.locationRow}>
                <Ionicons name="location" size={13} color="rgba(255,255,255,0.8)" />
                <Text style={profileStyles.locationText}>{card.distance}</Text>
              </View>
            )}
            {card.goal && (
              <View style={{ marginBottom: 6 }}>
                <GoalPill goal={card.goal} size="md" />
              </View>
            )}
            <Text style={profileStyles.bio}>{card.vibe_bio ?? card.bio}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {card.interests.map((int) => (
                  <View key={int} style={[profileStyles.tag, (card.matchInterests ?? []).includes(int) && profileStyles.tagMatch]}>
                    <Text style={profileStyles.tagText}>{int}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={profileStyles.actions}>
            <TouchableOpacity onPress={onSkip} style={[profileStyles.skipBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Ionicons name="close" size={28} color="#EF4444" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onVibe} style={profileStyles.vibeBtn}>
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={profileStyles.vibeGrad}>
                <Ionicons name="heart" size={30} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterModal({
  visible,
  onClose,
  onApply,
  initialPrefs,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (f: FilterState) => void;
  initialPrefs?: VibePrefsRow | null;
}) {
  const colors = useColors();
  const [showGender, setShowGender] = useState<string[]>(initialPrefs?.interested_in ?? ["everyone"]);
  const [goal, setGoal] = useState(initialPrefs?.looking_for ?? "all");
  const [ageMin, setAgeMin] = useState(initialPrefs?.age_min ?? 18);
  const [ageMax, setAgeMax] = useState(initialPrefs?.age_max ?? 35);
  const [maxDist, setMaxDist] = useState(initialPrefs?.max_distance_km ?? 25);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const GENDER_OPTS = [
    { value: "women", label: "Women", emoji: "👩" },
    { value: "men", label: "Men", emoji: "👨" },
    { value: "nonbinary", label: "Non-binary", emoji: "🏳️" },
    { value: "everyone", label: "Everyone", emoji: "💜" },
  ];

  const GOAL_OPTS = [
    { value: "all", label: "All intentions", emoji: "💜" },
    ...(RELATIONSHIP_GOALS as readonly { value: string; label: string; emoji: string }[]).map((g) => ({ value: g.value, label: g.label, emoji: g.emoji })),
  ];

  const toggleGender = (v: string) => {
    if (v === "everyone") { setShowGender(["everyone"]); return; }
    setShowGender((prev) => {
      const without = prev.filter((x) => x !== "everyone");
      return without.includes(v) ? without.filter((x) => x !== v) : [...without, v];
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={filterStyles.overlay}>
        <View style={[filterStyles.sheet, { backgroundColor: colors.card }]}>
          <View style={filterStyles.handle} />
          <View style={filterStyles.header}>
            <Text style={[filterStyles.title, { color: colors.foreground }]}>Filters</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[filterStyles.sectionLabel, { color: colors.mutedForeground }]}>Show Me</Text>
            <View style={filterStyles.ageRow}>
              {GENDER_OPTS.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  onPress={() => toggleGender(g.value)}
                  style={[filterStyles.agePill, showGender.includes(g.value) && { backgroundColor: "#7C3AED" }]}
                >
                  <Text style={{ fontSize: 13 }}>{g.emoji}</Text>
                  <Text style={[filterStyles.agePillText, { color: showGender.includes(g.value) ? "#fff" : colors.foreground }]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[filterStyles.sectionLabel, { color: colors.mutedForeground }]}>Looking For</Text>
            <View style={filterStyles.ageRow}>
              {GOAL_OPTS.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  onPress={() => setGoal(g.value)}
                  style={[filterStyles.agePill, goal === g.value && { backgroundColor: "#7C3AED" }]}
                >
                  <Text style={{ fontSize: 13 }}>{g.emoji}</Text>
                  <Text style={[filterStyles.agePillText, { color: goal === g.value ? "#fff" : colors.foreground }]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[filterStyles.sectionLabel, { color: colors.mutedForeground }]}>Age Range</Text>
            <View style={filterStyles.ageRow}>
              {[18, 22, 25, 30, 35, 40].map((age) => (
                <TouchableOpacity key={age} onPress={() => setAgeMin(age)} style={[filterStyles.agePill, ageMin === age && { backgroundColor: "#7C3AED22", borderColor: "#7C3AED" }]}>
                  <Text style={[filterStyles.agePillText, { color: ageMin === age ? "#A78BFA" : colors.foreground }]}>
                    {age}+
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={filterStyles.ageRow}>
              {[22, 25, 30, 35, 40, 50].map((age) => (
                <TouchableOpacity key={age} onPress={() => setAgeMax(age)} style={[filterStyles.agePill, ageMax === age && { backgroundColor: "#EA580C22", borderColor: "#EA580C" }]}>
                  <Text style={[filterStyles.agePillText, { color: ageMax === age ? "#FB923C" : colors.foreground }]}>≤{age}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[filterStyles.sectionLabel, { color: colors.mutedForeground }]}>Max Distance</Text>
            <View style={filterStyles.ageRow}>
              {[1, 5, 10, 25, 50, 101].map((d) => (
                <TouchableOpacity key={d} onPress={() => setMaxDist(d)} style={[filterStyles.agePill, maxDist === d && { backgroundColor: "#7C3AED" }]}>
                  <Text style={[filterStyles.agePillText, { color: maxDist === d ? "#fff" : colors.foreground }]}>
                    {d > 100 ? "Anywhere" : `${d} km`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[filterStyles.sectionLabel, { color: colors.mutedForeground }]}>More Options</Text>
            <TouchableOpacity onPress={() => setOnlineOnly((v) => !v)} style={[filterStyles.toggleRow, { borderColor: colors.border }]}>
              <View>
                <Text style={[filterStyles.toggleLabel, { color: colors.foreground }]}>🟢 Online only</Text>
                <Text style={[filterStyles.toggleSub, { color: colors.mutedForeground }]}>Only show people online right now</Text>
              </View>
              <View style={[filterStyles.toggleKnob, onlineOnly && { backgroundColor: "#7C3AED" }]}>
                <View style={[filterStyles.toggleThumb, onlineOnly && { transform: [{ translateX: 18 }] }]} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setVerifiedOnly((v) => !v)} style={[filterStyles.toggleRow, { borderColor: colors.border, marginBottom: 20 }]}>
              <View>
                <Text style={[filterStyles.toggleLabel, { color: colors.foreground }]}>✅ Verified only</Text>
                <Text style={[filterStyles.toggleSub, { color: colors.mutedForeground }]}>Only show verified profiles</Text>
              </View>
              <View style={[filterStyles.toggleKnob, verifiedOnly && { backgroundColor: "#7C3AED" }]}>
                <View style={[filterStyles.toggleThumb, verifiedOnly && { transform: [{ translateX: 18 }] }]} />
              </View>
            </TouchableOpacity>
          </ScrollView>
          <GradientButton
            onPress={() => {
              onApply({ showGender, goal, ageMin, ageMax, maxDist, onlineOnly, verifiedOnly });
              onClose();
            }}
            title="Apply Filters"
          />
        </View>
      </View>
    </Modal>
  );
}

interface FilterState {
  showGender: string[];
  goal: string;
  ageMin: number;
  ageMax: number;
  maxDist: number;
  onlineOnly: boolean;
  verifiedOnly: boolean;
}

function MatchOverlay({ card, onClose }: { card: VibeCard; onClose: () => void }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.6);
  const [icebreakers, setIcebreakers] = useState<string[]>([]);
  const [ibLoading, setIbLoading] = useState(false);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 350 });
    scale.value = withSpring(1, { damping: 14, stiffness: 120 });
    const t = setTimeout(onClose, 6000);
    return () => { clearTimeout(t); cancelAnimation(opacity); cancelAnimation(scale); };
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[matchStyles.overlay, overlayStyle]}>
      <Animated.View style={[matchStyles.content, contentStyle]}>
        <Text style={matchStyles.heartEmoji}>💜</Text>
        <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={matchStyles.badge}>
          <Text style={matchStyles.badgeText}>It's a Gundruk Match! ✨</Text>
        </LinearGradient>
        <View style={matchStyles.photos}>
          <View style={matchStyles.photoWrap}>
            <LinearGradient colors={["#EA580C", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={matchStyles.photoRing}>
              <View style={matchStyles.photoCircle}>
                <ExpoImage source="https://picsum.photos/seed/me/200/200" style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" />
              </View>
            </LinearGradient>
            <Text style={matchStyles.photoName}>You</Text>
          </View>
          <Ionicons name="heart" size={32} color="#EC4899" style={matchStyles.heartIcon} />
          <View style={matchStyles.photoWrap}>
            <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={matchStyles.photoRing}>
              <View style={matchStyles.photoCircle}>
                <ExpoImage source={thumbUrl(card.image)} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" transition={150} recyclingKey={card.id} />
              </View>
            </LinearGradient>
            <Text style={matchStyles.photoName}>{card.name}</Text>
          </View>
        </View>
        {(card.matchInterests?.length ?? 0) > 0 && (
          <Text style={matchStyles.matchSub}>You both vibe on {card.matchInterests!.slice(0, 2).join(" & ")} 🎯</Text>
        )}
        <TouchableOpacity
          onPress={() => { onClose(); router.push({ pathname: "/chat/[userId]", params: { userId: card.id, username: card.name, isVibeMatch: "true" } }); }}
          style={matchStyles.messageBtn}
        >
          <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={matchStyles.messageBtnGrad}>
            <Text style={matchStyles.messageBtnText}>💬 Send Message</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => {
            if (ibLoading) return;
            setIbLoading(true);
            const result = await callAI("icebreakers", {
              sharedInterests: card.matchInterests ?? card.interests?.slice(0, 3) ?? [],
              theirName: card.name,
            });
            setIbLoading(false);
            const parsed = parseAIJson<{ questions?: string[] }>(result, {});
            setIcebreakers(parsed.questions?.slice(0, 3) ?? []);
          }}
          style={matchStyles.ibBtn}
        >
          <Text style={matchStyles.ibBtnText}>{ibLoading ? "Thinking..." : "🎲 Get Icebreakers"}</Text>
        </TouchableOpacity>
        {icebreakers.length > 0 && (
          <View style={matchStyles.ibList}>
            {icebreakers.map((q, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  onClose();
                  router.push({ pathname: "/chat/[userId]", params: { userId: card.id, username: card.name, isVibeMatch: "true" } });
                }}
                style={matchStyles.ibItem}
              >
                <Text style={matchStyles.ibItemText}>"{q}"</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TouchableOpacity onPress={onClose} style={matchStyles.keepBtn}>
          <Text style={matchStyles.keepBtnText}>Keep Swiping ✨</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const matchStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4,0,20,0.96)", alignItems: "center", justifyContent: "center", zIndex: 100 },
  content: { alignItems: "center", paddingHorizontal: 28, width: "100%" },
  heartEmoji: { fontSize: 80, marginBottom: 10 },
  badge: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 32, marginBottom: 32 },
  badgeText: { color: "#fff", fontSize: 22, fontFamily: "Poppins_700Bold", letterSpacing: 0.3 },
  photos: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 20 },
  photoWrap: { alignItems: "center", gap: 10 },
  photoRing: { width: 112, height: 112, borderRadius: 56, padding: 3, alignItems: "center", justifyContent: "center" },
  photoCircle: { width: 106, height: 106, borderRadius: 53, overflow: "hidden" },
  photoName: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  heartIcon: { marginBottom: 28 },
  matchSub: { color: "rgba(255,255,255,0.72)", fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", marginBottom: 32, lineHeight: 21, paddingHorizontal: 8 },
  messageBtn: { width: "100%", borderRadius: 28, overflow: "hidden", marginBottom: 12 },
  messageBtnGrad: { paddingVertical: 16, alignItems: "center" },
  messageBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  keepBtn: { paddingVertical: 10 },
  keepBtnText: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_500Medium", fontSize: 14 },
  ibBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 22, borderWidth: 1, borderColor: "rgba(167,139,250,0.4)", backgroundColor: "rgba(124,58,237,0.12)", marginBottom: 12 },
  ibBtnText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  ibList: { width: "100%", gap: 8, marginBottom: 12 },
  ibItem: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  ibItemText: { color: "rgba(255,255,255,0.82)", fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 19, fontStyle: "italic" },
});

const ICE_BREAKERS = [
  { emoji: "🎵", text: "Your music taste is 🔥" },
  { emoji: "✈️", text: "Let's travel together!" },
  { emoji: "☕", text: "Coffee vibe?" },
  { emoji: "🎮", text: "Game on?" },
  { emoji: "🌅", text: "Sunset or sunrise person?" },
];

function IceBreakerSheet({ card, visible, onSend, onSkip }: {
  card: VibeCard | null;
  visible: boolean;
  onSend: (card: VibeCard, msg: string) => void;
  onSkip: (card: VibeCard) => void;
}) {
  const colors = useColors();
  if (!card || !visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => onSkip(card)}>
      <View style={ibStyles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => onSkip(card)} />
        <View style={[ibStyles.sheet, { backgroundColor: colors.card }]}>
          <View style={[ibStyles.handle, { backgroundColor: colors.border }]} />
          <Text style={[ibStyles.title, { color: colors.foreground }]}>Send a Message 💜</Text>
          <Text style={[ibStyles.sub, { color: colors.mutedForeground }]}>
            Break the ice with {card.name} before connecting
          </Text>
          {ICE_BREAKERS.map((ib) => (
            <TouchableOpacity
              key={ib.text}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSend(card, `${ib.emoji} ${ib.text}`); }}
              style={[ibStyles.option, { backgroundColor: colors.muted, borderColor: colors.border }]}
              activeOpacity={0.8}
            >
              <Text style={ibStyles.optionEmoji}>{ib.emoji}</Text>
              <Text style={[ibStyles.optionText, { color: colors.foreground }]}>{ib.text}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => onSkip(card)} style={ibStyles.skipBtn}>
            <Text style={[ibStyles.skipText, { color: colors.mutedForeground }]}>Skip ice breaker →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const ibStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 20, textAlign: "center" },
  sub: { fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", marginBottom: 16, lineHeight: 19 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 0.5, marginBottom: 8 },
  optionEmoji: { fontSize: 22 },
  optionText: { fontFamily: "Poppins_500Medium", fontSize: 15, flex: 1 },
  skipBtn: { paddingVertical: 14, alignItems: "center" },
  skipText: { fontFamily: "Poppins_500Medium", fontSize: 14 },
});

function SwipeCardDeck({ cards, onRequireLogin, userId, isAnonymous, myGoals, onReset, onCurrentIndexChange }: { cards: VibeCard[]; onRequireLogin: () => void; userId?: string; isAnonymous?: boolean; myGoals?: string[]; onReset?: () => Promise<void>; onCurrentIndexChange?: (index: number) => void }) {
  const colors = useColors();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [profileCard, setProfileCard] = useState<VibeCard | null>(null);
  const [matchCard, setMatchCard] = useState<VibeCard | null>(null);
  const [gameCard, setGameCard] = useState<VibeCard | null>(null);
  const [achievement, setAchievement] = useState<Achievement | null>(null);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => { return () => { cancelAnimation(translateX); cancelAnimation(translateY); }; }, []);

  // ── Sent vibe tracking (client-side, session-only) ──────────────────────
  // Records card IDs that received a pending vibe this session so the deck
  // can show "Vibe sent ✓" if the card reappears (e.g. after Start Over).
  const [sentVibeIds, setSentVibeIds] = useState<Set<string>>(new Set());

  // ── Swipe limit + cooldown state ──────────────────────────────────────────
  const [dailySwipeCount, setDailySwipeCount] = useState(0);
  const [consecutiveLefts, setConsecutiveLefts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  // Load initial swipe count and any saved cooldown on mount
  useEffect(() => {
    if (!userId) return;
    getDailySwipeCount(userId).then(setDailySwipeCount).catch(() => {});
    AsyncStorage.getItem(`vibe_cooldown_until:${userId}`)
      .then((val) => {
        if (val) {
          const until = parseInt(val, 10);
          if (Date.now() < until) setCooldownUntil(until);
        }
      })
      .catch(() => {});
  }, [userId]);

  const handleSwipe = useCallback((direction: "left" | "right", isSuper = false) => {
    const card = cards[currentIndex];

    // ── Anti-abuse: cooldown check ───────────────────────────────────────────
    const isCoolingDown = cooldownUntil !== null && Date.now() < cooldownUntil;
    if (isCoolingDown) {
      const minsLeft = Math.ceil((cooldownUntil! - Date.now()) / 60_000);
      Alert.alert(
        "Take a breath 💜",
        `You've been skipping a lot. Come back in ${minsLeft} min${minsLeft !== 1 ? "s" : ""} — the best vibes are worth waiting for!`,
      );
      return;
    }

    // ── Anti-abuse: daily limit check ────────────────────────────────────────
    if (dailySwipeCount >= FREE_DAILY_SWIPE_LIMIT) {
      Alert.alert(
        "Daily vibes used up ✨",
        `You've sent all ${FREE_DAILY_SWIPE_LIMIT} vibes for today. Come back tomorrow for fresh matches!`,
      );
      return;
    }

    // Advance card — notify parent so it can refill the buffer when running low
    const nextIdx = currentIndex + 1;
    onCurrentIndexChange?.(nextIdx);
    setCurrentIndex(nextIdx);
    translateX.value = 0;
    translateY.value = 0;
    Haptics.impactAsync(direction === "right" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);

    // ── Update local counters ────────────────────────────────────────────────
    setDailySwipeCount((c) => c + 1);

    if (direction === "left") {
      const newConsec = consecutiveLefts + 1;
      setConsecutiveLefts(newConsec);

      if (newConsec >= COOLDOWN_CONSECUTIVE_LEFTS && userId) {
        // Trigger 1-hour cooldown
        const cooldownEnd = Date.now() + COOLDOWN_DURATION_MS;
        setCooldownUntil(cooldownEnd);
        setConsecutiveLefts(0);
        AsyncStorage.setItem(`vibe_cooldown_until:${userId}`, cooldownEnd.toString()).catch(() => {});
        setTimeout(() => {
          Alert.alert(
            "Slow down 💜",
            "You've been skipping many people in a row! Take a 1-hour break — your perfect vibe is worth the patience.",
          );
        }, 400);
      }
    } else {
      setConsecutiveLefts(0);
    }

    // ── Record swipe via API server (persistence + match detection in one call) ──
    if (userId && card) {
      vibeSwipe(userId, card.id, isSuper ? "super" : direction)
        .then((result) => {
          if ((direction === "right" || isSuper) && result === "matched") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setTimeout(() => setMatchCard(card), 400);
          } else if (direction === "right" || isSuper) {
            // Not a match yet — track locally so "Vibe sent ✓" shows if card reappears
            setSentVibeIds((prev) => { const next = new Set(prev); next.add(card.id); return next; });
          }
        })
        .catch(() => {});
      if (direction === "right" || isSuper) {
        updateVibeScore(userId, 10, "Sent vibe").catch(() => {});
        checkAchievements(userId)
          .then((unlocked) => { if (unlocked.length > 0) setAchievement(unlocked[0]); })
          .catch(() => {});
      }
    } else if (card) {
      if (isSuper) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => setMatchCard(card), 500);
      }
    }
  }, [cards, currentIndex, userId, translateX, translateY, dailySwipeCount, consecutiveLefts, cooldownUntil]);

  const panGesture = useMemo(() => {
    // On web, RNGH tries to serialize worklet callbacks for a native UI thread
    // that doesn't exist (JSWorklets mode), throwing createSerializableObject errors.
    // Skip worklet callbacks on web — the action buttons still work fine.
    if (Platform.OS === "web") return Gesture.Pan();
    return Gesture.Pan()
      .onUpdate((e) => { translateX.value = e.translationX; translateY.value = e.translationY * 0.2; })
      .onEnd((e) => {
        const shouldSwipe = Math.abs(translateX.value) > SWIPE_THRESHOLD || Math.abs(e.velocityX) > 600;
        if (shouldSwipe) {
          const dir = translateX.value > 0 ? 1 : -1;
          translateX.value = withTiming(dir * W * 1.5, { duration: 300 });
          runOnJS(handleSwipe)(dir > 0 ? "right" : "left");
        } else {
          translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
          translateY.value = withSpring(0, { damping: 15, stiffness: 120 });
        }
      });
  }, [handleSwipe, translateX, translateY]);

  const topCardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(translateX.value, [-W, 0, W], [-20, 0, 20]);
    return { transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { rotate: `${rotate}deg` }] };
  });
  const vibeOverlay = useAnimatedStyle(() => ({ opacity: interpolate(translateX.value, [20, 120], [0, 1]) }));
  const skipOverlay = useAnimatedStyle(() => ({ opacity: interpolate(translateX.value, [-120, -20], [1, 0]) }));
  const nextCardStyle = useAnimatedStyle(() => {
    const scale = interpolate(Math.abs(translateX.value), [0, W * 0.4], [0.93, 1]);
    const ty = interpolate(Math.abs(translateX.value), [0, W * 0.4], [18, 0]);
    return { transform: [{ scale }, { translateY: ty }] };
  });

  if (currentIndex >= cards.length) {
    return (
      <View style={styles.emptyDeck}>
        <Text style={styles.emptyEmoji}>🎉</Text>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>You've seen everyone!</Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Check back later for new vibers nearby</Text>
        <TouchableOpacity
          onPress={async () => {
            setCurrentIndex(0);
            onCurrentIndexChange?.(0);
            if (onReset) await onReset();
          }}
          style={[styles.reloadBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
        >
          <Ionicons name="refresh" size={18} color="#7C3AED" />
          <Text style={[styles.reloadText, { color: colors.foreground }]}>Start Over</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const CARD_H = H * 0.62;
  const topCard = cards[currentIndex];
  const nextCard = cards[currentIndex + 1];
  const thirdCard = cards[currentIndex + 2];
  const match = topCard ? calcMatch(topCard, myGoals) : 0;

  return (
    <View style={styles.deckArea}>
      {thirdCard && (
        <View style={[styles.card, { height: CARD_H, transform: [{ scale: 0.88 }, { translateY: 30 }], zIndex: 1 }]}>
          <ExpoImage source={cardUrl(thirdCard.image)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={200} recyclingKey={thirdCard.id} />
        </View>
      )}
      {nextCard && (
        <Animated.View style={[styles.card, { height: CARD_H, zIndex: 2 }, nextCardStyle]}>
          <ExpoImage source={cardUrl(nextCard.image)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={200} recyclingKey={nextCard.id} />
          <LinearGradient colors={["transparent", "transparent", "rgba(0,0,0,0.6)", "rgba(0,0,0,0.95)"]} locations={[0, 0.4, 0.72, 1]} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      {topCard && (
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.card, { height: CARD_H, zIndex: 10 }, topCardStyle]}>
            <VibeCardDisplay
              card={topCard}
              matchPct={match}
              myGoals={myGoals}
              onExpand={() => setProfileCard(topCard)}
            />
            <Animated.View style={[styles.overlayVibe, vibeOverlay]} pointerEvents="none">
              <Text style={styles.overlayVibeText}>VIBE ✨</Text>
            </Animated.View>
            <Animated.View style={[styles.overlaySkip, skipOverlay]} pointerEvents="none">
              <Text style={styles.overlaySkipText}>SKIP</Text>
            </Animated.View>
            {sentVibeIds.has(topCard.id) && (
              <View style={{ position: "absolute", top: 14, left: 14, backgroundColor: "rgba(124,58,237,0.88)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }} pointerEvents="none">
                <Text style={{ color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 12 }}>Vibe sent ✓</Text>
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      )}

      <View style={styles.actionButtons}>
        <TouchableOpacity
          onPress={() => { translateX.value = withTiming(-W * 1.5, { duration: 300 }); setTimeout(() => handleSwipe("left"), 300); }}
          style={[styles.actionCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Ionicons name="close" size={28} color="#EF4444" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { translateX.value = withTiming(W * 1.5, { duration: 300 }); setTimeout(() => handleSwipe("right"), 300); }}
          style={styles.vibeCircle}
        >
          <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.vibeGradient}>
            <Ionicons name="heart" size={30} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { translateX.value = withTiming(W * 1.5, { duration: 300 }); setTimeout(() => handleSwipe("right", true), 300); }}
          style={[styles.actionCircle, { backgroundColor: "rgba(234,179,8,0.12)", borderColor: "#EAB308" }]}
        >
          <Ionicons name="star" size={24} color="#EAB308" />
        </TouchableOpacity>
      </View>

      {/* Daily swipe counter */}
      {userId && (
        <View style={styles.swipeCounterRow}>
          {cooldownUntil && Date.now() < cooldownUntil ? (
            <View style={styles.cooldownPill}>
              <Ionicons name="timer-outline" size={12} color="#EAB308" />
              <Text style={styles.cooldownText}>
                Cooldown: {Math.ceil((cooldownUntil - Date.now()) / 60_000)}m
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.swipeBarBg}>
                <View
                  style={[
                    styles.swipeBarFill,
                    {
                      width: `${Math.min((dailySwipeCount / FREE_DAILY_SWIPE_LIMIT) * 100, 100)}%` as any,
                      backgroundColor: dailySwipeCount >= FREE_DAILY_SWIPE_LIMIT * 0.8 ? "#EF4444" : "#7C3AED",
                    },
                  ]}
                />
              </View>
              <Text style={styles.swipeCountText}>
                {Math.max(FREE_DAILY_SWIPE_LIMIT - dailySwipeCount, 0)} vibes left today
              </Text>
            </>
          )}
        </View>
      )}

      {profileCard && (
        <ProfileModal
          card={profileCard}
          onClose={() => setProfileCard(null)}
          onVibe={() => { setProfileCard(null); setTimeout(() => handleSwipe("right"), 200); }}
          onSkip={() => { setProfileCard(null); setTimeout(() => handleSwipe("left"), 200); }}
        />
      )}

      {matchCard && <MatchOverlay card={matchCard} onClose={() => setMatchCard(null)} />}
      <AchievementModal visible={!!achievement} achievement={achievement} onClose={() => setAchievement(null)} />


      <VibeGamesModal
        card={gameCard}
        visible={!!gameCard}
        onComplete={(score, card) => {
          setGameCard(null);
          if (score >= 50 || Math.random() < 0.55) {
            setTimeout(() => setMatchCard(card), 500);
          } else {
            Alert.alert("Sent! 💜", `You sent a vibe to ${card.name}`);
          }
        }}
        onSkip={() => {
          const card = gameCard;
          setGameCard(null);
          if (card && Math.random() < 0.3) setTimeout(() => setMatchCard(card), 400);
        }}
      />
    </View>
  );
}

// ── People You May Know ──────────────────────────────────────────────────────
function SuggestedAccountsSection({ userId }: { userId?: string }) {
  const colors = useColors();
  const [accounts, setAccounts] = useState<SuggestedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetchSuggestedAccounts(userId, 12)
      .then(setAccounts)
      .finally(() => setLoading(false));
  }, [userId]);

  const visible = accounts.filter((a) => !dismissed.has(a.id));

  if (!userId || (!loading && visible.length === 0)) return null;

  return (
    <View style={saStyles.wrapper}>
      <Text style={[saStyles.heading, { color: colors.foreground }]}>👥 People You May Know</Text>
      {loading ? (
        <ActivityIndicator color="#7C3AED" style={{ marginVertical: 16 }} />
      ) : (
        <FlatList
          data={visible}
          horizontal
          keyExtractor={(a) => a.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 16 }}
          ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
          renderItem={({ item }) => (
            <View style={[saStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity onPress={() => setDismissed((d) => new Set([...d, item.id]))} style={saStyles.dismiss}>
                <Ionicons name="close" size={13} color={colors.mutedForeground} />
              </TouchableOpacity>
              {item.avatar_url ? (
                <ExpoImage source={thumbUrl(item.avatar_url)} style={saStyles.avatar} contentFit="cover" cachePolicy="memory-disk" transition={150} />
              ) : (
                <View style={[saStyles.avatar, { backgroundColor: "rgba(124,58,237,0.25)", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ fontSize: 22 }}>👤</Text>
                </View>
              )}
              <Text style={[saStyles.name, { color: colors.foreground }]} numberOfLines={1}>
                {item.full_name || item.username}
              </Text>
              <Text style={[saStyles.handle, { color: colors.mutedForeground }]} numberOfLines={1}>
                @{item.username}
              </Text>
              {item.mutual_count > 0 && (
                <Text style={[saStyles.mutual, { color: colors.mutedForeground }]}>
                  {item.mutual_count} mutual{item.mutual_count > 1 ? "s" : ""}
                </Text>
              )}
              <TouchableOpacity style={saStyles.followBtn} activeOpacity={0.8}>
                <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={saStyles.followGrad}>
                  <Text style={saStyles.followText}>Follow</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const saStyles = StyleSheet.create({
  wrapper: { marginBottom: 24 },
  heading: { fontFamily: "Poppins_700Bold", fontSize: 17, marginBottom: 14 },
  card: { width: 148, borderRadius: 18, padding: 14, borderWidth: 0.5, alignItems: "center", gap: 4 },
  dismiss: { position: "absolute", top: 8, right: 8, padding: 4, zIndex: 1 },
  avatar: { width: 64, height: 64, borderRadius: 32, marginBottom: 6 },
  name: { fontFamily: "Poppins_600SemiBold", fontSize: 13, textAlign: "center" },
  handle: { fontFamily: "Poppins_400Regular", fontSize: 11, textAlign: "center" },
  mutual: { fontFamily: "Poppins_400Regular", fontSize: 10, textAlign: "center" },
  followBtn: { marginTop: 8, borderRadius: 10, overflow: "hidden", width: "100%", height: 32 },
  followGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  followText: { fontFamily: "Poppins_700Bold", fontSize: 12, color: "#fff" },
});

function GoalsDiscoveryTab({ onGoalSelect }: { onGoalSelect: (goal: string) => void; userId?: string }) {
  const colors = useColors();
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={[gdStyles.title, { color: colors.foreground }]}>🎯 Browse by Intention</Text>
      <Text style={[gdStyles.sub, { color: colors.mutedForeground }]}>
        Find people who want the same things as you
      </Text>
      <View style={gdStyles.grid}>
        {(RELATIONSHIP_GOALS as readonly { value: string; label: string; shortLabel: string; emoji: string; count: string; color: string }[]).map((goal) => (
          <TouchableOpacity
            key={goal.value}
            style={[gdStyles.card, { borderColor: goal.color + "44" }]}
            onPress={() => onGoalSelect(goal.value)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[goal.color + "22", goal.color + "08"]}
              style={gdStyles.cardGrad}
            >
              <View style={[gdStyles.iconWrap, { backgroundColor: goal.color + "22" }]}>
                <Text style={gdStyles.emoji}>{goal.emoji}</Text>
              </View>
              <Text style={[gdStyles.goalLabel, { color: colors.foreground }]} numberOfLines={2}>{goal.label}</Text>
              <View style={[gdStyles.countPill, { backgroundColor: goal.color + "20" }]}>
                <Text style={[gdStyles.countText, { color: goal.color }]}>{goal.count} people</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[gdStyles.statsBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[gdStyles.statsTitle, { color: colors.foreground }]}>🔥 Trending right now</Text>
        {[
          { label: "New friends", emoji: "🤝", pct: 42 },
          { label: "Still figuring out", emoji: "🤔", pct: 31 },
          { label: "Long-term", emoji: "🌹", pct: 18 },
        ].map((s) => (
          <View key={s.label} style={gdStyles.statRow}>
            <Text style={gdStyles.statEmoji}>{s.emoji}</Text>
            <Text style={[gdStyles.statLabel, { color: colors.foreground }]}>{s.label}</Text>
            <View style={gdStyles.statBarBg}>
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[gdStyles.statBarFill, { width: `${s.pct}%` as any }]} />
            </View>
            <Text style={[gdStyles.statPct, { color: colors.mutedForeground }]}>{s.pct}%</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const gdStyles = StyleSheet.create({
  title: { fontFamily: "Poppins_700Bold", fontSize: 20, marginBottom: 4 },
  sub: { fontFamily: "Poppins_400Regular", fontSize: 13, marginBottom: 20, lineHeight: 19 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  card: { width: (W - 44) / 2, borderRadius: 18, overflow: "hidden", borderWidth: 1 },
  cardGrad: { padding: 16, alignItems: "flex-start", gap: 8, minHeight: 120 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  emoji: { fontSize: 22 },
  goalLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, lineHeight: 18 },
  countPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  countText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  statsBanner: { borderRadius: 20, padding: 18, borderWidth: 0.5, gap: 12 },
  statsTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, marginBottom: 4 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statEmoji: { fontSize: 16, width: 24 },
  statLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, width: 120 },
  statBarBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  statBarFill: { height: 6, borderRadius: 3 },
  statPct: { fontFamily: "Poppins_600SemiBold", fontSize: 12, width: 32, textAlign: "right" },
});

// ── Goal Users Sheet ────────────────────────────────────────────────────────
function GoalUsersSheet({ visible, goalValue, userId, onClose }: {
  visible: boolean;
  goalValue: string | null;
  userId: string | undefined;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<VibeCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileCard, setProfileCard] = useState<VibeCard | null>(null);
  const [sentVibes, setSentVibes] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastOpacity = useSharedValue(0);
  const toastFadeStyle = useAnimatedStyle(() => ({ opacity: toastOpacity.value }));

  const goalInfo = goalValue ? getGoalInfo(goalValue) : null;

  useEffect(() => {
    if (!visible || !goalValue || !userId) return;
    setLoading(true);
    setUsers([]);
    setSentVibes(new Set());
    // getUsersByIntention goes through the API server (service-role key) with a built-in
    // 10 s abort — never hangs. getVibeMatches uses supabase.rpc with anon key → hangs forever.
    getUsersByIntention(userId, goalValue)
      .then((matches) => setUsers(matches))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [visible, goalValue]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    toastOpacity.value = 0;
    toastOpacity.value = withSequence(
      withTiming(1, { duration: 250 }),
      withDelay(1600, withTiming(0, { duration: 300 }, (finished) => {
        if (finished) runOnJS(setToastMsg)(null);
      })),
    );
  };

  const handleVibe = (targetId: string, name: string) => {
    if (!userId || sentVibes.has(targetId)) return;
    setSentVibes((prev) => { const next = new Set(prev); next.add(targetId); return next; });
    void vibeSwipe(userId, targetId, "right").catch(() => {});
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showToast(`Vibe sent to ${name}! 💜`);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[gusStyles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        <View style={[gusStyles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={gusStyles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-down" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <View style={gusStyles.headerCenter}>
            <Text style={[gusStyles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
              {goalInfo?.emoji ?? "🎯"} {goalInfo?.label ?? goalValue}
            </Text>
            {!loading && (
              <Text style={[gusStyles.headerSub, { color: colors.mutedForeground }]}>
                {users.length} {users.length === 1 ? "person shares" : "people share"} this intention
              </Text>
            )}
          </View>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={gusStyles.loadWrap}>
            <Text style={[gusStyles.loadText, { color: colors.mutedForeground }]}>Finding people…</Text>
          </View>
        ) : users.length === 0 ? (
          <View style={gusStyles.loadWrap}>
            <Text style={{ fontSize: 40 }}>{goalInfo?.emoji ?? "🎯"}</Text>
            <Text style={[gusStyles.loadText, { color: colors.mutedForeground, marginTop: 12 }]}>
              No one nearby with this intention yet.{"\n"}Be the first!
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={gusStyles.grid} showsVerticalScrollIndicator={false}>
            {users.map((user) => {
              const matchPct = calcMatch(user);
              return (
                <TouchableOpacity
                  key={user.id}
                  style={[gusStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => setProfileCard(user)}
                  activeOpacity={0.88}
                >
                  <ExpoImage source={cardUrl(user.image)} style={gusStyles.photo} contentFit="cover" cachePolicy="memory-disk" transition={200} recyclingKey={user.id} />
                  <View style={gusStyles.cardBody}>
                    <Text style={[gusStyles.name, { color: colors.foreground }]} numberOfLines={1}>
                      {user.name}, {user.age}
                    </Text>
                    {user.distance && (
                      <Text style={[gusStyles.dist, { color: colors.mutedForeground }]}>📍 {user.distance}</Text>
                    )}
                    <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gusStyles.matchBadge}>
                      <Text style={gusStyles.matchText}>{matchPct}% match</Text>
                    </LinearGradient>
                    {sentVibes.has(user.id) ? (
                      <View style={[gusStyles.vibeBtn, { backgroundColor: "rgba(124,58,237,0.15)" }]}>
                        <Text style={[gusStyles.vibeBtnText, { color: "#A78BFA" }]}>Sent ✓</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); handleVibe(user.id, user.name); }}
                        activeOpacity={0.85}
                      >
                        <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gusStyles.vibeBtn}>
                          <Text style={gusStyles.vibeBtnText}>💜 Vibe</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
      {toastMsg && (
        <Animated.View style={[gusStyles.toast, toastFadeStyle]} pointerEvents="none">
          <Text style={gusStyles.toastText}>{toastMsg}</Text>
        </Animated.View>
      )}
      {profileCard && (
        <ProfileModal
          card={profileCard}
          onClose={() => setProfileCard(null)}
          onVibe={() => { handleVibe(profileCard.id, profileCard.name); setProfileCard(null); }}
          onSkip={() => setProfileCard(null)}
        />
      )}
    </Modal>
  );
}

const gusStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 0.5, gap: 8 },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, textAlign: "center" },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  loadWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 32 },
  loadText: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 16, paddingBottom: 40 },
  card: { width: (W - 44) / 2, borderRadius: 18, overflow: "hidden", borderWidth: 0.5 },
  photo: { width: "100%", aspectRatio: 1 },
  cardBody: { padding: 10, gap: 5 },
  name: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  dist: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  matchBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" },
  matchText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 11 },
  vibeBtn: { borderRadius: 12, paddingVertical: 8, alignItems: "center", marginTop: 2 },
  vibeBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
  toast: { position: "absolute", bottom: 36, left: 20, right: 20, backgroundColor: "rgba(124,58,237,0.93)", borderRadius: 16, paddingVertical: 12, paddingHorizontal: 20, alignItems: "center", zIndex: 999 },
  toastText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
});

const INTEREST_EMOJI: Record<string, string> = {
  Photography: "📸", Travel: "✈️", Music: "🎵", Art: "🎨", Coffee: "☕",
  Gaming: "🎮", Fitness: "💪", Food: "🍕", Books: "📚", Dogs: "🐕",
  Fashion: "👗", Running: "🏃", Yoga: "🧘", Hiking: "🏔️", Dancing: "💃",
  Cooking: "🍳", Movies: "🎬", Sports: "⚽", Reading: "📖", Camping: "⛺",
  Acting: "🎭", Networking: "💼", Tech: "💻", Nature: "🌿",
};

function vibeLevel(score: number = 0): { label: string; color: string } {
  if (score >= 900) return { label: "⚡ Legend", color: "#EAB308" };
  if (score >= 700) return { label: "🔥 Pro", color: "#F97316" };
  if (score >= 400) return { label: "✨ Rising", color: "#A78BFA" };
  return { label: "⭐ Starter", color: "#6B7280" };
}

function MatchesTab({ userId, onSwitchToNear }: { userId: string; onSwitchToNear?: () => void }) {
  const colors = useColors();
  const [matches, setMatches] = useState<VibeMatchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [newMatchToast, setNewMatchToast] = useState<VibeMatchProfile | null>(null);
  const toastY = useSharedValue(-110);
  const toastYStyle = useAnimatedStyle(() => ({ transform: [{ translateY: toastY.value }] }));
  const heartY1 = useSharedValue(0);
  const heartY2 = useSharedValue(0);
  const heartY3 = useSharedValue(0);
  const heartStyle1 = useAnimatedStyle(() => ({ transform: [{ translateY: heartY1.value }] }));
  const heartStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: heartY2.value }] }));
  const heartStyle3 = useAnimatedStyle(() => ({ transform: [{ translateY: heartY3.value }] }));

  const loadMatches = () => {
    setLoadTimedOut(false);
    // 10-second hard timeout — getMyVibeMatches now routes through the API server
    // so it shouldn't hang, but guard against network issues.
    const timer = setTimeout(() => {
      setLoading(false);
      setLoadTimedOut(true);
    }, 10_000);
    getMyVibeMatches(userId)
      .then(setMatches)
      .catch(() => {})
      .finally(() => { clearTimeout(timer); setLoading(false); });
  };

  useEffect(() => { loadMatches(); }, [userId]);

  // Realtime — new match arrives
  useEffect(() => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch = supabase
        .channel(`my-matches-${userId}-${suffix}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "vibe_matches" }, async (payload) => {
          try {
            const row = payload.new as any;
            if (row.user_id === userId || row.matched_user_id === userId) {
              const updated = await getMyVibeMatches(userId).catch(() => [] as VibeMatchProfile[]);
              if (updated.length > 0) {
                setMatches(updated);
                const newest = updated[0];
                if (newest) showMatchToast(newest);
              }
            }
          } catch { /* never crash on realtime payload */ }
        })
        .subscribe();
    } catch { /* channel collision — safe to ignore */ }
    return () => { if (ch) supabase.removeChannel(ch); };
  }, [userId]);

  // Float hearts animation for empty state
  useEffect(() => {
    if (loading || matches.length > 0) return;
    const floatAnim = withRepeat(
      withSequence(
        withTiming(-18, { duration: 1300 }),
        withTiming(0, { duration: 1300 })
      ),
      -1,
      false
    );
    heartY1.value = floatAnim;
    heartY2.value = withDelay(400, floatAnim);
    heartY3.value = withDelay(800, floatAnim);
    return () => { cancelAnimation(heartY1); cancelAnimation(heartY2); cancelAnimation(heartY3); };
  }, [loading, matches.length]);

  const showMatchToast = (match: VibeMatchProfile) => {
    setNewMatchToast(match);
    toastY.value = -110;
    toastY.value = withSequence(
      withSpring(0, { damping: 12, stiffness: 80 }),
      withDelay(3500, withTiming(-110, { duration: 300 }, (finished) => {
        if (finished) runOnJS(setNewMatchToast)(null);
      })),
    );
  };

  const filtered = matches.filter((m) => {
    if (onlineOnly && !m.isOnline) return false;
    if (searchQuery.trim() && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator color="#7C3AED" size="small" />
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Loading your matches…</Text>
      </View>
    );
  }

  if (loadTimedOut) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Text style={{ fontSize: 36 }}>⚠️</Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Couldn't load matches</Text>
        <TouchableOpacity onPress={loadMatches} activeOpacity={0.8}
          style={{ backgroundColor: "#7C3AED", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}>
          <Text style={{ color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (matches.length === 0) {
    return (
      <View style={[styles.emptyDeck, { gap: 0 }]}>
        <View style={{ flexDirection: "row", gap: 20, marginBottom: 24 }}>
          {([
            { style: heartStyle1, emoji: "🩷" },
            { style: heartStyle2, emoji: "💜" },
            { style: heartStyle3, emoji: "💜" },
          ] as const).map(({ style, emoji }, i) => (
            <Animated.Text key={i} style={[{ fontSize: 36 }, style]}>{emoji}</Animated.Text>
          ))}
        </View>
        <Text style={[styles.emptyTitle, { color: colors.foreground, marginBottom: 8 }]}>No matches yet 💜</Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground, marginBottom: 20 }]}>
          Swipe right on people you vibe with.{"\n"}When they vibe back, you match! 🎉
        </Text>
        <TouchableOpacity onPress={onSwitchToNear} activeOpacity={0.88} style={{ borderRadius: 24, overflow: "hidden" }}>
          <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24 }}>
            <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 }}>Start Swiping →</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* New match toast */}
      {newMatchToast && (
        <Animated.View style={[matchTabStyles.newMatchToast, toastYStyle]} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => { setNewMatchToast(null); router.push({ pathname: "/chat/[userId]", params: { userId: newMatchToast.id, username: newMatchToast.name, isVibeMatch: "true" } }); }}
            style={matchTabStyles.newMatchToastInner}
            activeOpacity={0.9}
          >
            <ExpoImage source={thumbUrl(newMatchToast.image)} style={matchTabStyles.toastPhoto} contentFit="cover" cachePolicy="memory-disk" transition={150} recyclingKey={newMatchToast.id} />
            <View style={{ flex: 1 }}>
              <Text style={matchTabStyles.toastTitle}>💜 New Match!</Text>
              <Text style={matchTabStyles.toastName}>{newMatchToast.name}</Text>
            </View>
            <Text style={matchTabStyles.toastCta}>Chat →</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header + Search */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>
              💜 {matches.length} Match{matches.length !== 1 ? "es" : ""}
            </Text>
            {/* Online-only toggle */}
            <TouchableOpacity
              onPress={() => setOnlineOnly((v) => !v)}
              activeOpacity={0.8}
              style={[matchTabStyles.onlineToggle, onlineOnly && matchTabStyles.onlineToggleActive]}
            >
              <View style={[matchTabStyles.onlineDotSmall, { backgroundColor: onlineOnly ? "#22C55E" : "#6B7280" }]} />
              <Text style={[matchTabStyles.onlineToggleText, { color: onlineOnly ? "#22C55E" : colors.mutedForeground }]}>
                Online only
              </Text>
            </TouchableOpacity>
          </View>
          {/* Search bar */}
          <View style={[matchTabStyles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search matches…"
              placeholderTextColor={colors.mutedForeground}
              style={[matchTabStyles.searchInput, { color: colors.foreground }]}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {filtered.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
            <Text style={{ fontSize: 32 }}>{onlineOnly ? "💤" : "🔍"}</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {onlineOnly ? "No one online right now" : `No results for "${searchQuery}"`}
            </Text>
            {onlineOnly && (
              <TouchableOpacity onPress={() => setOnlineOnly(false)}>
                <Text style={{ color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>Show all matches</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            {filtered.map((m) => {
              const lvl = vibeLevel(m.vibeScore);
              const shared = m.sharedInterests ?? [];
              return (
                <TouchableOpacity
                  key={m.id}
                  activeOpacity={0.93}
                  onPress={() => router.push(`/profile/${m.username}` as any)}
                  style={[matchTabStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={matchTabStyles.cardRow}>
                    {/* Gradient ring + photo */}
                    <TouchableOpacity onPress={() => router.push(`/profile/${m.username}` as any)} activeOpacity={0.85}>
                      <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={matchTabStyles.photoRing}>
                        <ExpoImage source={thumbUrl(m.image)} style={matchTabStyles.photo} contentFit="cover" cachePolicy="memory-disk" transition={150} recyclingKey={m.id} />
                      </LinearGradient>
                      {m.isOnline && <View style={matchTabStyles.onlineDot} />}
                    </TouchableOpacity>

                    <View style={matchTabStyles.info}>
                      {/* Name + online pill */}
                      <View style={matchTabStyles.nameRow}>
                        <Text style={[matchTabStyles.name, { color: colors.foreground }]} numberOfLines={1}>
                          {m.name}, {m.age}
                        </Text>
                        {m.isOnline && (
                          <View style={matchTabStyles.onlinePill}>
                            <Text style={matchTabStyles.onlinePillText}>● online</Text>
                          </View>
                        )}
                      </View>

                      {/* Vibe Match badge + matched time + same goal */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        <View style={matchTabStyles.vibeBadge}>
                          <Text style={matchTabStyles.vibeBadgeText}>💜 Match</Text>
                        </View>
                        {m.matchedAt && (
                          <Text style={[matchTabStyles.matchedTime, { color: colors.mutedForeground }]}>
                            · {m.matchedAt}
                          </Text>
                        )}
                        {m.sameGoal && (
                          <View style={matchTabStyles.sameGoalBadge}>
                            <Text style={matchTabStyles.sameGoalText}>Same goals 🎯</Text>
                          </View>
                        )}
                      </View>

                      {/* Bio */}
                      {!!m.bio && (
                        <Text style={[matchTabStyles.bio, { color: colors.mutedForeground }]} numberOfLines={2}>
                          {m.bio.length > 80 ? `${m.bio.slice(0, 80)}…` : m.bio}
                        </Text>
                      )}

                      {/* Last message preview */}
                      {!!m.lastMessage && (
                        <View style={matchTabStyles.lastMsgRow}>
                          <Text style={{ fontSize: 11 }}>💬</Text>
                          <Text style={[matchTabStyles.lastMsgText, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {m.lastMessage}
                          </Text>
                        </View>
                      )}

                      {/* Interest pills — shared ones glow gold */}
                      {m.interests.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }} contentContainerStyle={{ gap: 5 }}>
                          {m.interests.slice(0, 5).map((tag) => {
                            const isShared = shared.includes(tag);
                            return (
                              <View
                                key={tag}
                                style={[
                                  matchTabStyles.interestPill,
                                  isShared
                                    ? { backgroundColor: "rgba(234,179,8,0.18)", borderColor: "rgba(234,179,8,0.5)" }
                                    : { backgroundColor: "rgba(124,58,237,0.12)", borderColor: "rgba(124,58,237,0.2)" },
                                ]}
                              >
                                <Text style={[matchTabStyles.interestPillText, { color: isShared ? "#EAB308" : "#A78BFA" }]}>
                                  {INTEREST_EMOJI[tag] ?? "•"} {tag}
                                </Text>
                              </View>
                            );
                          })}
                          {m.interests.length > 5 && (
                            <View style={[matchTabStyles.interestPill, { backgroundColor: "rgba(124,58,237,0.08)", borderColor: "rgba(124,58,237,0.15)" }]}>
                              <Text style={[matchTabStyles.interestPillText, { color: colors.mutedForeground }]}>+{m.interests.length - 5}</Text>
                            </View>
                          )}
                        </ScrollView>
                      )}

                      {/* Vibe level */}
                      <View style={matchTabStyles.levelRow}>
                        <Text style={[matchTabStyles.levelText, { color: lvl.color }]}>{lvl.label}</Text>
                        {!!m.vibeScore && <Text style={[matchTabStyles.scoreText, { color: lvl.color }]}>{m.vibeScore} pts</Text>}
                        {shared.length > 0 && (
                          <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: "#EAB308" }}>
                            · {shared.length} shared ✨
                          </Text>
                        )}
                      </View>

                      {/* Action buttons */}
                      <View style={matchTabStyles.btnRow}>
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation(); router.push(`/profile/${m.username}` as any); }}
                          activeOpacity={0.85}
                          style={{ flex: 1, borderRadius: 10, overflow: "hidden" }}
                        >
                          <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={matchTabStyles.msgGrad}>
                            <Text style={matchTabStyles.msgText}>👤 View Full Profile</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

    </View>
  );
}

const matchTabStyles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 0.5, padding: 16 },
  cardRow: { flexDirection: "row", gap: 16 },
  photoRing: { width: 92, height: 92, borderRadius: 46, padding: 2.5, alignItems: "center", justifyContent: "center" },
  photo: { width: 87, height: 87, borderRadius: 43.5 },
  onlineDot: { position: "absolute", bottom: 2, right: 2, width: 15, height: 15, borderRadius: 7.5, backgroundColor: "#22C55E", borderWidth: 2.5, borderColor: "#fff" },
  info: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  name: { fontFamily: "Poppins_700Bold", fontSize: 15 },
  onlinePill: { backgroundColor: "rgba(34,197,94,0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  onlinePillText: { color: "#22C55E", fontFamily: "Poppins_600SemiBold", fontSize: 10 },
  vibeBadge: { backgroundColor: "rgba(124,58,237,0.18)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: "rgba(124,58,237,0.35)" },
  vibeBadgeText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  matchedTime: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  sameGoalBadge: { backgroundColor: "rgba(234,179,8,0.15)", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: "rgba(234,179,8,0.35)" },
  sameGoalText: { color: "#EAB308", fontFamily: "Poppins_600SemiBold", fontSize: 10 },
  bio: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 17, marginTop: 2 },
  lastMsgRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  lastMsgText: { fontFamily: "Poppins_400Regular", fontSize: 11, flex: 1 },
  interestPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  interestPillText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
  levelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" },
  levelText: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  scoreText: { fontFamily: "Poppins_400Regular", fontSize: 11, opacity: 0.7 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  msgGrad: { paddingVertical: 9, alignItems: "center", borderRadius: 10 },
  msgText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
  profileBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  profileText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  unreadBadge: { position: "absolute", top: -6, right: -6, backgroundColor: "#EF4444", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, borderWidth: 2, borderColor: "#080810" },
  unreadBadgeText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 10 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderWidth: 1 },
  searchInput: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, padding: 0 },
  onlineToggle: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(107,114,128,0.3)" },
  onlineToggleActive: { borderColor: "rgba(34,197,94,0.5)", backgroundColor: "rgba(34,197,94,0.08)" },
  onlineToggleText: { fontFamily: "Poppins_500Medium", fontSize: 12 },
  onlineDotSmall: { width: 7, height: 7, borderRadius: 3.5 },
  newMatchToast: { position: "absolute", top: 0, left: 12, right: 12, zIndex: 999 },
  newMatchToastInner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(124,58,237,0.95)", borderRadius: 18, padding: 14, shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 12 },
  toastPhoto: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "#EC4899" },
  toastTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
  toastName: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  toastCta: { color: "#EC4899", fontFamily: "Poppins_700Bold", fontSize: 13 },
});

// ── VibeInboxRequest ─────────────────────────────────────────────────────────
interface VibeInboxRequest {
  id: string;
  senderId: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    relationshipStatus: string | null;
    age: number | null;
    goal: string | null;
  };
}

// ── RequestsTab ──────────────────────────────────────────────────────────────
// Incoming pending vibe requests — requester card with Accept 💜 / Deny.
// Data: GET /api/vibe-requests/inbox  Actions: POST /api/vibe-requests/respond
function RequestsTab({ userId, onCountChange }: { userId: string; onCountChange?: (n: number) => void }) {
  const colors = useColors();
  const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  const [requests, setRequests] = useState<VibeInboxRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const snapshot = requests;
    try {
      const res = await fetch(`${apiBase}/vibe-requests/inbox?userId=${encodeURIComponent(userId)}`);
      const json = res.ok ? (await res.json() as { requests: VibeInboxRequest[] }) : { requests: snapshot };
      const list = json.requests ?? [];
      setRequests(list);
      onCountChange?.(list.length);
    } catch {
      // network error — keep existing list
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, apiBase]);

  useEffect(() => { load(); }, [load]);

  const respond = async (requestId: string, action: "accept" | "decline") => {
    setRespondingId(requestId);
    try {
      const res = await fetch(`${apiBase}/vibe-requests/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, userId, action }),
      });
      if (!res.ok) throw new Error("failed");
      setRequests((prev) => {
        const updated = prev.filter((r) => r.id !== requestId);
        onCountChange?.(updated.length);
        return updated;
      });
      if (action === "accept") {
        Alert.alert("Match! 💜", "You're now connected — head to Matches to say hi!");
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setRespondingId(null);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator color="#7C3AED" size="small" />
        <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 14 }}>
          Loading requests…
        </Text>
      </View>
    );
  }

  if (requests.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 44 }}>💌</Text>
        <Text style={{ color: colors.foreground, fontFamily: "Poppins_700Bold", fontSize: 18, textAlign: "center" }}>
          No vibe requests yet
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center" }}>
          Keep swiping — your matches are out there ✨
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 12 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          tintColor="#7C3AED"
        />
      }
    >
      {requests.map((req) => {
        const isResponding = respondingId === req.id;
        const name = req.sender.displayName || req.sender.username;
        return (
          <View
            key={req.id}
            style={{
              backgroundColor: colors.card,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "rgba(124,58,237,0.25)",
              overflow: "hidden",
            }}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push(`/profile/${req.sender.username}` as any)}
              style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 14 }}
            >
              {req.sender.avatarUrl ? (
                <ExpoImage source={thumbUrl(req.sender.avatarUrl)} style={{ width: 60, height: 60, borderRadius: 30 }} contentFit="cover" cachePolicy="memory-disk" transition={150} />
              ) : (
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(124,58,237,0.3)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#A78BFA", fontSize: 22, fontFamily: "Poppins_700Bold" }}>
                    {(req.sender.displayName || req.sender.username)?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.foreground, fontFamily: "Poppins_700Bold", fontSize: 16 }}>
                  {name}{req.sender.age ? `, ${req.sender.age}` : ""}
                </Text>
                {req.sender.goal ? (
                  <Text style={{ color: "#A78BFA", fontFamily: "Poppins_500Medium", fontSize: 12 }}>
                    💜 {req.sender.goal}
                  </Text>
                ) : null}
                {req.sender.relationshipStatus ? (
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 12 }}>
                    {req.sender.relationshipStatus}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
              <TouchableOpacity
                onPress={() => respond(req.id, "decline")}
                disabled={isResponding}
                activeOpacity={0.8}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center", borderRightWidth: 0.5, borderColor: "rgba(255,255,255,0.06)" }}
              >
                <Text style={{ color: isResponding ? colors.mutedForeground : "#EF4444", fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>
                  {isResponding ? "…" : "Deny"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => respond(req.id, "accept")}
                disabled={isResponding}
                activeOpacity={0.8}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center", overflow: "hidden" }}
              >
                <LinearGradient
                  colors={["#7C3AED", "#EC4899"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ ...StyleSheet.absoluteFillObject, opacity: isResponding ? 0.4 : 1 }}
                />
                <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 }}>
                  {isResponding ? "…" : "Accept 💜"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── TabContent ─────────────────────────────────────────────────────────────
// Renders the correct tab page based on `activeTab` state (passed down from
// the parent). A PanResponder on this View detects horizontal swipes and calls
// onSwipe("left"|"right") so the parent can advance/retreat the tab.
// No imperative refs needed — everything is driven by the activeTab prop.
type TabId = "nearby" | "goals" | "matches" | "rooms" | "astrology" | "daily" | "requests";
function TabContent({
  activeTab, onSwipe,
  nearContent, goalsContent, matchesContent, roomsContent, astrologyContent, dailyContent, requestsContent,
}: {
  activeTab: TabId;
  onSwipe: (dir: "left" | "right") => void;
  nearContent: React.ReactNode;
  goalsContent: React.ReactNode;
  matchesContent: React.ReactNode;
  roomsContent: React.ReactNode;
  astrologyContent: React.ReactNode;
  dailyContent: React.ReactNode;
  requestsContent: React.ReactNode;
}) {
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  // Threshold: dx must be large AND clearly dominate dy (4:1 ratio) so that
  // inner vertical ScrollViews/FlatLists always claim their gestures first.
  // Child responders have priority in React Native's bubble-up system —
  // we only get the gesture when no inner view claims it (empty swipe areas).
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 40 && Math.abs(gs.dx) > Math.abs(gs.dy) * 4,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -60) onSwipeRef.current("left");
        else if (gs.dx > 60) onSwipeRef.current("right");
      },
    })
  ).current;

  const content =
    activeTab === "nearby"    ? nearContent :
    activeTab === "goals"     ? goalsContent :
    activeTab === "matches"   ? matchesContent :
    activeTab === "rooms"     ? roomsContent :
    activeTab === "astrology" ? astrologyContent :
    activeTab === "requests"  ? requestsContent :
    dailyContent;

  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      {content}
    </View>
  );
}

function FindVibeContent() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const userId = session?.user?.id;

  const mainTabSwipe = useMainTabSwipe("find");
  const [activeTab, setActiveTab] = useState<TabId>("nearby");
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (tabParam === "requests") setActiveTab("requests");
    else if (tabParam === "matches") setActiveTab("matches");
  }, [tabParam]);
  const { isLinked } = useCoupleStatus();
  const [myGoals, setMyGoals] = useState<string[]>([]);
  const tabScrollRef = useRef<ScrollView>(null);
  const tabBtnLayouts = useRef<{ x: number; width: number }[]>([]);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [dailyProfileCard, setDailyProfileCard] = useState<VibeCard | null>(null);
  const [isAnonymous] = useState(false);
  const [showSpeedVibe, setShowSpeedVibe] = useState(false);
  const [pendingVibeCount, setPendingVibeCount] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    fetch(`${apiBase}/vibe-requests/inbox?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.ok ? r.json() : { requests: [] })
      .then((j) => setPendingVibeCount((j.requests ?? []).length))
      .catch(() => {});
  }, [userId]));

  const [vibePrivacy, setVibePrivacy] = useState("everyone");
  const [goalSheet, setGoalSheet] = useState<string | null>(null);
  const [vibePrefs, setVibePrefs] = useState<VibePrefsRow | null>(null);
  const [nearbyCards, setNearbyCards] = useState<VibeCard[]>([]);
  const [sameVibeCards, setSameVibeCards] = useState<VibeCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [screenError, setScreenError] = useState(false);
  // Rolling buffer refs for the vibe deck
  const nearbyCardsRef = useRef<VibeCard[]>([]);
  useEffect(() => { nearbyCardsRef.current = nearbyCards; }, [nearbyCards]);
  const refillInProgressRef = useRef(false);
  const [activeFilters, setActiveFilters] = useState<FilterState>({
    showGender: ["everyone"],
    goal: "all",
    ageMin: 18,
    ageMax: 50,
    maxDist: 50,
    onlineOnly: false,
    verifiedOnly: false,
  });
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (!userId) return;
    getGundrukProfile(userId).then((p) => setVibePrivacy(p.vibe_request_privacy)).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    getUserGoals(userId).then(setMyGoals).catch(() => {});
    (async () => {
      try {
        const prefs = await getVibePreferences(userId).catch(() => null);
        setVibePrefs(prefs);

        // Always load cards first — wizard is never blocking
        loadCards(userId, prefs);

      } catch (err) {
        console.log("FindVibe init error:", err);
        // Don't crash — just show content with empty cards
        setCardsLoading(false);
      }
    })();
  }, [userId]);

  const loadCards = async (uid: string, prefs: VibePrefsRow | null) => {
    setCardsLoading(true);

    // Instant first paint: show cached deck immediately while the network fetch
    // runs in the background. Cache TTL is 5 min (vibeCache.ts) so stale data
    // is skipped automatically. The network result always wins and replaces this.
    // Track whether cache successfully painted data before the network result
    // arrives — used to decide if a fetch failure is a cold-start failure (show
    // error UI) or a warm-cache background-refresh failure (stay silent).
    let cacheLoaded = false;
    getCachedVibeDeck(uid).then((cached) => {
      if (cached && cached.length > 0) {
        cacheLoaded = true;
        setNearbyCards(cached as VibeMatchProfile[]);
        setCardsLoading(false);
      }
    }).catch(() => {});

    try {
      const filters = prefs
        ? {
            interestedIn: prefs.interested_in,
            lookingFor: prefs.looking_for,
            ageMin: prefs.age_min,
            ageMax: prefs.age_max,
            maxDistanceKm: prefs.max_distance_km,
          }
        : undefined;

      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const locOrTimeout = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
          ]);
          if (locOrTimeout) {
            lat = (locOrTimeout as Location.LocationObject).coords.latitude;
            lng = (locOrTimeout as Location.LocationObject).coords.longitude;
          }
        }
      } catch {
        // location unavailable — continue without it
      }

      // NOTE: getVibeMatches calls supabase.rpc() with the anon key which hangs
      // forever under RLS (documented bug). Keep it OUT of this Promise.all or the
      // whole deck load stalls indefinitely. Fire it non-blocking below instead.
      const [nearby, swipedIds] = await Promise.all([
        getNearbyUsers(uid, lat, lng).catch(() => [] as VibeMatchProfile[]),
        getSwipedIds(uid).catch(() => new Set<string>()),
      ]);

      // Exclude own profile + already-swiped profiles; deduplicate across both sections
      const seen = new Set<string>([uid]);
      const keepCard = (c: VibeMatchProfile): boolean => {
        if (seen.has(c.id) || swipedIds.has(c.id)) return false;
        seen.add(c.id);
        return true;
      };

      // nearby comes from /api/vibe/deck (API server, service-role key — bypasses RLS).
      // Profiles without a distance still show up.
      const nearbyMapped: VibeMatchProfile[] = nearby.map((u) => ({
        ...u,
        distance: u.distance ?? `${Math.floor(Math.random() * 15) + 1} km`,
      }));
      const rawNearby: VibeMatchProfile[] = nearbyMapped.filter(keepCard);
      const sortedNearby = [...rawNearby].sort((a, b) => {
        const da = parseFloat((a.distance ?? "999 km").replace(/[^0-9.]/g, ""));
        const db = parseFloat((b.distance ?? "999 km").replace(/[^0-9.]/g, ""));
        return (isNaN(da) ? 999 : da) - (isNaN(db) ? 999 : db);
      });
      setNearbyCards(sortedNearby);
      // Persist fresh network result so next tab open (and the auth preload)
      // has an up-to-date deck ready instantly.
      if (sortedNearby.length > 0) void setCachedVibeDeck(uid, sortedNearby);

      // Load sameVibe cards non-blocking — getVibeMatches uses a direct anon-key RPC
      // that can hang forever under RLS, so never await it in the critical path.
      getVibeMatches(uid, filters)
        .then((allVibe) => {
          setSameVibeCards(allVibe.filter((c) => (c.vibe !== undefined || c.vibeScore !== undefined) && keepCard(c)));
        })
        .catch(() => {});
    } catch {
      // Cold-start failure: no cache was available to fall back on → show the
      // existing error UI (screenError). If cache painted stale data, stay silent.
      if (!cacheLoaded) setScreenError(true);
    } finally {
      setCardsLoading(false);
    }
  };


  // Rolling buffer for the vibe deck: when fewer than 10 cards remain ahead of
  // the current swipe index, fetch a fresh batch from the API and append only
  // profiles not already in the deck (deduplicated by id). Fire-and-forget —
  // the existing deck stays intact if the fetch fails.
  const refillVibeDeck = useCallback(async () => {
    if (!userId || refillInProgressRef.current) return;
    refillInProgressRef.current = true;
    try {
      const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
      const res = await fetch(`${apiBase}/vibe/deck?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) return;
      const json = (await res.json()) as { profiles?: any[] };
      const existingIds = new Set(nearbyCardsRef.current.map((c) => c.id));
      const newCards: VibeMatchProfile[] = (json.profiles ?? [])
        .map((row: any) => ({
          id: row.id ?? row.user_id,
          name: row.full_name ?? row.name ?? row.username ?? "Vibe User",
          age: row.age ?? 24,
          image:
            row.vibe_profile_photo_url ??
            (Array.isArray(row.vibe_photos) && row.vibe_photos.length > 0 ? row.vibe_photos[0] : null) ??
            row.avatar_url ??
            `https://picsum.photos/seed/${row.id ?? row.user_id}/400/600`,
          bio: row.bio ?? "",
          vibe_bio: row.vibe_bio,
          vibe_photos: row.vibe_photos,
          interests: row.interests ?? [],
          distance: row.distance_km ? `${Math.round(row.distance_km as number)} km away` : undefined,
          isOnline: row.is_online ?? false,
          isVerified: row.is_verified ?? false,
          gender: row.gender,
          goal: row.looking_for,
          vibeScore: row.vibe_score ?? row.compatibility_score,
          matchInterests: row.shared_interests ?? [],
        }))
        .filter((c: VibeMatchProfile) => !existingIds.has(c.id));
      if (newCards.length > 0) setNearbyCards((prev) => [...prev, ...newCards]);
    } catch {
      // non-fatal — deck stays intact
    } finally {
      refillInProgressRef.current = false;
    }
  }, [userId]);

  const handleGoalTap = (goalValue: string) => {
    setGoalSheet(goalValue);
  };

  const handleApplyFilters = async (f: FilterState) => {
    setActiveFilters(f);
    if (!userId) return;
    const filters = {
      interestedIn: f.showGender,
      lookingFor: f.goal !== "all" ? f.goal : undefined,
      ageMin: f.ageMin,
      ageMax: f.ageMax,
      maxDistanceKm: f.maxDist > 100 ? undefined : f.maxDist,
    };
    setCardsLoading(true);
    try {
      let all = await getVibeMatches(userId, filters);
      if (f.onlineOnly) all = all.filter((c) => c.isOnline);
      if (f.verifiedOnly) all = all.filter((c) => c.isVerified);
      setNearbyCards(all);
      setSameVibeCards(all.filter((c) => c.vibe !== undefined || c.vibeScore !== undefined));
    } catch {
    } finally {
      setCardsLoading(false);
    }
  };

  if (screenError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 16 }]}>
        <Text style={{ fontSize: 48 }}>😕</Text>
        <Text style={{ color: colors.foreground, fontFamily: "Poppins_700Bold", fontSize: 18 }}>Something went wrong</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", paddingHorizontal: 32 }}>
          Couldn't load Find Vibe. Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={() => { setScreenError(false); setCardsLoading(true); if (userId) loadCards(userId, vibePrefs); }}
          style={{ backgroundColor: "#7C3AED", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24 }}
        >
          <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 }}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]} {...mainTabSwipe.panHandlers}>
        <View style={[styles.guestContainer, { paddingTop: topInset + 40 }]}>
          <Text style={styles.guestEmoji}>💜</Text>
          <Text style={[styles.guestTitle, { color: colors.foreground }]}>Find Your Vibe</Text>
          <Text style={[styles.guestSub, { color: colors.mutedForeground }]}>Sign in to discover nearby people and connect</Text>
          <GradientButton onPress={() => router.push("/(auth)/login")} title="Sign In to Connect" style={{ width: "85%" }} />
          <TouchableOpacity onPress={() => router.push("/(auth)/signup")}>
            <Text style={[styles.signupLink, { color: "#7C3AED" }]}>Create account →</Text>
          </TouchableOpacity>
        </View>
        <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
      </View>
    );
  }

  const TABS = [
    { id: "nearby"    as const, emoji: "📍", label: "Near" },
    { id: "goals"     as const, emoji: "🎯", label: "Goals" },
    { id: "matches"   as const, emoji: "💜", label: "Matches" },
    { id: "requests"  as const, emoji: "💌", label: "Requests" },
    { id: "rooms"     as const, emoji: "🏠", label: "Rooms" },
    { id: "astrology" as const, emoji: "🕉️", label: "Astrology" },
    { id: "daily"     as const, emoji: "🌟", label: "Daily" },
  ];

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      {...mainTabSwipe.panHandlers}
    >
      {isLinked ? (
        <View style={[styles.header, { paddingTop: topInset + 8 }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>💕 Couple</Text>
        </View>
      ) : (
        <View style={[styles.header, { paddingTop: topInset + 8 }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Find Vibe</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => router.push("/vibe-notifications" as any)}
              style={[styles.iconBtn, { backgroundColor: pendingVibeCount > 0 ? "rgba(124,58,237,0.2)" : colors.muted, borderColor: pendingVibeCount > 0 ? "#7C3AED" : colors.border }]}
            >
              <Ionicons name="flash" size={18} color={pendingVibeCount > 0 ? "#A78BFA" : colors.mutedForeground} />
              {pendingVibeCount > 0 && (
                <View style={styles.vibeBadge}>
                  <Text style={styles.vibeBadgeText}>{pendingVibeCount > 9 ? "9+" : pendingVibeCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert("Coming soon 🌍", "Country-wise matching is coming soon — for now, vibe with people worldwide!")}
              activeOpacity={0.75}
              style={[styles.iconBtn, { backgroundColor: "rgba(124,58,237,0.08)", borderColor: "rgba(124,58,237,0.5)", opacity: 0.6 }]}
            >
              <Text style={{ fontSize: 13 }}>🔒</Text>
              <Text style={{ fontSize: 13 }}>🌍</Text>
              <Text style={[styles.speedText, { color: "#A78BFA" }]}>Country</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowFilter(true)} style={[styles.filterBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Ionicons name="options-outline" size={20} color="#7C3AED" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isLinked ? (
        <CoupleTab userId={userId ?? ""} session={session} />
      ) : (
        <>

      {vibePrivacy === "nobody" && (
        <TouchableOpacity onPress={() => router.push("/settings" as any)} style={styles.pauseBanner}>
          <Text style={styles.pauseText}>⏸ Vibe Requests are paused · Tap to change in Settings</Text>
        </TouchableOpacity>
      )}


      {/* ── Scrollable pill tab bar ── */}
      <ScrollView
        ref={tabScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScrollContent}
        style={styles.tabScrollRow}
      >
        {TABS.map((tab, i) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => {
                setActiveTab(tab.id);
                const layout = tabBtnLayouts.current[i];
                if (layout) {
                  tabScrollRef.current?.scrollTo({ x: Math.max(0, layout.x - 24), animated: true });
                }
              }}
              onLayout={(e) => {
                tabBtnLayouts.current[i] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
              }}
              activeOpacity={0.8}
              style={[
                styles.tabPill,
                isActive
                  ? styles.tabPillActive
                  : { borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
              ]}
            >
              {isActive ? (
                <LinearGradient
                  colors={["#7C3AED", "#EC4899"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.tabPillGrad}
                >
                  <Text style={styles.tabPillEmoji}>{tab.emoji}</Text>
                  <Text style={[styles.tabPillLabel, { color: "#fff" }]}>{tab.label}</Text>
                  {tab.id === "requests" && pendingVibeCount > 0 && (
                    <View style={{ backgroundColor: "#F97316", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3, marginLeft: 2 }}>
                      <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Poppins_700Bold", lineHeight: 16 }}>
                        {pendingVibeCount > 9 ? "9+" : pendingVibeCount}
                      </Text>
                    </View>
                  )}
                </LinearGradient>
              ) : (
                <View style={styles.tabPillInner}>
                  <Text style={styles.tabPillEmoji}>{tab.emoji}</Text>
                  <Text style={[styles.tabPillLabel, { color: "#6B7280" }]}>{tab.label}</Text>
                  {tab.id === "requests" && pendingVibeCount > 0 && (
                    <View style={{ backgroundColor: "#F97316", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3, marginLeft: 2 }}>
                      <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Poppins_700Bold", lineHeight: 16 }}>
                        {pendingVibeCount > 9 ? "9+" : pendingVibeCount}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Tab content — controlled by activeTab state ── */}
      <TabContent
        activeTab={activeTab}
        onSwipe={(dir) => {
          const idx = TABS.findIndex((t) => t.id === activeTab);
          const next = dir === "left" ? idx + 1 : idx - 1;
          if (next < 0 || next >= TABS.length) return;
          const tab = TABS[next];
          setActiveTab(tab.id);
          const layout = tabBtnLayouts.current[next];
          if (layout) {
            tabScrollRef.current?.scrollTo({ x: Math.max(0, layout.x - 24), animated: true });
          }
        }}
        nearContent={
          <SwipeCardDeck
            cards={nearbyCards}
            onRequireLogin={() => setShowLoginPrompt(true)}
            userId={session?.user?.id}
            isAnonymous={isAnonymous}
            myGoals={myGoals}
            onReset={userId ? async () => {
              await resetVibeDeck(userId);
              await loadCards(userId, vibePrefs);
            } : undefined}
            onCurrentIndexChange={(idx) => {
              // Rolling buffer: when fewer than dataBuf cards remain, fetch
              // more profiles. Buffer size scales with network quality.
              const { dataBuf } = getNetworkConfig();
              if (dataBuf > 0 && nearbyCards.length - idx < dataBuf) void refillVibeDeck();
            }}
          />
        }
        goalsContent={<GoalsDiscoveryTab onGoalSelect={handleGoalTap} userId={userId} />}
        matchesContent={userId ? (
          <MatchesTab
            userId={userId}
            onSwitchToNear={() => setActiveTab("nearby")}
          />
        ) : <View />}
        requestsContent={userId ? (
          <RequestsTab userId={userId} onCountChange={setPendingVibeCount} />
        ) : <View />}
        roomsContent={<VibeRoomsTab />}
        astrologyContent={<JyotishaTab userId={userId} />}
        dailyContent={
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 100 }}>
            <DailyVibeSection
              onViewProfile={(card) => setDailyProfileCard(card)}
              onConnect={() => {}}
            />
            <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
              <Text style={[styles.historyTitle, { color: colors.foreground }]}>📅 Daily History</Text>
              {[
                { name: "Zoey", date: "Yesterday", matched: true, image: "https://picsum.photos/seed/h1/100/100" },
                { name: "Marcus", date: "2 days ago", matched: false, image: "https://picsum.photos/seed/h2/100/100" },
                { name: "Sofia", date: "3 days ago", matched: true, image: "https://picsum.photos/seed/h3/100/100" },
              ].map((h, i) => (
                <View key={i} style={[styles.historyItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <ExpoImage source={thumbUrl(h.image)} style={styles.historyPhoto} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyName, { color: colors.foreground }]}>{h.name}</Text>
                    <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>{h.date}</Text>
                  </View>
                  <View style={[styles.historyStatus, { backgroundColor: h.matched ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.05)" }]}>
                    <Text style={{ color: h.matched ? "#A78BFA" : colors.mutedForeground, fontFamily: "Poppins_600SemiBold", fontSize: 12 }}>
                      {h.matched ? "✨ Vibed" : "Missed"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        }
      />
        </>
      )}

      {dailyProfileCard && (
        <ProfileModal
          card={dailyProfileCard}
          onClose={() => setDailyProfileCard(null)}
          onVibe={() => { setDailyProfileCard(null); Alert.alert("🌟 Daily Match!", `You vibed with ${dailyProfileCard.name}! 🎉`); }}
          onSkip={() => setDailyProfileCard(null)}
        />
      )}

      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
      <FilterModal
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        onApply={handleApplyFilters}
        initialPrefs={vibePrefs}
      />
      <SpeedVibeModal visible={showSpeedVibe} onClose={() => setShowSpeedVibe(false)} />
      <GoalUsersSheet
        visible={goalSheet !== null}
        goalValue={goalSheet}
        userId={userId}
        onClose={() => setGoalSheet(null)}
      />
    </View>
  );
}

const profileStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { height: H * 0.88, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden", position: "relative" },
  photo: { width: "100%", height: "70%" },
  tapZoneLeft: { position: "absolute", top: 0, left: 0, width: "40%", height: "70%" },
  tapZoneRight: { position: "absolute", top: 0, right: 0, width: "40%", height: "70%" },
  photoBars: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", gap: 4 },
  photoBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)" },
  photoBarSeen: { backgroundColor: "rgba(255,255,255,0.9)" },
  photoBarActive: { backgroundColor: "#ffffff" },
  closeBtn: { position: "absolute", top: 16, left: 16, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 20, padding: 4 },
  matchBadge: { position: "absolute", top: 16, right: 16 },
  matchGrad: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  matchText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_700Bold" },
  info: { position: "absolute", bottom: 100, left: 0, right: 0, padding: 20 },
  name: { color: "#fff", fontSize: 24, fontFamily: "Poppins_700Bold", marginBottom: 4 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  locationText: { color: "rgba(255,255,255,0.8)", fontSize: 13 },
  bio: { color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 20, fontFamily: "Poppins_400Regular" },
  tag: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  tagMatch: { backgroundColor: "rgba(124,58,237,0.7)" },
  tagText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_500Medium" },
  actions: { position: "absolute", bottom: 24, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 24 },
  skipBtn: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  vibeBtn: { width: 72, height: 72, borderRadius: 36, overflow: "hidden" },
  vibeGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
});

const filterStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28, maxHeight: H * 0.88 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  sectionLabel: { fontSize: 12, fontFamily: "Poppins_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  ageRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  agePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)" },
  agePillText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
  interestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  interestChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.06)" },
  interestText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 14, borderWidth: 0.5, marginBottom: 8 },
  toggleLabel: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  toggleSub: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 2 },
  toggleKnob: { width: 44, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.12)", padding: 3, justifyContent: "center" },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14 },
  headerTitle: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, position: "relative" },
  speedText: { fontFamily: "Poppins_700Bold", fontSize: 13 },
  updateBanner: { marginHorizontal: 12, marginBottom: 6, borderRadius: 14, overflow: "hidden" },
  updateBannerGrad: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  updateBannerEmoji: { fontSize: 20 },
  updateBannerTitle: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  updateBannerSub: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_400Regular", fontSize: 11 },
  updateBannerClose: { padding: 4 },
  vibeBadge: { position: "absolute", top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#EC4899", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  vibeBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Poppins_700Bold", lineHeight: 14 },
  pauseBanner: { backgroundColor: "rgba(249,115,22,0.13)", marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(249,115,22,0.28)" },
  pauseText: { color: "#F97316", fontFamily: "Poppins_600SemiBold", fontSize: 12, textAlign: "center" },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  scoreBadge: { position: "absolute", top: 16, right: 16, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  scoreText: { color: "#FBBF24", fontFamily: "Poppins_700Bold", fontSize: 12 },
  tabScrollRow: { maxHeight: 60, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.06)" },
  tabScrollContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: "center" },
  tabPill: { borderRadius: 20, minWidth: 70, overflow: "hidden" },
  tabPillActive: {},
  tabPillGrad: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, alignItems: "center", minWidth: 70 },
  tabPillInner: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, alignItems: "center", minWidth: 70 },
  tabPillEmoji: { fontSize: 17, lineHeight: 22 },
  tabPillLabel: { fontSize: 11, fontFamily: "Poppins_700Bold", marginTop: 1 },
  deckArea: { flex: 1, alignItems: "center", paddingHorizontal: 16, paddingTop: 8 },
  card: { position: "absolute", width: W - 32, borderRadius: 28, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.55, shadowRadius: 28, elevation: 20 },
  expandBtn: { position: "absolute", top: 16, left: 16, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 22, padding: 8 },
  overlayVibe: { position: "absolute", top: 32, left: 20, backgroundColor: "rgba(124,58,237,0.9)", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 3, borderColor: "#A78BFA", transform: [{ rotate: "-14deg" }] },
  overlayVibeText: { color: "#fff", fontSize: 24, fontFamily: "Poppins_700Bold", letterSpacing: 2 },
  overlaySkip: { position: "absolute", top: 32, right: 20, backgroundColor: "rgba(239,68,68,0.9)", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 3, borderColor: "#FCA5A5", transform: [{ rotate: "14deg" }] },
  overlaySkipText: { color: "#fff", fontSize: 24, fontFamily: "Poppins_700Bold", letterSpacing: 2 },
  matchBadge: { position: "absolute", top: 56, right: 16 },
  matchGrad: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  matchText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_700Bold" },
  cardBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 22, gap: 8 },
  cardNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardGoalRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sameGoalBadge: { backgroundColor: "rgba(234,179,8,0.25)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(234,179,8,0.5)" },
  sameGoalText: { color: "#EAB308", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  cardName: { color: "#fff", fontSize: 26, fontFamily: "Poppins_700Bold" },
  distancePill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  distanceText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_500Medium" },
  cardBio: { color: "rgba(255,255,255,0.88)", fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 20 },
  interestRow: { flexDirection: "row", gap: 7 },
  interestTag: { backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 11, paddingVertical: 5, borderRadius: 10, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.3)" },
  interestTagMatch: { backgroundColor: "rgba(124,58,237,0.65)", borderColor: "#A78BFA" },
  interestText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  actionButtons: { position: "absolute", bottom: Platform.OS === "web" ? 108 : 96, flexDirection: "row", alignItems: "center", gap: 20 },
  actionCircle: { width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  vibeCircle: { width: 80, height: 80, borderRadius: 40, overflow: "hidden", shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10 },
  vibeGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyDeck: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32, paddingBottom: 100 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 20, fontFamily: "Poppins_700Bold", textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 19 },
  reloadBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, borderWidth: 1, marginTop: 8 },
  reloadText: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  guestContainer: { flex: 1, alignItems: "center", paddingHorizontal: 32, gap: 16 },
  guestEmoji: { fontSize: 60, marginBottom: 8 },
  guestTitle: { fontSize: 26, fontFamily: "Poppins_700Bold", textAlign: "center" },
  guestSub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 21, marginBottom: 8 },
  signupLink: { fontSize: 15, fontFamily: "Poppins_600SemiBold", marginTop: 4 },
  historyTitle: { fontSize: 17, fontFamily: "Poppins_700Bold", marginBottom: 12 },
  historyItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 0.5, marginBottom: 10 },
  historyPhoto: { width: 48, height: 48, borderRadius: 24 },
  historyName: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  historyDate: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  historyStatus: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  swipeCounterRow: { position: "absolute", bottom: Platform.OS === "web" ? 58 : 52, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8 },
  swipeBarBg: { width: 90, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  swipeBarFill: { height: 3, borderRadius: 2 },
  swipeCountText: { color: "rgba(255,255,255,0.38)", fontFamily: "Poppins_400Regular", fontSize: 11 },
  cooldownPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(234,179,8,0.12)", borderWidth: 1, borderColor: "rgba(234,179,8,0.3)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  cooldownText: { color: "#EAB308", fontFamily: "Poppins_500Medium", fontSize: 11 },
});

export default function FindVibeScreen() {
  return (
    <FindVibeErrorBoundary>
      <FindVibeContent />
    </FindVibeErrorBoundary>
  );
}
