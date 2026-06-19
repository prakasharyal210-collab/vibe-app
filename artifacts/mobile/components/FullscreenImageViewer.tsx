import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: W, height: H } = Dimensions.get("window");

interface Props {
  images: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}

// ─── ZoomableSlide ────────────────────────────────────────────────────────────
// Must be at module scope — sub-components defined inside a parent function get
// a new type reference on every render, causing React to remount them (Ionicons
// empty-box bug).  Shared values reset on remount, which is exactly what we
// want when the user navigates to a new image.
function ZoomableSlide({
  uri,
  onClose,
}: {
  uri: string;
  onClose: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const opacity = useSharedValue(1);

  const resetZoom = () => {
    "worklet";
    scale.value = withSpring(1, { damping: 20 });
    tx.value = withSpring(0, { damping: 20 });
    ty.value = withSpring(0, { damping: 20 });
    savedScale.value = 1;
    savedTx.value = 0;
    savedTy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 0.5), 6);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        resetZoom();
        opacity.value = withSpring(1);
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1.05) {
        tx.value = savedTx.value + e.translationX;
        ty.value = savedTy.value + e.translationY;
      } else {
        // Swipe-down to dismiss — only vertical, only downward
        ty.value = Math.max(0, e.translationY);
        opacity.value = Math.max(0.15, 1 - e.translationY / 260);
      }
    })
    .onEnd((e) => {
      if (scale.value <= 1.05) {
        if (e.translationY > 90 || e.velocityY > 700) {
          runOnJS(onClose)();
        } else {
          ty.value = withSpring(0, { damping: 20 });
          opacity.value = withSpring(1);
        }
      } else {
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd(() => {
      if (scale.value > 1.05) {
        resetZoom();
        opacity.value = withSpring(1);
      } else {
        scale.value = withSpring(2.5, { damping: 18 });
        savedScale.value = 2.5;
      }
    });

  const gesture = Gesture.Exclusive(
    doubleTap,
    Gesture.Simultaneous(pinch, pan),
  );

  const slideStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.slideContainer, slideStyle]}
      >
        <Animated.View style={[styles.imageWrap, imageStyle]}>
          <Image
            source={{ uri }}
            style={styles.fullImage}
            contentFit="contain"
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

// ─── FullscreenImageViewer ────────────────────────────────────────────────────
export function FullscreenImageViewer({
  images,
  initialIndex = 0,
  visible,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIdx(initialIndex);
  }, [visible, initialIndex]);

  const validImages = images.filter(Boolean);
  const uri = validImages[idx] ?? "";

  const goPrev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIdx((i) => Math.min(validImages.length - 1, i + 1)),
    [validImages.length],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar hidden />

      {/* Black backdrop */}
      <View style={[StyleSheet.absoluteFill, styles.backdrop]} />

      {/* Zoomable image — remounts on idx change, which resets zoom automatically */}
      <ZoomableSlide key={idx} uri={uri} onClose={onClose} />

      {/* Close button — outside ZoomableSlide so it stays visible at full opacity */}
      <TouchableOpacity
        onPress={onClose}
        style={[styles.closeBtn, { top: insets.top + 12 }]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <View style={styles.closeBtnInner}>
          <Ionicons name="close" size={20} color="#fff" />
        </View>
      </TouchableOpacity>

      {/* Multi-image navigation */}
      {validImages.length > 1 && (
        <>
          {idx > 0 && (
            <TouchableOpacity
              style={[styles.arrow, styles.arrowLeft]}
              onPress={goPrev}
            >
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </TouchableOpacity>
          )}
          {idx < validImages.length - 1 && (
            <TouchableOpacity
              style={[styles.arrow, styles.arrowRight]}
              onPress={goNext}
            >
              <Ionicons name="chevron-forward" size={26} color="#fff" />
            </TouchableOpacity>
          )}
          <View style={[styles.dots, { bottom: insets.bottom + 28 }]}>
            {validImages.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === idx && styles.dotActive]}
              />
            ))}
          </View>
        </>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "#000",
  },
  slideContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrap: {
    width: W,
    height: H,
  },
  fullImage: {
    width: W,
    height: H,
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    zIndex: 20,
  },
  closeBtnInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  arrow: {
    position: "absolute",
    top: "50%",
    marginTop: -22,
    zIndex: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  arrowLeft: { left: 12 },
  arrowRight: { right: 12 },
  dots: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    left: 0,
    right: 0,
    gap: 6,
    zIndex: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
});
