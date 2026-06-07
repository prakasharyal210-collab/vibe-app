import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { fetchMessages, sendMessageToUser } from "@/lib/db";
import {
  encodeSnap,
  isSnap,
  markSnapViewed,
  parseSnap,
  sendSnapMessage,
  uploadSnapToStorage,
} from "@/lib/snap";
import { Message, supabase, timeAgo } from "@/lib/supabase";

// ─── SnapBubble ────────────────────────────────────────────────────────────────

function SnapBubble({
  msg,
  isMe,
  onView,
}: {
  msg: Message;
  isMe: boolean;
  onView: () => void;
}) {
  const snap = parseSnap(msg.text);
  if (!snap) return null;
  const isTemp = msg.id.startsWith("temp_");

  if (isMe) {
    const opened = snap.viewed;
    return (
      <LinearGradient
        colors={opened ? ["#374151", "#4B5563"] : ["#EA580C", "#DC2626"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={snapStyles.pill}
      >
        <Ionicons
          name={opened ? "camera-outline" : "camera"}
          size={17}
          color={opened ? "rgba(255,255,255,0.45)" : "#fff"}
        />
        <View>
          <Text
            style={[
              snapStyles.label,
              opened && { color: "rgba(255,255,255,0.45)" },
            ]}
          >
            {isTemp ? "Sending snap…" : opened ? "Opened 👁" : "Photo sent 📷"}
          </Text>
          {!opened && !isTemp && (
            <Text style={snapStyles.sublabel}>Disappears after viewing</Text>
          )}
        </View>
      </LinearGradient>
    );
  }

  if (snap.viewed) {
    return (
      <View
        style={[
          snapStyles.pill,
          { backgroundColor: "rgba(255,255,255,0.06)" },
        ]}
      >
        <Ionicons
          name="camera-outline"
          size={17}
          color="rgba(255,255,255,0.3)"
        />
        <Text
          style={[snapStyles.label, { color: "rgba(255,255,255,0.3)" }]}
        >
          Opened
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={onView} activeOpacity={0.82}>
      <LinearGradient
        colors={["#EA580C", "#DC2626"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[snapStyles.pill, snapStyles.pillTappable]}
      >
        <Ionicons name="camera" size={20} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={snapStyles.label}>Tap to view · Photo 📷</Text>
          <Text style={snapStyles.sublabel}>Disappears after viewing once</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const snapStyles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    maxWidth: 260,
  },
  pillTappable: { paddingVertical: 13, paddingHorizontal: 16 },
  label: {
    color: "#fff",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  sublabel: {
    color: "rgba(255,255,255,0.65)",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    marginTop: 1,
  },
});

// ─── Bubble ────────────────────────────────────────────────────────────────────

function Bubble({
  msg,
  isMe,
  otherUsername,
  otherAvatar,
  showAvatar,
  onViewSnap,
}: {
  msg: Message;
  isMe: boolean;
  otherUsername?: string;
  otherAvatar?: string;
  showAvatar: boolean;
  onViewSnap: () => void;
}) {
  const colors = useColors();
  const isTemp = msg.id.startsWith("temp_");
  const isSnapMsg = isSnap(msg.text);

  return (
    <View
      style={[
        bubbleStyles.row,
        isMe ? bubbleStyles.rowMe : bubbleStyles.rowThem,
      ]}
    >
      {!isMe && (
        <View style={bubbleStyles.avatarSlot}>
          {showAvatar ? (
            <UserAvatar username={otherUsername} url={otherAvatar} size={28} />
          ) : null}
        </View>
      )}

      {isSnapMsg ? (
        <SnapBubble msg={msg} isMe={isMe} onView={onViewSnap} />
      ) : (
        <View
          style={[
            bubbleStyles.bubble,
            isMe
              ? bubbleStyles.bubbleMe
              : { backgroundColor: colors.muted },
          ]}
        >
          {isMe ? (
            <LinearGradient
              colors={["#7C3AED", "#9333EA"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={bubbleStyles.gradFill}
            >
              <Text style={bubbleStyles.textMe}>{msg.text}</Text>
            </LinearGradient>
          ) : (
            <Text
              style={[bubbleStyles.textThem, { color: colors.foreground }]}
            >
              {msg.text}
            </Text>
          )}
        </View>
      )}

      {isMe && !isSnapMsg && (
        <View style={bubbleStyles.meta}>
          <Text style={bubbleStyles.time}>{timeAgo(msg.created_at)}</Text>
          <Ionicons
            name={
              isTemp ? "checkmark-outline" : "checkmark-done-outline"
            }
            size={12}
            color={isTemp ? "rgba(255,255,255,0.3)" : "#A78BFA"}
          />
        </View>
      )}
      {!isMe && !isSnapMsg && (
        <Text
          style={[
            bubbleStyles.timeThem,
            { color: colors.mutedForeground },
          ]}
        >
          {timeAgo(msg.created_at)}
        </Text>
      )}
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 4,
    paddingHorizontal: 12,
  },
  rowMe: { justifyContent: "flex-end" },
  rowThem: { justifyContent: "flex-start" },
  avatarSlot: { width: 32, marginRight: 6 },
  bubble: { maxWidth: "72%", borderRadius: 18, overflow: "hidden" },
  bubbleMe: { borderBottomRightRadius: 4 },
  gradFill: { paddingHorizontal: 14, paddingVertical: 10 },
  textMe: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: "#fff",
    lineHeight: 20,
  },
  textThem: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: 4,
    marginBottom: 2,
  },
  time: {
    fontSize: 9,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.35)",
  },
  timeThem: {
    fontSize: 9,
    fontFamily: "Poppins_400Regular",
    marginLeft: 4,
    marginBottom: 2,
  },
});

// ─── SnapCaptureSheet ──────────────────────────────────────────────────────────

function SnapCaptureSheet({
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
      <View style={captureStyles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onCancel}
        />
        <Animated.View
          style={[
            captureStyles.sheet,
            {
              paddingBottom: insets.bottom + 24,
              transform: [{ translateY: slideY }],
            },
          ]}
        >
          <View style={captureStyles.handle} />

          <View style={captureStyles.headerRow}>
            <Ionicons name="camera" size={18} color="#EA580C" />
            <Text style={captureStyles.title}>Send Snap</Text>
          </View>

          <Image
            source={{ uri }}
            style={captureStyles.preview}
            resizeMode="cover"
          />

          <View style={captureStyles.noteRow}>
            <Ionicons name="eye-off-outline" size={14} color="rgba(255,255,255,0.45)" />
            <Text style={captureStyles.note}>
              Disappears after the recipient views it once
            </Text>
          </View>

          <View style={captureStyles.btnRow}>
            <TouchableOpacity
              onPress={onCancel}
              style={captureStyles.cancelBtn}
              activeOpacity={0.75}
            >
              <Text style={captureStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onSend}
              disabled={sending}
              style={captureStyles.sendBtnWrap}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#EA580C", "#DC2626"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={captureStyles.sendBtn}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={17} color="#fff" />
                )}
                <Text style={captureStyles.sendText}>
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

const captureStyles = StyleSheet.create({
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
  title: {
    color: "#fff",
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
  },
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
  sendText: {
    color: "#fff",
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
  },
});

// ─── SnapViewerModal ───────────────────────────────────────────────────────────

const VIEW_DURATION = 5000;

function SnapViewerModal({
  uri,
  onClose,
}: {
  uri: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (timerRef.current) clearTimeout(timerRef.current);
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
      <View style={viewerStyles.container}>
        {/* Timer bar */}
        <View style={[viewerStyles.timerTrack, { top: insets.top + 8 }]}>
          <Animated.View
            style={[viewerStyles.timerFill, { width: barWidth as any }]}
          />
        </View>

        {/* Header */}
        <View
          style={[
            viewerStyles.header,
            { paddingTop: insets.top + 20 },
          ]}
        >
          <View style={viewerStyles.snapBadge}>
            <Ionicons name="camera" size={14} color="#fff" />
            <Text style={viewerStyles.snapBadgeText}>Snap · tap to close</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={viewerStyles.closeBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Image */}
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        >
          <Image
            source={{ uri }}
            style={viewerStyles.image}
            resizeMode="contain"
          />
        </TouchableOpacity>

        {/* Bottom hint */}
        <View style={[viewerStyles.bottomHint, { paddingBottom: insets.bottom + 20 }]}>
          <Ionicons name="eye-off-outline" size={14} color="rgba(255,255,255,0.5)" />
          <Text style={viewerStyles.hintText}>
            This snap disappears after viewing
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
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
  timerFill: {
    height: 3,
    backgroundColor: "#EA580C",
    borderRadius: 2,
  },
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

// ─── ChatScreen ────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    userId: otherId,
    username,
    avatar_url,
    isVibeMatch,
  } = useLocalSearchParams<{
    userId: string;
    username: string;
    avatar_url?: string;
    isVibeMatch?: string;
  }>();
  const { session } = useAuth();
  const myId = session?.user?.id ?? "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [snapPreviewUri, setSnapPreviewUri] = useState<string | null>(null);
  const [snapSending, setSnapSending] = useState(false);
  const [snapViewer, setSnapViewer] = useState<{
    uri: string;
    messageId: string;
    msgText: string;
  } | null>(null);

  const flatRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isMatch = isVibeMatch === "true";
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // ── Load messages ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!myId || !otherId) return;
    setLoading(true);
    fetchMessages(myId, otherId)
      .then((msgs) => {
        setMessages(msgs);
        setLoading(false);
        setTimeout(
          () => flatRef.current?.scrollToEnd({ animated: false }),
          80,
        );
      })
      .catch(() => setLoading(false));
  }, [myId, otherId]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!myId || !otherId) return;

    const channel = supabase
      .channel(`chat:${[myId, otherId].sort().join(":")}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${otherId}`,
        },
        (payload: any) => {
          const incoming = payload.new as Message;
          if (incoming.receiver_id !== myId) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          setTimeout(
            () => flatRef.current?.scrollToEnd({ animated: true }),
            50,
          );
        },
      )
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${myId}`,
        },
        (payload: any) => {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m)),
          );
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, otherId]);

  // ── Send text ──────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const content = text.trim();
    if (!content || !myId || !otherId) return;

    const tempId = `temp_${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: myId,
      receiver_id: otherId,
      text: content,
      created_at: new Date().toISOString(),
    };

    setText("");
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);

    const saved = await sendMessageToUser(myId, otherId, content);
    if (saved) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? saved : m)),
      );
    }
  }, [text, myId, otherId]);

  // ── Open snap camera / library ─────────────────────────────────────────────
  const openSnapCamera = useCallback(async () => {
    try {
      if (Platform.OS !== "web") {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (camPerm.status === "granted") {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: "images",
            quality: 0.8,
          });
          if (!result.canceled) {
            setSnapPreviewUri(result.assets[0].uri);
            return;
          }
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        quality: 0.8,
      });
      if (!result.canceled) {
        setSnapPreviewUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Camera unavailable", "Could not open camera or photo library.");
    }
  }, []);

  // ── Send snap ──────────────────────────────────────────────────────────────
  const handleSendSnap = useCallback(async () => {
    if (!snapPreviewUri || !myId || !otherId) return;
    setSnapSending(true);

    const tempId = `temp_${Date.now()}`;
    const tempText = encodeSnap({ url: snapPreviewUri, type: "photo", viewed: false });
    const optimistic: Message = {
      id: tempId,
      sender_id: myId,
      receiver_id: otherId,
      text: tempText,
      created_at: new Date().toISOString(),
    };

    setSnapPreviewUri(null);
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);

    let snapUrl = snapPreviewUri;
    const uploaded = await uploadSnapToStorage(snapPreviewUri, myId);
    if (uploaded) snapUrl = uploaded;

    const saved = await sendSnapMessage(myId, otherId, snapUrl, "photo");
    setSnapSending(false);
    if (saved) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? saved : m)),
      );
    }
  }, [snapPreviewUri, myId, otherId]);

  // ── View snap ──────────────────────────────────────────────────────────────
  const handleViewSnap = useCallback((msg: Message) => {
    const snap = parseSnap(msg.text);
    if (!snap || snap.viewed) return;
    setSnapViewer({ uri: snap.url, messageId: msg.id, msgText: msg.text });
  }, []);

  const handleSnapViewerClose = useCallback(async () => {
    if (!snapViewer) return;
    const { messageId, msgText } = snapViewer;
    setSnapViewer(null);

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const snap = parseSnap(m.text);
        if (!snap) return m;
        return {
          ...m,
          text: encodeSnap({
            ...snap,
            viewed: true,
            viewed_at: new Date().toISOString(),
          }),
        };
      }),
    );

    if (!messageId.startsWith("temp_")) {
      await markSnapViewed(messageId, msgText);
    }
  }, [snapViewer]);

  const canSend = text.trim().length > 0;

  return (
    <View style={[chatStyles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          chatStyles.header,
          {
            paddingTop: topPad,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={chatStyles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() =>
            username && router.push(`/profile/${username}` as any)
          }
          style={chatStyles.headerCenter}
          activeOpacity={0.75}
        >
          <UserAvatar username={username} url={avatar_url} size={34} />
          <View>
            <View style={chatStyles.nameRow}>
              <Text
                style={[chatStyles.headerName, { color: colors.foreground }]}
              >
                {username ?? "Chat"}
              </Text>
              {isMatch && (
                <View style={chatStyles.matchBadge}>
                  <Text style={chatStyles.matchBadgeText}>💜 Match</Text>
                </View>
              )}
            </View>
            <Text style={[chatStyles.headerStatus, { color: "#10B981" }]}>
              ● Active now
            </Text>
          </View>
        </TouchableOpacity>

        <View style={chatStyles.headerRight}>
          <TouchableOpacity style={chatStyles.iconBtn}>
            <Ionicons name="call-outline" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={chatStyles.iconBtn}>
            <Ionicons
              name="videocam-outline"
              size={22}
              color={colors.foreground}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Match banner */}
      {isMatch && (
        <View style={chatStyles.vibeBanner}>
          <LinearGradient
            colors={[
              "rgba(124,58,237,0.25)",
              "rgba(249,115,22,0.15)",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={chatStyles.vibeBannerGrad}
          >
            <Text style={chatStyles.vibeBannerText}>
              💜 You and {username} matched — say hi!
            </Text>
          </LinearGradient>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* Messages list */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => {
            const isMe = item.sender_id === myId;
            const prevMsg = messages[index - 1];
            const showAvatar =
              !isMe &&
              (prevMsg?.sender_id !== item.sender_id || !prevMsg);
            return (
              <Bubble
                msg={item}
                isMe={isMe}
                otherUsername={username}
                otherAvatar={avatar_url}
                showAvatar={showAvatar}
                onViewSnap={() => handleViewSnap(item)}
              />
            );
          }}
          contentContainerStyle={chatStyles.messageList}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            loading ? null : (
              <View style={chatStyles.emptyChat}>
                <UserAvatar
                  username={username}
                  url={avatar_url}
                  size={72}
                />
                <Text
                  style={[
                    chatStyles.emptyChatName,
                    { color: colors.foreground },
                  ]}
                >
                  {username}
                </Text>
                <Text
                  style={[
                    chatStyles.emptyChatSub,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {isMatch
                    ? "You matched! Send the first message 💜"
                    : "No messages yet. Say hello!"}
                </Text>
                <View style={chatStyles.snapHint}>
                  <Ionicons name="camera" size={14} color="#EA580C" />
                  <Text style={chatStyles.snapHintText}>
                    Tap the camera icon to send a snap that disappears after viewing
                  </Text>
                </View>
              </View>
            )
          }
          onContentSizeChange={() => {
            if (messages.length > 0)
              flatRef.current?.scrollToEnd({ animated: false });
          }}
        />

        {/* Input bar */}
        <View
          style={[
            chatStyles.inputBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: bottomPad + 6,
            },
          ]}
        >
          {/* Snap camera button */}
          <TouchableOpacity
            style={chatStyles.snapBtn}
            onPress={openSnapCamera}
            activeOpacity={0.75}
          >
            <View style={chatStyles.snapBtnInner}>
              <Ionicons name="camera" size={20} color="#EA580C" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={chatStyles.inputAction}>
            <Ionicons
              name="happy-outline"
              size={24}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={colors.mutedForeground}
            style={[
              chatStyles.input,
              {
                backgroundColor: colors.muted,
                color: colors.foreground,
              },
            ]}
            multiline
            maxLength={1000}
            onSubmitEditing={send}
            blurOnSubmit={false}
          />

          {canSend ? (
            <TouchableOpacity onPress={send} style={chatStyles.sendBtn}>
              <LinearGradient
                colors={["#7C3AED", "#EA580C"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={chatStyles.sendGrad}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={chatStyles.inputAction}>
              <Ionicons
                name="mic-outline"
                size={24}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Snap capture preview sheet */}
      {snapPreviewUri && (
        <SnapCaptureSheet
          uri={snapPreviewUri}
          sending={snapSending}
          onSend={handleSendSnap}
          onCancel={() => setSnapPreviewUri(null)}
        />
      )}

      {/* Snap viewer */}
      {snapViewer && (
        <SnapViewerModal
          uri={snapViewer.uri}
          onClose={handleSnapViewerClose}
        />
      )}
    </View>
  );
}

const chatStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    gap: 4,
  },
  backBtn: { padding: 6 },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerName: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  matchBadge: {
    backgroundColor: "rgba(124,58,237,0.25)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#7C3AED",
  },
  matchBadgeText: {
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
    color: "#A78BFA",
  },
  headerStatus: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  headerRight: { flexDirection: "row", gap: 0 },
  iconBtn: { padding: 8 },
  vibeBanner: { overflow: "hidden" },
  vibeBannerGrad: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(124,58,237,0.3)",
  },
  vibeBannerText: {
    color: "#A78BFA",
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
  },
  messageList: {
    paddingVertical: 12,
    paddingBottom: 8,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  emptyChat: {
    flex: 1,
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyChatName: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  emptyChatSub: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
  snapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(234,88,12,0.1)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(234,88,12,0.25)",
    marginTop: 4,
  },
  snapHintText: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 4,
    borderTopWidth: 0.5,
  },
  snapBtn: { marginBottom: 4, padding: 2 },
  snapBtnInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(234,88,12,0.15)",
    borderWidth: 1.5,
    borderColor: "rgba(234,88,12,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  inputAction: { padding: 6, marginBottom: 4 },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  sendBtn: { marginBottom: 4 },
  sendGrad: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
