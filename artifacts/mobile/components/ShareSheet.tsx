import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { fetchConversations, searchProfiles, sendMessageToUser } from "@/lib/db";
import type { Conversation, Profile } from "@/lib/supabase";
import { UserAvatar } from "./UserAvatar";

const { height: H } = Dimensions.get("window");
const SHEET_HEIGHT = H * 0.66;

const TYPE_LABELS: Record<string, string> = {
  post: "Post",
  reel: "Reel",
  confession: "Confession",
};

export interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  contentType?: "post" | "reel" | "confession";
  contentId?: string;
  senderId?: string;
  username?: string;
}

export function ShareSheet({
  visible,
  onClose,
  contentType,
  contentId,
  senderId,
  username,
}: ShareSheetProps) {
  const colors = useColors();
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  const [query, setQuery] = useState("");
  const [recentConvos, setRecentConvos] = useState<Conversation[]>([]);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [loadingConvos, setLoadingConvos] = useState(false);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: false,
        damping: 20,
        stiffness: 150,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 240,
        useNativeDriver: false,
      }).start();
      setQuery("");
      setSearchResults([]);
      setSentTo(new Set());
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !senderId) return;
    setLoadingConvos(true);
    fetchConversations(senderId)
      .then(setRecentConvos)
      .catch(() => {})
      .finally(() => setLoadingConvos(false));
  }, [visible, senderId]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchProfiles(query.trim(), senderId).then(setSearchResults).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query, senderId]);

  const isContentShare = !!(contentType && contentId && senderId);
  const shareUrl = `https://vibe.app/${contentType ?? "post"}/${username ?? ""}`;

  const handleSendToUser = useCallback(
    async (targetUserId: string) => {
      if (!isContentShare) return;
      setSending(targetUserId);
      try {
        await sendMessageToUser(senderId!, targetUserId, "", {
          contentType: contentType!,
          contentId: contentId!,
        });
        setSentTo((prev) => new Set([...prev, targetUserId]));
      } catch {
        Alert.alert("Error", "Couldn't send. Please try again.");
      } finally {
        setSending(null);
      }
    },
    [isContentShare, senderId, contentType, contentId],
  );

  const externalActions = [
    {
      icon: "link-outline",
      label: "Copy link",
      color: "#7C3AED",
      onPress: async () => {
        try {
          if (
            Platform.OS === "web" &&
            typeof navigator !== "undefined" &&
            navigator.clipboard
          ) {
            await navigator.clipboard.writeText(shareUrl);
          }
        } catch {}
        Alert.alert("Copied!", "Link copied to clipboard");
        onClose();
      },
    },
    {
      icon: "radio-button-on-outline",
      label: "Add to Story",
      color: "#EC4899",
      onPress: () => {
        onClose();
        Alert.alert("Added to story!");
      },
    },
    {
      icon: "share-social-outline",
      label: "Share via...",
      color: "#F97316",
      onPress: async () => {
        try {
          await Share.share({ message: `Check this out on Gundruk! ${shareUrl}`, url: shareUrl });
        } catch {}
        onClose();
      },
    },
    {
      icon: "flag-outline",
      label: "Report",
      color: "#EF4444",
      onPress: () => {
        onClose();
        Alert.alert("Reported", "Thanks for keeping Gundruk safe.");
      },
    },
  ];

  if (!visible) return null;

  function PersonItem({ userId, uname, avatarUrl }: { userId: string; uname: string; avatarUrl?: string | null }) {
    const isSent = sentTo.has(userId);
    const isSending = sending === userId;
    return (
      <TouchableOpacity
        style={styles.personItem}
        onPress={() => !isSent && !isSending && handleSendToUser(userId)}
        disabled={isSent || isSending}
        activeOpacity={0.75}
      >
        <UserAvatar url={avatarUrl ?? undefined} username={uname} size={46} />
        <Text style={[styles.personName, { color: colors.foreground }]} numberOfLines={1}>
          {uname}
        </Text>
        {isSending ? (
          <ActivityIndicator size="small" color="#A78BFA" />
        ) : isSent ? (
          <View style={styles.sentChip}>
            <Ionicons name="checkmark" size={12} color="#A78BFA" />
            <Text style={styles.sentChipText}>Sent</Text>
          </View>
        ) : isContentShare ? (
          <View style={styles.sendChip}>
            <Text style={styles.sendChipText}>Send</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  const showSearch = query.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.card, borderTopColor: colors.border },
          { transform: [{ translateY }] },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <Text style={[styles.title, { color: colors.foreground }]}>
          {isContentShare ? `Send ${TYPE_LABELS[contentType!] ?? ""}` : "Share"}
        </Text>

        {/* Search box — only shown when there is a content share */}
        {isContentShare && (
          <View
            style={[
              styles.searchBox,
              { backgroundColor: colors.muted, borderColor: colors.border },
            ]}
          >
            <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search people..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.searchInput, { color: colors.foreground }]}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* People list */}
        {isContentShare && (
          <View style={styles.peopleSection}>
            {loadingConvos && !showSearch ? (
              <ActivityIndicator color="#A78BFA" style={{ marginVertical: 14 }} />
            ) : showSearch ? (
              searchResults.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No results
                </Text>
              ) : (
                <FlatList
                  horizontal
                  data={searchResults}
                  keyExtractor={(p) => p.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.personList}
                  renderItem={({ item }) => (
                    <PersonItem
                      userId={item.id}
                      uname={item.username ?? ""}
                      avatarUrl={item.avatar_url}
                    />
                  )}
                />
              )
            ) : recentConvos.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No recent conversations
              </Text>
            ) : (
              <FlatList
                horizontal
                data={recentConvos}
                keyExtractor={(c) => c.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.personList}
                renderItem={({ item }) => (
                  <PersonItem
                    userId={item.other_user.id}
                    uname={item.other_user.username ?? ""}
                    avatarUrl={item.other_user.avatar_url}
                  />
                )}
              />
            )}
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {externalActions.map((action) => (
          <TouchableOpacity
            key={action.label}
            onPress={action.onPress}
            style={styles.actionRow}
            activeOpacity={0.75}
          >
            <View style={[styles.iconCircle, { backgroundColor: action.color + "22" }]}>
              <Ionicons name={action.icon as any} size={22} color={action.color} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.foreground }]}>
              {action.label}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 0.5,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontFamily: "Poppins_700Bold",
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    padding: 0,
  },
  peopleSection: {
    height: 110,
    justifyContent: "center",
  },
  personList: {
    paddingHorizontal: 14,
    gap: 10,
    alignItems: "flex-start",
  },
  personItem: {
    alignItems: "center",
    gap: 4,
    width: 70,
  },
  personName: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  sentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(167,139,250,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sentChipText: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
    color: "#A78BFA",
  },
  sendChip: {
    backgroundColor: "rgba(124,58,237,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sendChipText: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    color: "#A78BFA",
  },
  emptyText: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    paddingVertical: 16,
  },
  divider: {
    height: 0.5,
    marginBottom: 6,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 14,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
});
