import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const VIEW_DURATION = 5000;

export function SnapViewerModal({
  uri,
  onClose,
}: {
  uri: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(1)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    animRef.current = Animated.timing(progress, {
      toValue: 0,
      duration: VIEW_DURATION,
      useNativeDriver: false,
      easing: Easing.linear,
    });
    animRef.current.start(({ finished }) => {
      if (finished) onClose();
    });
    return () => {
      animRef.current?.stop();
    };
  }, []);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={viewerSt.container}>
        <View style={[viewerSt.timerTrack, { top: insets.top + 8 }]}>
          <Animated.View
            style={[viewerSt.timerFill, { width: barWidth as any }]}
          />
        </View>
        <View
          style={[viewerSt.header, { paddingTop: insets.top + 20 }]}
        >
          <View style={viewerSt.snapBadge}>
            <Ionicons name="camera" size={14} color="#fff" />
            <Text style={viewerSt.snapBadgeText}>Snap · tap to close</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={viewerSt.closeBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        >
          <Image
            source={{ uri }}
            style={viewerSt.image}
            resizeMode="contain"
          />
        </TouchableOpacity>
        <View
          style={[viewerSt.bottomHint, { paddingBottom: insets.bottom + 20 }]}
        >
          <Ionicons
            name="eye-off-outline"
            size={14}
            color="rgba(255,255,255,0.5)"
          />
          <Text style={viewerSt.hintText}>
            This snap disappears after viewing
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const viewerSt = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  timerTrack: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    zIndex: 20,
    overflow: "hidden",
  },
  timerFill: { height: 3, backgroundColor: "#EA580C", borderRadius: 2 },
  header: {
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
  snapBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(234,88,12,0.9)",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  snapBadgeText: {
    color: "#fff",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  closeBtn: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 20,
    padding: 8,
  },
  image: { flex: 1 },
  bottomHint: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  hintText: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
});

export function SnapCaptureSheet({
  uri,
  sending,
  onSend,
  onCancel,
}: {
  uri: string;
  sending: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    Animated.spring(slideY, {
      toValue: 0,
      tension: 75,
      friction: 13,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={captureSt.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onCancel}
        />
        <Animated.View
          style={[
            captureSt.sheet,
            {
              paddingBottom: insets.bottom + 24,
              transform: [{ translateY: slideY }],
            },
          ]}
        >
          <View style={captureSt.handle} />
          <View style={captureSt.headerRow}>
            <Ionicons name="camera" size={18} color="#EA580C" />
            <Text style={captureSt.title}>Send Snap</Text>
          </View>
          <Image
            source={{ uri }}
            style={captureSt.preview}
            resizeMode="cover"
          />
          <View style={captureSt.noteRow}>
            <Ionicons
              name="eye-off-outline"
              size={14}
              color="rgba(255,255,255,0.45)"
            />
            <Text style={captureSt.note}>
              Disappears after the recipient views it once
            </Text>
          </View>
          <View style={captureSt.btnRow}>
            <TouchableOpacity
              onPress={onCancel}
              style={captureSt.cancelBtn}
              activeOpacity={0.75}
            >
              <Text style={captureSt.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSend}
              disabled={sending}
              style={captureSt.sendBtnWrap}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#EA580C", "#DC2626"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={captureSt.sendBtn}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={17} color="#fff" />
                )}
                <Text style={captureSt.sendText}>
                  {sending ? "Sending…" : "Send Snap"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const captureSt = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0F0F1A",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 14,
  },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  preview: {
    width: "100%",
    height: 300,
    borderRadius: 18,
    backgroundColor: "#1a1a2e",
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 12,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  note: {
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    flex: 1,
  },
  btnRow: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: {
    color: "rgba(255,255,255,0.65)",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  sendBtnWrap: { flex: 1, borderRadius: 14, overflow: "hidden" },
  sendBtn: {
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  sendText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
});
