import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
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
import { fetchConversations } from "@/lib/db";
import { Conversation, timeAgo } from "@/lib/supabase";

function ConversationItem({ convo }: { convo: Conversation }) {
  const colors = useColors();
  const hasUnread = convo.unread_count > 0;

  return (
    <TouchableOpacity
      onPress={() =>
        router.push({
          pathname: "/chat/[userId]",
          params: {
            userId: convo.other_user.id,
            username: convo.other_user.username,
          },
        })
      }
      style={[styles.convoItem, { borderBottomColor: colors.border }]}
      activeOpacity={0.75}
    >
      <UserAvatar
        username={convo.other_user.username}
        url={convo.other_user.avatar_url}
        size={50}
        showBorder={hasUnread}
      />
      <View style={styles.convoText}>
        <View style={styles.convoHeader}>
          <Text
            style={[
              styles.convoName,
              { color: colors.foreground },
              hasUnread && styles.convoNameBold,
            ]}
          >
            {convo.other_user.username}
          </Text>
          <Text style={[styles.convoTime, { color: colors.mutedForeground }]}>
            {timeAgo(convo.last_message_at)}
          </Text>
        </View>
        <View style={styles.convoRow}>
          <Text
            style={[
              styles.convoMessage,
              { color: hasUnread ? colors.foreground : colors.mutedForeground },
              hasUnread && styles.convoMessageBold,
            ]}
            numberOfLines={1}
          >
            {convo.last_message}
          </Text>
          {hasUnread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{convo.unread_count}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function InboxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchConversations(session.user.id).then(setConversations).catch(() => {});
  }, [session?.user?.id]);

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
        <TouchableOpacity>
          <Ionicons name="create-outline" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrapper}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
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
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No messages yet
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  backBtn: { padding: 2 },
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
  },
  searchWrapper: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  convoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
  },
  convoText: { flex: 1 },
  convoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  convoName: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
  convoNameBold: { fontFamily: "Poppins_700Bold" },
  convoTime: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  convoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  convoMessage: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    flex: 1,
  },
  convoMessageBold: { fontFamily: "Poppins_500Medium" },
  badge: {
    backgroundColor: "#7C3AED",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    marginLeft: 8,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
});
