import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Toast, ToastType, useRealtime } from "@/context/RealtimeContext";
import { UserAvatar } from "./UserAvatar";

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  like:    { bg: "rgba(244,63,94,0.15)",  border: "#F43F5E", icon: "#F43F5E" },
  comment: { bg: "rgba(59,130,246,0.15)", border: "#3B82F6", icon: "#3B82F6" },
  follow:  { bg: "rgba(139,92,246,0.15)", border: "#8B5CF6", icon: "#8B5CF6" },
  vibe:    { bg: "rgba(234,179,8,0.15)",  border: "#EAB308", icon: "#EAB308" },
  mention: { bg: "rgba(249,115,22,0.15)", border: "#F97316", icon: "#F97316" },
  message: { bg: "rgba(16,185,129,0.15)", border: "#10B981", icon: "#10B981" },
};

const TOAST_ICONS: Record<ToastType, string> = {
  like:    "heart",
  comment: "chatbubble",
  follow:  "person-add",
  vibe:    "sparkles",
  mention: "at",
  message: "chatbubble-ellipses",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const colors = TOAST_COLORS[toast.type];

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 200 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(onDismiss);
  };

  const handlePress = () => {
    dismiss();
    if (toast.navigateTo) {
      setTimeout(() => router.push(toast.navigateTo as any), 260);
    }
  };

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          transform: [{ translateY: Animated.add(translateY, panY) }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.toastInner}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={[styles.iconDot, { backgroundColor: colors.border }]}>
          <Ionicons name={TOAST_ICONS[toast.type] as any} size={12} color="#fff" />
        </View>

        <UserAvatar
          username={toast.username}
          url={toast.avatar_url}
          size={36}
        />

        <View style={styles.textBlock}>
          <Text style={styles.toastUser} numberOfLines={1}>
            <Text style={[styles.bold, { color: "#fff" }]}>{toast.username}</Text>
            {"  "}
            <Text style={styles.toastMsg}>{toast.message}</Text>
          </Text>
        </View>

        <TouchableOpacity onPress={dismiss} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={14} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ToastOverlay() {
  const insets = useSafeAreaInsets();
  const { toasts, dismissToast } = useRealtime();
  const topPad = Platform.OS === "web" ? 72 : insets.top + 8;

  if (toasts.length === 0) return null;

  return (
    <View style={[styles.overlay, { top: topPad }]} pointerEvents="box-none">
      {toasts.slice(0, 3).map((toast, i) => (
        <View
          key={toast.id}
          style={[
            styles.toastWrap,
            { marginTop: i > 0 ? 6 : 0, opacity: i === 0 ? 1 : 0.7 - i * 0.15 },
          ]}
        >
          <ToastItem toast={toast} onDismiss={() => dismissToast(toast.id)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
    pointerEvents: "box-none",
  } as any,
  toastWrap: { width: "100%" },
  toast: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toastInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  iconDot: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  textBlock: { flex: 1 },
  toastUser: { fontSize: 13, fontFamily: "Poppins_400Regular", color: "rgba(255,255,255,0.9)", lineHeight: 18 },
  bold: { fontFamily: "Poppins_700Bold" },
  toastMsg: { color: "rgba(255,255,255,0.75)" },
  closeBtn: { padding: 2 },
});
