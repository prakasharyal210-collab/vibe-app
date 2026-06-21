import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { timeAgo } from "@/lib/supabase";
import { CreateStorySheet, PendingStory, PostedStoryViewer } from "./CreateStorySheet";
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
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
  cancelAnimation,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "./UserAvatar";

const { width: W, height: H } = Dimensions.get("window");


const REACTIONS = ["❤️", "🔥", "😍", "😂", "😮", "👏"];

export interface Story {
  id: string;
  username: string;
  isOwn?: boolean;
  image?: string;
  hasNew?: boolean;
  isOnline?: boolean;
  userId?: string;
  hasExistingStory?: boolean;
  storyType?: string;
  textContent?: string;
  bgGradient?: string;
  caption?: string;
  created_at?: string;
  mentions?: Array<{ userId: string; username: string; x: number; y: number }>;
}

// ─── Progress bar ────────────────────────────────────────────────────────────
function StoryProgressBar({ total, current, progress }: { total: number; current: number; progress: SharedValue<number> }) {
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as any,
  }));
  return (
    <View style={viewerStyles.progressContainer}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={viewerStyles.progressSegWrap}>
          <View style={[viewerStyles.progressSeg, { backgroundColor: i < current ? "#fff" : "rgba(255,255,255,0.3)" }]} />
          {i === current && <Animated.View style={[viewerStyles.progressFill, progressStyle]} />}
        </View>
      ))}
    </View>
  );
}

// ─── Story Viewer ─────────────────────────────────────────────────────────────
interface StoryViewerProps {
  stories: Story[];
  startIndex: number;
  onClose: () => void;
}

function StoryViewer({ stories, startIndex, onClose }: StoryViewerProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  // Include own story when they have an existing one; exclude non-own stories
  // that have no usable content (no image for media stories, no text for text stories).
  const viewable = stories.filter((s) => {
    if (s.isOwn) return s.hasExistingStory;
    const isText = s.storyType === "text" || (!!s.textContent && !s.image);
    return isText ? !!s.textContent : !!s.image;
  });
  const [current, setCurrent] = useState(Math.max(0, startIndex));
  const [reacted, setReacted] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const progress = useSharedValue(0);
  const floatScale = useSharedValue(0.3);
  const floatOpacity = useSharedValue(0);
  const floatY = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useSharedValue(0);

  const story = viewable[current];
  const isTextStory = story?.storyType === "text" || (!!story?.textContent && !story?.image);
  const storyImage = story?.image ?? "";
  const caption = story?.caption ?? "";
  const bgColors: [string, string] = story?.bgGradient
    ? (story.bgGradient.split(",").slice(0, 2) as [string, string])
    : ["#7C3AED", "#EA580C"];

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const startTimer = () => {
    clearTimer();
    progress.value = 0;
    progress.value = withTiming(1, { duration: 5000 });
    timerRef.current = setTimeout(() => advance(), 5000);
  };

  // Cancel all Reanimated animations on unmount so dangling frame callbacks
  // don't cause "Object is not a function" in rafCallback on Android.
  useEffect(() => {
    return () => {
      clearTimer();
      cancelAnimation(progress);
      cancelAnimation(translateY);
    };
  }, []);

  useEffect(() => {
    startTimer();
    // Record view for non-own, non-placeholder stories — fire-and-forget so it
    // never blocks the UI. The upsert on the server means repeated opens don't
    // create duplicate rows (only viewed_at is updated).
    const viewerId = session?.user?.id;
    const sid = story?.id;
    if (viewerId && sid && sid !== "own_placeholder" && !story?.isOwn) {
      fetch(`${API_BASE}/stories/${sid}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: viewerId }),
      }).catch(() => {});
    }
    return clearTimer;
  }, [current]);

  const advance = () => {
    clearTimer();
    if (current < viewable.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      onClose();
    }
  };

  const goBack = () => {
    clearTimer();
    if (current > 0) {
      setCurrent((c) => c - 1);
    } else {
      startTimer();
    }
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 800) {
        translateY.value = withTiming(H, { duration: 250 }, () => runOnJS(onClose)());
      } else {
        translateY.value = withTiming(0, { duration: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ scale: floatScale.value }, { translateY: floatY.value }],
    opacity: floatOpacity.value,
  }));

  const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

  const react = (emoji: string) => {
    setReacted(emoji);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // ── Float animation: pop up then float & fade ────────────────────────────
    floatScale.value = 0.3;
    floatOpacity.value = 1;
    floatY.value = 0;
    floatScale.value = withSpring(1.8, { damping: 10, stiffness: 220 });
    floatY.value = withDelay(150, withTiming(-100, { duration: 750 }));
    floatOpacity.value = withDelay(150, withTiming(0, { duration: 750 }, (finished) => {
      if (finished) runOnJS(setReacted)(null);
    }));

    // ── Persist to backend (fire-and-forget) ────────────────────────────────
    const viewerId = session?.user?.id;
    const storyId = story?.id;
    if (viewerId && storyId && storyId !== "own_placeholder" && !story?.isOwn) {
      fetch(`${API_BASE}/stories/${storyId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: viewerId, emoji }),
      }).catch(() => { /* silent — reaction animation already shown */ });
    }
  };

  if (!story) return null;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[viewerStyles.container, sheetStyle]}>
        {isTextStory ? (
          <>
            <LinearGradient colors={bgColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={viewerStyles.textStoryContent} pointerEvents="none">
              <Text style={viewerStyles.textStoryText}>{story.textContent}</Text>
            </View>
          </>
        ) : (
          <>
            {/* Blurred background — same image scaled to fill, then diffused */}
            <Image source={{ uri: storyImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
            {/* Sharp foreground — full image, no cropping */}
            <Image source={{ uri: storyImage }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            <LinearGradient
              colors={["rgba(0,0,0,0.55)", "transparent", "transparent", "rgba(0,0,0,0.65)"]}
              style={StyleSheet.absoluteFill}
            />
          </>
        )}

        <StoryProgressBar total={viewable.length} current={current} progress={progress} />

        <View style={[viewerStyles.topBar, { paddingTop: Platform.OS === "web" ? 20 : insets.top + 8 }]}>
          <TouchableOpacity
            style={viewerStyles.userRow}
            activeOpacity={0.8}
            onPress={() => {
              onClose();
              setTimeout(() => router.push(`/profile/${story.username}` as any), 280);
            }}
          >
            <View style={viewerStyles.viewerAvatarWrap}>
              <UserAvatar username={story.username} size={36} />
              {story.isOnline && <View style={viewerStyles.onlineDot} />}
            </View>
            <View>
              <Text style={viewerStyles.username}>{story.username}</Text>
              <Text style={viewerStyles.timeAgo}>{story?.created_at ? timeAgo(story.created_at) : ""}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={viewerStyles.closeBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Tap zones */}
        <View style={viewerStyles.tapZones}>
          <TouchableOpacity style={viewerStyles.tapLeft} onPress={goBack} activeOpacity={1} />
          <TouchableOpacity style={viewerStyles.tapRight} onPress={advance} activeOpacity={1} />
        </View>

        {caption ? (
          <View style={viewerStyles.captionBox} pointerEvents="none">
            <Text style={viewerStyles.captionText}>{caption}</Text>
          </View>
        ) : null}

        {/* Mention stickers — tap to visit profile */}
        {story.mentions?.map((m, idx) => (
          <TouchableOpacity
            key={m.userId + idx}
            style={[viewerStyles.mentionBubble, { left: m.x, top: m.y }]}
            onPress={() => {
              onClose();
              setTimeout(() => router.push(`/profile/${m.username}` as any), 280);
            }}
          >
            <BlurView intensity={60} tint="dark" style={viewerStyles.mentionBubbleInner}>
              <Ionicons name="at" size={11} color="#fff" />
              <Text style={viewerStyles.mentionBubbleText}>{m.username}</Text>
            </BlurView>
          </TouchableOpacity>
        ))}

        {reacted && (
          <Animated.View style={[viewerStyles.reactedBubble, floatStyle]} pointerEvents="none">
            <Text style={viewerStyles.reactedEmoji}>{reacted}</Text>
          </Animated.View>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={viewerStyles.bottomArea}
        >
          <View style={viewerStyles.reactionRow}>
            {REACTIONS.map((emoji) => (
              <TouchableOpacity key={emoji} onPress={() => react(emoji)} style={viewerStyles.reactionBtn}>
                <Text style={viewerStyles.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={viewerStyles.replyRow}>
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder={`Reply to ${story.username}...`}
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={viewerStyles.replyInput}
            />
            <TouchableOpacity
              onPress={() => { if (reply.trim()) { setReply(""); } }}
              style={viewerStyles.sendBtn}
            >
              <Ionicons name="send" size={20} color={reply.trim() ? "#8B5CF6" : "rgba(255,255,255,0.4)"} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </GestureDetector>
  );
}

const viewerStyles = StyleSheet.create({
  container: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000", zIndex: 200 },
  progressContainer: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: "row", paddingHorizontal: 8,
    paddingTop: Platform.OS === "web" ? 12 : 52, gap: 4,
  },
  progressSegWrap: {
    flex: 1, height: 2.5, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden", position: "relative",
  },
  progressSeg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  progressFill: { position: "absolute", top: 0, left: 0, bottom: 0, backgroundColor: "#fff" },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, zIndex: 10,
  },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  viewerAvatarWrap: { position: "relative" },
  onlineDot: {
    position: "absolute", bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "#22C55E", borderWidth: 1.5, borderColor: "#000",
  },
  username: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  timeAgo: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_400Regular", fontSize: 11 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center",
  },
  tapZones: { ...StyleSheet.absoluteFillObject as any, flexDirection: "row" },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },
  captionBox: { position: "absolute", bottom: 160, left: 0, right: 0, paddingHorizontal: 20 },
  captionText: {
    color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 16,
    textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4, textAlign: "center",
  },
  reactedBubble: {
    position: "absolute", top: "40%", alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 40, padding: 16,
  },
  reactedEmoji: { fontSize: 48 },
  bottomArea: { position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: Platform.OS === "web" ? 20 : 32 },
  reactionRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: 10, paddingHorizontal: 14 },
  reactionBtn: { backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 22, padding: 9 },
  reactionEmoji: { fontSize: 22 },
  replyRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 8 },
  emojiToggle: { padding: 4 },
  replyInput: {
    flex: 1, height: 42, backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 21, paddingHorizontal: 16, color: "#fff",
    fontFamily: "Poppins_400Regular", fontSize: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center",
  },
  textStoryContent: {
    ...StyleSheet.absoluteFillObject as any,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  textStoryText: {
    color: "#fff",
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    lineHeight: 38,
  },
  mentionBubble: { position: "absolute", zIndex: 15 },
  mentionBubbleInner: {
    flexDirection: "row" as const, alignItems: "center" as const, gap: 3,
    borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, overflow: "hidden" as const,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
  },
  mentionBubbleText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
});

// ─── Story circle item ────────────────────────────────────────────────────────
function StoryItem({ story, onPress }: { story: Story; onPress: () => void }) {
  const colors = useColors();
  const label = story.isOwn
    ? "Your Story"
    : story.username.length > 8
    ? story.username.slice(0, 8) + "…"
    : story.username;

  return (
    <TouchableOpacity style={S.storyItem} activeOpacity={0.8} onPress={onPress}>
      {story.isOwn ? (
        /* ── Own story circle ── */
        <View style={S.ownWrap}>
          {story.hasExistingStory ? (
            <LinearGradient
              colors={colors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={S.ring}
            >
              <View style={[S.inner, { backgroundColor: colors.background }]}>
                <UserAvatar username={story.username} size={52} />
              </View>
            </LinearGradient>
          ) : (
            <View style={[S.ring, S.ringGrey]}>
              <View style={[S.inner, { backgroundColor: colors.background }]}>
                <UserAvatar username={story.username} size={52} />
              </View>
            </View>
          )}
          <View style={S.addBadge}>
            <Ionicons name={story.hasExistingStory ? "eye-outline" : "add"} size={12} color="#fff" />
          </View>
        </View>
      ) : story.hasNew !== false ? (
        /* ── Unseen story: gradient ring ── */
        <View style={S.ownWrap}>
          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={S.ring}
          >
            <View style={[S.inner, { backgroundColor: colors.background }]}>
              <UserAvatar username={story.username} size={52} />
            </View>
          </LinearGradient>
          {story.isOnline && <View style={S.onlineDot} />}
        </View>
      ) : (
        /* ── Seen story: grey ring ── */
        <View style={S.ownWrap}>
          <View style={[S.ring, S.ringGrey]}>
            <View style={[S.inner, { backgroundColor: colors.background }]}>
              <UserAvatar username={story.username} size={52} />
            </View>
          </View>
          {story.isOnline && <View style={S.onlineDot} />}
        </View>
      )}
      <Text style={[S.label, { color: colors.foreground }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Public StoryRow ─────────────────────────────────────────────────────────
export function StoryRow({ stories, userId, onStoryCreated }: { stories: Story[]; userId?: string; onStoryCreated?: () => void }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [ownViewerOpen, setOwnViewerOpen] = useState(false);
  const [ownStoryPending, setOwnStoryPending] = useState<PendingStory | null>(null);
  const [ownStoryId, setOwnStoryId] = useState<string | null>(null);

  const ownUsername = stories.find((s) => s.isOwn)?.username ?? "";

  // Viewable list mirrors the filter used inside StoryViewer
  const viewable = stories.filter((s) => !s.isOwn || s.hasExistingStory);

  const openStory = (index: number) => {
    const story = stories[index];
    if (story.isOwn) {
      // Use story.id as the authoritative signal — fetchFriendStories sets a real
      // UUID as id only when a story was found; otherwise it stays "own_placeholder".
      // hasExistingStory is checked as a fallback for cases where id is missing.
      const hasRealStory =
        (typeof story.id === "string" && story.id.length > 0 && story.id !== "own_placeholder") ||
        story.hasExistingStory === true;

      if (!hasRealStory) {
        // No active story → open create flow
        setCreateOpen(true);
      } else {
        // Active story exists → open own-story viewer
        const storyType =
          story.storyType === "text" ? "text" : story.storyType === "video" ? "video" : "image";
        setOwnStoryPending({
          storyType,
          textContent: story.textContent,
          bgGradient: story.bgGradient,
          mediaUri: storyType !== "text" ? story.image : undefined,
          caption: story.caption,
        });
        setOwnStoryId(story.id);
        setOwnViewerOpen(true);
      }
      return;
    }
    // Find the correct index in the viewable list so StoryViewer starts on the right slide
    const viewableIndex = viewable.findIndex((s) => s.id === story.id);
    setViewerStart(viewableIndex >= 0 ? viewableIndex : 0);
    setViewerOpen(true);
  };

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={S.scroll}
        contentContainerStyle={S.content}
      >
        {stories.map((story, index) => (
          <StoryItem key={story.id} story={story} onPress={() => openStory(index)} />
        ))}
      </ScrollView>

      {viewerOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
          <StoryViewer
            stories={stories}
            startIndex={viewerStart}
            onClose={() => setViewerOpen(false)}
          />
        </Modal>
      )}

      {ownViewerOpen && ownStoryPending && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setOwnViewerOpen(false)}>
          <PostedStoryViewer
            pending={ownStoryPending}
            username={ownUsername}
            storyId={ownStoryId ?? undefined}
            userId={userId}
            onClose={() => setOwnViewerOpen(false)}
            onAddNew={() => {
              setOwnViewerOpen(false);
              setCreateOpen(true);
            }}
          />
        </Modal>
      )}

      <CreateStorySheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onPost={() => {
          // Refresh the stories bar in the background immediately after a
          // successful post — the modal stays open to show the posted-viewer.
          // The modal is dismissed by its own onClose chain.
          onStoryCreated?.();
        }}
        userId={userId}
        username={ownUsername}
      />
    </>
  );
}

const S = StyleSheet.create({
  scroll: { paddingVertical: 6 },
  content: { paddingHorizontal: 12, gap: 12, flexDirection: "row", alignItems: "flex-start" },

  storyItem: { alignItems: "center", gap: 5, width: 70 },
  ownWrap: { position: "relative" },

  ring: {
    width: 66, height: 66, borderRadius: 33,
    alignItems: "center", justifyContent: "center",
  },
  ringGrey: { backgroundColor: "rgba(255,255,255,0.18)" },
  inner: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },

  addBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#8B5CF6",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#0A0A0F",
  },
  onlineDot: {
    position: "absolute", bottom: 2, right: 2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: "#22C55E",
    borderWidth: 2, borderColor: "#0A0A0F",
  },

  label: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "center", width: 68 },
});
