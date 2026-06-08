import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  FlatList,
  Image,
  Platform,
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
import { Conversation, timeAgo } from "@/lib/supabase";

type InboxTab = "messages" | "snaps" | "requests";

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

// ─── ConversationItem ─────────────────────────────────────────────────────────

function ConversationItem({ convo }: { convo: Conversation }) {
  const colors = useColors();
  const hasUnread = convo.unread_count > 0;
  const isSnapMsg = isSnap(convo.last_message ?? "");
  const displayMessage = isSnapMsg ? "📷 Photo snap" : convo.last_message;

  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } })}
      style={[styles.convoItem, { borderBottomColor: colors.border }]}
      activeOpacity={0.75}
    >
      <UserAvatar username={convo.other_user.username} url={convo.other_user.avatar_url} size={50} showBorder={hasUnread} />
      <View style={styles.convoText}>
        <View style={styles.convoHeader}>
          <Text style={[styles.convoName, { color: colors.foreground }, hasUnread && styles.convoNameBold]}>
            {convo.other_user.username}
          </Text>
          <Text style={[styles.convoTime, { color: colors.mutedForeground }]}>{timeAgo(convo.last_message_at)}</Text>
        </View>
        <View style={styles.convoRow}>
          {isSnapMsg ? (
            <View style={snapPreviewStyles.row}>
              <View style={snapPreviewStyles.iconWrap}>
                <Ionicons name="camera" size={11} color="#EA580C" />
              </View>
              <Text style={[snapPreviewStyles.text, { color: hasUnread ? "#EA580C" : colors.mutedForeground }]} numberOfLines={1}>
                {displayMessage}
              </Text>
            </View>
          ) : (
            <Text style={[styles.convoMessage, { color: hasUnread ? colors.foreground : colors.mutedForeground }, hasUnread && styles.convoMessageBold]} numberOfLines={1}>
              {displayMessage}
            </Text>
          )}
          {hasUnread ? (
            <View style={styles.badge}><Text style={styles.badgeText}>{convo.unread_count}</Text></View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const snapPreviewStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  iconWrap: { width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(234,88,12,0.15)", alignItems: "center", justifyContent: "center" },
  text: { fontFamily: "Poppins_500Medium", fontSize: 13, flex: 1 },
});

// ─── SnapConvoItem ────────────────────────────────────────────────────────────

function SnapConvoItem({
  convo,
  onView,
}: {
  convo: SnapConversation;
  onView: () => void;
}) {
  const colors = useColors();
  const snap = parseSnap(convo.message_text);
  const isUnviewedIncoming = convo.is_incoming && snap && !snap.viewed;

  return (
    <TouchableOpacity
      onPress={() => {
        if (isUnviewedIncoming) {
          onView();
        } else {
          router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } });
        }
      }}
      style={[styles.convoItem, { borderBottomColor: colors.border }]}
      activeOpacity={0.75}
    >
      <UserAvatar username={convo.other_user.username} url={convo.other_user.avatar_url} size={50} showBorder={!!isUnviewedIncoming} />
      <View style={styles.convoText}>
        <View style={styles.convoHeader}>
          <Text style={[styles.convoName, { color: colors.foreground }, !!isUnviewedIncoming && styles.convoNameBold]}>
            {convo.other_user.username}
          </Text>
          <Text style={[styles.convoTime, { color: colors.mutedForeground }]}>{timeAgo(convo.created_at)}</Text>
        </View>
        {convo.is_incoming ? (
          isUnviewedIncoming ? (
            <LinearGradient colors={["#EA580C", "#DC2626"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={snapConvoSt.pill}>
              <Ionicons name="camera" size={13} color="#fff" />
              <Text style={snapConvoSt.pillText}>Tap to view · Photo</Text>
            </LinearGradient>
          ) : (
            <View style={[snapConvoSt.pill, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
              <Ionicons name="camera-outline" size={13} color="rgba(255,255,255,0.3)" />
              <Text style={[snapConvoSt.pillText, { color: "rgba(255,255,255,0.3)" }]}>Opened</Text>
            </View>
          )
        ) : snap?.viewed ? (
          <View style={[snapConvoSt.pill, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
            <Ionicons name="camera-outline" size={13} color="rgba(255,255,255,0.3)" />
            <Text style={[snapConvoSt.pillText, { color: "rgba(255,255,255,0.3)" }]}>Opened 👁</Text>
          </View>
        ) : (
          <View style={[snapConvoSt.pill, { backgroundColor: "rgba(234,88,12,0.12)", borderWidth: 1, borderColor: "rgba(234,88,12,0.3)" }]}>
            <Ionicons name="camera-outline" size={13} color="#EA580C" />
            <Text style={[snapConvoSt.pillText, { color: "#EA580C" }]}>Delivered</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const snapConvoSt = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, alignSelf: "flex-start" },
  pillText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
});

// ─── SnapSendSheet ─────────────────────────────────────────────────────────────

function SnapSendSheet({
  uri,
  conversations,
  onSendTo,
  onCancel,
  sendingTo,
}: {
  uri: string;
  conversations: Conversation[];
  onSendTo: (friend: { id: string; username?: string }) => void;
  onCancel: () => void;
  sendingTo: string | null;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
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
              {conversations.length === 0 ? "No conversations yet. Start chatting to send snaps!" : "No friends found"}
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
  const [tab, setTab] = useState<InboxTab>("messages");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [snapConvos, setSnapConvos] = useState<SnapConversation[]>([]);
  const [requests, setRequests] = useState<Conversation[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(false);
  const [loadingSnaps, setLoadingSnaps] = useState(true);
  const [snapPreviewUri, setSnapPreviewUri] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [snapViewer, setSnapViewer] = useState<{ uri: string; messageId: string; msgText: string } | null>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    fetchConversations(userId).then(setConversations).catch(() => {});
    fetchSnapConversations(userId).then(setSnapConvos).catch(() => {}).finally(() => setLoadingSnaps(false));
  }, [userId]);

  useEffect(() => {
    if (!userId || tab !== "requests") return;
    setLoadingReqs(true);
    fetchMessageRequests(userId).then((data) => { setRequests(data); setLoadingReqs(false); }).catch(() => setLoadingReqs(false));
  }, [userId, tab]);

  const handleAccept = async (convo: Conversation) => {
    await acceptMessageRequest(convo.id);
    setRequests((prev) => prev.filter((r) => r.id !== convo.id));
    setConversations((prev) => [{ ...convo, unread_count: 1 }, ...prev]);
    showToast(`Accepted message from @${convo.other_user.username} ✅`);
  };

  const handleDelete = (convo: Conversation) => {
    Alert.alert("Delete Request?", `Delete the message request from @${convo.other_user.username}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await deleteConversation(convo.id);
        setRequests((prev) => prev.filter((r) => r.id !== convo.id));
        showToast("Request deleted");
      }},
    ]);
  };

  const openSnapCamera = useCallback(async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status === "granted") {
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.8 });
          if (!result.canceled) { setSnapPreviewUri(result.assets[0].uri); return; }
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.8 });
      if (!result.canceled) setSnapPreviewUri(result.assets[0].uri);
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

  const filtered = conversations.filter((c) =>
    c.other_user.username.toLowerCase().includes(search.toLowerCase())
  );

  const TABS: { id: InboxTab; label: string }[] = [
    { id: "messages", label: "💬 Messages" },
    { id: "snaps", label: "👻 Snaps" },
    { id: "requests", label: "👥 Requests" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Inbox</Text>
        {tab === "snaps" ? (
          <TouchableOpacity onPress={openSnapCamera}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(234,88,12,0.12)", borderWidth: 1.5, borderColor: "rgba(234,88,12,0.35)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="camera" size={19} color="#EA580C" />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => {}}>
            <Ionicons name="create-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab selector — 3 tabs */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {TABS.map((t) => {
          const isActive = tab === t.id;
          const badgeCount = t.id === "requests" ? requests.length : 0;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text style={[styles.tabLabel, { color: isActive ? "#7C3AED" : colors.mutedForeground }]}>
                  {t.label}
                </Text>
                {badgeCount > 0 && (
                  <View style={styles.reqBadge}><Text style={styles.reqBadgeText}>{badgeCount}</Text></View>
                )}
              </View>
              {isActive && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Messages Tab ── */}
      {tab === "messages" && (
        <>
          <View style={styles.searchWrapper}>
            <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search messages..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.searchInput, { color: colors.foreground }]}
                autoCapitalize="none"
              />
            </View>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ConversationItem convo={item} />}
            ListHeaderComponent={
              <TouchableOpacity
                onPress={() => router.push("/ai-chat" as any)}
                style={[styles.convoItem, { borderBottomColor: colors.border }]}
                activeOpacity={0.75}
              >
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(124,58,237,0.18)", borderWidth: 2, borderColor: "#7C3AED", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 22 }}>🤖</Text>
                </View>
                <View style={styles.convoText}>
                  <View style={styles.convoHeader}>
                    <Text style={[styles.convoName, styles.convoNameBold, { color: colors.foreground }]}>Gundruk AI</Text>
                    <Text style={[styles.convoTime, { color: "#10B981" }]}>● Online</Text>
                  </View>
                  <Text style={[styles.convoMessage, { color: colors.mutedForeground }]} numberOfLines={1}>
                    Ask me anything — captions, bio, date ideas...
                  </Text>
                </View>
              </TouchableOpacity>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={52} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No messages yet</Text>
              </View>
            }
          />
        </>
      )}

      {/* ── Snaps Tab ── */}
      {tab === "snaps" && (
        <FlatList
          data={snapConvos}
          keyExtractor={(item) => item.message_id}
          renderItem={({ item }) => (
            <SnapConvoItem convo={item} onView={() => handleViewSnap(item)} />
          )}
          ListHeaderComponent={snapConvos.length > 0 ? (
            <View style={[styles.reqInfo, { backgroundColor: "rgba(234,88,12,0.08)", borderColor: "rgba(234,88,12,0.2)" }]}>
              <Ionicons name="camera" size={15} color="#EA580C" />
              <Text style={[styles.reqInfoText, { color: "#EA580C" }]}>
                Snaps disappear after the recipient views them once. Tap the camera above to send a snap.
              </Text>
            </View>
          ) : null}
          ListEmptyComponent={
            loadingSnaps ? null : (
              <View style={{ alignItems: "center", paddingTop: 70, paddingHorizontal: 32, gap: 14 }}>
                <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: "rgba(234,88,12,0.1)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(234,88,12,0.28)" }}>
                  <Ionicons name="camera" size={38} color="#EA580C" />
                </View>
                <Text style={{ color: colors.foreground, fontFamily: "Poppins_700Bold", fontSize: 17, textAlign: "center" }}>Send your first snap</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", lineHeight: 19 }}>
                  Tap the camera icon above to send a disappearing photo to a friend
                </Text>
                <TouchableOpacity onPress={openSnapCamera} activeOpacity={0.85} style={{ borderRadius: 14, overflow: "hidden", marginTop: 4 }}>
                  <LinearGradient colors={["#EA580C", "#DC2626"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 28, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="camera" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 }}>Send a Snap</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )
          }
        />
      )}

      {/* ── Requests Tab ── */}
      {tab === "requests" && (
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
            loadingReqs ? (
              <View style={styles.empty}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 14 }}>Loading requests…</Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={{ fontSize: 48 }}>📭</Text>
                <Text style={[styles.emptyText, { color: colors.foreground, marginTop: 8 }]}>No message requests</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", marginTop: 4, paddingHorizontal: 32 }}>
                  When someone you don't follow sends you a message, it'll appear here first.
                </Text>
              </View>
            )
          }
        />
      )}

      {/* Snap send sheet — rendered over content */}
      {snapPreviewUri && (
        <SnapSendSheet
          uri={snapPreviewUri}
          conversations={conversations}
          onSendTo={handleSendTo}
          onCancel={() => setSnapPreviewUri(null)}
          sendingTo={sendingTo}
        />
      )}

      {/* Snap viewer modal */}
      {snapViewer && (
        <SnapViewerModal uri={snapViewer.uri} onClose={handleSnapViewerClose} />
      )}

      {ToastView}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 0.5, gap: 12 },
  backBtn: { padding: 2 },
  title: { flex: 1, fontSize: 20, fontFamily: "Poppins_700Bold" },
  tabRow: { flexDirection: "row", borderBottomWidth: 0.5 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", position: "relative" },
  tabBtnActive: {},
  tabLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  tabIndicator: { position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2.5, backgroundColor: "#7C3AED", borderRadius: 2 },
  reqBadge: { backgroundColor: "#7C3AED", minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  reqBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Poppins_700Bold" },
  searchWrapper: { paddingHorizontal: 14, paddingVertical: 10 },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 12, height: 42, gap: 8, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular" },
  convoItem: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 0.5 },
  convoText: { flex: 1 },
  convoHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  convoName: { fontSize: 15, fontFamily: "Poppins_500Medium" },
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
