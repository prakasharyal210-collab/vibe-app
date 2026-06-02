import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
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
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "./UserAvatar";

const { width: W, height: H } = Dimensions.get("window");

const STORY_IMAGES = [
  "https://picsum.photos/seed/sv1/400/700",
  "https://picsum.photos/seed/sv2/400/700",
  "https://picsum.photos/seed/sv3/400/700",
  "https://picsum.photos/seed/sv4/400/700",
  "https://picsum.photos/seed/sv5/400/700",
  "https://picsum.photos/seed/sv6/400/700",
  "https://picsum.photos/seed/sv7/400/700",
];

const STORY_CAPTIONS = [
  "Golden hour vibes ✨",
  "City nights 🌃",
  "Living my best life 🎉",
  "Coffee and sunsets ☕",
  "Adventure time 🏔️",
  "Good vibes only 💜",
  "Saturday mood 🎵",
];

const REACTIONS = ["❤️", "🔥", "😍", "😂", "😮", "👏"];

interface Story {
  id: string;
  username: string;
  isOwn?: boolean;
  image?: string;
  hasNew?: boolean;
}

interface StoryViewerProps {
  stories: Story[];
  startIndex: number;
  onClose: () => void;
}

function StoryProgressBar({ total, current, progress }: { total: number; current: number; progress: SharedValue<number> }) {
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as any,
  }));

  return (
    <View style={viewerStyles.progressContainer}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={viewerStyles.progressSegWrap}>
          <View style={[viewerStyles.progressSeg, { backgroundColor: i < current ? "#fff" : "rgba(255,255,255,0.3)" }]} />
          {i === current && (
            <Animated.View style={[viewerStyles.progressFill, progressStyle]} />
          )}
        </View>
      ))}
    </View>
  );
}

function StoryViewer({ stories, startIndex, onClose }: StoryViewerProps) {
  const insets = useSafeAreaInsets();
  const viewable = stories.filter((s) => !s.isOwn);
  const [current, setCurrent] = useState(Math.max(0, startIndex - 1));
  const [reacted, setReacted] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [showReactions, setShowReactions] = useState(false);
  const progress = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useSharedValue(0);

  const storyImage = STORY_IMAGES[current % STORY_IMAGES.length];
  const caption = STORY_CAPTIONS[current % STORY_CAPTIONS.length];
  const story = viewable[current];

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const startTimer = () => {
    clearTimer();
    progress.value = 0;
    progress.value = withTiming(1, { duration: 5000 });
    timerRef.current = setTimeout(() => advance(), 5000);
  };

  useEffect(() => {
    startTimer();
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

  const react = (emoji: string) => {
    setReacted(emoji);
    setShowReactions(false);
    setTimeout(() => setReacted(null), 2000);
  };

  if (!story) return null;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[viewerStyles.container, sheetStyle]}>
        <Image source={{ uri: storyImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient colors={["rgba(0,0,0,0.6)", "transparent", "transparent", "rgba(0,0,0,0.7)"]} style={StyleSheet.absoluteFill} />

        <StoryProgressBar total={viewable.length} current={current} progress={progress} />

        <View style={[viewerStyles.topBar, { paddingTop: Platform.OS === "web" ? 20 : insets.top + 8 }]}>
          <View style={viewerStyles.userRow}>
            <UserAvatar username={story.username} size={36} />
            <View>
              <Text style={viewerStyles.username}>{story.username}</Text>
              <Text style={viewerStyles.timeAgo}>2h ago</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={viewerStyles.closeBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={viewerStyles.tapZones}>
          <TouchableOpacity style={viewerStyles.tapLeft} onPress={goBack} activeOpacity={1} />
          <TouchableOpacity style={viewerStyles.tapRight} onPress={advance} activeOpacity={1} />
        </View>

        {caption ? (
          <View style={viewerStyles.captionBox} pointerEvents="none">
            <Text style={viewerStyles.captionText}>{caption}</Text>
          </View>
        ) : null}

        {reacted && (
          <View style={viewerStyles.reactedBubble} pointerEvents="none">
            <Text style={viewerStyles.reactedEmoji}>{reacted}</Text>
          </View>
        )}

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={viewerStyles.bottomArea}>
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
              <Ionicons name="send" size={20} color={reply.trim() ? "#7C3AED" : "rgba(255,255,255,0.4)"} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </GestureDetector>
  );
}

const viewerStyles = StyleSheet.create({
  container: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000", zIndex: 200 },
  progressContainer: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, flexDirection: "row", paddingHorizontal: 8, paddingTop: Platform.OS === "web" ? 12 : 52, gap: 4 },
  progressSegWrap: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden", position: "relative" },
  progressSeg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  progressFill: { position: "absolute", top: 0, left: 0, bottom: 0, backgroundColor: "#fff" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, zIndex: 10 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  username: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  timeAgo: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_400Regular", fontSize: 11 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  tapZones: { ...StyleSheet.absoluteFillObject as any, flexDirection: "row" },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },
  captionBox: { position: "absolute", bottom: 160, left: 0, right: 0, paddingHorizontal: 20 },
  captionText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 16, textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4, textAlign: "center" },
  reactedBubble: { position: "absolute", top: "40%", alignSelf: "center", backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 40, padding: 16 },
  reactedEmoji: { fontSize: 48 },
  bottomArea: { position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: Platform.OS === "web" ? 20 : 32 },
  reactionRow: { flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 12 },
  reactionBtn: { backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 22, padding: 8 },
  reactionEmoji: { fontSize: 22 },
  replyRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 },
  replyInput: { flex: 1, height: 42, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 21, paddingHorizontal: 16, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
});

function StoryItem({ story, onPress }: { story: Story; onPress: () => void }) {
  const colors = useColors();

  return (
    <TouchableOpacity style={styles.storyItem} activeOpacity={0.8} onPress={onPress}>
      {story.isOwn ? (
        <View style={styles.ownStoryWrapper}>
          <UserAvatar username={story.username} size={56} />
          <View style={[styles.addBadge, { backgroundColor: "#7C3AED" }]}>
            <Ionicons name="add" size={12} color="#fff" />
          </View>
        </View>
      ) : story.hasNew !== false ? (
        <LinearGradient
          colors={["#7C3AED", "#F97316"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.storyRing}
        >
          <View style={[styles.storyInner, { backgroundColor: colors.background }]}>
            <UserAvatar username={story.username} size={52} />
          </View>
        </LinearGradient>
      ) : (
        <View style={[styles.storyRing, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
          <View style={[styles.storyInner, { backgroundColor: colors.background }]}>
            <UserAvatar username={story.username} size={52} />
          </View>
        </View>
      )}
      <Text style={[styles.storyName, { color: colors.foreground }]} numberOfLines={1}>
        {story.isOwn ? "Your Story" : story.username.split("_")[0]}
      </Text>
    </TouchableOpacity>
  );
}

export function StoryRow({ stories }: { stories: Story[] }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);

  const openViewer = (index: number) => {
    const story = stories[index];
    if (story.isOwn) {
      return;
    }
    setViewerStart(index);
    setViewerOpen(true);
  };

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {stories.map((story, index) => (
          <StoryItem key={story.id} story={story} onPress={() => openViewer(index)} />
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
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: 8 },
  content: { paddingHorizontal: 12, gap: 14 },
  storyItem: { alignItems: "center", gap: 5, width: 68 },
  ownStoryWrapper: { position: "relative" },
  storyRing: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  storyInner: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  addBadge: { position: "absolute", bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#0A0A0F" },
  storyName: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "center" },
});
