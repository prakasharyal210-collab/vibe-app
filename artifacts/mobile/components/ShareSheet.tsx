import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "./UserAvatar";

const { height: H } = Dimensions.get("window");
const SHEET_HEIGHT = H * 0.46;

const FRIENDS = [
  { id: "f1", username: "luna_sky" },
  { id: "f2", username: "marcus_vibe" },
  { id: "f3", username: "zoe.creates" },
  { id: "f4", username: "kai_adventures" },
  { id: "f5", username: "nadia.official" },
];

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  contentType?: "post" | "reel" | "profile";
  username?: string;
}

export function ShareSheet({ visible, onClose, contentType = "post", username }: ShareSheetProps) {
  const colors = useColors();
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 240,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const shareUrl = `https://vibe.app/${contentType}/${username ?? ""}`;

  const actions = [
    {
      icon: "link-outline",
      label: "Copy link",
      color: "#7C3AED",
      onPress: async () => {
        try {
          if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
            await navigator.clipboard.writeText(shareUrl);
          }
        } catch {}
        Alert.alert("Copied!", "Link copied to clipboard");
        onClose();
      },
    },
    {
      icon: "paper-plane-outline",
      label: "Send to DM",
      color: "#3B82F6",
      onPress: () => { onClose(); router.push("/inbox"); },
    },
    {
      icon: "radio-button-on-outline",
      label: "Add to Story",
      color: "#EC4899",
      onPress: () => { onClose(); Alert.alert("Added to story!"); },
    },
    {
      icon: "share-social-outline",
      label: "Share via...",
      color: "#F97316",
      onPress: async () => {
        try {
          await Share.share({ message: `Check this out on Vibe! ${shareUrl}`, url: shareUrl });
        } catch {}
        onClose();
      },
    },
    {
      icon: "flag-outline",
      label: "Report",
      color: "#EF4444",
      onPress: () => { onClose(); Alert.alert("Reported", "Thanks for keeping Vibe safe."); },
    },
  ];

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.card, borderTopColor: colors.border },
          { transform: [{ translateY }] },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[styles.title, { color: colors.foreground }]}>Share</Text>

        <View style={styles.friendsRow}>
          {FRIENDS.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={styles.friendItem}
              onPress={() => { onClose(); router.push("/inbox"); }}
            >
              <UserAvatar username={f.username} size={50} />
              <Text style={[styles.friendName, { color: colors.foreground }]} numberOfLines={1}>
                {f.username.split("_")[0].split(".")[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {actions.map((action) => (
          <TouchableOpacity
            key={action.label}
            onPress={action.onPress}
            style={styles.actionRow}
            activeOpacity={0.75}
          >
            <View style={[styles.iconCircle, { backgroundColor: action.color + "22" }]}>
              <Ionicons name={action.icon as any} size={22} color={action.color} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.foreground }]}>{action.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 0.5,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontFamily: "Poppins_700Bold",
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  friendsRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 14,
  },
  friendItem: {
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  friendName: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  divider: {
    height: 0.5,
    marginBottom: 6,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 14,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
});
