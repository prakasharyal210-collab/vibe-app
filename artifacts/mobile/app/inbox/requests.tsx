import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { acceptMessageRequest, deleteConversation, fetchMessageRequests } from "@/lib/db";
import { Conversation, timeAgo } from "@/lib/supabase";

export default function MessageRequestsScreen() {
  const { session } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!session?.user?.id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchMessageRequests(session.user.id);
      setRequests(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAccept = useCallback(async (conv: Conversation) => {
    setActionInProgress(conv.id);
    try {
      await acceptMessageRequest(conv.id);
      setRequests((prev) => prev.filter((r) => r.id !== conv.id));
      router.push({ pathname: "/chat/[userId]", params: { userId: conv.other_user.id, username: conv.other_user.username } } as any);
    } catch {
      Alert.alert("Error", "Could not accept request. Try again.");
    } finally {
      setActionInProgress(null);
    }
  }, []);

  const handleDecline = useCallback((conv: Conversation) => {
    Alert.alert(
      "Delete Request",
      `Delete message request from ${conv.other_user.username}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setActionInProgress(conv.id);
            try {
              await deleteConversation(conv.id);
              setRequests((prev) => prev.filter((r) => r.id !== conv.id));
            } catch {
              Alert.alert("Error", "Could not delete request. Try again.");
            } finally {
              setActionInProgress(null);
            }
          },
        },
      ]
    );
  }, []);

  const renderItem = useCallback(({ item }: { item: Conversation }) => {
    const busy = actionInProgress === item.id;
    return (
      <View style={[st.row, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <UserAvatar
          username={item.other_user.username}
          url={item.other_user.avatar_url}
          size={48}
        />
        <View style={st.info}>
          <View style={st.nameRow}>
            <Text style={[st.username, { color: colors.foreground }]} numberOfLines={1}>
              {item.other_user.username}
            </Text>
            <Text style={[st.time, { color: colors.mutedForeground }]}>
              {item.last_message_at ? timeAgo(item.last_message_at) : ""}
            </Text>
          </View>
          <Text style={[st.preview, { color: colors.mutedForeground }]} numberOfLines={2}>
            {item.last_message || "Sent you a message"}
          </Text>
          <View style={st.actions}>
            <TouchableOpacity
              style={[st.btn, st.acceptBtn]}
              onPress={() => handleAccept(item)}
              activeOpacity={0.8}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={st.acceptText}>Accept</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.btn, st.declineBtn, { borderColor: colors.border }]}
              onPress={() => handleDecline(item)}
              activeOpacity={0.8}
              disabled={busy}
            >
              <Text style={[st.declineText, { color: colors.mutedForeground }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }, [colors, actionInProgress, handleAccept, handleDecline]);

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </Pressable>
        <Text style={[st.headerTitle, { color: colors.foreground }]}>Message Requests</Text>
        <View style={st.backBtn} />
      </View>

      {loading ? (
        <View style={st.centered}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#8B5CF6"
              colors={["#8B5CF6"]}
            />
          }
          ListEmptyComponent={
            <View style={st.centered}>
              <Ionicons name="chatbubble-ellipses-outline" size={52} color={colors.mutedForeground} />
              <Text style={[st.emptyTitle, { color: colors.foreground }]}>No message requests</Text>
              <Text style={[st.emptySub, { color: colors.mutedForeground }]}>
                When someone you don't follow messages you, it appears here.
              </Text>
            </View>
          }
          contentContainerStyle={requests.length === 0 ? st.emptyContainer : { paddingBottom: insets.bottom + 24 }}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36 },
  headerTitle: { fontSize: 17, fontFamily: "Poppins_600SemiBold" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyContainer: { flex: 1 },
  emptyTitle: { fontSize: 16, fontFamily: "Poppins_600SemiBold", marginTop: 16, textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Poppins_400Regular", marginTop: 6, textAlign: "center", lineHeight: 19 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 },
  username: { fontSize: 14, fontFamily: "Poppins_600SemiBold", flex: 1, marginRight: 8 },
  time: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  preview: { fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 18, marginBottom: 12 },
  actions: { flexDirection: "row", gap: 10 },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  acceptBtn: { backgroundColor: "#8B5CF6" },
  acceptText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  declineBtn: { borderWidth: 1 },
  declineText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
});
