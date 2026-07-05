import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { fetchMessages, markMessagesRead, sendMessageToUser } from "@/lib/db";

export default function VibeMatchChatScreen() {
  const { matchId, matchName, matchImage } = useLocalSearchParams<{
    matchId: string;
    matchName: string;
    matchImage: string;
  }>();
  const { session } = useAuth();
  const myId = session?.user?.id ?? "";
  const colors = useColors();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const listRef = useRef<FlatList<any>>(null);

  const load = async () => {
    if (!myId || !matchId) return;
    try {
      setLoadError(false);
      const msgs = await fetchMessages(myId, matchId);
      setMessages(msgs);
      await markMessagesRead(myId, matchId).catch(() => {});
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, matchId]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending || !myId || !matchId) return;
    setSending(true);
    setText("");
    try {
      await sendMessageToUser(myId, matchId, t);
      await load();
    } catch {
      setText(t);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header — sits above the KAV so it never moves with the keyboard */}
      <View style={[s.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ marginRight: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        {matchImage ? (
          <Image source={{ uri: matchImage }} style={s.headerAvatar} />
        ) : (
          <View style={[s.headerAvatar, { backgroundColor: "rgba(124,58,237,0.3)", alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="person" size={18} color="#A78BFA" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[s.headerName, { color: colors.foreground }]} numberOfLines={1}>
            {matchName ?? "Vibe Match"}
          </Text>
          <Text style={[s.headerSub, { color: colors.mutedForeground }]}>💜 Vibe Match</Text>
        </View>
      </View>

      {/* KAV wraps only list + composer — header stays fixed above */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {loadError && (
          <View style={s.errorRow}>
            <Text style={[s.errorText, { color: colors.mutedForeground }]}>
              Couldn't load messages.
            </Text>
            <TouchableOpacity onPress={load}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id ?? item.created_at}
          style={{ flex: 1 }}
          contentContainerStyle={s.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={{ fontSize: 36 }}>💜</Text>
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                You matched! Say hello 👋
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.sender_id === myId;
            return (
              <View
                style={[
                  s.bubble,
                  isMe ? s.bubbleMe : s.bubbleThem,
                  !isMe && { backgroundColor: colors.muted },
                ]}
              >
                <Text style={[s.bubbleText, { color: isMe ? "#fff" : colors.foreground }]}>
                  {item.text ?? item.content}
                </Text>
                <Text style={[s.bubbleTime, { color: isMe ? "rgba(255,255,255,0.6)" : colors.mutedForeground }]}>
                  {item.created_at
                    ? new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : ""}
                </Text>
              </View>
            );
          }}
        />

        {/* Composer — safe-area bottom only; no tab bar here */}
        <View
          style={[
            s.inputRow,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: Math.max(bottomInset, 8) + 4,
            },
          ]}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Send a message…"
            placeholderTextColor={colors.mutedForeground}
            style={[s.input, { backgroundColor: colors.muted, color: colors.foreground }]}
            multiline
            returnKeyType="send"
            onSubmitEditing={send}
            blurOnSubmit
          />
          <TouchableOpacity
            onPress={send}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
            style={[s.sendBtn, { opacity: text.trim() && !sending ? 1 : 0.4 }]}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  headerAvatar: { width: 38, height: 38, borderRadius: 19 },
  headerName: { fontFamily: "Poppins_700Bold", fontSize: 15 },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: -1 },
  errorRow: { alignItems: "center", padding: 12, gap: 4 },
  errorText: { fontFamily: "Poppins_400Regular", fontSize: 13 },
  retryText: { color: "#A78BFA", fontFamily: "Poppins_500Medium", fontSize: 13 },
  listContent: { padding: 14, gap: 8, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  bubble: { maxWidth: "78%", paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, gap: 2 },
  bubbleMe: { alignSelf: "flex-end", backgroundColor: "#7C3AED", borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 20 },
  bubbleTime: { fontFamily: "Poppins_400Regular", fontSize: 10, alignSelf: "flex-end" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    padding: 10,
    borderTopWidth: 0.5,
  },
  input: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
});
