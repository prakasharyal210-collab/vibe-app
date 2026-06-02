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
  Alert,
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
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { CommentsSheet } from "@/components/CommentsSheet";
import { LoginPrompt } from "@/components/LoginPrompt";
import { ShareSheet } from "@/components/ShareSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { checkFavourited, checkLiked, checkReposted, toggleFavourite, toggleLike, toggleRepost } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

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
  views: number;
  sound: string;
  isVerified?: boolean;
}

const MOCK_REELS: Reel[] = [
  { id: "r1", image: "https://picsum.photos/seed/reel1/450/900", username: "luna_sky", caption: "Golden hour hits different 🌅 #sunset #vibes #photography", likes: 124300, comments: 8432, shares: 2910, views: 1240000, sound: "Original Sound · luna_sky", isVerified: true },
  { id: "r2", image: "https://picsum.photos/seed/reel2/450/900", username: "marcus_vibe", caption: "City nights never sleep ✨ #citylife #nightout", likes: 89100, comments: 3421, shares: 1289, views: 892000, sound: "Blinding Lights — The Weeknd" },
  { id: "r3", image: "https://picsum.photos/seed/reel3/450/900", username: "zoe.creates", caption: "Art takes time 🎨 #art #creative #process", likes: 204000, comments: 12840, shares: 8920, views: 2040000, sound: "original sound · zoe.creates", isVerified: true },
  { id: "r4", image: "https://picsum.photos/seed/reel4/450/900", username: "kai_adventures", caption: "Hiking this trail was insane 🏔️ #adventure #nature #hike", likes: 56200, comments: 2341, shares: 892, views: 562000, sound: "Mountain High — Lo-Fi Beats" },
  { id: "r5", image: "https://picsum.photos/seed/reel5/450/900", username: "nadia.official", caption: "Friday mood activated 🎉 #weekend #vibes #fyp", likes: 432100, comments: 24300, shares: 18920, views: 4320000, sound: "Good Days — SZA", isVerified: true },
  { id: "r6", image: "https://picsum.photos/seed/reel6/450/900", username: "alex.w", caption: "New studio session dropped 🎵 #music #studio #producer", likes: 67800, comments: 4320, shares: 1890, views: 678000, sound: "Unreleased · alex.w" },
];

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

let globalSoundOn = true;

interface ReelItemProps {
  reel: Reel;
  isActive: boolean;
  onComplete: () => void;
  onRequireLogin: () => void;
  isLoggedIn: boolean;
  soundOn: boolean;
}

function ReelItem({ reel, isActive, onComplete, onRequireLogin, isLoggedIn, soundOn }: ReelItemProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(reel.likes);
  const [saved, setSaved] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [favourited, setFavourited] = useState(false);

  useEffect(() => {
    if (!userId) return;
    checkLiked(reel.id, userId).then(setLiked).catch(() => {});
    checkReposted(reel.id, userId).then(setReposted).catch(() => {});
    checkFavourited(reel.id, userId).then((v) => { setSaved(v); setFavourited(v); }).catch(() => {});
  }, [reel.id, userId]);
  const [following, setFollowing] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const progress = useSharedValue(0);
  const heartScale = useSharedValue(0);
  const saveScale = useSharedValue(1);
  const lastTap = useRef(0);

  useEffect(() => {
    if (!isActive) { cancelAnimation(progress); progress.value = 0; return; }
    progress.value = withTiming(1, { duration: 12000, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(onComplete)();
    });
    return () => cancelAnimation(progress);
  }, [isActive]);

  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }], opacity: heartScale.value > 0 ? 1 : 0 }));

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (isLoggedIn && !liked) {
        setLiked(true);
        setLikes((l) => l + 1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (!isLoggedIn) {
        onRequireLogin();
      }
      setShowHeart(true);
      heartScale.value = withSequence(
        withTiming(1.5, { duration: 150 }),
        withTiming(0, { duration: 600 })
      );
      setTimeout(() => setShowHeart(false), 800);
    }
    lastTap.current = now;
  };

  const handleLike = () => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    const nowLiked = !liked;
    setLiked(nowLiked);
    setLikes((l) => (nowLiked ? l + 1 : l - 1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (userId) toggleLike(reel.id, userId, nowLiked);
  };

  const handleSave = () => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    const nowSaved = !saved;
    setSaved(nowSaved);
    saveScale.value = withSequence(withSpring(1.3, { damping: 6 }), withSpring(1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (userId) toggleFavourite(reel.id, userId, nowSaved);
  };

  const handleRepost = () => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    const nowR = !reposted;
    setReposted(nowR);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (userId) toggleRepost(reel.id, userId, nowR);
    if (nowR) Alert.alert("Reposted! ↩", "Added to your profile reposts");
  };

  const handleFavourite = () => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    const nowF = !favourited;
    setFavourited(nowF);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (userId) toggleFavourite(reel.id, userId, nowF);
  };

  const handleFollow = () => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    setFollowing((f) => !f);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveStyle = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));

  return (
    <TouchableOpacity activeOpacity={1} onPress={handleTap} style={[styles.reelContainer, { height: SCREEN_HEIGHT }]}>
      <Image source={{ uri: reel.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} style={styles.bottomGradient} />
      <LinearGradient colors={["rgba(0,0,0,0.45)", "transparent"]} style={styles.topGradient} />

      <View style={styles.topBar}>
        <Text style={styles.reelsTitle}>Reels</Text>
        <View style={styles.topRight}>
          <TouchableOpacity onPress={() => router.push("/search")} style={styles.topIconBtn}>
            <Ionicons name="search-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/notifications")} style={styles.topIconBtn}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>
      </View>

      {showHeart && (
        <Animated.View style={[styles.floatingHeart, heartStyle]}>
          <Ionicons name="heart" size={90} color="rgba(255,255,255,0.9)" />
        </Animated.View>
      )}

      <View style={styles.rightActions}>
        <View style={styles.avatarWrap}>
          <UserAvatar username={reel.username} size={44} />
          <TouchableOpacity onPress={handleFollow} style={[styles.followDot, following && { backgroundColor: "#EA580C" }]}>
            <Ionicons name={following ? "checkmark" : "add"} size={12} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={30} color={liked ? "#F97316" : "#fff"} />
          <Text style={styles.actionCount}>{formatCount(likes)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => { if (!isLoggedIn) { onRequireLogin(); return; } setShowComments(true); }}>
          <Ionicons name="chatbubble-outline" size={28} color="#fff" />
          <Text style={styles.actionCount}>{formatCount(reel.comments)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowShare(true)}>
          <Ionicons name="paper-plane-outline" size={28} color="#fff" />
          <Text style={styles.actionCount}>{formatCount(reel.shares)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handleSave}>
          <Animated.View style={saveStyle}>
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={26} color={saved ? "#7C3AED" : "#fff"} />
          </Animated.View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handleRepost}>
          <Ionicons name={reposted ? "repeat" : "repeat-outline"} size={26} color={reposted ? "#10B981" : "#fff"} />
          <Text style={styles.actionCount}>{reposted ? formatCount(reel.shares + 1) : formatCount(reel.shares)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handleFavourite}>
          <Ionicons name={favourited ? "star" : "star-outline"} size={26} color={favourited ? "#EAB308" : "#fff"} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <View style={styles.musicDisc}>
            <UserAvatar username={reel.username} size={36} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomInfo}>
        <View style={styles.usernameRow}>
          <Text style={styles.reelUsername}>@{reel.username}</Text>
          {reel.isVerified && <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />}
        </View>
        <Text style={styles.reelCaption} numberOfLines={2}>{reel.caption}</Text>
        <View style={styles.soundRow}>
          <Ionicons name="musical-notes" size={13} color="rgba(255,255,255,0.8)" />
          <Text style={styles.soundText} numberOfLines={1}>{reel.sound}</Text>
        </View>
        <View style={styles.viewsRow}>
          <Ionicons name="eye-outline" size={13} color="rgba(255,255,255,0.7)" />
          <Text style={styles.viewsText}>{formatCount(reel.views)} views</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.soundToggle}
        onPress={() => {}}
      >
        <Ionicons name={soundOn ? "volume-high" : "volume-mute"} size={20} color="#fff" />
      </TouchableOpacity>

      <CommentsSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        postId={reel.id}
        isLoggedIn={isLoggedIn}
        onRequireLogin={() => { setShowComments(false); onRequireLogin(); }}
      />
      <ShareSheet
        visible={showShare}
        onClose={() => setShowShare(false)}
        contentType="reel"
        username={reel.username}
      />
    </TouchableOpacity>
  );
}

export default function ReelsScreen() {
  const { session } = useAuth();
  const isLoggedIn = !!session;
  const [activeIndex, setActiveIndex] = useState(0);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems[0]) setActiveIndex(viewableItems[0].index ?? 0);
  }, []);

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 60 }), []);

  const handleComplete = useCallback(() => {
    const next = activeIndex + 1;
    if (next < MOCK_REELS.length) flatListRef.current?.scrollToIndex({ index: next, animated: true });
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
        getItemLayout={(_, index) => ({ length: SCREEN_HEIGHT, offset: SCREEN_HEIGHT * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <ReelItem
            reel={item}
            isActive={index === activeIndex}
            onComplete={handleComplete}
            onRequireLogin={() => setShowLoginPrompt(true)}
            isLoggedIn={isLoggedIn}
            soundOn={soundOn}
          />
        )}
      />
      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  reelContainer: { width: W, overflow: "hidden" },
  topGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 130 },
  bottomGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 320 },
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
  reelsTitle: { color: "#fff", fontSize: 18, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
  topRight: { flexDirection: "row", gap: 4 },
  topIconBtn: { padding: 4 },
  progressRow: {
    position: "absolute",
    top: Platform.OS === "web" ? 108 : 90,
    left: 12,
    right: 12,
  },
  progressTrack: { height: 2, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 1, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 1 },
  floatingHeart: { position: "absolute", alignSelf: "center", top: "38%" },
  soundToggle: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 104 : 124,
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  rightActions: {
    position: "absolute",
    right: 12,
    bottom: Platform.OS === "web" ? 108 : 130,
    alignItems: "center",
    gap: 18,
  },
  avatarWrap: { position: "relative" },
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
  actionBtn: { alignItems: "center", gap: 3 },
  actionCount: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  musicDisc: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.5)", overflow: "hidden" },
  bottomInfo: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 100 : 120,
    left: 12,
    right: 80,
    gap: 3,
  },
  usernameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  reelUsername: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  reelCaption: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 18 },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  soundText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Poppins_500Medium" },
  viewsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewsText: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontFamily: "Poppins_400Regular" },
});
