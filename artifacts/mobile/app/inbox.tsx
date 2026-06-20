import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import PagerViewCompat, { PagerViewHandle } from "@/components/PagerViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SnapViewerModal } from "@/components/SnapViewer";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  SnapConversation,
  acceptMessageRequest,
  deleteConversation,
  fetchConversations,
  fetchMessageRequests,
  fetchSnapConversations,
  markMessagesRead,
} from "@/lib/db";
import {
  encodeSnap,
  isSnap,
  markSnapViewed,
  parseSnap,
  sendSnapMessage,
  uploadSnapToStorage,
} from "@/lib/snap";
import { Conversation, supabase, timeAgo } from "@/lib/supabase";

type MainTab = "chats" | "snaps" | "calls";
type ChatFilter = "all" | "groups";
type SnapFilter = "all" | "received" | "sent" | "opened";
type ConvoStatus = "new_snap" | "new_chat" | "snap_delivered" | "chat_delivered" | "opened";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function fetchStreaks(userId: string): Promise<Map<string, number>> {
  try {
    const { data } = await supabase
      .from("snap_streaks")
      .select("user1_id, user2_id, streak_count")
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
    const map = new Map<string, number>();
    (data ?? []).forEach((row: any) => {
      const otherId = row.user1_id === userId ? row.user2_id : row.user1_id;
      map.set(otherId, row.streak_count ?? 0);
    });
    return map;
  } catch {
    return new Map();
  }
}

function previewText(text: string): string {
  if (!text) return "";
  if (isSnap(text)) return "📷 Photo";
  return text.length > 42 ? text.slice(0, 42) + "…" : text;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState("");
  const opacity = useRef(new Animated.Value(0)).current;
  const show = (msg: string) => {
    setMessage(msg);
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: false }).start(), 2400);
  };
  const ToastView = message ? (
    <Animated.View style={[toastSt.wrap, { opacity }]} pointerEvents="none">
      <Text style={toastSt.text}>{message}</Text>
    </Animated.View>
  ) : null;
  return { show, ToastView };
}

const toastSt = StyleSheet.create({
  wrap: {
    position: "absolute", bottom: 90, left: 20, right: 20,
    backgroundColor: "rgba(15,10,30,0.97)", borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 18, alignItems: "center",
    zIndex: 9999, borderWidth: 1, borderColor: "rgba(124,58,237,0.35)",
  },
  text: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
});

// ─── StatusBox ────────────────────────────────────────────────────────────────

function StatusBox({ status, time }: { status: ConvoStatus; time: string }) {
  const isSnapType = status === "new_snap" || status === "snap_delivered";
  const color =
    status === "opened" ? "#6B7280" :
    status === "new_chat" || status === "chat_delivered" ? "#3B82F6" :
    "#EF4444";
  const isFilled = status === "new_snap" || status === "new_chat";
  const label =
    status === "new_snap" ? "New Snap" :
    status === "new_chat" ? "New Chat" :
    status === "snap_delivered" || status === "chat_delivered" ? "Delivered" :
    "Opened";
  return (
    <View style={stSt.wrap}>
      {isFilled ? (
        <View style={[stSt.square, { backgroundColor: color }]} />
      ) : (
        <View style={[stSt.squareOutline, { borderColor: color }]}>
          <Ionicons name="arrow-forward" size={6} color={color} />
        </View>
      )}
      <Text style={[stSt.label, { color }]}>{label}</Text>
      <Text style={stSt.sep}> · </Text>
      <Text style={stSt.time}>{time}</Text>
    </View>
  );
}

const stSt = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  square: { width: 11, height: 11, borderRadius: 2.5 },
  squareOutline: { width: 11, height: 11, borderRadius: 2.5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  sep: { color: "rgba(255,255,255,0.25)", fontSize: 11, fontFamily: "Poppins_400Regular" },
  time: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 11 },
});

// ─── StoryRingAvatar ──────────────────────────────────────────────────────────

function StoryRingAvatar({
  username, url, size, hasStory, onPress,
}: {
  username: string; url?: string | null; size: number; hasStory: boolean; onPress: () => void;
}) {
  const inner = <UserAvatar username={username} url={url} size={size} />;
  if (!hasStory) return <TouchableOpacity onPress={onPress} activeOpacity={0.85}>{inner}</TouchableOpacity>;
  const ring = size + 7;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <LinearGradient colors={["#7C3AED", "#EC4899", "#F97316"]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
        style={{ width: ring, height: ring, borderRadius: ring / 2, alignItems: "center", justifyContent: "center" }}>
        <View style={{ borderRadius: (size + 3) / 2, borderWidth: 2.5, borderColor: "#0A0A0F" }}>
          {inner}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── SwipeableRow ─────────────────────────────────────────────────────────────

function SwipeableRow({
  children, onDelete, onArchive, onMute,
}: {
  children: React.ReactNode;
  onDelete?: () => void;
  onArchive?: () => void;
  onMute?: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  // Compute reveal distance from the ACTUAL number of visible buttons so the
  // camera icon in SnapConvoItemRow never overlaps the action area, and so
  // single-button (Snaps/Delete) rows don't over-reveal.
  const ACTION_W = 80;
  const numActions = [onMute, onArchive, onDelete].filter(Boolean).length;
  const OPEN_X = -(ACTION_W * numActions);

  const panResponder = useRef(
    PanResponder.create({
      // Stricter ratio (0.5 vs 0.9): horizontal movement must be 2× the vertical
      // movement before we claim the gesture — prevents diagonal FlatList scrolls
      // from accidentally triggering the swipe action.
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dy) < Math.abs(gs.dx) * 0.5,
      onPanResponderGrant: () => { translateX.stopAnimation(); },
      onPanResponderMove: (_, gs) => {
        const x = Math.max(Math.min(gs.dx, 0), OPEN_X - 20);
        translateX.setValue(x);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < OPEN_X / 2) {
          Animated.spring(translateX, { toValue: OPEN_X, useNativeDriver: false, damping: 22, stiffness: 200 }).start();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }).start();
        }
      },
      // If another responder (e.g. FlatList scroll) steals the gesture mid-swipe,
      // always snap the row back to closed so it never stays stuck partially open.
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }).start();
      },
    })
  ).current;

  const close = () =>
    Animated.spring(translateX, { toValue: 0, useNativeDriver: false, damping: 22, stiffness: 200 }).start();

  return (
    <View style={{ overflow: "hidden" }}>
      <View style={[StyleSheet.absoluteFill, { flexDirection: "row", justifyContent: "flex-end" }]}>
        {onMute && (
          <TouchableOpacity onPress={() => { close(); onMute(); }}
            style={[swipeSt.action, { backgroundColor: "#6B7280", width: ACTION_W }]}>
            <Ionicons name="notifications-off-outline" size={19} color="#fff" />
            <Text style={swipeSt.actionLabel} numberOfLines={1}>Mute</Text>
          </TouchableOpacity>
        )}
        {onArchive && (
          <TouchableOpacity onPress={() => { close(); onArchive(); }}
            style={[swipeSt.action, { backgroundColor: "#374151", width: ACTION_W }]}>
            <Ionicons name="archive-outline" size={19} color="#fff" />
            <Text style={swipeSt.actionLabel} numberOfLines={1}>Archive</Text>
          </TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity onPress={() => { close(); onDelete(); }}
            style={[swipeSt.action, { backgroundColor: "#EF4444", width: ACTION_W }]}>
            <Ionicons name="trash-outline" size={19} color="#fff" />
            <Text style={swipeSt.actionLabel} numberOfLines={1}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

const swipeSt = StyleSheet.create({
  action: { alignItems: "center", justifyContent: "center", gap: 4 },
  actionLabel: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 11, textAlign: "center" },
});

// ─── GundrukAIRow ─────────────────────────────────────────────────────────────

function GundrukAIRow({ borderColor }: { borderColor: string }) {
  return (
    <TouchableOpacity
      onPress={() => router.push("/ai-chat" as any)}
      style={[msgSt.row, { borderBottomColor: borderColor }]}
      activeOpacity={0.75}
    >
      <LinearGradient
        colors={["#4C1D95", "#7C3AED"]}
        style={msgSt.aiAvatar}
      >
        <Text style={{ fontSize: 22 }}>🤖</Text>
      </LinearGradient>
      <View style={msgSt.rowBody}>
        <View style={msgSt.rowTop}>
          <Text style={msgSt.nameAI} numberOfLines={1}>Gundruk AI</Text>
          <Text style={msgSt.timeText}>Always on</Text>
        </View>
        <Text style={msgSt.previewAI} numberOfLines={1}>
          Ask me anything — captions, bio, date ideas…
        </Text>
      </View>
      <View style={msgSt.aiBadge}>
        <Text style={msgSt.aiBadgeText}>AI</Text>
      </View>
    </TouchableOpacity>
  );
}

const msgSt = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 13, gap: 12, borderBottomWidth: 0.5,
  },
  aiAvatar: {
    width: 52, height: 52, borderRadius: 26, alignItems: "center",
    justifyContent: "center", borderWidth: 2, borderColor: "#7C3AED",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  nameUnread: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14.5 },
  nameMuted: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_500Medium", fontSize: 14.5 },
  nameAI: { color: "#A78BFA", fontFamily: "Poppins_700Bold", fontSize: 14.5 },
  timeText: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_400Regular", fontSize: 11.5 },
  previewText: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 1 },
  previewUnread: { color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_500Medium", fontSize: 13, marginTop: 1 },
  previewAI: { color: "rgba(139,92,246,0.7)", fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 1 },
  aiBadge: {
    backgroundColor: "rgba(124,58,237,0.2)", borderRadius: 8, borderWidth: 1,
    borderColor: "rgba(124,58,237,0.4)", paddingHorizontal: 7, paddingVertical: 2,
  },
  aiBadgeText: { color: "#A78BFA", fontFamily: "Poppins_700Bold", fontSize: 11 },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#7C3AED",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  unreadBadgeText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 11 },
  mutedIcon: { marginLeft: 2 },
  pinnedIcon: { marginLeft: 2 },
  camBtn: { padding: 6 },
  tick: { marginLeft: 3, marginBottom: 1 },
});

// ─── MessageConvoItem ─────────────────────────────────────────────────────────

function MessageConvoItem({
  convo, isPinned, isMuted, isFavorite, hasStory,
  onLongPress, onDelete, onMute, onArchive,
}: {
  convo: Conversation; isPinned: boolean; isMuted: boolean; isFavorite: boolean; hasStory: boolean;
  onCamera?: () => void; onLongPress: () => void;
  onDelete: () => void; onMute: () => void; onArchive: () => void;
}) {
  const colors = useColors();
  const hasUnread = convo.unread_count > 0;
  const isSnapMsg = isSnap(convo.last_message ?? "");

  const nameStyle = isMuted ? msgSt.nameMuted : hasUnread ? msgSt.nameUnread : { color: colors.mutedForeground as string, fontFamily: "Poppins_500Medium" as const, fontSize: 14.5 };

  return (
    <SwipeableRow onDelete={onDelete} onArchive={onArchive} onMute={onMute}>
      <Pressable
        onPress={() => router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } })}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={({ pressed }) => [msgSt.row, { borderBottomColor: colors.border, backgroundColor: pressed ? "rgba(255,255,255,0.05)" : colors.background }]}
      >
        <StoryRingAvatar
          username={convo.other_user.username}
          url={convo.other_user.avatar_url}
          size={50}
          hasStory={hasStory}
          onPress={() => router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } })}
        />
        <View style={msgSt.rowBody}>
          <View style={msgSt.rowTop}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 4 }}>
              {isPinned && <Text style={{ fontSize: 11 }}>📌</Text>}
              {isMuted && <Ionicons name="notifications-off" size={12} color="rgba(255,255,255,0.3)" style={msgSt.mutedIcon} />}
              <Text style={[nameStyle, { flex: 1 }]} numberOfLines={1}>{convo.other_user.username}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              {!hasUnread && (
                <Ionicons
                  name="checkmark-done"
                  size={14}
                  color="rgba(139,92,246,0.7)"
                  style={msgSt.tick}
                />
              )}
              <Text style={msgSt.timeText}>{timeAgo(convo.last_message_at)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={[hasUnread ? msgSt.previewUnread : msgSt.previewText, { flex: 1 }]}
              numberOfLines={1}
            >
              {isSnapMsg ? "📷 Photo" : previewText(convo.last_message ?? "")}
            </Text>
            {hasUnread && (
              <View style={msgSt.unreadBadge}>
                <Text style={msgSt.unreadBadgeText}>{convo.unread_count > 99 ? "99+" : convo.unread_count}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </SwipeableRow>
  );
}

// ─── SnapConvoItem ────────────────────────────────────────────────────────────

function SnapConvoItemRow({
  convo, isPinned, hasStory, streak, onView, onCamera, onLongPress, onDelete,
}: {
  convo: SnapConversation; isPinned: boolean; hasStory: boolean; streak: number;
  onView: () => void; onCamera: () => void; onLongPress: () => void; onDelete: () => void;
}) {
  const colors = useColors();
  const snap = parseSnap(convo.message_text);
  const isUnviewedIncoming = convo.is_incoming && snap && !snap.viewed;

  let status: ConvoStatus;
  if (convo.is_incoming) {
    status = isUnviewedIncoming ? "new_snap" : "opened";
  } else {
    status = snap?.viewed ? "opened" : "snap_delivered";
  }

  return (
    <SwipeableRow onDelete={onDelete}>
      <Pressable
        onPress={() => isUnviewedIncoming
          ? onView()
          : router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } })}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={({ pressed }) => [msgSt.row, { borderBottomColor: colors.border, backgroundColor: pressed ? "rgba(255,255,255,0.05)" : colors.background }]}
      >
        <StoryRingAvatar
          username={convo.other_user.username}
          url={convo.other_user.avatar_url}
          size={50}
          hasStory={hasStory}
          onPress={() => hasStory
            ? router.push(`/profile/${convo.other_user.username}` as any)
            : router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } })}
        />
        <View style={msgSt.rowBody}>
          <View style={msgSt.rowTop}>
            <Text
              style={[isUnviewedIncoming ? msgSt.nameUnread : { color: colors.mutedForeground as string, fontFamily: "Poppins_500Medium" as const, fontSize: 14.5 }, { flex: 1 }]}
              numberOfLines={1}
            >
              {isPinned ? "📌 " : ""}{convo.other_user.username}
            </Text>
            {streak > 0 && (
              <View style={snapRowSt.streakBadge}>
                <Text style={snapRowSt.streakText}>🔥 {streak}</Text>
              </View>
            )}
          </View>
          <StatusBox status={status} time={timeAgo(convo.created_at)} />
        </View>
      </Pressable>
    </SwipeableRow>
  );
}

const snapRowSt = StyleSheet.create({
  streakBadge: {
    backgroundColor: "rgba(249,115,22,0.12)", borderRadius: 10, borderWidth: 1,
    borderColor: "rgba(249,115,22,0.3)", paddingHorizontal: 7, paddingVertical: 2,
  },
  streakText: { color: "#F97316", fontFamily: "Poppins_700Bold", fontSize: 11 },
  camBtnGrad: { borderRadius: 14, padding: 7, alignItems: "center", justifyContent: "center" },
});

// ─── StoriesRow ───────────────────────────────────────────────────────────────

function StoriesRow({
  userId, storiesUsers,
}: {
  userId: string;
  storiesUsers: Array<{ id: string; username: string; avatar_url?: string | null }>;
}) {
  const colors = useColors();
  return (
    <View style={storySt.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={storySt.scroll}>
        {/* My story */}
        <TouchableOpacity style={storySt.item} activeOpacity={0.8}>
          <LinearGradient colors={["#1a1a2e", "#2a1a4e"]} style={storySt.addRing}>
            <View style={storySt.addInner}>
              <Ionicons name="add" size={22} color="#7C3AED" />
            </View>
          </LinearGradient>
          <Text style={[storySt.label, { color: colors.mutedForeground }]} numberOfLines={1}>My Story</Text>
        </TouchableOpacity>
        {/* Other users */}
        {storiesUsers.map((u) => (
          <TouchableOpacity
            key={u.id}
            style={storySt.item}
            activeOpacity={0.8}
            onPress={() => router.push(`/profile/${u.username}` as any)}
          >
            <LinearGradient colors={["#7C3AED", "#EC4899", "#F97316"]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={storySt.ring}>
              <View style={storySt.ringInner}>
                <UserAvatar username={u.username} url={u.avatar_url} size={50} />
              </View>
            </LinearGradient>
            <Text style={[storySt.label, { color: colors.mutedForeground }]} numberOfLines={1}>{u.username}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const storySt = StyleSheet.create({
  wrap: { paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.07)" },
  scroll: { paddingHorizontal: 14, gap: 16 },
  item: { alignItems: "center", gap: 5, width: 62 },
  addRing: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(124,58,237,0.5)" },
  addInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(124,58,237,0.1)", alignItems: "center", justifyContent: "center" },
  ring: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  ringInner: { borderRadius: 27, borderWidth: 2.5, borderColor: "#0A0A0F", overflow: "hidden" },
  label: { fontFamily: "Poppins_400Regular", fontSize: 11, textAlign: "center", maxWidth: 60 },
});

// ─── SnapSendSheet ─────────────────────────────────────────────────────────────

function SnapSendSheet({
  uri, conversations, onSendTo, onCancel, sendingTo, initialSearch = "",
}: {
  uri: string; conversations: Conversation[];
  onSendTo: (friend: { id: string; username?: string }) => void;
  onCancel: () => void; sendingTo: string | null; initialSearch?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState(initialSearch);
  const filtered = conversations.filter((c) =>
    (c.other_user.username ?? "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <View style={[snapSendSt.overlay, { backgroundColor: colors.background }]}>
      <View style={[snapSendSt.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onCancel} style={{ padding: 4 }}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[snapSendSt.title, { color: colors.foreground }]}>Send Snap to…</Text>
        <View style={{ width: 32 }} />
      </View>
      <Image
        source={{ uri }}
        style={{ width: "100%", height: 220, backgroundColor: "#1a1a2e" }}
        resizeMode="cover"
      />
      <View style={snapSendSt.noteRow}>
        <Ionicons name="eye-off-outline" size={13} color="rgba(255,255,255,0.4)" />
        <Text style={snapSendSt.note}>Disappears after the recipient views it once</Text>
      </View>
      <View style={[snapSendSt.searchWrap, { borderBottomColor: colors.border }]}>
        <View style={[snapSendSt.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            value={search} onChangeText={setSearch}
            placeholder="Search friends…" placeholderTextColor={colors.mutedForeground}
            style={[snapSendSt.searchInput, { color: colors.foreground }]} autoCapitalize="none"
          />
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isSending = sendingTo === item.other_user.id;
          return (
            <TouchableOpacity
              onPress={() => onSendTo(item.other_user)}
              style={[snapSendSt.row, { borderBottomColor: colors.border }]}
              activeOpacity={0.75} disabled={!!sendingTo}
            >
              <UserAvatar username={item.other_user.username} url={item.other_user.avatar_url} size={44} />
              <Text style={[snapSendSt.rowName, { color: colors.foreground }]} numberOfLines={1}>{item.other_user.username}</Text>
              {isSending ? (
                <ActivityIndicator size="small" color="#EA580C" />
              ) : (
                <LinearGradient colors={["#EA580C", "#DC2626"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={snapSendSt.sendBtn}>
                  <Ionicons name="camera" size={13} color="#fff" />
                  <Text style={snapSendSt.sendBtnText}>Send</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 40, paddingHorizontal: 32 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center" }}>
              {conversations.length === 0 ? "No conversations yet." : "No friends found"}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      />
    </View>
  );
}

const snapSendSt = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "rgba(234,88,12,0.07)" },
  note: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  searchWrap: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 12, height: 42, gap: 8, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 0.5 },
  rowName: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 14 },
  sendBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  sendBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
});

// ─── SubFilterBar ─────────────────────────────────────────────────────────────

function SubFilterBar<T extends string>({
  tabs, active, onChange, accent = "#7C3AED",
}: {
  tabs: Array<{ id: T; label: string; badge?: number }>;
  active: T;
  onChange: (id: T) => void;
  accent?: string;
}) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal showsHorizontalScrollIndicator={false}
      style={[subSt.bar, { borderBottomColor: colors.border }]}
      contentContainerStyle={{ paddingHorizontal: 14, gap: 4 }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <TouchableOpacity
            key={t.id}
            onPress={() => onChange(t.id)}
            style={[subSt.btn, isActive && { backgroundColor: accent + "22", borderColor: accent + "66" }]}
            activeOpacity={0.8}
          >
            <Text style={[subSt.label, { color: isActive ? accent : colors.mutedForeground }]}>{t.label}</Text>
            {t.badge ? (
              <View style={[subSt.badge, { backgroundColor: accent }]}>
                <Text style={subSt.badgeText}>{t.badge}</Text>
              </View>
            ) : null}
            {isActive && <View style={[subSt.underline, { backgroundColor: accent }]} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const subSt = StyleSheet.create({
  bar: { borderBottomWidth: 0.5, maxHeight: 46 },
  btn: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, flexDirection: "row",
    alignItems: "center", gap: 5, position: "relative", borderWidth: 1, borderColor: "transparent",
  },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  badge: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: "center" },
  badgeText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 10 },
  underline: { position: "absolute", bottom: 0, left: "20%", right: "20%", height: 2, borderRadius: 1 },
});

// ─── ChatsTab ─────────────────────────────────────────────────────────────────

function ChatsTab({
  myId, conversations, snapConvos, refreshing, onRefresh, usersWithStories,
  onCamera, onSnapCamera, onSnapView, show, requests,
}: {
  myId: string;
  conversations: Conversation[];
  snapConvos: SnapConversation[];
  refreshing: boolean;
  onRefresh: () => void;
  usersWithStories: Set<string>;
  onCamera: (preSearch?: string) => void;
  onSnapCamera: (preSearch?: string) => void;
  onSnapView: (c: SnapConversation) => void;
  show: (msg: string) => void;
  requests: Conversation[];
}) {
  const colors = useColors();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  type UnifiedItem = {
    key: string;
    kind: "chat" | "snap";
    convo: Conversation | SnapConversation;
    ts: string;
    userId: string;
    isPinned: boolean;
    hasStory: boolean;
    hasUnread: boolean;
  };

  const allItems = useMemo<UnifiedItem[]>(() => {
    const chatItems: UnifiedItem[] = conversations.map((c) => ({
      key: `chat_${c.id}`,
      kind: "chat",
      convo: c,
      ts: c.last_message_at,
      userId: c.other_user.id,
      isPinned: pinnedIds.has(c.id),
      hasStory: usersWithStories.has(c.other_user.id),
      hasUnread: c.unread_count > 0,
    }));
    const snapItems: UnifiedItem[] = snapConvos.map((c) => {
      const snap = parseSnap(c.message_text);
      return {
        key: `snap_${c.message_id}`,
        kind: "snap",
        convo: c,
        ts: c.created_at,
        userId: c.other_user.id,
        isPinned: pinnedIds.has(c.message_id),
        hasStory: usersWithStories.has(c.other_user.id),
        hasUnread: !!(c.is_incoming && snap && !snap.viewed),
      };
    });
    const merged = [...chatItems, ...snapItems];
    merged.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    merged.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
    return merged;
  }, [conversations, snapConvos, pinnedIds, usersWithStories]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let base = allItems;
    if (q) {
      base = base.filter((i) => {
        const n = i.kind === "chat"
          ? (i.convo as Conversation).other_user.username
          : (i.convo as SnapConversation).other_user.username;
        return n.toLowerCase().includes(q);
      });
    }
    if (filter === "groups") return [];
    return base;
  }, [allItems, filter, search, favIds]);

  const unreadCount = useMemo(() => allItems.filter((i) => i.hasUnread).length, [allItems]);

  const handleLongPress = useCallback((id: string, otherId: string, username: string, isPinned: boolean, isFav: boolean) => {
    Alert.alert(`@${username}`, undefined, [
      {
        text: isPinned ? "Unpin" : "📌 Pin Conversation",
        onPress: () => setPinnedIds((p) => { const n = new Set(p); isPinned ? n.delete(id) : n.add(id); return n; }),
      },
      {
        text: mutedIds.has(id) ? "🔔 Unmute" : "🔕 Mute",
        onPress: () => setMutedIds((p) => { const n = new Set(p); p.has(id) ? n.delete(id) : n.add(id); return n; }),
      },
      {
        text: isFav ? "★ Unfavorite" : "⭐ Add to Favorites",
        onPress: () => setFavIds((p) => { const n = new Set(p); p.has(id) ? n.delete(id) : n.add(id); return n; }),
      },
      {
        text: "✓ Mark as Read",
        onPress: () => {
          if (myId && otherId) void markMessagesRead(myId, otherId);
          show(`@${username} marked as read`);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [myId, mutedIds, show]);

  const TABS: Array<{ id: ChatFilter; label: string; badge?: number }> = [
    { id: "all", label: "All", badge: unreadCount || undefined },
    { id: "groups", label: "Groups" },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={chatTabSt.searchWrap}>
        <View style={[chatTabSt.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={15} color={colors.mutedForeground} />
          <TextInput
            value={search} onChangeText={setSearch}
            placeholder="Search messages…" placeholderTextColor={colors.mutedForeground}
            style={[chatTabSt.searchInput, { color: colors.foreground }]}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Sub-filter tabs */}
      <SubFilterBar tabs={TABS} active={filter} onChange={setFilter} />

      {/* Gundruk AI row — rendered outside FlatList so RefreshControl can't overlap it */}
      {filter === "all" && <GundrukAIRow borderColor={colors.border} />}

      {/* Main list */}
      {filter === "groups" ? (
        <View style={chatTabSt.empty}>
          <Text style={{ fontSize: 44 }}>👥</Text>
          <Text style={[chatTabSt.emptyTitle, { color: colors.foreground }]}>No group chats yet</Text>
          <Text style={[chatTabSt.emptySub, { color: colors.mutedForeground }]}>Group chats coming soon!</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" colors={["#8B5CF6"]} />}
          ListHeaderComponent={filter === "all" && requests.length > 0 ? (
            <TouchableOpacity
              style={[chatTabSt.requestsRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => router.push("/inbox/requests" as any)}
              activeOpacity={0.7}
            >
              <View style={chatTabSt.requestsIcon}>
                <Ionicons name="chatbubble-ellipses" size={20} color="#8B5CF6" />
                <View style={chatTabSt.requestsBadge}>
                  <Text style={chatTabSt.requestsBadgeText}>{requests.length}</Text>
                </View>
              </View>
              <View style={chatTabSt.requestsInfo}>
                <Text style={[chatTabSt.requestsTitle, { color: colors.foreground }]}>Message Requests</Text>
                <Text style={[chatTabSt.requestsSub, { color: colors.mutedForeground }]}>
                  {requests.length} {requests.length === 1 ? "person" : "people"} sent you a request
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
          ListEmptyComponent={
            <View style={chatTabSt.empty}>
              <Text style={{ fontSize: 44 }}>💬</Text>
              <Text style={[chatTabSt.emptyTitle, { color: colors.foreground }]}>No messages yet</Text>
              <Text style={[chatTabSt.emptySub, { color: colors.mutedForeground }]}>Start a conversation</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === "chat") {
              const c = item.convo as Conversation;
              const isMuted = mutedIds.has(c.id);
              const isFav = favIds.has(c.other_user.id);
              return (
                <MessageConvoItem
                  convo={c}
                  isPinned={item.isPinned}
                  isMuted={isMuted}
                  isFavorite={isFav}
                  hasStory={item.hasStory}
                  onCamera={() => onSnapCamera(c.other_user.username)}
                  onLongPress={() => handleLongPress(c.id, c.other_user.id, c.other_user.username, item.isPinned, isFav)}
                  onDelete={() => Alert.alert("Delete?", `Delete conversation with @${c.other_user.username}?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => show("Conversation deleted") },
                  ])}
                  onMute={() => {
                    setMutedIds((p) => { const n = new Set(p); p.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; });
                    show(mutedIds.has(c.id) ? `@${c.other_user.username} unmuted` : `@${c.other_user.username} muted`);
                  }}
                  onArchive={() => show(`@${c.other_user.username} archived`)}
                />
              );
            } else {
              const c = item.convo as SnapConversation;
              return (
                <SnapConvoItemRow
                  convo={c}
                  isPinned={item.isPinned}
                  hasStory={item.hasStory}
                  streak={0}
                  onView={() => onSnapView(c)}
                  onCamera={() => onSnapCamera(c.other_user.username)}
                  onLongPress={() => handleLongPress(c.message_id, c.other_user.id, c.other_user.username, item.isPinned, false)}
                  onDelete={() => show("Snap deleted")}
                />
              );
            }
          }}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* New message FAB */}
      <TouchableOpacity
        style={chatTabSt.fab}
        onPress={() => router.push("/find-friends" as any)}
        activeOpacity={0.85}
      >
        <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={chatTabSt.fabGrad}>
          <Ionicons name="create-outline" size={22} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const chatTabSt = StyleSheet.create({
  searchWrap: { paddingHorizontal: 14, paddingVertical: 8 },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 12, height: 42, gap: 8, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 17, textAlign: "center" },
  emptySub: { fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", lineHeight: 20 },
  fab: {
    position: "absolute", bottom: 20, right: 20,
    shadowColor: "#7C3AED", shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  fabGrad: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  requestsRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 0.5, gap: 12,
  },
  requestsIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", position: "relative" },
  requestsBadge: {
    position: "absolute", top: -2, right: -4, backgroundColor: "#8B5CF6",
    borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
  },
  requestsBadgeText: { fontSize: 10, fontFamily: "Poppins_700Bold", color: "#fff" },
  requestsInfo: { flex: 1 },
  requestsTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  requestsSub: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 1 },
});

// ─── SnapsTab ─────────────────────────────────────────────────────────────────

function SnapsTab({
  userId, snapConvos, usersWithStories, refreshing, onRefresh,
  onSnapCamera, onSnapView, streaks, show,
}: {
  userId: string;
  snapConvos: SnapConversation[];
  usersWithStories: Set<string>;
  refreshing: boolean;
  onRefresh: () => void;
  onSnapCamera: (preSearch?: string) => void;
  onSnapView: (c: SnapConversation) => void;
  streaks: Map<string, number>;
  show: (msg: string) => void;
}) {
  const colors = useColors();
  const [filter, setFilter] = useState<SnapFilter>("all");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const storyUsers = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; username: string; avatar_url?: string | null }> = [];
    snapConvos.forEach((c) => {
      if (usersWithStories.has(c.other_user.id) && !seen.has(c.other_user.id)) {
        seen.add(c.other_user.id);
        out.push(c.other_user);
      }
    });
    return out;
  }, [snapConvos, usersWithStories]);

  const filteredSnaps = useMemo(() => {
    let base = snapConvos;
    if (filter === "received") return base.filter((c) => c.is_incoming);
    if (filter === "sent") return base.filter((c) => !c.is_incoming);
    if (filter === "opened") {
      return base.filter((c) => {
        const snap = parseSnap(c.message_text);
        return snap?.viewed;
      });
    }
    return base;
  }, [snapConvos, filter]);

  const newCount = useMemo(
    () => snapConvos.filter((c) => { const s = parseSnap(c.message_text); return c.is_incoming && s && !s.viewed; }).length,
    [snapConvos]
  );

  const TABS: Array<{ id: SnapFilter; label: string; badge?: number }> = [
    { id: "all", label: "All" },
    { id: "received", label: "Received", badge: newCount || undefined },
    { id: "sent", label: "Sent" },
    { id: "opened", label: "Opened" },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* Sub-filter tabs */}
      <SubFilterBar tabs={TABS} active={filter} onChange={setFilter} accent="#EA580C" />

      <FlatList
        data={filteredSnaps}
        keyExtractor={(c) => c.message_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EA580C" colors={["#EA580C"]} />}
        ListHeaderComponent={storyUsers.length > 0 ? <StoriesRow userId={userId} storiesUsers={storyUsers} /> : undefined}
        ListEmptyComponent={
          <View style={chatTabSt.empty}>
            <Text style={{ fontSize: 44 }}>👻</Text>
            <Text style={[chatTabSt.emptyTitle, { color: colors.foreground }]}>No snaps here</Text>
            <Text style={[chatTabSt.emptySub, { color: colors.mutedForeground }]}>
              {filter === "received" ? "No snaps received yet" : filter === "sent" ? "You haven't sent any snaps" : filter === "opened" ? "No opened snaps" : "Start snapping!"}
            </Text>
          </View>
        }
        renderItem={({ item: c }) => (
          <SnapConvoItemRow
            convo={c}
            isPinned={pinnedIds.has(c.message_id)}
            hasStory={usersWithStories.has(c.other_user.id)}
            streak={streaks.get(c.other_user.id) ?? 0}
            onView={() => onSnapView(c)}
            onCamera={() => onSnapCamera(c.other_user.username)}
            onLongPress={() =>
              Alert.alert(`@${c.other_user.username}`, undefined, [
                {
                  text: pinnedIds.has(c.message_id) ? "Unpin" : "📌 Pin",
                  onPress: () => setPinnedIds((p) => { const n = new Set(p); p.has(c.message_id) ? n.delete(c.message_id) : n.add(c.message_id); return n; }),
                },
                {
                  text: "👁 View Profile",
                  onPress: () => router.push(`/profile/${c.other_user.username}` as any),
                },
                { text: "Cancel", style: "cancel" },
              ])
            }
            onDelete={() => show("Snap deleted")}
          />
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* Quick snap camera FAB */}
      <TouchableOpacity style={chatTabSt.fab} onPress={() => onSnapCamera()} activeOpacity={0.85}>
        <LinearGradient colors={["#EA580C", "#DC2626"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={chatTabSt.fabGrad}>
          <Ionicons name="camera" size={22} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ─── CallsTab ─────────────────────────────────────────────────────────────────

function CallsTab() {
  const colors = useColors();
  return (
    <View style={callsSt.wrap}>
      <LinearGradient colors={["rgba(124,58,237,0.15)", "rgba(249,115,22,0.08)"]} style={callsSt.card}>
        <Text style={{ fontSize: 52 }}>📞</Text>
        <Text style={[callsSt.title, { color: colors.foreground }]}>Calls Coming Soon</Text>
        <Text style={[callsSt.sub, { color: colors.mutedForeground }]}>
          Voice and video calls will be available in the next update.
        </Text>
        <View style={callsSt.badge}>
          <Ionicons name="time-outline" size={14} color="#7C3AED" />
          <Text style={callsSt.badgeText}>In Development</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const callsSt = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { borderRadius: 24, padding: 32, alignItems: "center", gap: 12, borderWidth: 1, borderColor: "rgba(124,58,237,0.2)", width: "100%" },
  title: { fontFamily: "Poppins_700Bold", fontSize: 20, textAlign: "center" },
  sub: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(124,58,237,0.15)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(124,58,237,0.3)" },
  badgeText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
});

// ─── BottomTabBar ─────────────────────────────────────────────────────────────

function BottomTabBar({
  active, onChange, insets, chatBadge, snapBadge,
}: {
  active: MainTab;
  onChange: (t: MainTab) => void;
  insets: { bottom: number };
  chatBadge?: number;
  snapBadge?: number;
}) {
  const TABS: Array<{ id: MainTab; label: string; icon: string; iconFocused: string; badge?: number }> = [
    { id: "chats", label: "Chats", icon: "chatbubble-outline", iconFocused: "chatbubble", badge: chatBadge },
    { id: "snaps", label: "Snaps", icon: "camera-outline", iconFocused: "camera", badge: snapBadge },
    { id: "calls", label: "Calls", icon: "call-outline", iconFocused: "call" },
  ];

  return (
    <View style={[btSt.bar, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: "rgba(255,255,255,0.07)" }]}>
      {TABS.map((t) => {
        const focused = t.id === active;
        return (
          <TouchableOpacity
            key={t.id}
            onPress={() => onChange(t.id)}
            style={btSt.item}
            activeOpacity={0.75}
          >
            <View style={btSt.iconWrap}>
              <Ionicons
                name={(focused ? t.iconFocused : t.icon) as any}
                size={22}
                color={focused ? "#8B5CF6" : "#6B7280"}
              />
              {!!t.badge && t.badge > 0 && (
                <View style={btSt.badge}>
                  <Text style={btSt.badgeText}>{t.badge > 99 ? "99+" : t.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[btSt.label, { color: focused ? "#8B5CF6" : "#6B7280" }]}>{t.label}</Text>
            {focused && <View style={btSt.dot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const btSt = StyleSheet.create({
  bar: {
    flexDirection: "row", backgroundColor: "rgba(8,8,16,0.97)",
    borderTopWidth: 0.5, paddingTop: 10,
  },
  item: { flex: 1, alignItems: "center", gap: 3 },
  iconWrap: { position: "relative" },
  badge: {
    position: "absolute", top: -5, right: -8,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: "#0A0A0F",
  },
  badgeText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 9 },
  label: { fontFamily: "Poppins_500Medium", fontSize: 10.5 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#8B5CF6", marginTop: 1 },
});

// ─── SwipeableTopTabBar ───────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get("window").width;

function SwipeableTopTabBar({
  scrollOffset,
  onPress,
  chatBadge,
  snapBadge,
}: {
  scrollOffset: Animated.Value;
  onPress: (page: number) => void;
  chatBadge?: number;
  snapBadge?: number;
}) {
  const tabW = SCREEN_W / 2;
  const underlineX = scrollOffset.interpolate({
    inputRange: [0, 1],
    outputRange: [0, tabW],
    extrapolate: "clamp",
  });
  const tab0Opacity = scrollOffset.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45], extrapolate: "clamp" });
  const tab1Opacity = scrollOffset.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1], extrapolate: "clamp" });

  return (
    <View style={topTabSt.bar}>
      {/* Tab 0 — Messages */}
      <TouchableOpacity style={topTabSt.tab} onPress={() => onPress(0)} activeOpacity={0.8}>
        <Animated.View style={[topTabSt.tabInner, { opacity: tab0Opacity }]}>
          <Text style={topTabSt.tabIcon}>💬</Text>
          <Text style={topTabSt.tabLabel}>Messages</Text>
          {!!chatBadge && chatBadge > 0 && (
            <View style={topTabSt.badge}><Text style={topTabSt.badgeText}>{chatBadge > 99 ? "99+" : chatBadge}</Text></View>
          )}
        </Animated.View>
      </TouchableOpacity>

      {/* Tab 1 — Snaps */}
      <TouchableOpacity style={topTabSt.tab} onPress={() => onPress(1)} activeOpacity={0.8}>
        <Animated.View style={[topTabSt.tabInner, { opacity: tab1Opacity }]}>
          <Text style={topTabSt.tabIcon}>📸</Text>
          <Text style={topTabSt.tabLabel}>Snaps</Text>
          {!!snapBadge && snapBadge > 0 && (
            <View style={[topTabSt.badge, { backgroundColor: "#EA580C" }]}><Text style={topTabSt.badgeText}>{snapBadge > 99 ? "99+" : snapBadge}</Text></View>
          )}
        </Animated.View>
      </TouchableOpacity>

      {/* Sliding underline */}
      <Animated.View style={[topTabSt.underline, { width: tabW, transform: [{ translateX: underlineX }] }]} />
    </View>
  );
}

const topTabSt = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.08)",
    position: "relative",
  },
  tab: { flex: 1, paddingVertical: 11, alignItems: "center" },
  tabInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  tabIcon: { fontSize: 15 },
  tabLabel: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14.5 },
  badge: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#7C3AED",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  badgeText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 10 },
  underline: {
    position: "absolute", bottom: 0, height: 2.5, borderRadius: 2,
    backgroundColor: "#8B5CF6",
  },
});

// ─── InboxScreen ──────────────────────────────────────────────────────────────

export default function InboxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { show, ToastView } = useToast();

  const [mainTab, setMainTab] = useState<MainTab>("chats");
  const pagerRef = useRef<PagerViewHandle>(null);
  const scrollOffset = useRef(new Animated.Value(0)).current;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messageRequests, setMessageRequests] = useState<Conversation[]>([]);
  const [snapConvos, setSnapConvos] = useState<SnapConversation[]>([]);
  const [usersWithStories, setUsersWithStories] = useState<Set<string>>(new Set());
  const [streaks, setStreaks] = useState<Map<string, number>>(new Map());
  const [refreshing, setRefreshing] = useState(false);

  // Snap camera/viewer state (lifted to allow cross-tab usage)
  const [snapPreviewUri, setSnapPreviewUri] = useState<string | null>(null);
  const [snapPreviewSearch, setSnapPreviewSearch] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [snapViewer, setSnapViewer] = useState<{ uri: string; messageId: string; msgText: string } | null>(null);

  // De-duplicate snap conversations — the API can occasionally return the same
  // message_id twice (once as sender, once as receiver). Duplicate keys in the
  // FlatList cause two rows to render at the same position, creating the
  // appearance of an "overlapping duplicate" row with a stuck swipe action.
  const dedupedSnapConvos = useMemo(() => {
    const seen = new Set<string>();
    return snapConvos.filter((c) => {
      if (seen.has(c.message_id)) return false;
      seen.add(c.message_id);
      return true;
    });
  }, [snapConvos]);

  const userId = session?.user?.id;
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      fetchConversations(userId).then(setConversations).catch(() => {}),
      fetchSnapConversations(userId).then(setSnapConvos).catch(() => {}),
      fetchStreaks(userId).then(setStreaks).catch(() => {}),
      fetchMessageRequests(userId).then(setMessageRequests).catch(() => {}),
    ]);
  }, [userId]);

  const loadStories = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from("stories")
        .select("user_id")
        .gt("expires_at", new Date().toISOString())
        .neq("user_id", userId);
      setUsersWithStories(new Set((data ?? []).map((s: any) => s.user_id as string)));
    } catch {}
  }, [userId]);

  useEffect(() => {
    loadAll();
    loadStories();
  }, [loadAll, loadStories]);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    await Promise.all([loadAll(), loadStories()]);
    setRefreshing(false);
  }, [loadAll, loadStories]);

  // ── Snap camera — navigate to dedicated Snapchat-style screen ──────────────
  const openSnapCamera = useCallback((preSearch = "") => {
    const dest = preSearch
      ? `/snap-camera?toUsername=${encodeURIComponent(preSearch)}`
      : "/snap-camera";
    router.push(dest as any);
  }, []);

  // Refresh snap convos whenever inbox regains focus (e.g. after snap-camera closes)
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchSnapConversations(userId).then(setSnapConvos).catch(() => {});
      }
    }, [userId])
  );

  const handleSendTo = useCallback(async (friend: { id: string; username?: string }) => {
    if (!snapPreviewUri || !userId) return;
    setSendingTo(friend.id);
    try {
      let url = snapPreviewUri;
      const uploaded = await uploadSnapToStorage(snapPreviewUri, userId);
      if (uploaded) url = uploaded;
      await sendSnapMessage(userId, friend.id, url, "photo");
      setSnapPreviewUri(null);
      setSnapPreviewSearch("");
      setSendingTo(null);
      fetchSnapConversations(userId).then(setSnapConvos).catch(() => {});
      show(`Snap sent to @${friend.username ?? "friend"} 👻`);
    } catch { setSendingTo(null); Alert.alert("Error", "Could not send snap."); }
  }, [snapPreviewUri, userId, show]);

  const handleViewSnap = useCallback((convo: SnapConversation) => {
    const snap = parseSnap(convo.message_text);
    if (!snap) return;
    setSnapViewer({ uri: snap.url, messageId: convo.message_id, msgText: convo.message_text });
  }, []);

  const handleSnapViewerClose = useCallback(async () => {
    if (!snapViewer) return;
    const { messageId, msgText } = snapViewer;
    setSnapViewer(null);
    setSnapConvos((prev) =>
      prev.map((c) => {
        if (c.message_id !== messageId) return c;
        const snap = parseSnap(c.message_text);
        if (!snap) return c;
        return { ...c, message_text: encodeSnap({ ...snap, viewed: true, viewed_at: new Date().toISOString() }) };
      })
    );
    await markSnapViewed(messageId, msgText).catch(() => {});
  }, [snapViewer]);

  // ── Badges ─────────────────────────────────────────────────────────────────
  const unreadChats = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count > 0 ? 1 : 0), 0),
    [conversations]
  );
  const unreadSnaps = useMemo(
    () => snapConvos.filter((c) => { const s = parseSnap(c.message_text); return c.is_incoming && s && !s.viewed; }).length,
    [snapConvos]
  );

  return (
    <View style={[screenSt.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[screenSt.header, { paddingTop: topInset + 6, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[screenSt.title, { color: colors.foreground }]}>Messages</Text>
        <View style={screenSt.headerRight}>
          <TouchableOpacity onPress={() => openSnapCamera()} style={screenSt.iconBtn}>
            <Ionicons name="camera-outline" size={23} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={screenSt.iconBtn}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Swipeable top tab bar (only for chats/snaps) ── */}
      {mainTab !== "calls" && (
        <SwipeableTopTabBar
          scrollOffset={scrollOffset}
          onPress={(page) => {
            pagerRef.current?.setPage(page);
            setMainTab(page === 0 ? "chats" : "snaps");
          }}
          chatBadge={unreadChats}
          snapBadge={unreadSnaps}
        />
      )}

      {/* ── Tab content ── */}
      {mainTab === "calls" ? (
        <View style={{ flex: 1 }}><CallsTab /></View>
      ) : (
        <PagerViewCompat
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={mainTab === "snaps" ? 1 : 0}
          onPageScroll={(e) => {
            const { position, offset } = e.nativeEvent;
            scrollOffset.setValue(position + offset);
          }}
          onPageSelected={(e) => {
            const page = e.nativeEvent.position;
            setMainTab(page === 0 ? "chats" : "snaps");
          }}
        >
          <View key="chats" style={{ flex: 1 }}>
            <ChatsTab
              myId={userId ?? ""}
              conversations={conversations}
              snapConvos={dedupedSnapConvos}
              refreshing={refreshing}
              onRefresh={onRefresh}
              usersWithStories={usersWithStories}
              onCamera={openSnapCamera}
              onSnapCamera={openSnapCamera}
              onSnapView={handleViewSnap}
              show={show}
              requests={messageRequests}
            />
          </View>
          <View key="snaps" style={{ flex: 1 }}>
            <SnapsTab
              userId={userId ?? ""}
              snapConvos={dedupedSnapConvos}
              usersWithStories={usersWithStories}
              refreshing={refreshing}
              onRefresh={onRefresh}
              onSnapCamera={openSnapCamera}
              onSnapView={handleViewSnap}
              streaks={streaks}
              show={show}
            />
          </View>
        </PagerViewCompat>
      )}

      {/* ── Bottom tab bar ── */}
      <BottomTabBar
        active={mainTab}
        onChange={(tab) => {
          if (tab === "calls") {
            setMainTab("calls");
          } else {
            const page = tab === "chats" ? 0 : 1;
            pagerRef.current?.setPage(page);
            setMainTab(tab);
          }
        }}
        insets={insets}
        chatBadge={unreadChats}
        snapBadge={unreadSnaps}
      />

      {/* ── Snap send sheet ── */}
      {snapPreviewUri && (
        <SnapSendSheet
          uri={snapPreviewUri}
          conversations={conversations}
          onSendTo={handleSendTo}
          onCancel={() => { setSnapPreviewUri(null); setSnapPreviewSearch(""); }}
          sendingTo={sendingTo}
          initialSearch={snapPreviewSearch}
        />
      )}

      {/* ── Snap viewer ── */}
      {snapViewer && <SnapViewerModal uri={snapViewer.uri} onClose={handleSnapViewerClose} />}

      {ToastView}
    </View>
  );
}

const screenSt = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 0.5, gap: 10,
  },
  title: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 20 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { padding: 6, borderRadius: 20 },
});
