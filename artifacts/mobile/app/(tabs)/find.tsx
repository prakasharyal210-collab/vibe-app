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
import { createVibeMatch } from "@/lib/db";
import { GradientButton } from "@/components/GradientButton";
import { LoginPrompt } from "@/components/LoginPrompt";
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
}

const MY_INTERESTS = ["Photography", "Travel", "Music", "Art", "Coffee"];

const NEARBY_CARDS: VibeCard[] = [
  { id: "p1", name: "Ariana", age: 24, image: "https://picsum.photos/seed/find1/400/600", bio: "Photographer & world traveler. Always chasing golden hour.", interests: ["Photography", "Travel", "Coffee", "Yoga"], distance: "0.3 km", matchInterests: ["Photography", "Travel", "Coffee"] },
  { id: "p2", name: "Marcus", age: 27, image: "https://picsum.photos/seed/find2/400/600", bio: "Music producer & dog dad. Studio sessions > everything.", interests: ["Music", "Dogs", "Running", "Gaming"], distance: "0.8 km", matchInterests: ["Music"] },
  { id: "p3", name: "Zoey", age: 23, image: "https://picsum.photos/seed/find3/400/600", bio: "Artist. Into indie music, vintage fashion, and late night drives.", interests: ["Art", "Music", "Fashion", "Coffee"], distance: "1.2 km", matchInterests: ["Art", "Music", "Coffee"] },
  { id: "p4", name: "Jay", age: 26, image: "https://picsum.photos/seed/find4/400/600", bio: "Foodie and fitness nerd. Weekend hiker. ENFJ.", interests: ["Fitness", "Food", "Hiking", "Travel"], distance: "2.1 km", matchInterests: ["Travel"] },
  { id: "p5", name: "Sofia", age: 25, image: "https://picsum.photos/seed/find5/400/600", bio: "Actress & content creator. Big INTJ energy.", interests: ["Acting", "Photography", "Art", "Travel"], distance: "3.4 km", matchInterests: ["Photography", "Art", "Travel"] },
];

const SAMEVIBE_CARDS: VibeCard[] = [
  { id: "v1", name: "Kai", age: 28, image: "https://picsum.photos/seed/vibe1/400/600", bio: "Adventure is my love language. Mountains > malls.", interests: ["Travel", "Photography", "Camping", "Music"], vibe: "Adventurer", matchInterests: ["Travel", "Photography", "Music"] },
  { id: "v2", name: "Mia", age: 22, image: "https://picsum.photos/seed/vibe2/400/600", bio: "Digital artist. Drawing fandoms by day, gaming by night.", interests: ["Art", "Gaming", "Coffee", "Music"], vibe: "Creator", matchInterests: ["Art", "Coffee", "Music"] },
  { id: "v3", name: "Leo", age: 29, image: "https://picsum.photos/seed/vibe3/400/600", bio: "Chef & food blogger. Your taste buds will thank me.", interests: ["Cooking", "Food", "Travel", "Photography"], vibe: "Foodie", matchInterests: ["Travel", "Photography"] },
  { id: "v4", name: "Nina", age: 24, image: "https://picsum.photos/seed/vibe4/400/600", bio: "Startup founder. Morning runs. Strong opinions.", interests: ["Art", "Coffee", "Tech", "Travel"], vibe: "Hustler", matchInterests: ["Art", "Coffee", "Travel"] },
];

function calcMatch(card: VibeCard): number {
  const shared = (card.matchInterests ?? []).length;
  const total = new Set([...MY_INTERESTS, ...card.interests]).size;
  return Math.round((shared / total) * 100);
}

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
                <TouchableOpacity
                  key={age}
                  onPress={() => setMaxAge(age)}
                  style={[filterStyles.agePill, maxAge === age && { backgroundColor: "#7C3AED" }]}
                >
                  <Text style={[filterStyles.agePillText, { color: maxAge === age ? "#fff" : colors.foreground }]}>
                    {age === 18 ? "18+" : `≤ ${age}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[filterStyles.sectionLabel, { color: colors.mutedForeground }]}>Max Distance</Text>
            <View style={filterStyles.ageRow}>
              {[1, 5, 10, 25, 50].map((d) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => setMaxDist(d)}
                  style={[filterStyles.agePill, maxDist === d && { backgroundColor: "#7C3AED" }]}
                >
                  <Text style={[filterStyles.agePillText, { color: maxDist === d ? "#fff" : colors.foreground }]}>{d} km</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[filterStyles.sectionLabel, { color: colors.mutedForeground }]}>Interests</Text>
            <View style={filterStyles.interestGrid}>
              {INTERESTS_ALL.map((int) => (
                <TouchableOpacity
                  key={int}
                  onPress={() => toggle(int)}
                  style={[filterStyles.interestChip, selected.includes(int) && { backgroundColor: "#7C3AED" }, { borderColor: colors.border }]}
                >
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
    const t = setTimeout(onClose, 5000);
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
        <TouchableOpacity onPress={onClose} style={matchStyles.messageBtn}>
          <Text style={matchStyles.messageBtnText}>💬 Send Message</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={matchStyles.keepBtn}>
          <Text style={matchStyles.keepBtnText}>Keep Swiping →</Text>
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

function SwipeCardDeck({ cards, onRequireLogin, userId }: { cards: VibeCard[]; onRequireLogin: () => void; userId?: string }) {
  const colors = useColors();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [profileCard, setProfileCard] = useState<VibeCard | null>(null);
  const [matchCard, setMatchCard] = useState<VibeCard | null>(null);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const handleSwipe = (direction: "left" | "right") => {
    const card = cards[currentIndex];
    const next = currentIndex + 1;
    setCurrentIndex(next);
    translateX.value = 0;
    translateY.value = 0;
    Haptics.impactAsync(direction === "right" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    if (direction === "right" && card) {
      if (userId) createVibeMatch(userId, card.id).catch(() => {});
      if (Math.random() < 0.45) {
        setTimeout(() => setMatchCard(card), 500);
      } else {
        setTimeout(() => Alert.alert("Vibe Sent! 💜", `You sent a vibe to ${card.name}`), 400);
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

  const CARD_H = H * 0.54;
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

            <Animated.View style={[styles.overlayVibe, vibeOverlay]}>
              <Text style={styles.overlayVibeText}>VIBE ✨</Text>
            </Animated.View>
            <Animated.View style={[styles.overlaySkip, skipOverlay]}>
              <Text style={styles.overlaySkipText}>SKIP</Text>
            </Animated.View>

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
        <TouchableOpacity onPress={() => { translateX.value = withTiming(-W * 1.5, { duration: 300 }); setTimeout(() => handleSwipe("left"), 300); }} style={[styles.actionCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="close" size={28} color="#EF4444" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { translateX.value = withTiming(W * 1.5, { duration: 300 }); setTimeout(() => handleSwipe("right"), 300); }} style={styles.vibeCircle}>
          <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.vibeGradient}>
            <Ionicons name="heart" size={30} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { topCard && setProfileCard(topCard); }} style={[styles.actionCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="person-outline" size={22} color="#7C3AED" />
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
    </View>
  );
}

export default function FindVibeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState<"nearby" | "samevibe">("nearby");
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
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
        <TouchableOpacity onPress={() => setShowFilter(true)} style={[styles.filterBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="options-outline" size={20} color="#7C3AED" />
          <Text style={[styles.filterText, { color: colors.foreground }]}>Filter</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {(["nearby", "samevibe"] as const).map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}>
            {activeTab === tab && (
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 1 }} style={styles.tabUnderline} />
            )}
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.foreground : colors.mutedForeground }, activeTab === tab && styles.tabTextActive]}>
              {tab === "nearby" ? "📍 Nearby" : "✨ Same Vibe"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SwipeCardDeck key={activeTab} cards={cards} onRequireLogin={() => setShowLoginPrompt(true)} userId={session?.user?.id} />

      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
      <FilterModal visible={showFilter} onClose={() => setShowFilter(false)} onApply={() => {}} />
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
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  tabRow: { flexDirection: "row", borderBottomWidth: 0.5, marginBottom: 4 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12, position: "relative" },
  tabBtnActive: {},
  tabUnderline: { position: "absolute", bottom: 0, left: 20, right: 20, height: 2, borderRadius: 1 },
  tabText: { fontSize: 14, fontFamily: "Poppins_500Medium" },
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
  actionButtons: { position: "absolute", bottom: Platform.OS === "web" ? 100 : 90, flexDirection: "row", alignItems: "center", gap: 20 },
  actionCircle: { width: 60, height: 60, borderRadius: 30, borderWidth: 1, alignItems: "center", justifyContent: "center" },
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
});
