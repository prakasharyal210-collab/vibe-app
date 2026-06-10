import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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

type FilterTab = "all" | "unread" | "stories" | "groups";
type ConvoStatus = "new_snap" | "new_chat" | "snap_delivered" | "chat_delivered" | "opened";

// ─── Toast ────────────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState("");
  const opacity = useRef(new RNAnimated.Value(0)).current;

  const show = (msg: string) => {
    setMessage(msg);
    opacity.setValue(0);
    RNAnimated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    setTimeout(() => RNAnimated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(), 2400);
  };

  const ToastView = message ? (
    <RNAnimated.View style={[toastSt.wrap, { opacity }]} pointerEvents="none">
      <Text style={toastSt.text}>{message}</Text>
    </RNAnimated.View>
  ) : null;

  return { show, ToastView };
}

const toastSt = StyleSheet.create({
  wrap: { position: "absolute", bottom: 28, left: 20, right: 20, backgroundColor: "rgba(30,12,50,0.95)", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18, alignItems: "center", zIndex: 9999, borderWidth: 1, borderColor: "rgba(124,58,237,0.3)" },
  text: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
});

// ─── StatusBox ────────────────────────────────────────────────────────────────

function StatusBox({ status, time }: { status: ConvoStatus; time: string }) {
  const isSnapType = status === "new_snap" || status === "snap_delivered";
  const color = status === "opened" ? "#6B7280" : isSnapType ? "#EF4444" : "#3B82F6";
  const isFilled = status === "new_snap" || status === "new_chat";
  const label =
    status === "new_snap" ? "New Snap" :
    status === "new_chat" ? "New Chat" :
    (status === "snap_delivered" || status === "chat_delivered") ? "Delivered" :
    "Opened";

  return (
    <View style={stSt.wrap}>
      {isFilled ? (
        <View style={[stSt.square, { backgroundColor: color }]} />
      ) : (
        <View style={[stSt.squareOutline, { borderColor: color }]}>
          <Ionicons name="arrow-forward" size={7} color={color} />
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
  const avatar = <UserAvatar username={username} url={url} size={size} />;
  if (!hasStory) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.85}>{avatar}</TouchableOpacity>;
  }
  const ring = size + 7;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={["#7C3AED", "#EC4899", "#F97316"]}
        start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
        style={{ width: ring, height: ring, borderRadius: ring / 2, alignItems: "center", justifyContent: "center" }}
      >
        <View style={{ borderRadius: (size + 3) / 2, borderWidth: 2.5, borderColor: "#0A0A0F" }}>
          {avatar}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── ConversationItem ─────────────────────────────────────────────────────────

function ConversationItem({
  convo, isPinned, hasStory, onCamera, onLongPress,
}: {
  convo: Conversation; isPinned: boolean; hasStory: boolean;
  onCamera: () => void; onLongPress: () => void;
}) {
  const colors = useColors();
  const hasUnread = convo.unread_count > 0;
  const isSnapMsg = isSnap(convo.last_message ?? "");
  const status: ConvoStatus = hasUnread ? (isSnapMsg ? "new_snap" : "new_chat") : "opened";

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } })}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.convoItem, { borderBottomColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
    >
      <StoryRingAvatar
        username={convo.other_user.username}
        url={convo.other_user.avatar_url}
        size={50}
        hasStory={hasStory}
        onPress={() => hasStory
          ? router.push(`/profile/${convo.other_user.username}` as any)
          : router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } })
        }
      />
      <View style={styles.convoText}>
        <Text style={[styles.convoName, hasUnread ? styles.convoNameBold : { color: colors.mutedForeground }]}>
          {isPinned ? "📌 " : ""}{convo.other_user.username}
        </Text>
        <StatusBox status={status} time={timeAgo(convo.last_message_at)} />
      </View>
      <TouchableOpacity onPress={onCamera} style={rowSt.camBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="camera-outline" size={22} color={colors.mutedForeground} />
      </TouchableOpacity>
    </Pressable>
  );
}

// ─── SnapConvoItem ────────────────────────────────────────────────────────────

function SnapConvoItem({
  convo, isPinned, hasStory, onView, onCamera, onLongPress,
}: {
  convo: SnapConversation; isPinned: boolean; hasStory: boolean;
  onView: () => void; onCamera: () => void; onLongPress: () => void;
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
    <Pressable
      onPress={() => isUnviewedIncoming
        ? onView()
        : router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } })
      }
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.convoItem, { borderBottomColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
    >
      <StoryRingAvatar
        username={convo.other_user.username}
        url={convo.other_user.avatar_url}
        size={50}
        hasStory={hasStory}
        onPress={() => hasStory
          ? router.push(`/profile/${convo.other_user.username}` as any)
          : router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } })
        }
      />
      <View style={styles.convoText}>
        <Text style={[styles.convoName, isUnviewedIncoming ? styles.convoNameBold : { color: colors.mutedForeground }]}>
          {isPinned ? "📌 " : ""}{convo.other_user.username}
        </Text>
        <StatusBox status={status} time={timeAgo(convo.created_at)} />
      </View>
      <TouchableOpacity onPress={onCamera} style={rowSt.camBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="camera-outline" size={22} color={colors.mutedForeground} />
      </TouchableOpacity>
    </Pressable>
  );
}

const rowSt = StyleSheet.create({
  camBtn: { padding: 6 },
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

      <Image source={{ uri }} style={snapSendSt.preview} resizeMode="cover" />
      <View style={snapSendSt.noteRow}>
        <Ionicons name="eye-off-outline" size={13} color="rgba(255,255,255,0.4)" />
        <Text style={snapSendSt.note}>Disappears after the recipient views it once</Text>
      </View>

      <View style={[snapSendSt.searchWrap, { borderBottomColor: colors.border }]}>
        <View style={[snapSendSt.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search friends…"
            placeholderTextColor={colors.mutedForeground}
            style={[snapSendSt.searchInput, { color: colors.foreground }]}
            autoCapitalize="none"
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
              activeOpacity={0.75}
              disabled={!!sendingTo}
            >
              <UserAvatar username={item.other_user.username} url={item.other_user.avatar_url} size={44} />
              <Text style={[snapSendSt.rowName, { color: colors.foreground }]} numberOfLines={1}>
                {item.other_user.username}
              </Text>
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
  preview: { width: "100%", height: 180, backgroundColor: "#1a1a2e" },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "rgba(234,88,12,0.08)" },
  note: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  searchWrap: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 12, height: 42, gap: 8, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 0.5 },
  rowName: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 14 },
  sendBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  sendBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
});

// ─── RequestItem ──────────────────────────────────────────────────────────────

function RequestItem({
  convo, onAccept, onDelete,
}: { convo: Conversation; onAccept: (c: Conversation) => void; onDelete: (c: Conversation) => void }) {
  const colors = useColors();
  return (
    <View style={[styles.convoItem, reqSt.requestItem, { borderBottomColor: colors.border, borderColor: "rgba(124,58,237,0.15)" }]}>
      <UserAvatar username={convo.other_user.username} url={convo.other_user.avatar_url} size={50} />
      <View style={styles.convoText}>
        <View style={styles.convoHeader}>
          <Text style={[styles.convoName, styles.convoNameBold, { color: colors.foreground }]}>
            {convo.other_user.username}
          </Text>
          <Text style={[styles.convoTime, { color: colors.mutedForeground }]}>{timeAgo(convo.last_message_at)}</Text>
        </View>
        <Text style={[styles.convoMessage, reqSt.blurred, { color: colors.mutedForeground }]} numberOfLines={1}>
          {convo.last_message || "Sent you a message"}
        </Text>
        <View style={reqSt.btnRow}>
          <TouchableOpacity onPress={() => onAccept(convo)} style={reqSt.acceptBtn} activeOpacity={0.8}>
            <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={reqSt.acceptGrad}>
              <Text style={reqSt.acceptText}>Accept</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(convo)} style={[reqSt.deleteBtn, { borderColor: colors.border }]} activeOpacity={0.8}>
            <Text style={[reqSt.deleteText, { color: colors.mutedForeground }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const reqSt = StyleSheet.create({
  requestItem: { paddingVertical: 14, borderWidth: 0, borderBottomWidth: 0.5 },
  blurred: { textShadowColor: "rgba(0,0,0,0)", fontStyle: "italic", opacity: 0.5, letterSpacing: 2, fontSize: 12 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  acceptBtn: { flex: 1, borderRadius: 10, overflow: "hidden" },
  acceptGrad: { paddingVertical: 8, alignItems: "center" },
  acceptText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
  deleteBtn: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 8, alignItems: "center" },
  deleteText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
});

// ─── InboxScreen ──────────────────────────────────────────────────────────────

export default function InboxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { show: showToast, ToastView } = useToast();

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [snapConvos, setSnapConvos] = useState<SnapConversation[]>([]);
  const [requests, setRequests] = useState<Conversation[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(false);
  const [loadingSnaps, setLoadingSnaps] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapPreviewUri, setSnapPreviewUri] = useState<string | null>(null);
  const [snapPreviewSearch, setSnapPreviewSearch] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [snapViewer, setSnapViewer] = useState<{ uri: string; messageId: string; msgText: string } | null>(null);
  const [showRequests, setShowRequests] = useState(false);

  // New feature state
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [usersWithStories, setUsersWithStories] = useState<Set<string>>(new Set());

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const userId = session?.user?.id;

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      fetchConversations(userId).then(setConversations).catch(() => {}),
      fetchSnapConversations(userId).then(setSnapConvos).catch(() => {}).then(() => setLoadingSnaps(false)),
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

  useEffect(() => {
    if (!userId || !showRequests) return;
    setLoadingReqs(true);
    fetchMessageRequests(userId)
      .then((data) => { setRequests(data); setLoadingReqs(false); })
      .catch(() => setLoadingReqs(false));
  }, [userId, showRequests]);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    await Promise.all([loadAll(), loadStories()]);
    setRefreshing(false);
  }, [loadAll, loadStories]);

  // ── Unified list ────────────────────────────────────────────────────────────
  type UnifiedItem =
    | { key: string; kind: "chat"; convo: Conversation; ts: string; userId: string; isPinned: boolean; hasStory: boolean; hasUnread: boolean }
    | { key: string; kind: "snap"; convo: SnapConversation; ts: string; userId: string; isPinned: boolean; hasStory: boolean; hasUnread: boolean };

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
      const hasUnread = !!(c.is_incoming && snap && !snap.viewed);
      return {
        key: `snap_${c.message_id}`,
        kind: "snap",
        convo: c,
        ts: c.created_at,
        userId: c.other_user.id,
        isPinned: pinnedIds.has(c.message_id),
        hasStory: usersWithStories.has(c.other_user.id),
        hasUnread,
      };
    });

    const merged = [...chatItems, ...snapItems];
    merged.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    merged.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
    return merged;
  }, [conversations, snapConvos, pinnedIds, usersWithStories]);

  // ── Filtered views ──────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    let base = allItems;
    if (q) {
      base = base.filter((i) => {
        const name = i.kind === "chat"
          ? (i.convo as Conversation).other_user.username
          : (i.convo as SnapConversation).other_user.username;
        return name.toLowerCase().includes(q);
      });
    }
    if (filterTab === "unread") return base.filter((i) => i.hasUnread);
    if (filterTab === "stories") {
      const seen = new Set<string>();
      return base.filter((i) => {
        if (!i.hasStory || seen.has(i.userId)) return false;
        seen.add(i.userId);
        return true;
      });
    }
    if (filterTab === "groups") return [];
    return base;
  }, [allItems, filterTab, search]);

  const unreadCount = useMemo(() => allItems.filter((i) => i.hasUnread).length, [allItems]);
  const storiesCount = useMemo(() => {
    const seen = new Set<string>();
    allItems.forEach((i) => { if (i.hasStory) seen.add(i.userId); });
    return seen.size;
  }, [allItems]);

  // ── Long press menu ─────────────────────────────────────────────────────────
  const showLongPressMenu = useCallback((id: string, username: string, isPinned: boolean) => {
    Alert.alert(`@${username}`, undefined, [
      {
        text: isPinned ? "Unpin Conversation" : "📌 Pin Conversation",
        onPress: () => setPinnedIds((prev) => {
          const next = new Set(prev);
          if (isPinned) next.delete(id); else next.add(id);
          return next;
        }),
      },
      {
        text: "🔕 Mute Notifications",
        onPress: () => showToast(`@${username} muted`),
      },
      {
        text: "🗑 Delete Conversation",
        style: "destructive",
        onPress: () =>
          Alert.alert("Delete Conversation?", `This will delete your conversation with @${username}.`, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => {
                setConversations((prev) => prev.filter((c) => c.id !== id && c.other_user.id !== id));
                setSnapConvos((prev) => prev.filter((c) => c.message_id !== id && c.other_user.id !== id));
                showToast("Conversation deleted");
              },
            },
          ]),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [showToast]);

  // ── Snap camera ─────────────────────────────────────────────────────────────
  const openSnapCamera = useCallback(async (preSearch = "") => {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status === "granted") {
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.8 });
          if (!result.canceled) {
            setSnapPreviewSearch(preSearch);
            setSnapPreviewUri(result.assets[0].uri);
          }
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.8 });
      if (!result.canceled) {
        setSnapPreviewSearch(preSearch);
        setSnapPreviewUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Could not open camera or photo library.");
    }
  }, []);

  const handleSendTo = useCallback(async (friend: { id: string; username?: string }) => {
    if (!snapPreviewUri || !userId) return;
    setSendingTo(friend.id);
    try {
      let snapUrl = snapPreviewUri;
      const uploaded = await uploadSnapToStorage(snapPreviewUri, userId);
      if (uploaded) snapUrl = uploaded;
      await sendSnapMessage(userId, friend.id, snapUrl, "photo");
      setSnapPreviewUri(null);
      setSnapPreviewSearch("");
      setSendingTo(null);
      fetchSnapConversations(userId).then(setSnapConvos).catch(() => {});
      showToast(`Snap sent to @${friend.username ?? "friend"} 👻`);
    } catch {
      setSendingTo(null);
      Alert.alert("Error", "Could not send snap. Please try again.");
    }
  }, [snapPreviewUri, userId]);

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

  const handleAccept = async (convo: Conversation) => {
    await acceptMessageRequest(convo.id);
    setRequests((prev) => prev.filter((r) => r.id !== convo.id));
    setConversations((prev) => [{ ...convo, unread_count: 1 }, ...prev]);
    showToast(`Accepted message from @${convo.other_user.username} ✅`);
  };

  const handleDelete = (convo: Conversation) => {
    Alert.alert("Delete Request?", `Delete the message request from @${convo.other_user.username}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          await deleteConversation(convo.id);
          setRequests((prev) => prev.filter((r) => r.id !== convo.id));
          showToast("Request deleted");
        },
      },
    ]);
  };

  // ── Tab definitions ─────────────────────────────────────────────────────────
  const TABS: { id: FilterTab; label: string; badge?: number }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread", badge: unreadCount || undefined },
    { id: "stories", label: "Stories", badge: storiesCount || undefined },
    { id: "groups", label: "Groups" },
  ];

  // ── Render item ─────────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: UnifiedItem }) => {
    if (item.kind === "chat") {
      const c = item.convo as Conversation;
      return (
        <ConversationItem
          convo={c}
          isPinned={item.isPinned}
          hasStory={item.hasStory}
          onCamera={() => openSnapCamera(c.other_user.username)}
          onLongPress={() => showLongPressMenu(c.id, c.other_user.username, item.isPinned)}
        />
      );
    } else {
      const c = item.convo as SnapConversation;
      return (
        <SnapConvoItem
          convo={c}
          isPinned={item.isPinned}
          hasStory={item.hasStory}
          onView={() => handleViewSnap(c)}
          onCamera={() => openSnapCamera(c.other_user.username)}
          onLongPress={() => showLongPressMenu(c.message_id, c.other_user.username, item.isPinned)}
        />
      );
    }
  }, [openSnapCamera, showLongPressMenu, handleViewSnap]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Messages</Text>

        {/* Requests badge button */}
        <TouchableOpacity onPress={() => setShowRequests(true)} style={styles.headerIconBtn}>
          <Ionicons name="person-add-outline" size={22} color={colors.foreground} />
          {requests.length > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{requests.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Global snap camera */}
        <TouchableOpacity onPress={() => openSnapCamera()}>
          <View style={styles.snapCamBtn}>
            <Ionicons name="camera" size={19} color="#EA580C" />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Filter tabs ── */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {TABS.map((t) => {
          const isActive = filterTab === t.id;
          const badgeColor = t.id === "unread" ? "#3B82F6" : "#7C3AED";
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setFilterTab(t.id)}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[styles.tabLabel, { color: isActive ? "#7C3AED" : colors.mutedForeground }]}>
                  {t.label}
                </Text>
                {t.badge ? (
                  <View style={[styles.reqBadge, { backgroundColor: badgeColor }]}>
                    <Text style={styles.reqBadgeText}>{t.badge}</Text>
                  </View>
                ) : null}
              </View>
              {isActive && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Search bar ── */}
      <View style={styles.searchWrapper}>
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search messages…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCapitalize="none"
          />
        </View>
      </View>

      {/* ── Main list ── */}
      {filterTab === "groups" ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 40 }}>👥</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground, marginTop: 8 }]}>No group chats yet</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", marginTop: 4, paddingHorizontal: 32 }}>
            Group chat feature is coming soon!
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" colors={["#8B5CF6"]} />
          }
          ListHeaderComponent={filterTab === "all" ? (
            <TouchableOpacity
              onPress={() => router.push("/ai-chat" as any)}
              style={[styles.convoItem, { borderBottomColor: colors.border }]}
              activeOpacity={0.75}
            >
              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(124,58,237,0.18)", borderWidth: 2, borderColor: "#7C3AED", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 22 }}>🤖</Text>
              </View>
              <View style={styles.convoText}>
                <Text style={[styles.convoName, styles.convoNameBold, { color: colors.foreground }]}>Gundruk AI</Text>
                <Text style={[styles.convoMessage, { color: colors.mutedForeground }]} numberOfLines={1}>
                  Ask me anything — captions, bio, date ideas...
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}
          ListEmptyComponent={
            loadingSnaps ? (
              <View style={styles.empty}>
                <ActivityIndicator color="#8B5CF6" />
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={{ fontSize: 48 }}>
                  {filterTab === "unread" ? "✅" : filterTab === "stories" ? "🌟" : "💬"}
                </Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground, marginTop: 8 }]}>
                  {filterTab === "unread" ? "All caught up!" : filterTab === "stories" ? "No active stories" : "No messages yet"}
                </Text>
              </View>
            )
          }
        />
      )}

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

      {/* ── Snap viewer modal ── */}
      {snapViewer && (
        <SnapViewerModal uri={snapViewer.uri} onClose={handleSnapViewerClose} />
      )}

      {/* ── Requests modal ── */}
      <Modal
        visible={showRequests}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRequests(false)}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowRequests(false)} style={styles.backBtn}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.foreground }]}>Message Requests</Text>
            <View style={{ width: 36 }} />
          </View>

          {loadingReqs ? (
            <View style={styles.empty}>
              <ActivityIndicator color="#8B5CF6" />
            </View>
          ) : (
            <FlatList
              data={requests}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <RequestItem convo={item} onAccept={handleAccept} onDelete={handleDelete} />}
              ListHeaderComponent={requests.length > 0 ? (
                <View style={[styles.reqInfo, { backgroundColor: "rgba(124,58,237,0.08)", borderColor: "rgba(124,58,237,0.15)" }]}>
                  <Ionicons name="information-circle-outline" size={16} color="#A78BFA" />
                  <Text style={[styles.reqInfoText, { color: "#A78BFA" }]}>
                    These are messages from people you don't follow. Accept to move them to your inbox.
                  </Text>
                </View>
              ) : null}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={{ fontSize: 48 }}>📭</Text>
                  <Text style={[styles.emptyText, { color: colors.foreground, marginTop: 8 }]}>No message requests</Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", marginTop: 4, paddingHorizontal: 32 }}>
                    When someone you don't follow messages you, it'll appear here first.
                  </Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            />
          )}
        </View>
      </Modal>

      {ToastView}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 0.5, gap: 10 },
  backBtn: { padding: 2 },
  title: { flex: 1, fontSize: 20, fontFamily: "Poppins_700Bold" },
  headerIconBtn: { position: "relative", padding: 4 },
  headerBadge: { position: "absolute", top: 0, right: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  headerBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Poppins_700Bold" },
  snapCamBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(234,88,12,0.12)", borderWidth: 1.5, borderColor: "rgba(234,88,12,0.35)", alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", borderBottomWidth: 0.5 },
  tabBtn: { flex: 1, paddingVertical: 11, alignItems: "center", position: "relative" },
  tabBtnActive: {},
  tabLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  tabIndicator: { position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2.5, backgroundColor: "#7C3AED", borderRadius: 2 },
  reqBadge: { minWidth: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  reqBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Poppins_700Bold" },
  searchWrapper: { paddingHorizontal: 14, paddingVertical: 9 },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 12, height: 40, gap: 8, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular" },
  convoItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 0.5 },
  convoText: { flex: 1 },
  convoHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  convoName: { fontSize: 15, fontFamily: "Poppins_500Medium", color: "#fff" },
  convoNameBold: { fontFamily: "Poppins_700Bold" },
  convoTime: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  convoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convoMessage: { fontSize: 13, fontFamily: "Poppins_400Regular", flex: 1 },
  convoMessageBold: { fontFamily: "Poppins_500Medium" },
  badge: { backgroundColor: "#7C3AED", minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, marginLeft: 8 },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_700Bold" },
  empty: { flex: 1, alignItems: "center", paddingTop: 80, gap: 6 },
  emptyText: { fontSize: 16, fontFamily: "Poppins_600SemiBold" },
  reqInfo: { flexDirection: "row", gap: 10, alignItems: "flex-start", margin: 14, padding: 12, borderRadius: 12, borderWidth: 1 },
  reqInfoText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 17 },
});
