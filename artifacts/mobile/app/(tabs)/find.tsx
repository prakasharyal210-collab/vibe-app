import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Achievement, checkAchievements, createVibeMatch, updateVibeScore } from "@/lib/db";
import { AchievementModal } from "@/components/AchievementModal";
import { GradientButton } from "@/components/GradientButton";
import { LoginPrompt } from "@/components/LoginPrompt";
import { SpeedVibeModal } from "@/components/SpeedVibeModal";
import { VibeRoomsTab } from "@/components/VibeRoomsTab";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const { width: W, height: H } = Dimensions.get("window");
const SWIPE_THRESHOLD = W * 0.3;

interface VibeCard {
  id: string;
  name: string;
  age: number;
  image: string;
  bio: string;
  interests: string[];
  distance?: string;
  vibe?: string;
  matchInterests?: string[];
  vibeScore?: number;
}

const MY_INTERESTS = ["Photography", "Travel", "Music", "Art", "Coffee"];

const NEARBY_CARDS: VibeCard[] = [
  { id: "p1", name: "Ariana", age: 24, image: "https://picsum.photos/seed/find1/400/600", bio: "Photographer & world traveler. Always chasing golden hour.", interests: ["Photography", "Travel", "Coffee", "Yoga"], distance: "0.3 km", matchInterests: ["Photography", "Travel", "Coffee"], vibeScore: 847 },
  { id: "p2", name: "Marcus", age: 27, image: "https://picsum.photos/seed/find2/400/600", bio: "Music producer & dog dad. Studio sessions > everything.", interests: ["Music", "Dogs", "Running", "Gaming"], distance: "0.8 km", matchInterests: ["Music"], vibeScore: 612 },
  { id: "p3", name: "Zoey", age: 23, image: "https://picsum.photos/seed/find3/400/600", bio: "Artist. Into indie music, vintage fashion, and late night drives.", interests: ["Art", "Music", "Fashion", "Coffee"], distance: "1.2 km", matchInterests: ["Art", "Music", "Coffee"], vibeScore: 931 },
  { id: "p4", name: "Jay", age: 26, image: "https://picsum.photos/seed/find4/400/600", bio: "Foodie and fitness nerd. Weekend hiker. ENFJ.", interests: ["Fitness", "Food", "Hiking", "Travel"], distance: "2.1 km", matchInterests: ["Travel"], vibeScore: 488 },
  { id: "p5", name: "Sofia", age: 25, image: "https://picsum.photos/seed/find5/400/600", bio: "Actress & content creator. Big INTJ energy.", interests: ["Acting", "Photography", "Art", "Travel"], distance: "3.4 km", matchInterests: ["Photography", "Art", "Travel"], vibeScore: 773 },
];

const SAMEVIBE_CARDS: VibeCard[] = [
  { id: "v1", name: "Kai", age: 28, image: "https://picsum.photos/seed/vibe1/400/600", bio: "Adventure is my love language. Mountains > malls.", interests: ["Travel", "Photography", "Camping", "Music"], vibe: "Adventurer", matchInterests: ["Travel", "Photography", "Music"], vibeScore: 894 },
  { id: "v2", name: "Mia", age: 22, image: "https://picsum.photos/seed/vibe2/400/600", bio: "Digital artist. Drawing fandoms by day, gaming by night.", interests: ["Art", "Gaming", "Coffee", "Music"], vibe: "Creator", matchInterests: ["Art", "Coffee", "Music"], vibeScore: 756 },
  { id: "v3", name: "Leo", age: 29, image: "https://picsum.photos/seed/vibe3/400/600", bio: "Chef & food blogger. Your taste buds will thank me.", interests: ["Cooking", "Food", "Travel", "Photography"], vibe: "Foodie", matchInterests: ["Travel", "Photography"], vibeScore: 543 },
  { id: "v4", name: "Nina", age: 24, image: "https://picsum.photos/seed/vibe4/400/600", bio: "Startup founder. Morning runs. Strong opinions.", interests: ["Art", "Coffee", "Tech", "Travel"], vibe: "Hustler", matchInterests: ["Art", "Coffee", "Travel"], vibeScore: 1002 },
];

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

function calcMatch(card: VibeCard): number {
  const shared = (card.matchInterests ?? []).length;
  const total = new Set([...MY_INTERESTS, ...card.interests]).size;
  return Math.round((shared / total) * 100);
}

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
                  <Image source={{ uri: card.image }} style={gameStyles.playerPhoto} />
                  <Text style={gameStyles.photoLabel}>{card.name}</Text>
                </View>
                <Text style={gameStyles.vsText}>⚡</Text>
                <View style={gameStyles.photoWrap}>
                  <Image source={{ uri: "https://picsum.photos/seed/myprofile/100/100" }} style={gameStyles.playerPhoto} />
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
  const pulse = useSharedValue(1);

  useEffect(() => {
    const timer = setInterval(() => setCountdown(getDailyCountdown()), 1000);
    let running = true;
    const doPulse = () => {
      if (!running) return;
      pulse.value = withSpring(1.03, { damping: 8, stiffness: 100 }, () => {
        pulse.value = withSpring(1, { damping: 8, stiffness: 100 });
        setTimeout(doPulse, 2500);
      });
    };
    setTimeout(doPulse, 1000);
    return () => { running = false; clearInterval(timer); };
  }, []);

  const cardAnim = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const match = calcMatch(DAILY_VIBE_CARD);

  return (
    <View style={dailyStyles.container}>
      <View style={dailyStyles.headerRow}>
        <View>
          <Text style={dailyStyles.sectionTitle}>🌟 Today's Vibe</Text>
          <Text style={dailyStyles.sectionSub}>Your special daily connection</Text>
        </View>
        <View style={dailyStyles.countdownBox}>
          <Ionicons name="time-outline" size={12} color="#EAB308" />
          <Text style={dailyStyles.countdown}>Next: {countdown}</Text>
        </View>
      </View>

      <Animated.View style={cardAnim}>
        <TouchableOpacity onPress={() => onViewProfile(DAILY_VIBE_CARD)} activeOpacity={0.92} style={dailyStyles.card}>
          <Image source={{ uri: DAILY_VIBE_CARD.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <LinearGradient colors={["rgba(234,179,8,0.3)", "transparent", "rgba(0,0,0,0.9)"]} style={StyleSheet.absoluteFill} />

          <View style={dailyStyles.goldBorderOverlay} pointerEvents="none" />

          <View style={dailyStyles.sparkleRow} pointerEvents="none">
            <LinearGradient colors={["#EAB308", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={dailyStyles.sparkleTag}>
              <Text style={dailyStyles.sparkleText}>✨ Today's Vibe</Text>
            </LinearGradient>
            <View style={dailyStyles.matchPill}>
              <Text style={dailyStyles.matchPillText}>{match}% Match</Text>
            </View>
          </View>

          <View style={dailyStyles.cardInfo} pointerEvents="none">
            <Text style={dailyStyles.cardName}>{DAILY_VIBE_CARD.name}, {DAILY_VIBE_CARD.age}</Text>
            <Text style={dailyStyles.cardBio} numberOfLines={2}>{DAILY_VIBE_CARD.bio}</Text>
            <View style={dailyStyles.tagsRow}>
              {DAILY_VIBE_CARD.interests.slice(0, 3).map((t) => (
                <View key={t} style={[dailyStyles.tag, (DAILY_VIBE_CARD.matchInterests ?? []).includes(t) && dailyStyles.tagMatch]}>
                  <Text style={dailyStyles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {connected ? (
        <View style={dailyStyles.connectedRow}>
          <Text style={dailyStyles.connectedText}>🎉 You vibed with {DAILY_VIBE_CARD.name}!</Text>
          <TouchableOpacity
            style={dailyStyles.msgBtn}
            onPress={() => router.push({ pathname: "/chat/[userId]", params: { userId: DAILY_VIBE_CARD.id, username: DAILY_VIBE_CARD.name, isVibeMatch: "true" } })}
          >
            <Text style={dailyStyles.msgBtnText}>💬 Message</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => { setConnected(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); onConnect(); }}
          activeOpacity={0.9}
          style={dailyStyles.connectBtn}
        >
          <LinearGradient colors={["#EAB308", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={dailyStyles.connectGrad}>
            <Text style={dailyStyles.connectText}>Connect ✨</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
      <Text style={dailyStyles.expireText}>⏳ Expires in 24 hours</Text>
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
  connectBtn: { marginTop: 12 },
  connectGrad: { paddingVertical: 14, borderRadius: 24, alignItems: "center" },
  connectText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  connectedRow: { marginTop: 12, alignItems: "center", gap: 10 },
  connectedText: { color: "#EAB308", fontFamily: "Poppins_700Bold", fontSize: 15 },
  msgBtn: { backgroundColor: "rgba(124,58,237,0.3)", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: "#7C3AED" },
  msgBtnText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  expireText: { color: "rgba(255,255,255,0.3)", fontFamily: "Poppins_400Regular", fontSize: 11, textAlign: "center", marginTop: 8 },
});

function ProfileModal({ card, onClose, onVibe, onSkip }: { card: VibeCard; onClose: () => void; onVibe: () => void; onSkip: () => void }) {
  const colors = useColors();
  const match = calcMatch(card);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={profileStyles.overlay}>
        <View style={[profileStyles.sheet, { backgroundColor: colors.card }]}>
          <Image source={{ uri: card.image }} style={profileStyles.photo} resizeMode="cover" />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} style={StyleSheet.absoluteFill} />

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
            <Text style={profileStyles.bio}>{card.bio}</Text>
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

function FilterModal({ visible, onClose, onApply }: { visible: boolean; onClose: () => void; onApply: () => void }) {
  const colors = useColors();
  const [maxAge, setMaxAge] = useState(35);
  const [maxDist, setMaxDist] = useState(10);
  const INTERESTS_ALL = ["Music", "Art", "Travel", "Photography", "Coffee", "Fitness", "Food", "Gaming", "Hiking", "Tech"];
  const [selected, setSelected] = useState<string[]>(["Music", "Art"]);
  const toggle = (i: string) => setSelected((s) => s.includes(i) ? s.filter((x) => x !== i) : [...s, i]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={filterStyles.overlay}>
        <View style={[filterStyles.sheet, { backgroundColor: colors.card }]}>
          <View style={filterStyles.header}>
            <Text style={[filterStyles.title, { color: colors.foreground }]}>Filters</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[filterStyles.sectionLabel, { color: colors.mutedForeground }]}>Age Range</Text>
            <View style={filterStyles.ageRow}>
              {[18, 22, 25, 30, 35, 40].map((age) => (
                <TouchableOpacity key={age} onPress={() => setMaxAge(age)} style={[filterStyles.agePill, maxAge === age && { backgroundColor: "#7C3AED" }]}>
                  <Text style={[filterStyles.agePillText, { color: maxAge === age ? "#fff" : colors.foreground }]}>
                    {age === 18 ? "18+" : `≤ ${age}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[filterStyles.sectionLabel, { color: colors.mutedForeground }]}>Max Distance</Text>
            <View style={filterStyles.ageRow}>
              {[1, 5, 10, 25, 50].map((d) => (
                <TouchableOpacity key={d} onPress={() => setMaxDist(d)} style={[filterStyles.agePill, maxDist === d && { backgroundColor: "#7C3AED" }]}>
                  <Text style={[filterStyles.agePillText, { color: maxDist === d ? "#fff" : colors.foreground }]}>{d} km</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[filterStyles.sectionLabel, { color: colors.mutedForeground }]}>Interests</Text>
            <View style={filterStyles.interestGrid}>
              {INTERESTS_ALL.map((int) => (
                <TouchableOpacity key={int} onPress={() => toggle(int)} style={[filterStyles.interestChip, selected.includes(int) && { backgroundColor: "#7C3AED" }, { borderColor: colors.border }]}>
                  <Text style={[filterStyles.interestText, { color: selected.includes(int) ? "#fff" : colors.foreground }]}>{int}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <GradientButton onPress={() => { onApply(); onClose(); }} title="Apply Filters" />
        </View>
      </View>
    </Modal>
  );
}

function MatchOverlay({ card, onClose }: { card: VibeCard; onClose: () => void }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.6);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 350 });
    scale.value = withSpring(1, { damping: 14, stiffness: 120 });
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[matchStyles.overlay, overlayStyle]}>
      <Animated.View style={[matchStyles.content, contentStyle]}>
        <Text style={matchStyles.heartEmoji}>💜</Text>
        <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={matchStyles.badge}>
          <Text style={matchStyles.badgeText}>It's a Vibe Match! ✨</Text>
        </LinearGradient>
        <View style={matchStyles.photos}>
          <View style={matchStyles.photoWrap}>
            <View style={matchStyles.photoCircle}>
              <Image source={{ uri: "https://picsum.photos/seed/me/200/200" }} style={{ width: "100%", height: "100%" }} />
            </View>
            <Text style={matchStyles.photoName}>You</Text>
          </View>
          <Ionicons name="heart" size={28} color="#7C3AED" style={{ marginBottom: 24 }} />
          <View style={matchStyles.photoWrap}>
            <View style={[matchStyles.photoCircle, { borderColor: "#EA580C" }]}>
              <Image source={{ uri: card.image }} style={{ width: "100%", height: "100%" }} />
            </View>
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
          <Text style={matchStyles.messageBtnText}>💬 Send Message</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={matchStyles.keepBtn}>
          <Text style={matchStyles.keepBtnText}>Keep Swiping ✨</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const matchStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center", zIndex: 100 },
  content: { alignItems: "center", paddingHorizontal: 32 },
  heartEmoji: { fontSize: 72, marginBottom: 16 },
  badge: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 30, marginBottom: 28 },
  badgeText: { color: "#fff", fontSize: 20, fontFamily: "Poppins_700Bold" },
  photos: { flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 16 },
  photoWrap: { alignItems: "center", gap: 8 },
  photoCircle: { width: 88, height: 88, borderRadius: 44, overflow: "hidden", borderWidth: 3, borderColor: "#7C3AED" },
  photoName: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  matchSub: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", marginBottom: 28 },
  messageBtn: { backgroundColor: "#7C3AED", paddingHorizontal: 40, paddingVertical: 14, borderRadius: 28, marginBottom: 12 },
  messageBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  keepBtn: { paddingVertical: 8 },
  keepBtnText: { color: "rgba(255,255,255,0.55)", fontFamily: "Poppins_500Medium", fontSize: 14 },
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
          <Text style={[ibStyles.title, { color: colors.foreground }]}>Send a Vibe 💜</Text>
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

function SwipeCardDeck({ cards, onRequireLogin, userId, isAnonymous }: { cards: VibeCard[]; onRequireLogin: () => void; userId?: string; isAnonymous?: boolean }) {
  const colors = useColors();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [profileCard, setProfileCard] = useState<VibeCard | null>(null);
  const [matchCard, setMatchCard] = useState<VibeCard | null>(null);
  const [gameCard, setGameCard] = useState<VibeCard | null>(null);
  const [iceBreakerCard, setIceBreakerCard] = useState<VibeCard | null>(null);
  const [achievement, setAchievement] = useState<Achievement | null>(null);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const proceedAfterIceBreaker = (card: VibeCard) => {
    setIceBreakerCard(null);
    setTimeout(() => setGameCard(card), 300);
  };

  const handleSwipe = (direction: "left" | "right", isSuper = false) => {
    const card = cards[currentIndex];
    setCurrentIndex((i) => i + 1);
    translateX.value = 0;
    translateY.value = 0;
    Haptics.impactAsync(direction === "right" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    if (direction === "right" && card) {
      if (userId) {
        createVibeMatch(userId, card.id).catch(() => {});
        updateVibeScore(userId, 10, "New match").catch(() => {});
        checkAchievements(userId)
          .then((unlocked) => { if (unlocked.length > 0) setAchievement(unlocked[0]); })
          .catch(() => {});
      }
      if (isSuper) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => setMatchCard(card), 500);
      } else {
        setTimeout(() => setIceBreakerCard(card), 400);
      }
    }
  };

  const panGesture = Gesture.Pan()
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
        <TouchableOpacity onPress={() => setCurrentIndex(0)} style={[styles.reloadBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="refresh" size={18} color="#7C3AED" />
          <Text style={[styles.reloadText, { color: colors.foreground }]}>Start Over</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const CARD_H = H * 0.5;
  const topCard = cards[currentIndex];
  const nextCard = cards[currentIndex + 1];
  const thirdCard = cards[currentIndex + 2];
  const match = topCard ? calcMatch(topCard) : 0;

  return (
    <View style={styles.deckArea}>
      {thirdCard && (
        <View style={[styles.card, { height: CARD_H, transform: [{ scale: 0.88 }, { translateY: 30 }], zIndex: 1 }]}>
          <Image source={{ uri: thirdCard.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </View>
      )}
      {nextCard && (
        <Animated.View style={[styles.card, { height: CARD_H, zIndex: 2 }, nextCardStyle]}>
          <Image source={{ uri: nextCard.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      {topCard && (
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.card, { height: CARD_H, zIndex: 10 }, topCardStyle]}>
            <Image source={{ uri: topCard.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} style={StyleSheet.absoluteFill} />

            <TouchableOpacity onPress={() => setProfileCard(topCard)} style={styles.expandBtn}>
              <Ionicons name="expand-outline" size={20} color="#fff" />
            </TouchableOpacity>

            <Animated.View style={[styles.overlayVibe, vibeOverlay]} pointerEvents="none">
              <Text style={styles.overlayVibeText}>VIBE ✨</Text>
            </Animated.View>
            <Animated.View style={[styles.overlaySkip, skipOverlay]} pointerEvents="none">
              <Text style={styles.overlaySkipText}>SKIP</Text>
            </Animated.View>

            {topCard.vibeScore !== undefined && (
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreText}>⚡ {topCard.vibeScore}</Text>
              </View>
            )}

            <View style={styles.matchBadge}>
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.matchGrad}>
                <Text style={styles.matchText}>{match}% Match</Text>
              </LinearGradient>
            </View>

            <View style={styles.cardBottom}>
              <View style={styles.cardNameRow}>
                <Text style={styles.cardName}>{topCard.name}, {topCard.age}</Text>
                {topCard.distance ? (
                  <View style={styles.distancePill}>
                    <Ionicons name="location" size={11} color="#7C3AED" />
                    <Text style={styles.distanceText}>{topCard.distance}</Text>
                  </View>
                ) : topCard.vibe ? (
                  <View style={[styles.distancePill, { backgroundColor: "rgba(124,58,237,0.3)" }]}>
                    <Text style={[styles.distanceText, { color: "#A78BFA" }]}>{topCard.vibe}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardBio} numberOfLines={2}>{topCard.bio}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.interestRow}>
                  {topCard.interests.map((int) => (
                    <View key={int} style={[styles.interestTag, (topCard.matchInterests ?? []).includes(int) && styles.interestTagMatch]}>
                      <Text style={styles.interestText}>{int}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
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

      <IceBreakerSheet
        card={iceBreakerCard}
        visible={!!iceBreakerCard}
        onSend={(card, msg) => {
          proceedAfterIceBreaker(card);
        }}
        onSkip={(card) => proceedAfterIceBreaker(card)}
      />

      <VibeGamesModal
        card={gameCard}
        visible={!!gameCard}
        onComplete={(score, card) => {
          setGameCard(null);
          if (score >= 50 || Math.random() < 0.55) {
            setTimeout(() => setMatchCard(card), 500);
          } else {
            Alert.alert("Vibe Sent! 💜", `You sent a vibe to ${card.name}`);
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

export default function FindVibeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState<"nearby" | "samevibe" | "daily" | "rooms">("nearby");
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [dailyProfileCard, setDailyProfileCard] = useState<VibeCard | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showSpeedVibe, setShowSpeedVibe] = useState(false);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  if (!isLoggedIn) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
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

  const cards = activeTab === "nearby" ? NEARBY_CARDS : SAMEVIBE_CARDS;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Find Vibe</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => { setIsAnonymous((a) => !a); Alert.alert(isAnonymous ? "👤 Visible" : "👻 Anonymous", isAnonymous ? "You are now visible to others" : "You are now hidden — shown as a silhouette"); }}
            style={[styles.iconBtn, { backgroundColor: isAnonymous ? "rgba(124,58,237,0.3)" : colors.muted, borderColor: isAnonymous ? "#7C3AED" : colors.border }]}
          >
            <Text style={{ fontSize: 16 }}>{isAnonymous ? "👻" : "👤"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowSpeedVibe(true)}
            style={[styles.iconBtn, { backgroundColor: "rgba(249,115,22,0.12)", borderColor: "#F97316" }]}
          >
            <Text style={{ fontSize: 14 }}>⚡</Text>
            <Text style={[styles.speedText, { color: "#F97316" }]}>Speed</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowFilter(true)} style={[styles.filterBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Ionicons name="options-outline" size={20} color="#7C3AED" />
          </TouchableOpacity>
        </View>
      </View>

      {isAnonymous && (
        <View style={styles.anonBanner}>
          <Text style={styles.anonText}>👻 Anonymous mode — you appear as a silhouette</Text>
        </View>
      )}

      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {([
          { id: "nearby", label: "📍 Near" },
          { id: "samevibe", label: "✨ Vibe" },
          { id: "daily", label: "🌟 Daily" },
          { id: "rooms", label: "🏠 Rooms" },
        ] as const).map((tab) => (
          <TouchableOpacity key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}>
            {activeTab === tab.id && (
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 1 }} style={styles.tabUnderline} />
            )}
            <Text style={[styles.tabText, { color: activeTab === tab.id ? colors.foreground : colors.mutedForeground }, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "rooms" ? (
        <VibeRoomsTab />
      ) : activeTab === "daily" ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 100 }}>
          <DailyVibeSection
            onViewProfile={(card) => setDailyProfileCard(card)}
            onConnect={() => {}}
          />
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>📅 Daily Vibe History</Text>
            {[
              { name: "Zoey", date: "Yesterday", matched: true, image: "https://picsum.photos/seed/h1/100/100" },
              { name: "Marcus", date: "2 days ago", matched: false, image: "https://picsum.photos/seed/h2/100/100" },
              { name: "Sofia", date: "3 days ago", matched: true, image: "https://picsum.photos/seed/h3/100/100" },
            ].map((h, i) => (
              <View key={i} style={[styles.historyItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Image source={{ uri: h.image }} style={styles.historyPhoto} />
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
      ) : (
        <SwipeCardDeck key={activeTab} cards={cards} onRequireLogin={() => setShowLoginPrompt(true)} userId={session?.user?.id} isAnonymous={isAnonymous} />
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
      <FilterModal visible={showFilter} onClose={() => setShowFilter(false)} onApply={() => {}} />
      <SpeedVibeModal visible={showSpeedVibe} onClose={() => setShowSpeedVibe(false)} />
    </View>
  );
}

const profileStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { height: H * 0.88, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden", position: "relative" },
  photo: { width: "100%", height: "70%" },
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
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: H * 0.8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  sectionLabel: { fontSize: 13, fontFamily: "Poppins_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  ageRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  agePill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)" },
  agePillText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
  interestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  interestChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.06)" },
  interestText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontFamily: "Poppins_700Bold" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  speedText: { fontFamily: "Poppins_700Bold", fontSize: 12 },
  anonBanner: { backgroundColor: "rgba(124,58,237,0.2)", marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  anonText: { color: "#A78BFA", fontFamily: "Poppins_500Medium", fontSize: 12, textAlign: "center" },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  scoreBadge: { position: "absolute", top: 16, right: 16, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  scoreText: { color: "#FBBF24", fontFamily: "Poppins_700Bold", fontSize: 12 },
  tabRow: { flexDirection: "row", borderBottomWidth: 0.5, marginBottom: 4 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, position: "relative" },
  tabBtnActive: {},
  tabUnderline: { position: "absolute", bottom: 0, left: 10, right: 10, height: 2, borderRadius: 1 },
  tabText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  tabTextActive: { fontFamily: "Poppins_700Bold" },
  deckArea: { flex: 1, alignItems: "center", paddingHorizontal: 16, paddingTop: 8 },
  card: { position: "absolute", width: W - 32, borderRadius: 24, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 10 },
  expandBtn: { position: "absolute", top: 16, left: 16, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 20, padding: 6 },
  overlayVibe: { position: "absolute", top: 24, left: 24, backgroundColor: "rgba(124,58,237,0.85)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 2, borderColor: "#7C3AED" },
  overlayVibeText: { color: "#fff", fontSize: 20, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
  overlaySkip: { position: "absolute", top: 24, right: 24, backgroundColor: "rgba(239,68,68,0.85)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 2, borderColor: "#EF4444" },
  overlaySkipText: { color: "#fff", fontSize: 20, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
  matchBadge: { position: "absolute", bottom: 120, right: 14 },
  matchGrad: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  matchText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_700Bold" },
  cardBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 18, gap: 6 },
  cardNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardName: { color: "#fff", fontSize: 22, fontFamily: "Poppins_700Bold" },
  distancePill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  distanceText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_500Medium" },
  cardBio: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 18 },
  interestRow: { flexDirection: "row", gap: 6 },
  interestTag: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  interestTagMatch: { backgroundColor: "rgba(124,58,237,0.6)" },
  interestText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_500Medium" },
  actionButtons: { position: "absolute", bottom: Platform.OS === "web" ? 100 : 90, flexDirection: "row", alignItems: "center", gap: 16 },
  actionCircle: { width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  vibeCircle: { width: 72, height: 72, borderRadius: 36, overflow: "hidden" },
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
});
