import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { callAI } from "@/lib/ai";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  "Write me a bio ✨",
  "Caption ideas 📸",
  "Reel script 🎬",
  "Hashtag ideas #",
  "Date ideas 💡",
];

export default function AIChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! 👋 I'm Gundruk AI — your dark aesthetic creative co-pilot. Ask me anything: captions, bio writing, reel scripts, date ideas, or just vibe with me 🫶",
    },
  ]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomPad = Platform.OS === "ios" ? insets.bottom : 12;

  const send = async (override?: string) => {
    const content = (override ?? text).trim();
    if (!content || loading) return;
    setText("");

    const userMsg: ChatMsg = { id: `u_${Date.now()}`, role: "user", content };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 50);

    setLoading(true);
    const history = nextMsgs.map((m) => ({ role: m.role, content: m.content }));
    const result = await callAI("general", {}, { messages: history, noCache: true });
    setLoading(false);

    const aiMsg: ChatMsg = {
      id: `a_${Date.now()}`,
      role: "assistant",
      content: result ?? "Sorry, I couldn't respond right now. Try again! 🙏",
    };
    setMessages((prev) => [...prev, aiMsg]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={["rgba(124,58,237,0.18)", "rgba(234,88,12,0.08)"]}
        style={[s.header, { paddingTop: (Platform.OS === "ios" ? insets.top : 16) + 8, borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.aiAvatar}>
            <Text style={s.aiAvatarEmoji}>🤖</Text>
          </View>
          <View>
            <Text style={[s.headerName, { color: colors.foreground }]}>Gundruk AI</Text>
            <Text style={[s.headerSub, { color: "#10B981" }]}>● Always online</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Messages */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.list}
          keyboardDismissMode="interactive"
          renderItem={({ item }) => (
            <View style={[s.row, item.role === "user" ? s.rowMe : s.rowThem]}>
              {item.role === "assistant" && (
                <View style={s.aiBubbleAvatar}>
                  <Text style={{ fontSize: 14 }}>🤖</Text>
                </View>
              )}
              {item.role === "user" ? (
                <LinearGradient
                  colors={["#7C3AED", "#EA580C"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[s.bubble, s.bubbleMe]}
                >
                  <Text style={s.textMe}>{item.content}</Text>
                </LinearGradient>
              ) : (
                <View style={[s.bubble, s.bubbleThem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.textThem, { color: colors.foreground }]}>{item.content}</Text>
                </View>
              )}
            </View>
          )}
          ListFooterComponent={
            loading ? (
              <View style={[s.row, s.rowThem]}>
                <View style={s.aiBubbleAvatar}><Text style={{ fontSize: 14 }}>🤖</Text></View>
                <View style={[s.bubble, s.bubbleThem, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 14, paddingHorizontal: 18 }]}>
                  <ActivityIndicator size="small" color="#7C3AED" />
                </View>
              </View>
            ) : null
          }
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Quick prompts */}
        <View style={s.quickRow}>
          {QUICK_PROMPTS.map((q) => (
            <TouchableOpacity key={q} onPress={() => send(q)} style={[s.quickPill, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[s.quickText, { color: colors.foreground }]}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input */}
        <View style={[s.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad + 6 }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask me anything..."
            placeholderTextColor={colors.mutedForeground}
            style={[s.input, { backgroundColor: colors.muted, color: colors.foreground }]}
            multiline
            maxLength={800}
          />
          <TouchableOpacity onPress={() => send()} disabled={!text.trim() || loading} style={s.sendBtn}>
            <LinearGradient
              colors={text.trim() ? ["#7C3AED", "#EA580C"] : ["#374151", "#374151"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.sendGrad}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 0.5 },
  backBtn: { padding: 6 },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8 },
  aiAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(124,58,237,0.2)", borderWidth: 1.5, borderColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
  aiAvatarEmoji: { fontSize: 20 },
  headerName: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  list: { paddingVertical: 16, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "flex-end", marginBottom: 8, paddingHorizontal: 12 },
  rowMe: { justifyContent: "flex-end" },
  rowThem: { justifyContent: "flex-start", gap: 8 },
  aiBubbleAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(124,58,237,0.15)", alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "78%", borderRadius: 18 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleThem: { borderBottomLeftRadius: 4, borderWidth: 0.5, paddingHorizontal: 14, paddingVertical: 10 },
  textMe: { color: "#fff", fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 20, paddingHorizontal: 14, paddingVertical: 10 },
  textThem: { fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 20 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  quickPill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 0.5 },
  quickText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 10, paddingTop: 8, gap: 8, borderTopWidth: 0.5 },
  input: { flex: 1, minHeight: 38, maxHeight: 100, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, fontFamily: "Poppins_400Regular" },
  sendBtn: { marginBottom: 4 },
  sendGrad: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
