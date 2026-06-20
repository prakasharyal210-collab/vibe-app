import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  joinVibeRoom,
  getRoomMessages,
  sendRoomMessage,
  VibeRoomMessage,
} from "@/lib/db";

const { width: W } = Dimensions.get("window");
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "";

interface VibeRoom {
  id: string;
  emoji: string;
  name: string;
  category: string;
  isLive: boolean;
  memberPhotos: string[];
  description: string;
}

interface RoomStatus {
  joined: boolean;
  memberCount: number;
}

interface RoomMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  time: string;
  avatar: string;
}

const VIBE_ROOMS: VibeRoom[] = [
  {
    id: "r1", emoji: "🎵", name: "Music Lovers", category: "Music",
    isLive: true,
    memberPhotos: ["seed/rm1", "seed/rm2", "seed/rm3", "seed/rm4", "seed/rm5", "seed/rm6"],
    description: "Share your music taste, discover new artists, and vibe to the rhythm",
  },
  {
    id: "r2", emoji: "🎮", name: "Gamers Hub", category: "Gaming",
    isLive: true,
    memberPhotos: ["seed/rg1", "seed/rg2", "seed/rg3", "seed/rg4", "seed/rg5", "seed/rg6"],
    description: "All genres welcome. Find your gaming crew and squads",
  },
  {
    id: "r3", emoji: "✈️", name: "Travel Buddies", category: "Travel",
    isLive: true,
    memberPhotos: ["seed/rt1", "seed/rt2", "seed/rt3", "seed/rt4", "seed/rt5", "seed/rt6"],
    description: "Plan trips, share destinations, find travel companions worldwide",
  },
  {
    id: "r4", emoji: "🍕", name: "Foodies", category: "Food",
    isLive: false,
    memberPhotos: ["seed/rf1", "seed/rf2", "seed/rf3", "seed/rf4", "seed/rf5", "seed/rf6"],
    description: "Recipes, restaurants, food culture — eat your way through the world",
  },
  {
    id: "r5", emoji: "💪", name: "Fitness Tribe", category: "Fitness",
    isLive: true,
    memberPhotos: ["seed/rfi1", "seed/rfi2", "seed/rfi3", "seed/rfi4", "seed/rfi5", "seed/rfi6"],
    description: "Workouts, nutrition, motivation — crush goals together",
  },
  {
    id: "r6", emoji: "📚", name: "Bookworms", category: "Books",
    isLive: false,
    memberPhotos: ["seed/rb1", "seed/rb2", "seed/rb3", "seed/rb4", "seed/rb5", "seed/rb6"],
    description: "Book clubs, recommendations, literary discussions",
  },
  {
    id: "r7", emoji: "🎨", name: "Artists Corner", category: "Art",
    isLive: false,
    memberPhotos: ["seed/ra1", "seed/ra2", "seed/ra3", "seed/ra4", "seed/ra5", "seed/ra6"],
    description: "Share your creations, get feedback, collab with other creators",
  },
  {
    id: "r8", emoji: "💼", name: "Entrepreneurs", category: "Business",
    isLive: false,
    memberPhotos: ["seed/re1", "seed/re2", "seed/re3", "seed/re4", "seed/re5", "seed/re6"],
    description: "Founders, freelancers, side-hustlers — build and grow together",
  },
];

function formatMsgTime(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function mapApiMessage(r: VibeRoomMessage): RoomMessage {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.profiles?.full_name ?? r.profiles?.username ?? "Vibe User",
    text: r.text,
    time: formatMsgTime(r.created_at),
    avatar: `seed/${r.user_id.slice(0, 8)}`,
  };
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── RoomModal ─────────────────────────────────────────────────────────────────
function RoomModal({
  room, userId, initialJoined, initialMemberCount, onClose, onJoined,
}: {
  room: VibeRoom;
  userId?: string;
  initialJoined: boolean;
  initialMemberCount: number;
  onClose: () => void;
  onJoined: (roomId: string, newCount: number) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [joined, setJoined] = useState(initialJoined);
  const [memberCount, setMemberCount] = useState(initialMemberCount);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const topPad = Platform.OS === "web" ? 16 : insets.top + 8;
  const botPad = Platform.OS === "web" ? 16 : insets.bottom;

  useEffect(() => {
    if (!joined) return;

    getRoomMessages(room.id).then((rows) => {
      if (rows.length > 0) setMessages(rows.map(mapApiMessage));
    }).catch(() => {});

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`room:${room.id}:${suffix}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "vibe_room_messages", filter: `room_id=eq.${room.id}` },
          (payload) => {
            try {
              const row = payload.new as VibeRoomMessage;
              setMessages((prev) => [...prev, mapApiMessage(row)]);
              setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
            } catch { }
          },
        )
        .subscribe();
    } catch { }
    channelRef.current = channel;

    return () => {
      if (channel) supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [joined, room.id]);

  const handleJoin = async () => {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoined(true);
    try {
      const result = await joinVibeRoom(userId, room.id);
      const newCount = result.memberCount > 0 ? result.memberCount : memberCount + 1;
      setMemberCount(newCount);
      onJoined(room.id, newCount);
    } catch {
      setJoined(false);
    }
  };

  const sendMessage = async () => {
    if (!text.trim() || !userId || sending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const draft = text.trim();
    const optimistic: RoomMessage = {
      id: `opt_${Date.now()}`,
      userId,
      username: "you",
      text: draft,
      time: "now",
      avatar: `seed/${userId.slice(0, 8)}`,
    };
    setMessages((m) => [...m, optimistic]);
    setText("");
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    setSending(true);
    try {
      await sendRoomMessage(userId, room.id, draft);
    } catch {
      setMessages((m) => m.filter((msg) => msg.id !== optimistic.id));
      setText(draft);
    } finally {
      setSending(false);
    }
  };

  const memberLabel = memberCount > 0
    ? `${formatCount(memberCount)} member${memberCount !== 1 ? "s" : ""}`
    : "Be the first!";

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[roomStyles.container, { backgroundColor: colors.background }]}>
        <LinearGradient colors={["#1A0A2E", "#0A0A1A"]} style={roomStyles.headerGrad}>
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
                  <Text style={roomStyles.memberCount}>{memberLabel}</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={roomStyles.voiceBtn}>
              <Ionicons name="people-outline" size={20} color="#A78BFA" />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={roomStyles.memberScroll}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
          >
            {room.memberPhotos.map((seed, i) => (
              <TouchableOpacity key={i} onPress={() => router.push(`/profile/${seed.split("/")[1]}` as any)}>
                <Image source={{ uri: `https://picsum.photos/${seed}/60/60` }} style={roomStyles.memberAvatar} />
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={roomStyles.roomDesc}>{room.description}</Text>

          <TouchableOpacity
            onPress={joined ? undefined : handleJoin}
            style={[roomStyles.joinBtn, joined && roomStyles.joinBtnJoined]}
            activeOpacity={joined ? 1 : 0.85}
          >
            {joined ? (
              <View style={roomStyles.joinGrad}>
                <Text style={[roomStyles.joinText, { color: "#A78BFA" }]}>✓ Joined</Text>
              </View>
            ) : (
              <LinearGradient
                colors={["#7C3AED", "#EA580C"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={roomStyles.joinGrad}
              >
                <Text style={roomStyles.joinText}>Join Room</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </LinearGradient>

        {!joined ? (
          <View style={roomStyles.preJoinHint}>
            <Text style={[roomStyles.preJoinText, { color: colors.mutedForeground }]}>
              Join the room to read messages and chat with members 💬
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 14 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const isOwn = item.userId === userId || item.username === "you";
              return (
                <View style={[roomStyles.msgRow, isOwn && roomStyles.msgRowOwn]}>
                  {!isOwn && (
                    <Image source={{ uri: `https://picsum.photos/${item.avatar}/60/60` }} style={roomStyles.msgAvatar} />
                  )}
                  <View style={[roomStyles.msgBubble, { backgroundColor: isOwn ? "rgba(124,58,237,0.3)" : colors.card }]}>
                    {!isOwn && <Text style={roomStyles.msgUser}>{item.username}</Text>}
                    <Text style={[roomStyles.msgText, { color: colors.foreground }]}>{item.text}</Text>
                    <Text style={[roomStyles.msgTime, { color: colors.mutedForeground }]}>{item.time}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {joined && (
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
              <TouchableOpacity onPress={sendMessage} style={roomStyles.sendBtn} disabled={sending}>
                <LinearGradient colors={["#7C3AED", "#EA580C"]} style={roomStyles.sendGrad}>
                  {sending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Ionicons name="send" size={16} color="#fff" />}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

// ── RoomCard ──────────────────────────────────────────────────────────────────
function RoomCard({
  room, userId, joined, memberCount, onJoined,
}: {
  room: VibeRoom;
  userId?: string;
  joined: boolean;
  memberCount: number;
  onJoined: (roomId: string, newCount: number) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  const memberLabel = memberCount > 0
    ? `${formatCount(memberCount)} member${memberCount !== 1 ? "s" : ""}`
    : null;

  return (
    <>
      <TouchableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOpen(true); }}
        style={[roomCardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        activeOpacity={0.85}
      >
        <View style={roomCardStyles.topRow}>
          <Text style={roomCardStyles.emoji}>{room.emoji}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {room.isLive && (
              <View style={roomCardStyles.liveBadge}>
                <View style={roomCardStyles.liveDot} />
                <Text style={roomCardStyles.liveText}>LIVE</Text>
              </View>
            )}
            {joined && (
              <View style={roomCardStyles.joinedBadge}>
                <Text style={roomCardStyles.joinedText}>✓ Joined</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={[roomCardStyles.name, { color: colors.foreground }]}>{room.name}</Text>
        <Text style={[roomCardStyles.desc, { color: colors.mutedForeground }]} numberOfLines={2}>{room.description}</Text>

        <View style={roomCardStyles.memberRow}>
          {room.memberPhotos.slice(0, 4).map((seed, i) => (
            <View key={i} style={[roomCardStyles.memberAvatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 4 - i }]}>
              <Image source={{ uri: `https://picsum.photos/${seed}/60/60` }} style={{ width: "100%", height: "100%", borderRadius: 16 }} />
            </View>
          ))}
          {memberLabel ? (
            <Text style={[roomCardStyles.memberCount, { color: colors.mutedForeground }]}>{memberLabel}</Text>
          ) : null}
        </View>

        {joined ? (
          <View style={[roomCardStyles.joinBtn, { backgroundColor: "rgba(124,58,237,0.12)", borderWidth: 1.5, borderColor: "#7C3AED" }]}>
            <Text style={[roomCardStyles.joinText, { color: "#A78BFA" }]}>✓ Joined — Open Room</Text>
          </View>
        ) : (
          <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={roomCardStyles.joinBtn}>
            <Text style={roomCardStyles.joinText}>Join Room →</Text>
          </LinearGradient>
        )}
      </TouchableOpacity>

      {open && (
        <RoomModal
          room={room}
          userId={userId}
          initialJoined={joined}
          initialMemberCount={memberCount}
          onClose={() => setOpen(false)}
          onJoined={onJoined}
        />
      )}
    </>
  );
}

// ── VibeRoomsTab ──────────────────────────────────────────────────────────────
export function VibeRoomsTab() {
  const colors = useColors();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [roomStatus, setRoomStatus] = useState<Record<string, RoomStatus>>({});
  const [statusLoaded, setStatusLoaded] = useState(false);

  useEffect(() => {
    const roomIds = VIBE_ROOMS.map((r) => r.id).join(",");
    const qs = userId ? `roomIds=${roomIds}&userId=${userId}` : `roomIds=${roomIds}`;
    fetch(`${API_BASE}/api/vibe-rooms/status?${qs}`)
      .then((r) => r.json())
      .then((data: { rooms: Record<string, RoomStatus> }) => {
        setRoomStatus(data.rooms ?? {});
      })
      .catch(() => {})
      .finally(() => setStatusLoaded(true));
  }, [userId]);

  const handleJoined = (roomId: string, newCount: number) => {
    setRoomStatus((prev) => ({
      ...prev,
      [roomId]: { joined: true, memberCount: newCount },
    }));
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, gap: 14 }}
    >
      <View style={roomsTabStyles.header}>
        <Text style={[roomsTabStyles.title, { color: colors.foreground }]}>🏠 Vibe Rooms</Text>
        <Text style={[roomsTabStyles.sub, { color: colors.mutedForeground }]}>Meet people who share your interests</Text>
      </View>

      {!statusLoaded && (
        <View style={{ alignItems: "center", paddingVertical: 20 }}>
          <ActivityIndicator color="#7C3AED" />
        </View>
      )}

      {VIBE_ROOMS.map((room) => {
        const status = roomStatus[room.id] ?? { joined: false, memberCount: 0 };
        return (
          <RoomCard
            key={room.id}
            room={room}
            userId={userId}
            joined={status.joined}
            memberCount={status.memberCount}
            onJoined={handleJoined}
          />
        );
      })}
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
  joinBtnJoined: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: "#7C3AED", borderRadius: 14, marginHorizontal: 16 },
  joinGrad: { paddingVertical: 12, alignItems: "center" },
  joinText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  preJoinHint: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  preJoinText: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
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
  card: { borderRadius: 24, borderWidth: 0.5, padding: 18, gap: 12 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  emoji: { fontSize: 38 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(34,197,94,0.15)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22C55E" },
  liveText: { color: "#22C55E", fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 0.8 },
  joinedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(124,58,237,0.18)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  joinedText: { color: "#A78BFA", fontFamily: "Poppins_700Bold", fontSize: 11 },
  name: { fontFamily: "Poppins_700Bold", fontSize: 19 },
  desc: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  memberAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: "#7C3AED", overflow: "hidden" },
  memberCount: { fontFamily: "Poppins_400Regular", fontSize: 12, marginLeft: 8 },
  joinBtn: { paddingVertical: 14, borderRadius: 18, alignItems: "center" },
  joinText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
});

const roomsTabStyles = StyleSheet.create({
  header: { gap: 4, marginBottom: 4 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 22 },
  sub: { fontFamily: "Poppins_400Regular", fontSize: 13 },
});
