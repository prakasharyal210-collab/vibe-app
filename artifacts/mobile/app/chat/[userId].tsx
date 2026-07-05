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
  Platform,
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
import { fetchMessages, getOtherUserActivity, markMessagesRead, sendMessageToUser } from "@/lib/db";
import { SharedContentCard } from "@/components/SharedContentCard";
import {
  encodeSnap,
  isSnap,
  markSnapViewed,
  parseSnap,
  sendSnapMessage,
  uploadSnapToStorage,
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
  const isShareMsg = !!(msg.shared_content_type && msg.shared_preview);

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
      ) : isShareMsg ? (
        <SharedContentCard
          contentType={msg.shared_content_type!}
          contentId={msg.shared_content_id ?? ""}
          preview={msg.shared_preview!}
        />
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
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);

  const flatRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isMatch = isVibeMatch === "true";
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

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
