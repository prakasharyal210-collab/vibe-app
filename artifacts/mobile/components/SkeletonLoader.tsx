import React, { useEffect } from "react";
import { StyleSheet, StyleProp, View, ViewStyle } from "react-native";
import RAnimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

function SkeletonBase({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      false
    );
    return () => cancelAnimation(opacity);
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <RAnimated.View
      style={[{ backgroundColor: colors.muted, borderRadius: 6 }, style, animStyle]}
    />
  );
}

export function SkeletonCircle({ size = 40, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <SkeletonBase
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

export function SkeletonText({ width = "100%", height = 14, style }: { width?: number | string; height?: number; style?: StyleProp<ViewStyle> }) {
  return <SkeletonBase style={[{ width: width as any, height, borderRadius: 7 }, style]} />;
}

export function SkeletonRect({ width = "100%", height = 200, borderRadius = 12, style }: { width?: number | string; height?: number; borderRadius?: number; style?: StyleProp<ViewStyle> }) {
  return <SkeletonBase style={[{ width: width as any, height, borderRadius }, style]} />;
}

export function SkeletonPost() {
  return (
    <View style={skeletonStyles.post}>
      <View style={skeletonStyles.row}>
        <SkeletonCircle size={38} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonText width="50%" height={12} />
          <SkeletonText width="30%" height={10} />
        </View>
      </View>
      <SkeletonRect height={300} borderRadius={0} />
      <View style={skeletonStyles.actions}>
        <SkeletonText width={60} height={18} />
        <SkeletonText width={60} height={18} />
        <SkeletonText width={60} height={18} />
      </View>
      <View style={{ paddingHorizontal: 12, gap: 6 }}>
        <SkeletonText width="70%" height={12} />
        <SkeletonText width="90%" height={12} />
      </View>
    </View>
  );
}

export function SkeletonCard() {
  return (
    <View style={skeletonStyles.card}>
      <SkeletonRect height={200} borderRadius={16} />
      <View style={{ gap: 8, padding: 12 }}>
        <SkeletonText width="60%" height={16} />
        <SkeletonText width="80%" height={12} />
        <View style={skeletonStyles.row}>
          <SkeletonText width={60} height={24} style={{ borderRadius: 8 }} />
          <SkeletonText width={60} height={24} style={{ borderRadius: 8 }} />
        </View>
      </View>
    </View>
  );
}

export function SkeletonAccount() {
  return (
    <View style={skeletonStyles.account}>
      <SkeletonCircle size={48} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonText width="40%" height={13} />
        <SkeletonText width="70%" height={11} />
      </View>
      <SkeletonText width={72} height={32} style={{ borderRadius: 10 }} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  post: {
    gap: 12,
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 12,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    margin: 8,
  },
  account: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
});
