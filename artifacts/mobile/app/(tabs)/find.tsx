import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  Image,
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
}

const NEARBY_CARDS: VibeCard[] = [
  { id: "p1", name: "Ariana", age: 24, image: "https://picsum.photos/seed/find1/400/600", bio: "Photographer & world traveler. Always chasing golden hour.", interests: ["Photography", "Travel", "Coffee"], distance: "0.3 km" },
  { id: "p2", name: "Marcus", age: 27, image: "https://picsum.photos/seed/find2/400/600", bio: "Music producer & dog dad. Studio sessions > everything.", interests: ["Music", "Dogs", "Running"], distance: "0.8 km" },
  { id: "p3", name: "Zoey", age: 23, image: "https://picsum.photos/seed/find3/400/600", bio: "Artist. Into indie music, vintage fashion, and late night drives.", interests: ["Art", "Music", "Fashion"], distance: "1.2 km" },
  { id: "p4", name: "Jay", age: 26, image: "https://picsum.photos/seed/find4/400/600", bio: "Foodie and fitness nerd. Weekend hiker. ENFJ.", interests: ["Fitness", "Food", "Hiking"], distance: "2.1 km" },
  { id: "p5", name: "Sofia", age: 25, image: "https://picsum.photos/seed/find5/400/600", bio: "Actress & content creator. Big INTJ energy.", interests: ["Acting", "Content", "Movies"], distance: "3.4 km" },
];

const SAMEVIBE_CARDS: VibeCard[] = [
  { id: "v1", name: "Kai", age: 28, image: "https://picsum.photos/seed/vibe1/400/600", bio: "Adventure is my love language. Mountains > malls.", interests: ["Hiking", "Photography", "Camping"], vibe: "Adventurer" },
  { id: "v2", name: "Mia", age: 22, image: "https://picsum.photos/seed/vibe2/400/600", bio: "Digital artist. Drawing fandoms by day, gaming by night.", interests: ["Art", "Gaming", "Anime"], vibe: "Creator" },
  { id: "v3", name: "Leo", age: 29, image: "https://picsum.photos/seed/vibe3/400/600", bio: "Chef & food blogger. Your taste buds will thank me.", interests: ["Cooking", "Food", "Travel"], vibe: "Foodie" },
  { id: "v4", name: "Nina", age: 24, image: "https://picsum.photos/seed/vibe4/400/600", bio: "Startup founder. Morning runs. Strong opinions.", interests: ["Entrepreneurship", "Fitness", "Tech"], vibe: "Hustler" },
];

function SwipeCardDeck({
  cards,
  onEmpty,
  onRequireLogin,
}: {
  cards: VibeCard[];
  onEmpty: () => void;
  onRequireLogin: () => void;
}) {
  const colors = useColors();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeHistory, setSwipeHistory] = useState<string[]>([]);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const handleSwipe = (direction: "left" | "right") => {
    const card = cards[currentIndex];
    setSwipeHistory((h) => [...h, direction === "right" ? card.id : ""]);
    const next = currentIndex + 1;
    if (next >= cards.length) {
      setCurrentIndex(next);
      onEmpty();
    } else {
      setCurrentIndex(next);
    }
    translateX.value = 0;
    translateY.value = 0;
    if (direction === "right") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.2;
    })
    .onEnd((e) => {
      const shouldSwipe =
        Math.abs(translateX.value) > SWIPE_THRESHOLD ||
        Math.abs(e.velocityX) > 600;
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
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const vibeOverlay = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [20, 120], [0, 1]),
  }));

  const skipOverlay = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-120, -20], [1, 0]),
  }));

  const nextCardStyle = useAnimatedStyle(() => {
    const scale = interpolate(Math.abs(translateX.value), [0, W * 0.4], [0.93, 1]);
    const ty = interpolate(Math.abs(translateX.value), [0, W * 0.4], [18, 0]);
    return { transform: [{ scale }, { translateY: ty }] };
  });

  if (currentIndex >= cards.length) {
    return (
      <View style={styles.emptyDeck}>
        <Text style={styles.emptyEmoji}>🎉</Text>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          You've seen everyone!
        </Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
          Check back later for new vibers nearby
        </Text>
        <TouchableOpacity
          onPress={() => setCurrentIndex(0)}
          style={[styles.reloadBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
        >
          <Ionicons name="refresh" size={18} color="#7C3AED" />
          <Text style={[styles.reloadText, { color: colors.foreground }]}>Start Over</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const CARD_HEIGHT = H * 0.56;

  return (
    <View style={styles.deckArea}>
      {cards
        .slice(currentIndex, currentIndex + 3)
        .reverse()
        .map((card, i) => {
          const isTop = i === Math.min(2, cards.length - currentIndex - 1);
          const isNext = i === Math.min(1, cards.length - currentIndex - 2);

          return isTop ? (
            <GestureDetector key={card.id} gesture={panGesture}>
              <Animated.View style={[styles.card, { height: CARD_HEIGHT }, topCardStyle]}>
                <Image
                  source={{ uri: card.image }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.88)"]}
                  style={StyleSheet.absoluteFill}
                />

                <Animated.View style={[styles.overlayVibe, vibeOverlay]}>
                  <Text style={styles.overlayVibeText}>VIBE ✨</Text>
                </Animated.View>
                <Animated.View style={[styles.overlaySkip, skipOverlay]}>
                  <Text style={styles.overlaySkipText}>SKIP</Text>
                </Animated.View>

                <View style={styles.cardBottom}>
                  <View style={styles.cardNameRow}>
                    <Text style={styles.cardName}>{card.name}, {card.age}</Text>
                    {card.distance ? (
                      <View style={styles.distancePill}>
                        <Ionicons name="location" size={11} color="#7C3AED" />
                        <Text style={styles.distanceText}>{card.distance}</Text>
                      </View>
                    ) : card.vibe ? (
                      <View style={[styles.distancePill, { backgroundColor: "rgba(124,58,237,0.3)" }]}>
                        <Text style={[styles.distanceText, { color: "#A78BFA" }]}>{card.vibe}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardBio} numberOfLines={2}>{card.bio}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.interestRow}>
                      {card.interests.map((int) => (
                        <View key={int} style={styles.interestTag}>
                          <Text style={styles.interestText}>{int}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </Animated.View>
            </GestureDetector>
          ) : (
            <Animated.View
              key={card.id}
              style={[styles.card, { height: CARD_HEIGHT }, !isTop && nextCardStyle]}
            >
              <Image
                source={{ uri: card.image }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.88)"]}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          );
        })}

      <View style={styles.actionButtons}>
        <TouchableOpacity
          onPress={() => {
            translateX.value = withTiming(-W * 1.5, { duration: 300 });
            setTimeout(() => handleSwipe("left"), 300);
          }}
          style={[styles.actionCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Ionicons name="close" size={28} color="#EF4444" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            translateX.value = withTiming(W * 1.5, { duration: 300 });
            setTimeout(() => handleSwipe("right"), 300);
          }}
          style={styles.vibeCircle}
        >
          <LinearGradient
            colors={["#7C3AED", "#EA580C"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.vibeGradient}
          >
            <Ionicons name="heart" size={30} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        >
          <Ionicons name="star" size={24} color="#F59E0B" />
        </TouchableOpacity>
      </View>
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
  const [isEmpty, setIsEmpty] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;

  if (!isLoggedIn) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.guestContainer, { paddingTop: topInset + 40 }]}>
          <Text style={styles.guestEmoji}>💜</Text>
          <Text style={[styles.guestTitle, { color: colors.foreground }]}>
            Find Your Vibe
          </Text>
          <Text style={[styles.guestSub, { color: colors.mutedForeground }]}>
            Sign in to discover nearby people and connect with those who share your vibe
          </Text>
          <GradientButton
            onPress={() => router.push("/(auth)/login")}
            title="Sign In to Connect"
            style={{ width: "85%" }}
          />
          <TouchableOpacity onPress={() => router.push("/(auth)/signup")}>
            <Text style={[styles.signupLink, { color: "#7C3AED" }]}>
              Create account →
            </Text>
          </TouchableOpacity>
        </View>
        <LoginPrompt
          visible={showLoginPrompt}
          onClose={() => setShowLoginPrompt(false)}
        />
      </View>
    );
  }

  const cards = activeTab === "nearby" ? NEARBY_CARDS : SAMEVIBE_CARDS;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Find Vibe
        </Text>
        <TouchableOpacity>
          <Ionicons name="options-outline" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {(["nearby", "samevibe"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => { setActiveTab(tab); setIsEmpty(false); }}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
          >
            {activeTab === tab && (
              <LinearGradient
                colors={["#7C3AED", "#EA580C"]}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 1 }}
                style={styles.tabUnderline}
              />
            )}
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? colors.foreground : colors.mutedForeground },
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab === "nearby" ? "📍 Nearby" : "✨ Same Vibe"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SwipeCardDeck
        key={activeTab}
        cards={cards}
        onEmpty={() => setIsEmpty(true)}
        onRequireLogin={() => setShowLoginPrompt(true)}
      />

      <LoginPrompt
        visible={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    marginBottom: 4,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    position: "relative",
  },
  tabBtnActive: {},
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 20,
    right: 20,
    height: 2,
    borderRadius: 1,
  },
  tabText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },
  tabTextActive: {
    fontFamily: "Poppins_700Bold",
  },
  deckArea: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    position: "absolute",
    width: W - 32,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  overlayVibe: {
    position: "absolute",
    top: 24,
    left: 24,
    backgroundColor: "rgba(124,58,237,0.85)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#7C3AED",
  },
  overlayVibeText: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 1,
  },
  overlaySkip: {
    position: "absolute",
    top: 24,
    right: 24,
    backgroundColor: "rgba(239,68,68,0.85)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#EF4444",
  },
  overlaySkipText: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 1,
  },
  cardBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 18,
    gap: 6,
  },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardName: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Poppins_700Bold",
  },
  distancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  distanceText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
  },
  cardBio: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    lineHeight: 18,
  },
  interestRow: {
    flexDirection: "row",
    gap: 6,
  },
  interestTag: {
    backgroundColor: "rgba(124,58,237,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  interestText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
  },
  actionButtons: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 100 : 90,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  actionCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  vibeCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  vibeGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyDeck: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
    paddingBottom: 100,
  },
  emptyEmoji: {
    fontSize: 52,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
  reloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  reloadText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  guestContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  guestEmoji: {
    fontSize: 60,
    marginBottom: 8,
  },
  guestTitle: {
    fontSize: 26,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
  },
  guestSub: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 8,
  },
  signupLink: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    marginTop: 4,
  },
});
