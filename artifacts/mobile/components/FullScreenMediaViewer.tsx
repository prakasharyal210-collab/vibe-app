import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: W, height: H } = Dimensions.get("window");

export interface MediaItem {
  id: string;
  image: string;
  caption?: string;
  likes?: number;
  username?: string;
  isVideo?: boolean;
}

interface FullScreenMediaViewerProps {
  items: MediaItem[];
  startIndex: number;
  visible: boolean;
  onClose: () => void;
}

export function FullScreenMediaViewer({ items, startIndex, visible, onClose }: FullScreenMediaViewerProps) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(startIndex);
  const [liked, setLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(items[startIndex]?.likes ?? 0);
  const [showHeart, setShowHeart] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  const translateY = useSharedValue(0);
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);
  const bgOpacity = useSharedValue(1);

  const handleDoubleTap = () => {
    if (!liked) {
      setLiked(true);
      setLocalLikes((l) => l + 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShowHeart(true);
    heartScale.value = 0;
    heartOpacity.value = 0;
    heartScale.value = withSpring(1, { damping: 7, stiffness: 150 });
    heartOpacity.value = withTiming(1, { duration: 120 });
    setTimeout(() => {
      heartOpacity.value = withTiming(0, { duration: 400 });
      heartScale.value = withTiming(0.6, { duration: 400 });
    }, 700);
    setTimeout(() => setShowHeart(false), 1100);
  };

  const doGoPrev = () => setCurrent((c) => Math.max(0, c - 1));
  const doGoNext = () => setCurrent((c) => Math.min(items.length - 1, c + 1));
  const doClose = () => onClose();

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
        bgOpacity.value = 1 - e.translationY / (H * 0.5);
      }
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) {
        translateY.value = withTiming(H, { duration: 220 }, () => runOnJS(doClose)());
        bgOpacity.value = withTiming(0, { duration: 220 });
      } else {
        translateY.value = withSpring(0, { damping: 20 });
        bgOpacity.value = withSpring(1);
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(300)
    .onEnd(() => runOnJS(handleDoubleTap)());

  const swipeHorizontal = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onEnd((e) => {
      if (e.translationX < -50) runOnJS(doGoNext)();
      if (e.translationX > 50) runOnJS(doGoPrev)();
    });

  const composed = Gesture.Race(
    Gesture.Simultaneous(panGesture, doubleTapGesture),
    swipeHorizontal,
  );

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: Math.max(bgOpacity.value, 0),
  }));

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  if (!visible || items.length === 0) return null;

  const item = items[current];
  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.container, containerStyle]}>
          <Image source={{ uri: item.image }} style={styles.image} resizeMode="contain" />

          {showHeart && (
            <Animated.View style={[styles.heartBurst, heartStyle]} pointerEvents="none">
              <Text style={styles.heartEmoji}>❤️</Text>
            </Animated.View>
          )}

          <View style={[styles.topBar, { paddingTop: topPad }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeCircle}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
            {items.length > 1 && (
              <View style={styles.counterBadge}>
                <Text style={styles.counterText}>{current + 1} / {items.length}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.moreCircle}>
              <Ionicons name="ellipsis-horizontal" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {current > 0 && (
            <TouchableOpacity onPress={doGoPrev} style={styles.prevBtn} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={28} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          )}
          {current < items.length - 1 && (
            <TouchableOpacity onPress={doGoNext} style={styles.nextBtn} activeOpacity={0.8}>
              <Ionicons name="chevron-forward" size={28} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          )}

          {items.length > 1 && (
            <View style={styles.dotsRow} pointerEvents="none">
              {items.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, { backgroundColor: i === current ? "#fff" : "rgba(255,255,255,0.4)" }]}
                />
              ))}
            </View>
          )}

          <View style={[styles.bottomBar, { paddingBottom: Platform.OS === "web" ? 24 : insets.bottom + 16 }]}>
            {item.username && (
              <Text style={styles.usernameText}>@{item.username}</Text>
            )}
            {item.caption && (
              <TouchableOpacity onPress={() => setCaptionExpanded((e) => !e)} activeOpacity={0.9}>
                <Text style={styles.caption} numberOfLines={captionExpanded ? undefined : 2}>
                  {item.caption}
                  {!captionExpanded && item.caption.length > 80 && (
                    <Text style={styles.moreText}> more</Text>
                  )}
                </Text>
              </TouchableOpacity>
            )}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                onPress={() => {
                  const nowLiked = !liked;
                  setLiked(nowLiked);
                  setLocalLikes((l) => nowLiked ? l + 1 : l - 1);
                  if (nowLiked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
                style={styles.actionBtn}
              >
                <Ionicons
                  name={liked ? "heart" : "heart-outline"}
                  size={28}
                  color={liked ? "#F97316" : "#fff"}
                />
                <Text style={styles.actionLabel}>
                  {localLikes >= 1000 ? `${(localLikes / 1000).toFixed(1)}k` : localLikes}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn}>
                <Ionicons name="chatbubble-outline" size={26} color="#fff" />
                <Text style={styles.actionLabel}>Comments</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn}>
                <Ionicons name="paper-plane-outline" size={26} color="#fff" />
                <Text style={styles.actionLabel}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn}>
                <Ionicons name="bookmark-outline" size={26} color="#fff" />
                <Text style={styles.actionLabel}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  image: { flex: 1 },
  heartBurst: {
    position: "absolute",
    top: "38%",
    alignSelf: "center",
    zIndex: 20,
  },
  heartEmoji: { fontSize: 90 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  closeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  counterBadge: {
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  counterText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  moreCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  prevBtn: {
    position: "absolute",
    left: 8,
    top: "45%",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
    padding: 6,
    zIndex: 5,
  },
  nextBtn: {
    position: "absolute",
    right: 8,
    top: "45%",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
    padding: 6,
    zIndex: 5,
  },
  dotsRow: {
    position: "absolute",
    bottom: 140,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    zIndex: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    gap: 8,
    zIndex: 10,
  },
  usernameText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  caption: { color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 18 },
  moreText: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_600SemiBold" },
  actionsRow: { flexDirection: "row", gap: 28, paddingTop: 4 },
  actionBtn: { alignItems: "center", gap: 3 },
  actionLabel: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_400Regular", fontSize: 11 },
});
