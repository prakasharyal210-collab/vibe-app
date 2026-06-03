import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  GestureResponderEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";

const { width: W, height: H } = Dimensions.get("window");
const STORY_DURATION = 4500;

export interface Story {
  id: string;
  image: string;
  username?: string;
  time?: string;
}

export interface Highlight {
  id: string;
  label: string;
  image: string;
  username?: string;
  stories?: Story[];
}

function buildStories(highlight: Highlight): Story[] {
  if (highlight.stories && highlight.stories.length > 0) return highlight.stories;
  return [
    { id: `${highlight.id}-1`, image: `https://picsum.photos/seed/${highlight.id}a/450/900`, username: highlight.username, time: "2h" },
    { id: `${highlight.id}-2`, image: `https://picsum.photos/seed/${highlight.id}b/450/900`, username: highlight.username, time: "1d" },
    { id: `${highlight.id}-3`, image: `https://picsum.photos/seed/${highlight.id}c/450/900`, username: highlight.username, time: "3d" },
  ];
}

interface Props {
  highlight: Highlight | null;
  visible: boolean;
  onClose: () => void;
}

export function HighlightViewer({ highlight, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 20 : insets.top;

  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const progressAnims = useRef<Animated.Value[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedAt = useRef<number>(0);
  const elapsed = useRef<number>(0);

  const stories = highlight ? buildStories(highlight) : [];
  const count = stories.length;

  if (progressAnims.current.length !== count) {
    progressAnims.current = Array.from({ length: count }, () => new Animated.Value(0));
  }

  const startStory = useCallback((index: number, startFrom = 0) => {
    if (!visible || index >= count) return;

    progressAnims.current.forEach((a, i) => {
      a.stopAnimation();
      if (i < index) a.setValue(1);
      else if (i > index) a.setValue(0);
      else a.setValue(startFrom);
    });

    elapsed.current = startFrom * STORY_DURATION;
    const remaining = STORY_DURATION - elapsed.current;

    Animated.timing(progressAnims.current[index], {
      toValue: 1,
      duration: remaining,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        if (index + 1 < count) {
          setStoryIndex(index + 1);
        } else {
          onClose();
        }
      }
    });

    timerRef.current = setTimeout(() => {
      if (index + 1 < count) {
        setStoryIndex(index + 1);
      } else {
        onClose();
      }
    }, remaining);
  }, [visible, count, onClose]);

  useEffect(() => {
    if (!visible) {
      setStoryIndex(0);
      progressAnims.current.forEach((a) => a.setValue(0));
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    startStory(0);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, highlight]);

  useEffect(() => {
    if (!visible) return;
    progressAnims.current.forEach((a, i) => {
      if (i !== storyIndex) {
        a.stopAnimation();
        a.setValue(i < storyIndex ? 1 : 0);
      }
    });
    startStory(storyIndex);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [storyIndex]);

  const handlePause = () => {
    if (paused) {
      setPaused(false);
      startStory(storyIndex, elapsed.current / STORY_DURATION);
    } else {
      setPaused(true);
      progressAnims.current[storyIndex]?.stopAnimation((val) => {
        elapsed.current = val * STORY_DURATION;
      });
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  const handleTap = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    if (x < W * 0.35) {
      setStoryIndex((i) => Math.max(0, i - 1));
    } else {
      if (storyIndex + 1 < count) {
        setStoryIndex((i) => i + 1);
      } else {
        onClose();
      }
    }
  };

  if (!highlight) return null;

  const story = stories[storyIndex];

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {story && (
          <Image
            source={{ uri: story.image }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        )}

        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.18)" }]} pointerEvents="none" />

        {/* Progress bars */}
        <View style={[styles.progressRow, { top: topInset + 8 }]}>
          {stories.map((_, i) => (
            <View key={i} style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnims.current[i]
                      ? progressAnims.current[i].interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] })
                      : "0%",
                  },
                ]}
              />
            </View>
          ))}
        </View>

        {/* Header */}
        <View style={[styles.header, { top: topInset + 22 }]}>
          <View style={styles.headerLeft}>
            <UserAvatar username={highlight.username ?? highlight.label} url={highlight.image} size={38} showBorder />
            <View style={{ gap: 1 }}>
              <Text style={styles.headerUsername}>{highlight.username ?? highlight.label}</Text>
              {story?.time && <Text style={styles.headerTime}>{story.time}</Text>}
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handlePause} style={styles.iconBtn}>
              <Ionicons name={paused ? "play" : "pause"} size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tap zones */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} onLongPress={handlePause} />

        {/* Bottom reply bar */}
        <View style={[styles.replyBar, { bottom: insets.bottom + 16 }]}>
          <View style={styles.replyInput}>
            <Text style={styles.replyPlaceholder}>Reply to {highlight.label}...</Text>
          </View>
          <TouchableOpacity style={styles.replyBtn}>
            <Ionicons name="heart-outline" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.replyBtn}>
            <Ionicons name="paper-plane-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  progressRow: {
    position: "absolute",
    left: 10,
    right: 10,
    flexDirection: "row",
    gap: 4,
    zIndex: 20,
  },
  progressTrack: {
    flex: 1,
    height: 2.5,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  header: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 20,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerUsername: { color: "#fff", fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  headerTime: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "Poppins_400Regular" },
  iconBtn: { padding: 6 },
  replyBar: {
    position: "absolute",
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 20,
  },
  replyInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  replyPlaceholder: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontFamily: "Poppins_400Regular" },
  replyBtn: { padding: 4 },
});
