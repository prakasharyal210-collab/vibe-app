import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
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
import { Message, supabase, timeAgo } from "@/lib/supabase";

const MOCK_MESSAGES = (myId: string, otherId: string): Message[] => [
  {
    id: "m1",
    sender_id: otherId,
    receiver_id: myId,
    text: "Hey! Love your latest post",
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "m2",
    sender_id: myId,
    receiver_id: otherId,
    text: "Thanks so much! Took it near the lake",
    created_at: new Date(Date.now() - 3500000).toISOString(),
  },
  {
    id: "m3",
    sender_id: otherId,
    receiver_id: myId,
    text: "omg that photo was stunning!",
    created_at: new Date(Date.now() - 1800000).toISOString(),
  },
];

function Bubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      <View
        style={[
          styles.bubble,
          isMe
            ? styles.bubbleMe
            : { backgroundColor: colors.muted },
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: isMe ? "#fff" : colors.foreground },
          ]}
        >
          {msg.text}
        </Text>
        <Text
          style={[
            styles.bubbleTime,
            { color: isMe ? "rgba(255,255,255,0.6)" : colors.mutedForeground },
          ]}
        >
          {timeAgo(msg.created_at)}
        </Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId, username } = useLocalSearchParams<{ userId: string; username: string }>();
  const { session } = useAuth();
  const myId = session?.user?.id ?? "me";
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES(myId, userId ?? "other"));
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const newMsg: Message = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
      sender_id: myId,
      receiver_id: userId ?? "",
      text: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [newMsg, ...prev]);
    setText("");
    inputRef.current?.focus();

    try {
      await supabase.from("messages").insert({
        sender_id: myId,
        receiver_id: userId,
        text: trimmed,
      });
    } catch {
      // silent fail — message already shown locally
    }
  };

  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 67 : insets.top,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <UserAvatar username={username} size={36} />
        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: colors.foreground }]}>{username}</Text>
          <Text style={[styles.headerStatus, { color: "#7C3AED" }]}>Active now</Text>
        </View>
        <TouchableOpacity>
          <Ionicons name="videocam-outline" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <Bubble msg={item} isMe={item.sender_id === myId} />}
          inverted
          contentContainerStyle={styles.messageList}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!!messages.length}
        />

        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: bottomInset + 8,
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              { backgroundColor: colors.muted, color: colors.foreground },
            ]}
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={send}
          />
          <TouchableOpacity onPress={send} style={styles.sendBtn} disabled={!text.trim()}>
            <Ionicons
              name="send"
              size={20}
              color={text.trim() ? "#7C3AED" : colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    padding: 2,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  headerStatus: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
  messageList: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  bubbleRow: {
    alignItems: "flex-start",
  },
  bubbleRowMe: {
    alignItems: "flex-end",
  },
  bubble: {
    maxWidth: "75%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
  },
  bubbleMe: {
    backgroundColor: "#7C3AED",
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    lineHeight: 20,
  },
  bubbleTime: {
    fontSize: 10,
    fontFamily: "Poppins_400Regular",
    alignSelf: "flex-end",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: 0.5,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  sendBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
