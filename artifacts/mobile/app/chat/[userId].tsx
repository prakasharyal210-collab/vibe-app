import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SnapCaptureSheet, SnapViewerModal } from "@/components/SnapViewer";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Image as ExpoImage } from "expo-image";
import { fetchMessages, getOtherUserActivity, markMessagesRead, reactToMessage, sendMessageToUser, uploadChatPhoto } from "@/lib/db";
import { FullscreenImageViewer } from "@/components/FullscreenImageViewer";
import { ReactionPickerModal } from "@/components/ReactionPickerModal";
import { SharedContentCard } from "@/components/SharedContentCard";
import {
  encodeSnap,
  isSnap,
  markSnapViewed,
  parseSnap,
  sendSnapMessage,
  uploadSnapToStorage,
  viewSnap,
} from "@/lib/snap";
import { Message, supabase, timeAgo } from "@/lib/supabase";
import { callAI, parseAIJson } from "@/lib/ai";

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
  const opened = snap.viewed;

  // Receiver — already opened: dim ghost pill
  if (!isMe && opened) {
    return (
      <View style={snapStyles.pill}>
        <Ionicons name="camera-outline" size={15} color="rgba(255,255,255,0.25)" />
        <Text style={snapStyles.labelOpened}>Opened</Text>
      </View>
    );
  }

  // Receiver — new snap: tappable pill with purple accent border
  if (!isMe) {
    return (
      <TouchableOpacity
        onPress={onView}
        activeOpacity={0.78}
        style={[snapStyles.pill, snapStyles.pillNew]}
      >
        <Ionicons name="camera-outline" size={16} color="#A78BFA" />
        <View style={snapStyles.textCol}>
          <Text style={snapStyles.label}>Tap to view</Text>
          <Text style={snapStyles.sublabel}>Disappears after viewing</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color="rgba(167,139,250,0.55)" />
      </TouchableOpacity>
    );
  }

  // Sender — opened: ghost
  if (opened) {
    return (
      <View style={snapStyles.pill}>
        <Ionicons name="camera-outline" size={15} color="rgba(255,255,255,0.25)" />
        <Text style={snapStyles.labelOpened}>{isTemp ? "Sending…" : "Opened"}</Text>
      </View>
    );
  }

  // Sender — delivered, not yet opened
  return (
    <View style={[snapStyles.pill, snapStyles.pillSent]}>
      <Ionicons name="camera-outline" size={15} color="rgba(255,255,255,0.65)" />
      <View style={snapStyles.textCol}>
        <Text style={snapStyles.label}>{isTemp ? "Sending…" : "Photo sent"}</Text>
        {!isTemp && <Text style={snapStyles.sublabel}>Waiting to be viewed</Text>}
      </View>
    </View>
  );
}

const snapStyles = StyleSheet.create({
  // Base pill — dark charcoal, matches chat dark theme
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 16,
    maxWidth: 240,
    backgroundColor: "rgba(28,28,40,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  // Receiver unviewed: purple accent border
  pillNew: {
    borderColor: "rgba(139,92,246,0.55)",
    backgroundColor: "rgba(28,24,45,0.95)",
  },
  // Sender delivered: slightly brighter border
  pillSent: {
    borderColor: "rgba(255,255,255,0.13)",
  },
  textCol: {
    flexShrink: 1,
  },
  label: {
    color: "rgba(255,255,255,0.88)",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  labelOpened: {
    color: "rgba(255,255,255,0.28)",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  sublabel: {
    color: "rgba(255,255,255,0.38)",
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    marginTop: 1,
  },
});

// ─── PhotoBubble ───────────────────────────────────────────────────────────────

function PhotoBubble({
  url,
  uploading,
  onPress,
}: {
  url: string;
  uploading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={uploading ? undefined : onPress}
      activeOpacity={0.85}
      style={photoStyles.container}
    >
      <ExpoImage
        source={{ uri: url }}
        style={photoStyles.image}
        contentFit="cover"
        transition={200}
      />
      {uploading && (
        <View style={photoStyles.overlay}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const photoStyles = StyleSheet.create({
  container: {
    width: 200,
    height: 200,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  image: { width: "100%", height: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── QuotedSnippet ─────────────────────────────────────────────────────────────

function QuotedSnippet({
  senderName,
  snippet,
  onPress,
}: {
  senderName: string;
  snippet: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={quotedStyles.container}
    >
      <View style={quotedStyles.accent} />
      <View style={quotedStyles.body}>
        <Text style={quotedStyles.name}>{senderName}</Text>
        <Text style={quotedStyles.snippet} numberOfLines={1}>
          {snippet}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const quotedStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 4,
    maxWidth: "100%",
  },
  accent: { width: 3, backgroundColor: "#A78BFA" },
  body: { flex: 1, paddingHorizontal: 8, paddingVertical: 5 },
  name: {
    color: "#A78BFA",
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  snippet: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
});

// ─── Bubble ────────────────────────────────────────────────────────────────────

function Bubble({
  msg,
  isMe,
  otherUsername,
  otherAvatar,
  showAvatar,
  viewerId,
  onViewSnap,
  onLongPress,
  onSwipeRight,
  onTapQuote,
  isUploading,
  onViewPhoto,
}: {
  msg: Message;
  isMe: boolean;
  otherUsername?: string;
  otherAvatar?: string;
  showAvatar: boolean;
  viewerId: string;
  onViewSnap: () => void;
  onLongPress: (msgId: string) => void;
  onSwipeRight: (msg: Message) => void;
  onTapQuote?: (msgId: string) => void;
  isUploading?: boolean;
  onViewPhoto?: (url: string) => void;
}) {
  const colors = useColors();
  const isTemp = msg.id.startsWith("temp_");
  const isSnapMsg = isSnap(msg.text);
  const isPhotoMsg = msg.message_type === "photo";
  const isShareMsg = !!(msg.shared_content_type && msg.shared_preview);

  const reactions = msg.reactions ?? [];
  const groups: Record<string, string[]> = {};
  for (const r of reactions) {
    if (!groups[r.emoji]) groups[r.emoji] = [];
    groups[r.emoji].push(r.userId);
  }
  const hasReactions = Object.keys(groups).length > 0;
  const myReactionEmoji = reactions.find((r) => r.userId === viewerId)?.emoji;

  const handleLongPress = () => {
    if (!isTemp) onLongPress(msg.id);
  };

  // Swipe-right to reply — uses a stable ref so PanResponder never goes stale
  const onSwipeRightRef = useRef(onSwipeRight);
  onSwipeRightRef.current = onSwipeRight;
  const panRef = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        dx > 12 && Math.abs(dy) < Math.abs(dx) * 0.8,
      onPanResponderRelease: (_, { dx }) => {
        if (dx > 50) onSwipeRightRef.current(msg);
      },
    }),
  ).current;

  return (
    <View
      {...panRef.panHandlers}
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

      <View style={{ maxWidth: "80%" }}>
        {!!msg.reply_preview && !isSnapMsg && (
          <QuotedSnippet
            senderName={
              msg.reply_preview.sender_id === viewerId
                ? "You"
                : msg.reply_preview.sender_username
            }
            snippet={msg.reply_preview.text_snippet}
            onPress={
              msg.reply_to_message_id
                ? () => onTapQuote?.(msg.reply_to_message_id!)
                : undefined
            }
          />
        )}
        {isSnapMsg ? (
          <SnapBubble msg={msg} isMe={isMe} onView={onViewSnap} />
        ) : isPhotoMsg ? (
          <PhotoBubble
            url={msg.text}
            uploading={!!isUploading}
            onPress={() => onViewPhoto?.(msg.text)}
          />
        ) : isShareMsg ? (
          <Pressable onLongPress={handleLongPress} delayLongPress={380}>
            <SharedContentCard
              contentType={msg.shared_content_type!}
              contentId={msg.shared_content_id ?? ""}
              preview={msg.shared_preview!}
            />
          </Pressable>
        ) : (
          <Pressable
            onLongPress={handleLongPress}
            delayLongPress={380}
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
          </Pressable>
        )}

        {hasReactions && (
          <View
            style={[
              bubbleStyles.reactionRow,
              { alignSelf: isMe ? "flex-start" : "flex-end" },
            ]}
          >
            {Object.entries(groups).map(([emoji, userIds]) => (
              <View
                key={emoji}
                style={[
                  bubbleStyles.reactionBadge,
                  myReactionEmoji === emoji && bubbleStyles.reactionBadgeMine,
                ]}
              >
                <Text style={bubbleStyles.reactionEmoji}>{emoji}</Text>
                {userIds.length > 1 && (
                  <Text style={bubbleStyles.reactionCount}>
                    {userIds.length}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

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
  bubble: { borderRadius: 18, overflow: "hidden" },
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
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: -4,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  reactionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  reactionBadgeMine: {
    backgroundColor: "rgba(124,58,237,0.25)",
    borderColor: "rgba(124,58,237,0.6)",
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.7)",
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
    prefill,
  } = useLocalSearchParams<{
    userId: string;
    username: string;
    avatar_url?: string;
    isVibeMatch?: string;
    prefill?: string;
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
    type: "photo" | "video";
    messageId: string;
    msgText: string;
  } | null>(null);
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{
    messageId: string;
    senderName: string;
    snippet: string;
  } | null>(null);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [viewerPhoto, setViewerPhoto] = useState<string | null>(null);

  const flatRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isMatch = isVibeMatch === "true";
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Pre-fill composer from prompt reply
  useEffect(() => {
    if (prefill) setText(prefill);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load messages + activity status ────────────────────────────────────────
  useEffect(() => {
    if (!myId || !otherId) return;
    setLoading(true);
    // Load messages, mark them read, and fetch the other user's last-active in parallel
    Promise.all([
      fetchMessages(myId, otherId),
      getOtherUserActivity(otherId),
    ])
      .then(([msgs, activeAt]) => {
        setMessages(msgs);
        setLastActiveAt(activeAt);
        setLoading(false);
        setTimeout(
          () => flatRef.current?.scrollToEnd({ animated: false }),
          80,
        );
        // Mark incoming messages as read (fire-and-forget)
        void markMessagesRead(myId, otherId);
      })
      .catch(() => setLoading(false));
  }, [myId, otherId]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!myId || !otherId) return;

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`chat:${[myId, otherId].sort().join(":")}:${suffix}`)
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
          // User is actively viewing chat — immediately mark the new message read
          void markMessagesRead(myId, otherId);
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
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "message_reactions" }, (payload: any) => {
        const r = payload.new as any;
        setMessages((prev) => prev.map((m) => {
          if (m.id !== r.message_id) return m;
          const already = (m.reactions ?? []).some((rx) => rx.userId === r.user_id);
          if (already) return m;
          return { ...m, reactions: [...(m.reactions ?? []), { userId: r.user_id, emoji: r.emoji }] };
        }));
      })
      .on("postgres_changes" as any, { event: "DELETE", schema: "public", table: "message_reactions" }, (payload: any) => {
        const r = payload.old as any;
        setMessages((prev) => prev.map((m) => {
          if (m.id !== r.message_id) return m;
          return { ...m, reactions: (m.reactions ?? []).filter((rx) => rx.userId !== r.user_id) };
        }));
      })
      .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "message_reactions" }, (payload: any) => {
        const r = payload.new as any;
        setMessages((prev) => prev.map((m) => {
          if (m.id !== r.message_id) return m;
          return { ...m, reactions: (m.reactions ?? []).map((rx) => rx.userId === r.user_id ? { userId: rx.userId, emoji: r.emoji } : rx) };
        }));
      })
      .subscribe();
    } catch { /* channel collision — safe to ignore */ }

    channelRef.current = channel;
    return () => {
      if (channel) supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [myId, otherId]);

  // ── Polling fallback (15 s) — catches messages that realtime misses ────────
  useEffect(() => {
    if (!myId || !otherId) return;
    const interval = setInterval(async () => {
      try {
        const msgs = await fetchMessages(myId, otherId);
        if (msgs.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = msgs.filter((m) => !existingIds.has(m.id));
            if (newMsgs.length === 0) return prev;
            const merged = [...prev, ...newMsgs].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);
            return merged;
          });
        }
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [myId, otherId]);

  // ── Smart reply suggestions ────────────────────────────────────────────────
  useEffect(() => {
    const lastFromThem = [...messages].reverse().find(
      (m) => m.sender_id === otherId && !isSnap(m.text),
    );
    if (!lastFromThem) { setSmartReplies([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await callAI("smart_reply", { lastMessage: lastFromThem.text }, { noCache: true });
      if (cancelled) return;
      const parsed = parseAIJson<{ replies?: string[] }>(result, {});
      setSmartReplies(parsed.replies ?? []);
    }, 700);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [messages.length, otherId]);

  // ── Send text ──────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const content = text.trim();
    if (!content || !myId || !otherId) return;

    const tempId = `temp_${Date.now()}`;
    const replySnapshot = replyTo;
    const optimistic: Message = {
      id: tempId,
      sender_id: myId,
      receiver_id: otherId,
      text: content,
      created_at: new Date().toISOString(),
      reply_to_message_id: replySnapshot?.messageId,
      reply_preview: replySnapshot
        ? {
            sender_username: replySnapshot.senderName,
            sender_id:
              replySnapshot.senderName === "You" ? myId : otherId,
            text_snippet: replySnapshot.snippet,
          }
        : undefined,
    };

    setText("");
    setReplyTo(null);
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);

    const saved = await sendMessageToUser(
      myId,
      otherId,
      content,
      undefined,
      replySnapshot?.messageId,
    );
    if (saved) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? saved : m)),
      );
    }
  }, [text, myId, otherId, replyTo]);

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
  const handleViewSnap = useCallback(async (msg: Message) => {
    const snap = parseSnap(msg.text);
    if (!snap || snap.viewed) return;

    console.log("[handleViewSnap-chat] msg.id:", msg.id, "snap.url prefix:", (snap.url ?? "").slice(0, 60));

    // Sign-on-view: ask the server for a fresh 1-hour URL so TTL starts now,
    // not at upload time. Falls back to the stored URL for legacy snaps.
    const viewed = myId ? await viewSnap(msg.id, myId) : null;
    console.log("[handleViewSnap-chat] viewSnap result:", viewed ? "got signedUrl" : "null — fallback to snap.url");

    const uri = viewed?.signedUrl ?? snap.url;
    const type = (viewed?.mediaType ?? snap.type ?? "photo") as "photo" | "video";

    setSnapViewer({ uri, type, messageId: msg.id, msgText: msg.text });
  }, [myId]);

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

  const handleReact = useCallback(async (msgId: string, emoji: string) => {
    setPickerMsgId(null);
    if (!myId) return;
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const existing = (m.reactions ?? []).find((r) => r.userId === myId);
        let newReactions: Array<{ userId: string; emoji: string }>;
        if (existing?.emoji === emoji) {
          // Same emoji → remove
          newReactions = (m.reactions ?? []).filter((r) => r.userId !== myId);
        } else if (existing) {
          // Different emoji → replace
          newReactions = (m.reactions ?? []).map((r) =>
            r.userId === myId ? { ...r, emoji } : r,
          );
        } else {
          // New reaction
          newReactions = [...(m.reactions ?? []), { userId: myId, emoji }];
        }
        return { ...m, reactions: newReactions };
      }),
    );
    try {
      await reactToMessage(msgId, myId, emoji);
    } catch {
      // Revert on failure — re-fetch authoritative state
      fetchMessages(myId, otherId).then(setMessages).catch(() => {});
    }
  }, [myId, otherId]);

  const handleGalleryPhoto = useCallback(async () => {
    if (!myId || !otherId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? "image/jpeg";

    const tempId = `temp_photo_${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: myId,
      receiver_id: otherId,
      text: asset.uri,
      message_type: "photo",
      created_at: new Date().toISOString(),
    };
    setUploadingIds((prev) => new Set([...prev, tempId]));
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const photoUrl = await uploadChatPhoto(asset.uri, mimeType, myId);
      if (!photoUrl) throw new Error("upload failed");
      const saved = await sendMessageToUser(myId, otherId, photoUrl, undefined, undefined, "photo");
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (saved ?? m) : m)));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert("Failed to send photo", "Please try again.");
    } finally {
      setUploadingIds((prev) => {
        const s = new Set(prev);
        s.delete(tempId);
        return s;
      });
    }
  }, [myId, otherId]);

  const handleSwipeRight = useCallback((msg: Message) => {
    const senderName = msg.sender_id === myId ? "You" : (username ?? "");
    const isSnapMsg = isSnap(msg.text);
    const snippet = isSnapMsg
      ? "📷 Photo"
      : msg.shared_content_type
      ? `📎 Shared ${msg.shared_content_type}`
      : msg.text.length > 60
      ? msg.text.slice(0, 57) + "…"
      : msg.text;
    setReplyTo({ messageId: msg.id, senderName, snippet });
  }, [myId, username]);

  const handleScrollToOriginal = useCallback((msgId: string) => {
    const index = messages.findIndex((m) => m.id === msgId);
    if (index >= 0) {
      flatRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    }
  }, [messages]);

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
            <Text
              style={[
                chatStyles.headerStatus,
                {
                  color: (() => {
                    if (!lastActiveAt) return "rgba(255,255,255,0.35)";
                    const mins = (Date.now() - new Date(lastActiveAt).getTime()) / 60000;
                    return mins < 5 ? "#10B981" : "rgba(255,255,255,0.35)";
                  })(),
                },
              ]}
            >
              {(() => {
                if (!lastActiveAt) return "● Offline";
                const mins = (Date.now() - new Date(lastActiveAt).getTime()) / 60000;
                if (mins < 5) return "● Active now";
                if (mins < 60) return `● Active ${Math.floor(mins)}m ago`;
                const hrs = Math.floor(mins / 60);
                return `● Active ${hrs}h ago`;
              })()}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={chatStyles.headerRight}>
          <TouchableOpacity
            style={chatStyles.iconBtn}
            onPress={() => Alert.alert("Voice Call", "Coming soon ✨", [{ text: "OK" }])}
          >
            <Ionicons name="call-outline" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={chatStyles.iconBtn}
            onPress={() => Alert.alert("Video Call", "Coming soon ✨", [{ text: "OK" }])}
          >
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 4 }}>
                {[
                  { label: "🎲 Icebreakers", type: "icebreakers" },
                  { label: "💬 Starters", type: "conversation_starters" },
                  { label: "💡 Date Ideas", type: "date_ideas" },
                ].map((btn) => (
                  <TouchableOpacity
                    key={btn.type}
                    onPress={async () => {
                      const result = await callAI(btn.type, { theirName: username, sharedInterests: [] });
                      const key = btn.type === "icebreakers" ? "questions" : btn.type === "conversation_starters" ? "starters" : "ideas";
                      const parsed = parseAIJson<Record<string, unknown[]>>(result, {});
                      const items = (parsed[key] ?? []) as Array<string | { title?: string }>;
                      const first = typeof items[0] === "string" ? items[0] : (items[0] as any)?.title ?? "";
                      if (first) setText(first);
                    }}
                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(124,58,237,0.5)" }}
                  >
                    <Text style={{ color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 11 }}>{btn.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </LinearGradient>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Messages list */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
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
                viewerId={myId}
                onViewSnap={() => handleViewSnap(item)}
                onLongPress={setPickerMsgId}
                onSwipeRight={handleSwipeRight}
                onTapQuote={handleScrollToOriginal}
                isUploading={uploadingIds.has(item.id)}
                onViewPhoto={setViewerPhoto}
              />
            );
          }}
          contentContainerStyle={chatStyles.messageList}
          onScrollToIndexFailed={() => {}}
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

        {/* Smart Reply Pills */}
        {smartReplies.length > 0 && !text && (
          <View style={{ flexShrink: 0 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6 }}
              style={{ flexGrow: 0 }}
            >
              {smartReplies.map((r, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => { setText(r); setSmartReplies([]); }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "rgba(124,58,237,0.15)", borderWidth: 1, borderColor: "rgba(124,58,237,0.35)", alignSelf: "center" }}
                >
                  <Text style={{ color: "#A78BFA", fontFamily: "Poppins_500Medium", fontSize: 12 }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Reply-to bar */}
        {replyTo && (
          <View
            style={[
              chatStyles.replyBar,
              { backgroundColor: colors.card, borderTopColor: colors.border },
            ]}
          >
            <View style={chatStyles.replyBarAccent} />
            <View style={{ flex: 1 }}>
              <Text style={chatStyles.replyBarName}>
                Replying to {replyTo.senderName}
              </Text>
              <Text
                style={[chatStyles.replyBarSnippet, { color: colors.mutedForeground }]}
                numberOfLines={1}
              >
                {replyTo.snippet}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

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

          {/* Gallery photo button — sends a persistent photo (not a snap) */}
          <TouchableOpacity
            style={chatStyles.snapBtn}
            onPress={handleGalleryPhoto}
            activeOpacity={0.75}
          >
            <View style={chatStyles.galleryBtnInner}>
              <Ionicons name="image-outline" size={20} color="#7C3AED" />
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
          type={snapViewer.type}
          onClose={handleSnapViewerClose}
        />
      )}

      {/* Full-screen photo viewer */}
      {viewerPhoto && (
        <FullscreenImageViewer
          images={[viewerPhoto]}
          initialIndex={0}
          visible={!!viewerPhoto}
          onClose={() => setViewerPhoto(null)}
        />
      )}

      {/* Reaction picker */}
      <ReactionPickerModal
        visible={!!pickerMsgId}
        msgId={pickerMsgId}
        myReaction={pickerMsgId
          ? messages.find((m) => m.id === pickerMsgId)?.reactions?.find((r) => r.userId === myId)?.emoji
          : undefined}
        myId={myId}
        otherUsername={username}
        reactions={pickerMsgId
          ? messages.find((m) => m.id === pickerMsgId)?.reactions
          : undefined}
        onSelect={handleReact}
        onClose={() => setPickerMsgId(null)}
      />
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
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: 0.5,
  },
  replyBarAccent: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: "#A78BFA",
    borderRadius: 2,
  },
  replyBarName: {
    color: "#A78BFA",
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  replyBarSnippet: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
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
  galleryBtnInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(124,58,237,0.15)",
    borderWidth: 1.5,
    borderColor: "rgba(124,58,237,0.4)",
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
