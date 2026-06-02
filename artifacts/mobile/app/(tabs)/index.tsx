import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { LoginPrompt } from "@/components/LoginPrompt";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";

const { width: W, height: H } = Dimensions.get("window");
const SCREEN_HEIGHT = H;

interface Reel {
  id: string;
  image: string;
  username: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  sound: string;
}

const MOCK_REELS: Reel[] = [
  {
    id: "r1",
    image: "https://picsum.photos/seed/reel1/450/900",
    username: "luna_sky",
    caption: "Golden hour hits different 🌅 #sunset #vibes #photography",
    likes: 124300,
    comments: 8432,
    shares: 2910,
    sound: "Original Sound · luna_sky",
  },
  {
    id: "r2",
    image: "https://picsum.photos/seed/reel2/450/900",
    username: "marcus_vibe",
    caption: "City nights never sleep ✨ #citylife #nightout",
    likes: 89100,
    comments: 3421,
    shares: 1289,
    sound: "Blinding Lights — The Weeknd",
  },
  {
    id: "r3",
    image: "https://picsum.photos/seed/reel3/450/900",
    username: "zoe.creates",
    caption: "Art takes time 🎨 #art #creative #process",
    likes: 204000,
    comments: 12840,
    shares: 8920,
    sound: "original sound · zoe.creates",
  },
  {
    id: "r4",
    image: "https://picsum.photos/seed/reel4/450/900",
    username: "kai_adventures",
    caption: "Hiking this trail was insane 🏔️ #adventure #nature #hike",
    likes: 56200,
    comments: 2341,
    shares: 892,
    sound: "Mountain High — Lo-Fi Beats",
  },
  {
    id: "r5",
    image: "https://picsum.photos/seed/reel5/450/900",
    username: "nadia.official",
    caption: "Friday mood activated 🎉 #weekend #vibes #fyp",
    likes: 432100,
    comments: 24300,
    shares: 18920,
    sound: "Good Days — SZA",
  },
  {
    id: "r6",
    image: "https://picsum.photos/seed/reel6/450/900",
    username: "alex.w",
    caption: "New studio session dropped 🎵 #music #studio #producer",
    likes: 67800,
    comments: 4320,
    shares: 1890,
    sound: "Unreleased · alex.w",
  },
];

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface ReelItemProps {
  reel: Reel;
  isActive: boolean;
  onComplete: () => void;
  onRequireLogin: () => void;
  isLoggedIn: boolean;
}

function ReelItem({ reel, isActive, onComplete, onRequireLogin, isLoggedIn }: ReelItemProps) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(reel.likes);
  const [showHeart, setShowHeart] = useState(false);
  const progress = useSharedValue(0);
  const heartScale = useSharedValue(0);
  const lastTap = useRef(0);

  useEffect(() => {
    if (!isActive) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = withTiming(
      1,
      { duration: 12000, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(onComplete)();
      }
    );
    return () => cancelAnimation(progress);
  }, [isActive]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartScale.value,
  }));

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      handleLike();
      setShowHeart(true);
      heartScale.value = withTiming(1.5, { duration: 150 }, () => {
        heartScale.value = withTiming(0, { duration: 600 });
        runOnJS(setShowHeart)(false);
      });
    }
    lastTap.current = now;
  };

  const handleLike = () => {
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    const nowLiked = !liked;
    setLiked(nowLiked);
    setLikes((l) => (nowLiked ? l + 1 : l - 1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handleTap}
      style={[styles.reelContainer, { height: SCREEN_HEIGHT }]}
    >
      <Image
        source={{ uri: reel.image }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        style={styles.bottomGradient}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.4)", "transparent"]}
        style={styles.topGradient}
      />

      <View style={styles.topBar}>
        <Text style={styles.reelsTitle}>Reels</Text>
        <TouchableOpacity>
          <Ionicons name="search-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>
      </View>

      <Animated.View style={[styles.floatingHeart, heartStyle]}>
        <Ionicons name="heart" size={90} color="rgba(255,255,255,0.9)" />
      </Animated.View>

      <View style={styles.rightActions}>
        <View style={styles.profilePicWrap}>
          <UserAvatar username={reel.username} size={44} />
          <View style={styles.followDot}>
            <Ionicons name="add" size={12} color="#fff" />
          </View>
        </View>

        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={30}
            color={liked ? "#F97316" : "#fff"}
          />
          <Text style={styles.actionCount}>{formatCount(likes)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => !isLoggedIn && onRequireLogin()}
        >
          <Ionicons name="chatbubble-outline" size={28} color="#fff" />
          <Text style={styles.actionCount}>{formatCount(reel.comments)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => !isLoggedIn && onRequireLogin()}
        >
          <Ionicons name="paper-plane-outline" size={28} color="#fff" />
          <Text style={styles.actionCount}>{formatCount(reel.shares)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <View style={styles.musicDisc}>
            <UserAvatar username={reel.username} size={36} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomInfo}>
        <Text style={styles.reelUsername}>@{reel.username}</Text>
        <Text style={styles.reelCaption} numberOfLines={2}>
          {reel.caption}
        </Text>
        <View style={styles.soundRow}>
          <Ionicons name="musical-notes" size={13} color="rgba(255,255,255,0.8)" />
          <Text style={styles.soundText} numberOfLines={1}>
            {reel.sound}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ReelsScreen() {
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const [activeIndex, setActiveIndex] = useState(0);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: any[] }) => {
      if (viewableItems[0]) {
        setActiveIndex(viewableItems[0].index ?? 0);
      }
    },
    []
  );

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 60 }),
    []
  );

  const handleComplete = useCallback(() => {
    const nextIndex = activeIndex + 1;
    if (nextIndex < MOCK_REELS.length) {
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }
  }, [activeIndex]);

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={MOCK_REELS}
        keyExtractor={(item) => item.id}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        pagingEnabled
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <ReelItem
            reel={item}
            isActive={index === activeIndex}
            onComplete={handleComplete}
            onRequireLogin={() => setShowLoginPrompt(true)}
            isLoggedIn={isLoggedIn}
          />
        )}
        scrollEnabled={!!MOCK_REELS.length}
      />
      <LoginPrompt
        visible={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  reelContainer: {
    width: W,
    overflow: "hidden",
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  topBar: {
    position: "absolute",
    top: Platform.OS === "web" ? 72 : 54,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  reelsTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 1,
  },
  progressRow: {
    position: "absolute",
    top: Platform.OS === "web" ? 110 : 96,
    left: 12,
    right: 12,
  },
  progressTrack: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 1,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 1,
  },
  floatingHeart: {
    position: "absolute",
    alignSelf: "center",
    top: "40%",
  },
  rightActions: {
    position: "absolute",
    right: 12,
    bottom: Platform.OS === "web" ? 100 : 120,
    alignItems: "center",
    gap: 18,
  },
  profilePicWrap: {
    position: "relative",
  },
  followDot: {
    position: "absolute",
    bottom: -6,
    alignSelf: "center",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  actionBtn: {
    alignItems: "center",
    gap: 3,
  },
  actionCount: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  musicDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    overflow: "hidden",
  },
  bottomInfo: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 92 : 112,
    left: 12,
    right: 80,
  },
  reelUsername: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  reelCaption: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    lineHeight: 18,
    marginBottom: 6,
  },
  soundRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  soundText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
  },
});
