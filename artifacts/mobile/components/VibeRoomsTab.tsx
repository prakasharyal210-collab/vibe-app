import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const { width: W, height: H } = Dimensions.get("window");

interface VibeRoom {
  id: string;
  emoji: string;
  name: string;
  category: string;
  members: number;
  isLive: boolean;
  memberPhotos: string[];
  description: string;
}

interface RoomMessage {
  id: string;
  username: string;
  text: string;
  time: string;
  avatar: string;
}

const VIBE_ROOMS: VibeRoom[] = [
  {
    id: "r1", emoji: "🎵", name: "Music Lovers", category: "Music",
    members: 847, isLive: true,
    memberPhotos: ["seed/rm1", "seed/rm2", "seed/rm3", "seed/rm4", "seed/rm5", "seed/rm6"],
    description: "Share your music taste, discover new artists, and vibe to the rhythm",
  },
  {
    id: "r2", emoji: "🎮", name: "Gamers Hub", category: "Gaming",
    members: 632, isLive: true,
    memberPhotos: ["seed/rg1", "seed/rg2", "seed/rg3", "seed/rg4", "seed/rg5", "seed/rg6"],
    description: "All genres welcome. Find your gaming crew and squads",
  },
  {
    id: "r3", emoji: "✈️", name: "Travel Buddies", category: "Travel",
    members: 1204, isLive: true,
    memberPhotos: ["seed/rt1", "seed/rt2", "seed/rt3", "seed/rt4", "seed/rt5", "seed/rt6"],
    description: "Plan trips, share destinations, find travel companions worldwide",
  },
  {
    id: "r4", emoji: "🍕", name: "Foodies", category: "Food",
    members: 521, isLive: false,
    memberPhotos: ["seed/rf1", "seed/rf2", "seed/rf3", "seed/rf4", "seed/rf5", "seed/rf6"],
    description: "Recipes, restaurants, food culture — eat your way through the world",
  },
  {
    id: "r5", emoji: "💪", name: "Fitness Tribe", category: "Fitness",
    members: 389, isLive: true,
    memberPhotos: ["seed/rfi1", "seed/rfi2", "seed/rfi3", "seed/rfi4", "seed/rfi5", "seed/rfi6"],
    description: "Workouts, nutrition, motivation — crush goals together",
  },
  {
    id: "r6", emoji: "📚", name: "Bookworms", category: "Books",
    members: 276, isLive: false,
    memberPhotos: ["seed/rb1", "seed/rb2", "seed/rb3", "seed/rb4", "seed/rb5", "seed/rb6"],
    description: "Book clubs, recommendations, literary discussions",
  },
  {
    id: "r7", emoji: "🎨", name: "Artists Corner", category: "Art",
    members: 445, isLive: false,
    memberPhotos: ["seed/ra1", "seed/ra2", "seed/ra3", "seed/ra4", "seed/ra5", "seed/ra6"],
    description: "Share your creations, get feedback, collab with other creators",
  },
  {
    id: "r8", emoji: "💼", name: "Entrepreneurs", category: "Business",
    members: 312, isLive: false,
    memberPhotos: ["seed/re1", "seed/re2", "seed/re3", "seed/re4", "seed/re5", "seed/re6"],
    description: "Founders, freelancers, side-hustlers — build and grow together",
  },
];

const MOCK_ROOM_MESSAGES: RoomMessage[] = [
  { id: "m1", username: "luna_sky", text: "Anyone else obsessed with Olivia Rodrigo's new album? 🎵", time: "2m", avatar: "seed/luna" },
  { id: "m2", username: "marcus_vibe", text: "Just dropped a new beat if anyone wants to listen 🎧", time: "4m", avatar: "seed/marcus" },
  { id: "m3", username: "kai_adventures", text: "This room is giving main character energy ✨", time: "6m", avatar: "seed/kai" },
  { id: "m4", username: "zoe.creates", text: "Indie alternative all day every day 🎸", time: "8m", avatar: "seed/zoe" },
  { id: "m5", username: "sofia_near", text: "Who's going to Coachella next year? 🌵", time: "12m", avatar: "seed/sofia" },
];

function RoomModal({ room, onClose }: { room: VibeRoom; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState(MOCK_ROOM_MESSAGES);
  const [text, setText] = useState("");
  const [joined, setJoined] = useState(false);
  const listRef = useRef<FlatList>(null);

  const topPad = Platform.OS === "web" ? 16 : insets.top + 8;
  const botPad = Platform.OS === "web" ? 16 : insets.bottom;

  const sendMessage = () => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newMsg: RoomMessage = {
      id: Date.now().toString(),
      username: "you",
      text: text.trim(),
      time: "now",
      avatar: "seed/me",
    };
    setMessages((m) => [...m, newMsg]);
    setText("");
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[roomStyles.container, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={["#1A0A2E", "#0A0A1A"]}
          style={roomStyles.headerGrad}
        >
          <View style={[roomStyles.header, { paddingTop: topPad }]}>
            <TouchableOpacity onPress={onClose} style={roomStyles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={roomStyles.headerInfo}>
              <Text style={roomStyles.roomEmoji}>{room.emoji}</Text>
              <View>
                <Text style={roomStyles.roomName}>{room.name}</Text>
                <View style={roomStyles.liveRow}>
                  {room.isLive && <View style={roomStyles.liveDot} />}
                  <Text style={roomStyles.memberCount}>{room.members.toLocaleString()} members</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={roomStyles.voiceBtn}>
              <Ionicons name="mic-outline" size={20} color="#A78BFA" />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={roomStyles.memberScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
            {room.memberPhotos.map((seed, i) => (
              <TouchableOpacity key={i} onPress={() => router.push(`/profile/${seed.split("/")[1]}` as any)}>
                <Image source={{ uri: `https://picsum.photos/${seed}/60/60` }} style={roomStyles.memberAvatar} />
              </TouchableOpacity>
            ))}
            <View style={[roomStyles.memberAvatar, { backgroundColor: "rgba(124,58,237,0.3)", alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ color: "#A78BFA", fontSize: 12, fontFamily: "Poppins_600SemiBold" }}>+{room.members - 6}</Text>
            </View>
          </ScrollView>

          <Text style={roomStyles.roomDesc}>{room.description}</Text>

          <TouchableOpacity
            onPress={() => { setJoined((j) => !j); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            style={[roomStyles.joinBtn, joined && roomStyles.joinBtnJoined]}
          >
            {joined ? (
              <Text style={[roomStyles.joinText, { color: "#A78BFA" }]}>✓ Joined</Text>
            ) : (
              <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={roomStyles.joinGrad}>
                <Text style={roomStyles.joinText}>Join Room</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </LinearGradient>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 14 }}
          renderItem={({ item }) => (
            <View style={[roomStyles.msgRow, item.username === "you" && roomStyles.msgRowOwn]}>
              {item.username !== "you" && (
                <Image source={{ uri: `https://picsum.photos/${item.avatar}/60/60` }} style={roomStyles.msgAvatar} />
              )}
              <View style={[roomStyles.msgBubble, { backgroundColor: item.username === "you" ? "rgba(124,58,237,0.3)" : colors.card }]}>
                {item.username !== "you" && (
                  <Text style={roomStyles.msgUser}>{item.username}</Text>
                )}
                <Text style={[roomStyles.msgText, { color: colors.foreground }]}>{item.text}</Text>
                <Text style={[roomStyles.msgTime, { color: colors.mutedForeground }]}>{item.time} ago</Text>
              </View>
            </View>
          )}
        />

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
          <View style={[roomStyles.inputRow, { borderTopColor: colors.border, paddingBottom: botPad + 8, backgroundColor: colors.background }]}>
            <TextInput
              style={[roomStyles.input, { backgroundColor: colors.muted, color: colors.foreground }]}
              value={text}
              onChangeText={setText}
              placeholder="Message the room..."
              placeholderTextColor={colors.mutedForeground}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={sendMessage} style={roomStyles.sendBtn}>
              <LinearGradient colors={["#7C3AED", "#EA580C"]} style={roomStyles.sendGrad}>
                <Ionicons name="send" size={16} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function RoomCard({ room }: { room: VibeRoom }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOpen(true); }}
        style={[roomCardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        activeOpacity={0.85}
      >
        <View style={roomCardStyles.topRow}>
          <Text style={roomCardStyles.emoji}>{room.emoji}</Text>
          {room.isLive && (
            <View style={roomCardStyles.liveBadge}>
              <View style={roomCardStyles.liveDot} />
              <Text style={roomCardStyles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        <Text style={[roomCardStyles.name, { color: colors.foreground }]}>{room.name}</Text>
        <Text style={[roomCardStyles.desc, { color: colors.mutedForeground }]} numberOfLines={2}>{room.description}</Text>
        <View style={roomCardStyles.memberRow}>
          {room.memberPhotos.slice(0, 4).map((seed, i) => (
            <View key={i} style={[roomCardStyles.memberAvatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 4 - i }]}>
              <Image source={{ uri: `https://picsum.photos/${seed}/60/60` }} style={{ width: "100%", height: "100%", borderRadius: 16 }} />
            </View>
          ))}
          <Text style={[roomCardStyles.memberCount, { color: colors.mutedForeground }]}>
            {room.members >= 1000 ? `${(room.members / 1000).toFixed(1)}k` : room.members} members
          </Text>
        </View>
        <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={roomCardStyles.joinBtn}>
          <Text style={roomCardStyles.joinText}>Enter Room →</Text>
        </LinearGradient>
      </TouchableOpacity>

      {open && <RoomModal room={room} onClose={() => setOpen(false)} />}
    </>
  );
}

export function VibeRoomsTab() {
  const colors = useColors();

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, gap: 14 }}>
      <View style={roomsTabStyles.header}>
        <Text style={[roomsTabStyles.title, { color: colors.foreground }]}>🏠 Vibe Rooms</Text>
        <Text style={[roomsTabStyles.sub, { color: colors.mutedForeground }]}>Meet people who share your interests</Text>
      </View>

      {VIBE_ROOMS.map((room) => (
        <RoomCard key={room.id} room={room} />
      ))}
    </ScrollView>
  );
}

const roomStyles = StyleSheet.create({
  container: { flex: 1 },
  headerGrad: { paddingBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  roomEmoji: { fontSize: 30 },
  roomName: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22C55E" },
  memberCount: { color: "rgba(255,255,255,0.65)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  voiceBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(124,58,237,0.2)", alignItems: "center", justifyContent: "center" },
  memberScroll: { maxHeight: 60, marginBottom: 8 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "#7C3AED" },
  roomDesc: { color: "rgba(255,255,255,0.65)", fontFamily: "Poppins_400Regular", fontSize: 13, paddingHorizontal: 16, lineHeight: 18, marginBottom: 12 },
  joinBtn: { marginHorizontal: 16, borderRadius: 14, overflow: "hidden" },
  joinBtnJoined: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: "#7C3AED", borderRadius: 14 },
  joinGrad: { paddingVertical: 12, alignItems: "center" },
  joinText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  msgRow: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  msgRowOwn: { flexDirection: "row-reverse" },
  msgAvatar: { width: 32, height: 32, borderRadius: 16 },
  msgBubble: { maxWidth: "75%", padding: 10, borderRadius: 16, gap: 3 },
  msgUser: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  msgText: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 19 },
  msgTime: { fontFamily: "Poppins_400Regular", fontSize: 10, alignSelf: "flex-end" },
  inputRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 0.5 },
  input: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 14 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, overflow: "hidden" },
  sendGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
});

const roomCardStyles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 0.5, padding: 16, gap: 10 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  emoji: { fontSize: 32 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(34,197,94,0.15)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22C55E" },
  liveText: { color: "#22C55E", fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 0.5 },
  name: { fontFamily: "Poppins_700Bold", fontSize: 17 },
  desc: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 18 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  memberAvatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: "#7C3AED", overflow: "hidden" },
  memberCount: { fontFamily: "Poppins_400Regular", fontSize: 12, marginLeft: 6 },
  joinBtn: { paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  joinText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
});

const roomsTabStyles = StyleSheet.create({
  header: { gap: 4, marginBottom: 4 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 22 },
  sub: { fontFamily: "Poppins_400Regular", fontSize: 13 },
});
