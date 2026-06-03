import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
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
import { Message, supabase, timeAgo } from "@/lib/supabase";

// ─── Bubble ────────────────────────────────────────────────────────────────────
function Bubble({
  msg,
  isMe,
  otherUsername,
  otherAvatar,
  showAvatar,
}: {
  msg: Message;
  isMe: boolean;
  otherUsername?: string;
  otherAvatar?: string;
  showAvatar: boolean;
}) {
  const colors = useColors();
  const isTemp = msg.id.startsWith("temp_");

  return (
    <View style={[bubbleStyles.row, isMe ? bubbleStyles.rowMe : bubbleStyles.rowThem]}>
      {!isMe && (
        <View style={bubbleStyles.avatarSlot}>
          {showAvatar ? (
            <UserAvatar username={otherUsername} url={otherAvatar} size={28} />
          ) : null}
        </View>
      )}

      <View style={[bubbleStyles.bubble, isMe ? bubbleStyles.bubbleMe : { backgroundColor: colors.muted }]}>
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
          <Text style={[bubbleStyles.textThem, { color: colors.foreground }]}>{msg.text}</Text>
        )}
      </View>

      {isMe && (
        <View style={bubbleStyles.meta}>
          <Text style={bubbleStyles.time}>{timeAgo(msg.created_at)}</Text>
          <Ionicons
            name={isTemp ? "checkmark-outline" : "checkmark-done-outline"}
            size={12}
            color={isTemp ? "rgba(255,255,255,0.3)" : "#A78BFA"}
          />
        </View>
      )}
      {!isMe && (
        <Text style={[bubbleStyles.timeThem, { color: colors.mutedForeground }]}>
          {timeAgo(msg.created_at)}
        </Text>
      )}
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", marginBottom: 4, paddingHorizontal: 12 },
  rowMe: { justifyContent: "flex-end" },
  rowThem: { justifyContent: "flex-start" },
  avatarSlot: { width: 32, marginRight: 6 },
  bubble: { maxWidth: "72%", borderRadius: 18, overflow: "hidden" },
  bubbleMe: { borderBottomRightRadius: 4 },
  gradFill: { paddingHorizontal: 14, paddingVertical: 10 },
  textMe: { fontSize: 14, fontFamily: "Poppins_400Regular", color: "#fff", lineHeight: 20 },
  textThem: { fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 20, paddingHorizontal: 14, paddingVertical: 10 },
  meta: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 4, marginBottom: 2 },
  time: { fontSize: 9, fontFamily: "Poppins_400Regular", color: "rgba(255,255,255,0.35)" },
  timeThem: { fontSize: 9, fontFamily: "Poppins_400Regular", marginLeft: 4, marginBottom: 2 },
});

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId: otherId, username, avatar_url, isVibeMatch } = useLocalSearchParams<{
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
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 80);
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
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, otherId]);

  // ── Send ───────────────────────────────────────────────────────────────────
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
      setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
    }
  }, [text, myId, otherId]);

  const canSend = text.trim().length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => username && router.push(`/profile/${username}` as any)}
          style={styles.headerCenter}
          activeOpacity={0.75}
        >
          <UserAvatar username={username} url={avatar_url} size={34} />
          <View>
            <View style={styles.nameRow}>
              <Text style={[styles.headerName, { color: colors.foreground }]}>{username ?? "Chat"}</Text>
              {isMatch && (
                <View style={styles.matchBadge}>
                  <Text style={styles.matchBadgeText}>💜 Vibe</Text>
                </View>
              )}
            </View>
            <Text style={[styles.headerStatus, { color: "#10B981" }]}>● Active now</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="call-outline" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="videocam-outline" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Vibe match banner */}
      {isMatch && (
        <View style={styles.vibeBanner}>
          <LinearGradient colors={["rgba(124,58,237,0.25)", "rgba(249,115,22,0.15)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.vibeBannerGrad}>
            <Text style={styles.vibeBannerText}>💜 You and {username} vibed together — say hi!</Text>
          </LinearGradient>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        {/* Messages list */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => {
            const isMe = item.sender_id === myId;
            const prevMsg = messages[index - 1];
            const showAvatar = !isMe && (prevMsg?.sender_id !== item.sender_id || !prevMsg);
            return (
              <Bubble
                msg={item}
                isMe={isMe}
                otherUsername={username}
                otherAvatar={avatar_url}
                showAvatar={showAvatar}
              />
            );
          }}
          contentContainerStyle={styles.messageList}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.emptyChat}>
                <UserAvatar username={username} url={avatar_url} size={72} />
                <Text style={[styles.emptyChatName, { color: colors.foreground }]}>{username}</Text>
                <Text style={[styles.emptyChatSub, { color: colors.mutedForeground }]}>
                  {isMatch ? "You vibed! Send the first message 💜" : "No messages yet. Say hello!"}
                </Text>
              </View>
            )
          }
          onContentSizeChange={() => {
            if (messages.length > 0) flatRef.current?.scrollToEnd({ animated: false });
          }}
        />

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad + 6 }]}>
          <TouchableOpacity style={styles.inputAction}>
            <Ionicons name="happy-outline" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground }]}
            multiline
            maxLength={1000}
            onSubmitEditing={send}
            blurOnSubmit={false}
          />

          {canSend ? (
            <TouchableOpacity onPress={send} style={styles.sendBtn}>
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendGrad}>
                <Ionicons name="send" size={16} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.inputAction}>
              <Ionicons name="mic-outline" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  matchBadgeText: { fontSize: 10, fontFamily: "Poppins_700Bold", color: "#A78BFA" },
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
  messageList: { paddingVertical: 12, paddingBottom: 8, flexGrow: 1, justifyContent: "flex-end" },
  emptyChat: { flex: 1, alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyChatName: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  emptyChatSub: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 19 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 6,
    borderTopWidth: 0.5,
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
