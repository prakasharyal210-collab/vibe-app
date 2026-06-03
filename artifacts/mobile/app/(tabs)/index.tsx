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
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CommentsSheet } from "@/components/CommentsSheet";
import { LoginPrompt } from "@/components/LoginPrompt";
import { ShareSheet } from "@/components/ShareSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { checkFavourited, checkLiked, checkReposted, toggleFavourite, toggleLike, toggleRepost } from "@/lib/db";

const { width: W, height: H } = Dimensions.get("window");
const SCREEN_H = H;

// ─── Types ──────────────────────────────────────────────────────────────────────
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

// ─── Mock data ───────────────────────────────────────────────────────────────────
const MOCK_REELS: Reel[] = [
  { id: "r1", image: "https://picsum.photos/seed/reel1/450/900", username: "luna_sky", caption: "Golden hour hits different 🌅 #sunset #vibes #photography", likes: 124300, comments: 8432, shares: 2910, views: 1240000, sound: "Original Sound · luna_sky", isVerified: true },
  { id: "r2", image: "https://picsum.photos/seed/reel2/450/900", username: "marcus_vibe", caption: "City nights never sleep ✨ #citylife #nightout #aesthetic", likes: 89100, comments: 3421, shares: 1289, views: 892000, sound: "Blinding Lights — The Weeknd" },
  { id: "r3", image: "https://picsum.photos/seed/reel3/450/900", username: "zoe.creates", caption: "Art takes time 🎨 follow the process #art #creative #design", likes: 204000, comments: 12840, shares: 8920, views: 2040000, sound: "original sound · zoe.creates", isVerified: true },
  { id: "r4", image: "https://picsum.photos/seed/reel4/450/900", username: "kai_adventures", caption: "Hiking this trail was insane 🏔️ #adventure #nature #hike #outdoors", likes: 56200, comments: 2341, shares: 892, views: 562000, sound: "Mountain High — Lo-Fi Beats" },
  { id: "r5", image: "https://picsum.photos/seed/reel5/450/900", username: "nadia.official", caption: "Friday mood activated 🎉 #weekend #vibes #fyp #trending", likes: 432100, comments: 24300, shares: 18920, views: 4320000, sound: "Good Days — SZA", isVerified: true },
  { id: "r6", image: "https://picsum.photos/seed/reel6/450/900", username: "alex.w", caption: "New studio session dropped 🎵 #music #studio #producer #hiphop", likes: 67800, comments: 4320, shares: 1890, views: 678000, sound: "Unreleased · alex.w" },
];

const MOCK_FOLLOWING_REELS: Reel[] = [
  { id: "f1", image: "https://picsum.photos/seed/follow1/450/900", username: "alex.w", caption: "Behind the scenes of the new track 🎧 #music #studio", likes: 12300, comments: 432, shares: 210, views: 123000, sound: "Unreleased · alex.w" },
  { id: "f2", image: "https://picsum.photos/seed/follow2/450/900", username: "zoe.creates", caption: "New piece dropping tomorrow 🎨 #art #sneak peek", likes: 8900, comments: 321, shares: 189, views: 89000, sound: "Lofi Chill — Beats", isVerified: true },
];

const TRENDING_SOUNDS = [
  { id: "s1", name: "Good Days", artist: "SZA", uses: "2.1M" },
  { id: "s2", name: "Blinding Lights", artist: "The Weeknd", uses: "5.4M" },
  { id: "s3", name: "Lo-Fi Beats", artist: "ChilledCow", uses: "890K" },
  { id: "s4", name: "Essence", artist: "Wizkid", uses: "1.3M" },
  { id: "s5", name: "Heat Waves", artist: "Glass Animals", uses: "3.2M" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function parseCaption(text: string, onHashtag: (tag: string) => void) {
  const parts = text.split(/(\s*#\w+)/g);
  return parts.map((part, i) => {
    const trimmed = part.trim();
    if (trimmed.startsWith("#")) {
      return (
        <Text
          key={i}
          style={captionStyles.tag}
          onPress={() => onHashtag(trimmed.slice(1))}
        >
          {part}
        </Text>
      );
    }
    return <Text key={i} style={captionStyles.text}>{part}</Text>;
  });
}

const captionStyles = StyleSheet.create({
  text: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 19 },
  tag: { color: "#A78BFA", fontSize: 13, fontFamily: "Poppins_600SemiBold", lineHeight: 19 },
});

// ─── Sounds modal ─────────────────────────────────────────────────────────────────
function SoundsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={soundsStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={soundsStyles.sheet}>
        <View style={soundsStyles.handle} />
        <Text style={soundsStyles.title}>🎵 Trending Sounds</Text>
        {TRENDING_SOUNDS.map((s, i) => (
          <TouchableOpacity key={s.id} style={soundsStyles.row} activeOpacity={0.7}>
            <View style={soundsStyles.rank}>
              <Text style={soundsStyles.rankNum}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={soundsStyles.soundName}>{s.name}</Text>
              <Text style={soundsStyles.soundArtist}>{s.artist} · {s.uses} uses</Text>
            </View>
            <Ionicons name="play-circle-outline" size={28} color="#7C3AED" />
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}
const soundsStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 16 },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17, marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.08)" },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(124,58,237,0.25)", alignItems: "center", justifyContent: "center" },
  rankNum: { color: "#A78BFA", fontFamily: "Poppins_700Bold", fontSize: 12 },
  soundName: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  soundArtist: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 12 },
});

// ─── ReelItem ─────────────────────────────────────────────────────────────────────
interface ReelItemProps {
  reel: Reel;
  isActive: boolean;
  onComplete: () => void;
  onRequireLogin: () => void;
  isLoggedIn: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
}

function ReelItem({ reel, isActive, onComplete, onRequireLogin, isLoggedIn, soundOn, onToggleSound }: ReelItemProps) {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id;

  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(reel.likes);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [paused, setPaused] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [slowMo, setSlowMo] = useState(false);

  // animations
  const progress = useSharedValue(0);
  const heartScale = useSharedValue(0);
  const saveScale = useSharedValue(1);
  const pauseOpacity = useSharedValue(0);
  const marqueeX = useSharedValue(0);

  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const pausedAtRef = useRef(0);

  // Supabase checks
  useEffect(() => {
    if (!userId) return;
    checkLiked(reel.id, userId).then(setLiked).catch(() => {});
    checkFavourited(reel.id, userId).then(setSaved).catch(() => {});
  }, [reel.id, userId]);

  // Progress bar animation
  useEffect(() => {
    if (!isActive || paused) {
      cancelAnimation(progress);
      return;
    }
    const remaining = 1 - pausedAtRef.current;
    const duration = remaining * 14000;
    progress.value = withTiming(1, { duration, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(onComplete)();
    });
    return () => cancelAnimation(progress);
  }, [isActive, paused]);

  // Track progress when pausing
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as any }));

  // Sound marquee
  useEffect(() => {
    if (!isActive) { cancelAnimation(marqueeX); marqueeX.value = 0; return; }
    marqueeX.value = withRepeat(
      withTiming(-180, { duration: 9000, easing: Easing.linear }),
      -1, false
    );
    return () => { cancelAnimation(marqueeX); };
  }, [isActive]);
  const marqueeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: marqueeX.value }] }));

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartScale.value > 0 ? 1 : 0,
  }));
  const saveStyle = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));
  const pauseStyle = useAnimatedStyle(() => ({ opacity: pauseOpacity.value }));

  const doLike = useCallback(() => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    setLiked(true);
    setLikes((l) => l + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    heartScale.value = withSequence(
      withTiming(1.5, { duration: 150 }),
      withTiming(0, { duration: 600 })
    );
    if (userId) toggleLike(reel.id, userId, true);
  }, [isLoggedIn, userId, reel.id]);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      // Double tap → like
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      doLike();
    } else {
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        // Single tap → pause / play
        setPaused((p) => {
          const next = !p;
          if (next) {
            pausedAtRef.current = progress.value;
            pauseOpacity.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 800, easing: Easing.out(Easing.quad) }));
          }
          return next;
        });
      }, 350);
    }
    lastTap.current = now;
  }, [doLike, progress]);

  const handleLike = useCallback(() => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    const nowLiked = !liked;
    setLiked(nowLiked);
    setLikes((l) => nowLiked ? l + 1 : l - 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (userId) toggleLike(reel.id, userId, nowLiked);
  }, [liked, isLoggedIn, userId, reel.id]);

  const handleSave = useCallback(() => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    const nowSaved = !saved;
    setSaved(nowSaved);
    saveScale.value = withSequence(withSpring(1.3, { damping: 6 }), withSpring(1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (userId) toggleFavourite(reel.id, userId, nowSaved);
  }, [saved, isLoggedIn, userId, reel.id]);

  const handleFollow = useCallback(() => {
    if (!isLoggedIn) { onRequireLogin(); return; }
    setFollowing((f) => !f);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isLoggedIn]);

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom + 56;

  return (
    <Pressable
      style={[S.reelContainer, { height: SCREEN_H }]}
      onPress={handlePress}
      onLongPress={() => {
        setSlowMo(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => setSlowMo(false), 2000);
      }}
      delayLongPress={400}
    >
      {/* Background image */}
      <Image
        source={{ uri: reel.image }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
        priority={isActive ? "high" : "normal"}
      />

      {/* Slow-mo overlay */}
      {slowMo && (
        <View style={S.slowMoBanner}>
          <Text style={S.slowMoText}>🐢 Slow Motion</Text>
        </View>
      )}

      {/* Gradients */}
      <LinearGradient colors={["rgba(0,0,0,0.55)", "transparent"]} style={[S.topGrad, { height: topPad + 100 }]} />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} style={[S.bottomGrad, { height: bottomPad + 260 }]} />

      {/* Floating heart on double tap */}
      <Animated.View style={[S.floatingHeart, heartStyle]} pointerEvents="none">
        <Ionicons name="heart" size={100} color="rgba(255,255,255,0.92)" />
      </Animated.View>

      {/* Pause indicator */}
      <Animated.View style={[S.pauseIndicator, pauseStyle]} pointerEvents="none">
        <Ionicons name={paused ? "pause" : "play"} size={64} color="rgba(255,255,255,0.7)" />
      </Animated.View>

      {/* ── Right actions ─────────────────────────────────────────────────── */}
      <View style={[S.rightActions, { bottom: bottomPad + 8 }]}>
        {/* Creator avatar + follow */}
        <TouchableOpacity
          onPress={() => router.push(`/profile/${reel.username}` as any)}
          style={S.creatorAvatar}
        >
          <View style={S.avatarRing}>
            <UserAvatar username={reel.username} size={44} />
          </View>
          <TouchableOpacity onPress={handleFollow} style={[S.followDot, following && { backgroundColor: "#EA580C" }]}>
            <Ionicons name={following ? "checkmark" : "add"} size={12} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Like */}
        <TouchableOpacity style={S.actionBtn} onPress={handleLike} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={32} color={liked ? "#F43F5E" : "#fff"} />
          <Text style={S.actionCount}>{fmt(likes)}</Text>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity
          style={S.actionBtn}
          onPress={() => { if (!isLoggedIn) { onRequireLogin(); return; } setShowComments(true); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chatbubble-outline" size={30} color="#fff" />
          <Text style={S.actionCount}>{fmt(reel.comments)}</Text>
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity style={S.actionBtn} onPress={() => setShowShare(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="paper-plane-outline" size={28} color="#fff" />
          <Text style={S.actionCount}>{fmt(reel.shares)}</Text>
        </TouchableOpacity>

        {/* Save */}
        <TouchableOpacity style={S.actionBtn} onPress={handleSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Animated.View style={saveStyle}>
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={28} color={saved ? "#7C3AED" : "#fff"} />
          </Animated.View>
        </TouchableOpacity>

        {/* Super like ⭐ */}
        <TouchableOpacity
          style={S.actionBtn}
          onPress={() => { if (!isLoggedIn) { onRequireLogin(); return; } Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="star-outline" size={28} color="#EAB308" />
        </TouchableOpacity>

        {/* More ··· */}
        <TouchableOpacity style={S.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Spinning music disc */}
        <TouchableOpacity style={S.musicDisc} onPress={() => router.push("/search" as any)}>
          <UserAvatar username={reel.username} size={36} />
          <View style={S.musicNote}>
            <Ionicons name="musical-note" size={10} color="#fff" />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Bottom info ──────────────────────────────────────────────────── */}
      <View style={[S.bottomInfo, { bottom: bottomPad + 8 }]}>
        {/* Username */}
        <TouchableOpacity
          onPress={() => router.push(`/profile/${reel.username}` as any)}
          style={S.usernameRow}
        >
          <Text style={S.username}>@{reel.username}</Text>
          {reel.isVerified && <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />}
        </TouchableOpacity>

        {/* Caption with expandable + hashtags */}
        <TouchableOpacity activeOpacity={0.8} onPress={() => setCaptionExpanded((e) => !e)}>
          <Text style={S.caption} numberOfLines={captionExpanded ? undefined : 2}>
            {parseCaption(reel.caption, (tag) => router.push(`/search?q=%23${tag}` as any))}
          </Text>
          {!captionExpanded && (
            <Text style={S.moreText}>...more</Text>
          )}
        </TouchableOpacity>

        {/* Sound row - marquee */}
        <TouchableOpacity style={S.soundRow} activeOpacity={0.7}>
          <Ionicons name="musical-notes" size={13} color="rgba(255,255,255,0.8)" />
          <View style={S.soundMarqueeClip}>
            <Animated.Text style={[S.soundText, marqueeStyle]} numberOfLines={1}>
              {reel.sound} · {reel.sound} · {reel.sound} ·{"  "}
            </Animated.Text>
          </View>
        </TouchableOpacity>

        {/* Views */}
        <View style={S.viewsRow}>
          <Text style={S.viewsText}>👁️ {fmt(reel.views)} views</Text>
        </View>
      </View>

      {/* ── Sound toggle (bottom left) ──────────────────────────────────── */}
      <TouchableOpacity style={[S.soundToggle, { bottom: bottomPad + 8 }]} onPress={onToggleSound}>
        <Ionicons name={soundOn ? "volume-high" : "volume-mute"} size={18} color="#fff" />
      </TouchableOpacity>

      {/* ── Progress bar (very bottom) ──────────────────────────────────── */}
      <View style={[S.progressWrap, { bottom: Platform.OS === "web" ? 84 : insets.bottom }]}>
        <View style={S.progressTrack}>
          <Animated.View style={[S.progressFill, progressStyle]} />
        </View>
      </View>

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
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────────
export default function ReelsScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const isLoggedIn = !!session;

  const [feedTab, setFeedTab] = useState<"foryou" | "following">("foryou");
  const [activeIndex, setActiveIndex] = useState(0);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [showSounds, setShowSounds] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const reels = feedTab === "foryou" ? MOCK_REELS : MOCK_FOLLOWING_REELS;

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems[0]) setActiveIndex(viewableItems[0].index ?? 0);
  }, []);

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 60 }), []);

  const handleComplete = useCallback(() => {
    const next = activeIndex + 1;
    if (next < reels.length) flatListRef.current?.scrollToIndex({ index: next, animated: true });
  }, [activeIndex, reels.length]);

  const switchTab = (tab: "foryou" | "following") => {
    setFeedTab(tab);
    setActiveIndex(0);
    setTimeout(() => flatListRef.current?.scrollToIndex({ index: 0, animated: false }), 50);
  };

  const topPad = Platform.OS === "web" ? 20 : insets.top;

  return (
    <View style={S.container}>
      <FlatList
        ref={flatListRef}
        data={reels}
        keyExtractor={(item) => item.id + feedTab}
        snapToInterval={SCREEN_H}
        snapToAlignment="start"
        decelerationRate="fast"
        pagingEnabled
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={5}
        renderItem={({ item, index }) => (
          <ReelItem
            reel={item}
            isActive={index === activeIndex}
            onComplete={handleComplete}
            onRequireLogin={() => setShowLoginPrompt(true)}
            isLoggedIn={isLoggedIn}
            soundOn={soundOn}
            onToggleSound={() => setSoundOn((s) => !s)}
          />
        )}
        ListEmptyComponent={() => (
          <View style={[S.emptyState, { height: SCREEN_H }]}>
            <Text style={S.emptyEmoji}>🎬</Text>
            <Text style={S.emptyTitle}>No reels yet</Text>
            <Text style={S.emptySub}>Be the first to post a reel!</Text>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/create" as any)}
              style={S.emptyBtn}
            >
              <Text style={S.emptyBtnText}>Create Reel →</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* ── Fixed top bar ───────────────────────────────────────────────── */}
      <View style={[S.topBar, { paddingTop: topPad + 6 }]} pointerEvents="box-none">
        {/* Following / For You tabs */}
        <View style={S.topTabs}>
          <TouchableOpacity onPress={() => switchTab("following")} style={S.topTabBtn}>
            <Text style={[S.topTabText, feedTab === "following" && S.topTabTextActive]}>Following</Text>
            {feedTab === "following" && <View style={S.topTabUnderline} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => switchTab("foryou")} style={S.topTabBtn}>
            <Text style={[S.topTabText, feedTab === "foryou" && S.topTabTextActive]}>For You</Text>
            {feedTab === "foryou" && <View style={S.topTabUnderline} />}
          </TouchableOpacity>
        </View>

        {/* Right icons */}
        <View style={S.topRight}>
          <TouchableOpacity onPress={() => router.push("/search")} style={S.topIconBtn}>
            <Ionicons name="search-outline" size={23} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSounds(true)} style={S.topIconBtn}>
            <Ionicons name="musical-notes-outline" size={23} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
      <SoundsModal visible={showSounds} onClose={() => setShowSounds(false)} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  // reel
  reelContainer: { width: W, overflow: "hidden", backgroundColor: "#000" },
  topGrad: { position: "absolute", top: 0, left: 0, right: 0 },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0 },

  // overlays
  floatingHeart: { position: "absolute", alignSelf: "center", top: "38%" },
  pauseIndicator: { position: "absolute", alignSelf: "center", top: "42%" },
  slowMoBanner: {
    position: "absolute", top: "45%", alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, zIndex: 99,
  },
  slowMoText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },

  // top bar
  topBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    zIndex: 20,
  },
  topTabs: { flexDirection: "row", gap: 20 },
  topTabBtn: { alignItems: "center", paddingBottom: 2 },
  topTabText: { color: "rgba(255,255,255,0.55)", fontSize: 16, fontFamily: "Poppins_600SemiBold" },
  topTabTextActive: { color: "#fff", fontFamily: "Poppins_700Bold" },
  topTabUnderline: { width: "100%", height: 2, backgroundColor: "#fff", borderRadius: 1, marginTop: 2 },
  topRight: { flexDirection: "row", gap: 4 },
  topIconBtn: { padding: 6 },

  // right actions
  rightActions: {
    position: "absolute",
    right: 10,
    alignItems: "center",
    gap: 20,
  },
  creatorAvatar: { alignItems: "center" },
  avatarRing: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: "#fff", overflow: "hidden" },
  followDot: {
    position: "absolute",
    bottom: -8,
    alignSelf: "center",
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#7C3AED",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#000",
  },
  actionBtn: { alignItems: "center", gap: 3 },
  actionCount: {
    color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold",
    textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  musicDisc: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.4)",
    overflow: "hidden",
    position: "relative",
  },
  musicNote: {
    position: "absolute", bottom: 2, right: 2,
    backgroundColor: "#000", borderRadius: 6, padding: 1,
  },

  // bottom info
  bottomInfo: {
    position: "absolute",
    left: 14,
    right: 70,
    gap: 4,
  },
  usernameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  username: {
    color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold",
    textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  caption: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 19 },
  moreText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Poppins_500Medium" },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  soundMarqueeClip: { flex: 1, overflow: "hidden" },
  soundText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Poppins_500Medium", width: 600 },
  viewsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewsText: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "Poppins_400Regular" },

  // sound toggle
  soundToggle: {
    position: "absolute",
    left: 14,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },

  // progress bar
  progressWrap: {
    position: "absolute",
    left: 0, right: 0,
    paddingHorizontal: 0,
  },
  progressTrack: { height: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff" },

  // empty state
  emptyState: { width: W, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { color: "#fff", fontSize: 22, fontFamily: "Poppins_700Bold" },
  emptySub: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "Poppins_400Regular" },
  emptyBtn: { backgroundColor: "#7C3AED", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  emptyBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
});
