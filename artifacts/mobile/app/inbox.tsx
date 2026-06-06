import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated as RNAnimated,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  acceptMessageRequest,
  deleteConversation,
  fetchConversations,
  fetchMessageRequests,
} from "@/lib/db";
import { Conversation, timeAgo } from "@/lib/supabase";

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
          <Text style={[styles.convoMessage, { color: hasUnread ? colors.foreground : colors.mutedForeground }, hasUnread && styles.convoMessageBold]} numberOfLines={1}>
            {convo.last_message}
          </Text>
          {hasUnread ? (
            <View style={styles.badge}><Text style={styles.badgeText}>{convo.unread_count}</Text></View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

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
        {/* Blurred message preview */}
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
  const [tab, setTab] = useState<"messages" | "requests">("messages");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<Conversation[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    fetchConversations(userId).then(setConversations).catch(() => {});
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
        showToast(`Request deleted`);
      }},
    ]);
  };

  const filtered = conversations.filter((c) =>
    c.other_user.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Inbox</Text>
        <TouchableOpacity onPress={() => {}}>
          <Ionicons name="create-outline" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Tab selector */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setTab("messages")} style={[styles.tabBtn, tab === "messages" && styles.tabBtnActive]} activeOpacity={0.8}>
          <Text style={[styles.tabLabel, { color: tab === "messages" ? "#7C3AED" : colors.mutedForeground }]}>Messages</Text>
          {tab === "messages" && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("requests")} style={[styles.tabBtn, tab === "requests" && styles.tabBtnActive]} activeOpacity={0.8}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.tabLabel, { color: tab === "requests" ? "#7C3AED" : colors.mutedForeground }]}>Requests</Text>
            {requests.length > 0 && (
              <View style={styles.reqBadge}><Text style={styles.reqBadgeText}>{requests.length}</Text></View>
            )}
          </View>
          {tab === "requests" && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      </View>

      {tab === "messages" ? (
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
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={52} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No messages yet</Text>
              </View>
            }
          />
        </>
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
            loadingReqs ? (
              <View style={styles.empty}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 14 }}>Loading requests…</Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={{ fontSize: 48 }}>📭</Text>
                <Text style={[styles.emptyText, { color: colors.foreground, marginTop: 8 }]}>No message requests</Text>
                <Text style={[{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", marginTop: 4, paddingHorizontal: 32 }]}>
                  When someone you don't follow sends you a message, it'll appear here first.
                </Text>
              </View>
            )
          }
        />
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
  tabLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
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
