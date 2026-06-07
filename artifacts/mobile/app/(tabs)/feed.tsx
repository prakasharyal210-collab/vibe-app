import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdCard } from "@/components/AdCard";
import { LoginPrompt } from "@/components/LoginPrompt";
import { PostCard } from "@/components/PostCard";
import { SkeletonPost } from "@/components/SkeletonLoader";
import { SnapViewerModal } from "@/components/SnapViewer";
import { StoryRow } from "@/components/StoryRow";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useRealtime } from "@/context/RealtimeContext";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";
import {
  SnapConversation,
  acceptMessageRequest,
  deleteConversation,
  fetchConversations,
  fetchFriendStories,
  fetchMessageRequests,
  fetchSnapConversations,
  fetchUnreadCount,
  getForYouFeed,
  getFriendsFeed,
  markPostSeen,
} from "@/lib/db";
import type { StoryEntry } from "@/lib/db";
import { Conversation, Post, supabase, timeAgo } from "@/lib/supabase";
import { AdItem, HOUSE_ADS, insertAdsInFeed, loadFeedAds } from "@/lib/ads";
import {
  encodeSnap,
  isSnap,
  markSnapViewed,
  parseSnap,
  sendSnapMessage,
  uploadSnapToStorage,
} from "@/lib/snap";

const { width: SCREEN_W } = Dimensions.get("window");
const PAGE_SIZE = 20;
const PAGE_INBOX = 0;
const PAGE_FORYOU = 1;
const PAGE_FRIENDS = 2;

type InboxTabId = "messages" | "snaps" | "requests";

// ─── Category pills ──────────────────────────────────────────────────────────

interface Category { id: string; label: string; keywords: string[] }
const CATEGORIES: Category[] = [
  { id: "explore", label: "🧭 Explore", keywords: [] },
  { id: "trending", label: "🔥 Trending", keywords: [] },
  { id: "music", label: "🎵 Music", keywords: ["music", "song", "beat", "artist", "track", "album", "listen"] },
  { id: "dance", label: "💃 Dance", keywords: ["dance", "dancing", "choreo", "moves"] },
  { id: "comedy", label: "😂 Comedy", keywords: ["comedy", "funny", "laugh", "humor", "joke", "lol"] },
  { id: "travel", label: "✈️ Travel", keywords: ["travel", "trip", "vacation", "explore", "adventure", "wanderlust"] },
  { id: "food", label: "🍕 Food", keywords: ["food", "eat", "recipe", "cooking", "foodie", "chef"] },
  { id: "fitness", label: "💪 Fitness", keywords: ["fitness", "gym", "workout", "run", "exercise", "health"] },
  { id: "gaming", label: "🎮 Gaming", keywords: ["gaming", "game", "play", "stream", "esports", "gamer"] },
  { id: "photography", label: "📸 Photography", keywords: ["photo", "photography", "shot", "camera", "portrait", "landscape"] },
  { id: "art", label: "🎨 Art", keywords: ["art", "drawing", "painting", "sketch", "creative", "design"] },
  { id: "fashion", label: "💄 Fashion", keywords: ["fashion", "style", "outfit", "ootd", "clothes", "wear"] },
  { id: "pets", label: "🐾 Pets", keywords: ["pet", "dog", "cat", "puppy", "kitten", "animal"] },
  { id: "sports", label: "⚽ Sports", keywords: ["sport", "football", "basketball", "soccer", "tennis", "athlete"] },
  { id: "tech", label: "💻 Tech", keywords: ["tech", "ai", "coding", "developer", "startup", "software"] },
  { id: "nature", label: "🌿 Nature", keywords: ["nature", "forest", "ocean", "mountains", "outdoor", "wildlife"] },
];

function CategoryPills({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  const { theme } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pillSt.row} style={pillSt.scroll}>
      {CATEGORIES.map((cat) => {
        const isActive = cat.id === active;
        return (
          <TouchableOpacity key={cat.id} onPress={() => onSelect(cat.id)} activeOpacity={0.75} style={pillSt.pillWrap}>
            {isActive ? (
              <LinearGradient colors={theme.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={pillSt.pill}>
                <Text style={[pillSt.text, { color: "#fff" }]}>{cat.label}</Text>
              </LinearGradient>
            ) : (
              <View style={[pillSt.pill, pillSt.pillInactive]}>
                <Text style={pillSt.text}>{cat.label}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
const pillSt = StyleSheet.create({
  scroll: { flexShrink: 0 },
  row: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: "row" },
  pillWrap: { borderRadius: 20, overflow: "hidden" },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  pillInactive: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  text: { fontSize: 12, fontFamily: "Poppins_500Medium", color: "rgba(156,163,175,0.9)" },
});

// ─── VibeLogo ────────────────────────────────────────────────────────────────

function VibeLogo() {
  const { theme } = useTheme();
  if (Platform.OS === "web") {
    return (
      <Text style={[logoSt.text, {
        // @ts-ignore
        background: `linear-gradient(to right, ${theme.gradient[0]}, ${theme.gradient[1]}, ${theme.gradient[2]})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }]}>GUNDRUK</Text>
    );
  }
  return (
    <View style={logoSt.row}>
      <Text style={[logoSt.text, { color: theme.gradient[0] }]}>G</Text>
      <Text style={[logoSt.text, { color: theme.gradient[1] }]}>U</Text>
      <Text style={[logoSt.text, { color: theme.gradient[2] }]}>NDRUK</Text>
    </View>
  );
}
const logoSt = StyleSheet.create({
  row: { flexDirection: "row" },
  text: { fontSize: 22, fontFamily: "Poppins_700Bold", letterSpacing: 2 },
});

// ─── TrendingGrid ─────────────────────────────────────────────────────────────

const MOCK_TRENDING = Array.from({ length: 9 }, (_, i) => ({
  id: `tr${i}`,
  image_url: `https://picsum.photos/seed/trend${i + 1}/300/300`,
  likes_count: Math.floor(Math.random() * 80000 + 5000),
}));

function TrendingGrid({ posts, colors, title = "Trending on Gundruk" }: {
  posts: { id: string; image_url: string; likes_count: number }[];
  colors: any;
  title?: string;
}) {
  const ITEM = (SCREEN_W - 4) / 3;
  const fmt = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 10 }}>
        <LinearGradient colors={["#7C3AED", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 3, height: 16, borderRadius: 2 }} />
        <Text style={{ color: colors.foreground, fontFamily: "Poppins_700Bold", fontSize: 15 }}>{title}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
        {posts.map((p) => (
          <TouchableOpacity key={p.id} activeOpacity={0.85} onPress={() => router.push(`/post/${p.id}` as any)}>
            <Image source={{ uri: p.image_url }} style={{ width: ITEM, height: ITEM }} resizeMode="cover" />
            <View style={{ position: "absolute", bottom: 4, left: 5, flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Text style={{ fontSize: 9 }}>❤️</Text>
              <Text style={{ color: "#fff", fontSize: 10, fontFamily: "Poppins_600SemiBold", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>{fmt(p.likes_count)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function WhyThisButton({ index }: { index: number }) {
  const WHY = ["Based on your interest in #travel", "Popular in your area", "Trending right now", "Because you liked similar posts", "From a creator you might like"];
  return (
    <TouchableOpacity onPress={() => Alert.alert("💡 Why you're seeing this", WHY[index % WHY.length])} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingBottom: 8, paddingTop: 2 }} activeOpacity={0.7}>
      <Ionicons name="information-circle-outline" size={12} color="rgba(255,255,255,0.35)" />
      <Text style={{ fontSize: 11, fontFamily: "Poppins_400Regular", color: "rgba(255,255,255,0.35)" }}>Why you're seeing this</Text>
    </TouchableOpacity>
  );
}

function SuggestedCTA({ colors }: { colors: any }) {
  return (
    <View style={{ alignItems: "center", paddingTop: 20, paddingHorizontal: 32, gap: 12 }}>
      <TouchableOpacity onPress={() => router.push("/suggested-users" as any)} style={{ backgroundColor: "#7C3AED", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
        <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 }}>Find People to Follow →</Text>
      </TouchableOpacity>
    </View>
  );
}

function FriendsStoriesBar({ stories, colors }: { stories: StoryEntry[]; colors: any }) {
  return (
    <View style={{ backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
        <LinearGradient colors={["#7C3AED", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 3, height: 16, borderRadius: 2 }} />
        <Text style={{ color: colors.foreground, fontFamily: "Poppins_700Bold", fontSize: 15, flex: 1 }}>Stories</Text>
        {stories.filter((s) => s.isOnline && !s.isOwn).length > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22C55E" }} />
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Poppins_500Medium" }}>{stories.filter((s) => s.isOnline && !s.isOwn).length} online</Text>
          </View>
        )}
      </View>
      <StoryRow stories={stories} />
      <View style={{ height: 0.5, backgroundColor: colors.border, marginTop: 8 }} />
    </View>
  );
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_FOR_YOU: Post[] = [
  {
    id: "fy1", user_id: "u6",
    image_url: "https://picsum.photos/seed/fy1/400/400",
    images: ["https://picsum.photos/seed/fy1/400/400", "https://picsum.photos/seed/fy1b/400/400"],
    caption: "The best sunsets are the ones you didn't plan 🌅 #spontaneous #travel",
    location: "Amalfi Coast, Italy", likes_count: 4821, comments_count: 203,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    profiles: { id: "u6", username: "alex.w", is_verified: true },
  },
  {
    id: "fy2", user_id: "u7",
    image_url: "https://picsum.photos/seed/fy2/400/400",
    images: ["https://picsum.photos/seed/fy2/400/400"],
    caption: "Studio session 🎵 new music coming very soon... #music #vibes",
    likes_count: 1933, comments_count: 88,
    created_at: new Date(Date.now() - 21600000).toISOString(),
    profiles: { id: "u7", username: "maya_art" },
  },
  {
    id: "fy3", user_id: "u8",
    image_url: "https://picsum.photos/seed/fy3/400/400",
    images: ["https://picsum.photos/seed/fy3/400/400"],
    caption: "Morning run ☀️ 10km done 💪 #fitness #motivation",
    likes_count: 892, comments_count: 41,
    created_at: new Date(Date.now() - 43200000).toISOString(),
    profiles: { id: "u8", username: "kai_fit" },
  },
];

// ─── SnapSendSheet ────────────────────────────────────────────────────────────
// Pick a friend to send a snap to from the Inbox

function SnapSendSheet({
  uri,
  conversations,
  onSendTo,
  onCancel,
  sendingTo,
}: {
  uri: string;
  conversations: Conversation[];
  onSendTo: (friend: { id: string; username?: string; avatar_url?: string }) => void;
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
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={[snapSendSt.container, { backgroundColor: colors.background }]}>
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
                style={[snapSendSt.friendRow, { borderBottomColor: colors.border }]}
                activeOpacity={0.75}
                disabled={!!sendingTo}
              >
                <UserAvatar username={item.other_user.username} url={item.other_user.avatar_url} size={44} />
                <Text style={[snapSendSt.friendName, { color: colors.foreground }]} numberOfLines={1}>
                  {item.other_user.username}
                </Text>
                {isSending ? (
                  <ActivityIndicator size="small" color="#EA580C" />
                ) : (
                  <LinearGradient
                    colors={["#EA580C", "#DC2626"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={snapSendSt.snapBtn}
                  >
                    <Ionicons name="camera" size={13} color="#fff" />
                    <Text style={snapSendSt.snapBtnText}>Send</Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 40, paddingHorizontal: 32 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center" }}>
                {conversations.length === 0
                  ? "No conversations yet. Start chatting to send snaps!"
                  : "No friends found"}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        />
      </View>
    </Modal>
  );
}

const snapSendSt = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  preview: { width: "100%", height: 180, backgroundColor: "#1a1a2e" },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "rgba(234,88,12,0.08)" },
  note: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  searchWrap: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 12, height: 42, gap: 8, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular" },
  friendRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 0.5 },
  friendName: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 14 },
  snapBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  snapBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
});

// ─── InboxPanel ───────────────────────────────────────────────────────────────

function InboxConvoRow({ convo, colors }: { convo: Conversation; colors: any }) {
  const hasUnread = convo.unread_count > 0;
  const snapMsg = isSnap(convo.last_message ?? "");
  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } } as any)}
      style={[inboxSt.row, { borderBottomColor: colors.border }]}
      activeOpacity={0.75}
    >
      <UserAvatar username={convo.other_user.username} url={convo.other_user.avatar_url} size={50} showBorder={hasUnread} />
      <View style={inboxSt.rowText}>
        <View style={inboxSt.rowHeader}>
          <Text style={[inboxSt.rowName, { color: colors.foreground }, hasUnread && inboxSt.bold]}>{convo.other_user.username}</Text>
          <Text style={[inboxSt.rowTime, { color: colors.mutedForeground }]}>{timeAgo(convo.last_message_at)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {snapMsg ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(234,88,12,0.15)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="camera" size={11} color="#EA580C" />
              </View>
              <Text style={{ color: hasUnread ? "#EA580C" : colors.mutedForeground, fontFamily: "Poppins_500Medium", fontSize: 13 }} numberOfLines={1}>📷 Photo snap</Text>
            </View>
          ) : (
            <Text style={[inboxSt.rowMsg, { color: hasUnread ? colors.foreground : colors.mutedForeground }, hasUnread && inboxSt.bold]} numberOfLines={1}>{convo.last_message}</Text>
          )}
          {hasUnread ? <View style={inboxSt.badge}><Text style={inboxSt.badgeText}>{convo.unread_count}</Text></View> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function SnapConvoRow({ convo, colors, onView }: { convo: SnapConversation; colors: any; onView: () => void }) {
  const snap = parseSnap(convo.message_text);
  const isUnviewedIncoming = convo.is_incoming && snap && !snap.viewed;
  return (
    <TouchableOpacity
      onPress={() => {
        if (isUnviewedIncoming) { onView(); }
        else { router.push({ pathname: "/chat/[userId]", params: { userId: convo.other_user.id, username: convo.other_user.username } } as any); }
      }}
      style={[inboxSt.row, { borderBottomColor: colors.border }]}
      activeOpacity={0.75}
    >
      <UserAvatar username={convo.other_user.username} url={convo.other_user.avatar_url} size={50} showBorder={!!isUnviewedIncoming} />
      <View style={inboxSt.rowText}>
        <View style={inboxSt.rowHeader}>
          <Text style={[inboxSt.rowName, { color: colors.foreground }, !!isUnviewedIncoming && inboxSt.bold]}>{convo.other_user.username}</Text>
          <Text style={[inboxSt.rowTime, { color: colors.mutedForeground }]}>{timeAgo(convo.created_at)}</Text>
        </View>
        {convo.is_incoming ? (
          isUnviewedIncoming ? (
            <LinearGradient colors={["#EA580C", "#DC2626"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={inboxSt.snapPill}>
              <Ionicons name="camera" size={13} color="#fff" />
              <Text style={inboxSt.snapPillText}>Tap to view · Photo</Text>
            </LinearGradient>
          ) : (
            <View style={[inboxSt.snapPill, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
              <Ionicons name="camera-outline" size={13} color="rgba(255,255,255,0.3)" />
              <Text style={[inboxSt.snapPillText, { color: "rgba(255,255,255,0.3)" }]}>Opened</Text>
            </View>
          )
        ) : (
          snap?.viewed ? (
            <View style={[inboxSt.snapPill, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
              <Ionicons name="camera-outline" size={13} color="rgba(255,255,255,0.3)" />
              <Text style={[inboxSt.snapPillText, { color: "rgba(255,255,255,0.3)" }]}>Opened 👁</Text>
            </View>
          ) : (
            <View style={[inboxSt.snapPill, { backgroundColor: "rgba(234,88,12,0.12)", borderWidth: 1, borderColor: "rgba(234,88,12,0.3)" }]}>
              <Ionicons name="camera-outline" size={13} color="#EA580C" />
              <Text style={[inboxSt.snapPillText, { color: "#EA580C" }]}>Delivered</Text>
            </View>
          )
        )}
      </View>
    </TouchableOpacity>
  );
}

const inboxSt = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 0.5 },
  rowText: { flex: 1 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  rowName: { fontSize: 15, fontFamily: "Poppins_500Medium" },
  rowTime: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  rowMsg: { fontSize: 13, fontFamily: "Poppins_400Regular", flex: 1 },
  bold: { fontFamily: "Poppins_700Bold" },
  badge: { backgroundColor: "#7C3AED", minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_700Bold" },
  snapPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, alignSelf: "flex-start" },
  snapPillText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
});

const INBOX_TABS: { id: InboxTabId; label: string }[] = [
  { id: "messages", label: "💬 Messages" },
  { id: "snaps", label: "👻 Snaps" },
  { id: "requests", label: "👥 Requests" },
];

function InboxPanel({
  userId,
  colors,
  insets,
  bottomInset,
}: {
  userId: string;
  colors: any;
  insets: ReturnType<typeof useSafeAreaInsets>;
  bottomInset: number;
}) {
  const [activeTab, setActiveTab] = useState<InboxTabId>("messages");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [snapConvos, setSnapConvos] = useState<SnapConversation[]>([]);
  const [requests, setRequests] = useState<Conversation[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [loadingSnaps, setLoadingSnaps] = useState(true);
  const [loadingReqs, setLoadingReqs] = useState(false);
  const [reqLoaded, setReqLoaded] = useState(false);
  const [snapPreviewUri, setSnapPreviewUri] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [snapViewer, setSnapViewer] = useState<{ uri: string; messageId: string; msgText: string } | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (!userId) { setLoadingMsgs(false); setLoadingSnaps(false); return; }
    fetchConversations(userId).then(setConversations).catch(() => {}).finally(() => setLoadingMsgs(false));
    fetchSnapConversations(userId).then(setSnapConvos).catch(() => {}).finally(() => setLoadingSnaps(false));
  }, [userId]);

  useEffect(() => {
    if (activeTab !== "requests" || reqLoaded || !userId) return;
    setLoadingReqs(true);
    fetchMessageRequests(userId)
      .then((data) => { setRequests(data); setReqLoaded(true); })
      .catch(() => {})
      .finally(() => setLoadingReqs(false));
  }, [activeTab, userId, reqLoaded]);

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

  const handleSendTo = useCallback(async (friend: { id: string; username?: string; avatar_url?: string }) => {
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: topPad + 8, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontFamily: "Poppins_700Bold", fontSize: 22, color: colors.foreground }}>Inbox</Text>
        <TouchableOpacity onPress={openSnapCamera} style={{ marginRight: 4 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(234,88,12,0.12)", borderWidth: 1.5, borderColor: "rgba(234,88,12,0.35)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="camera" size={20} color="#EA580C" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/notifications")} style={{ padding: 6 }}>
          <Ionicons name="notifications-outline" size={23} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Swipe hint */}
      <View style={{ paddingHorizontal: 16, paddingTop: 5, paddingBottom: 2, alignItems: "flex-end" }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Poppins_400Regular", letterSpacing: 0.3 }}>For You  →</Text>
      </View>

      {/* Sub-tabs */}
      <View style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        {INBOX_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={{ flex: 1, paddingVertical: 11, alignItems: "center", borderBottomWidth: 2.5, borderBottomColor: active ? "#7C3AED" : "transparent" }}
              activeOpacity={0.75}
            >
              <Text style={{ color: active ? "#A78BFA" : colors.mutedForeground, fontFamily: active ? "Poppins_700Bold" : "Poppins_500Medium", fontSize: 12 }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Messages Tab ── */}
      {activeTab === "messages" && (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <InboxConvoRow convo={item} colors={colors} />}
          contentContainerStyle={{ paddingBottom: bottomInset }}
          ListEmptyComponent={
            loadingMsgs ? (
              <View style={{ paddingTop: 20 }}>{[1, 2].map((i) => <SkeletonPost key={i} />)}</View>
            ) : (
              <View style={{ alignItems: "center", paddingTop: 80, gap: 10 }}>
                <Ionicons name="chatbubbles-outline" size={52} color={colors.mutedForeground} />
                <Text style={{ color: colors.foreground, fontFamily: "Poppins_600SemiBold", fontSize: 16 }}>No messages yet</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", paddingHorizontal: 32 }}>Swipe right to the For You feed and connect with people</Text>
              </View>
            )
          }
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        />
      )}

      {/* ── Snaps Tab ── */}
      {activeTab === "snaps" && (
        <FlatList
          data={snapConvos}
          keyExtractor={(item) => item.message_id}
          renderItem={({ item }) => <SnapConvoRow convo={item} colors={colors} onView={() => handleViewSnap(item)} />}
          contentContainerStyle={{ paddingBottom: bottomInset }}
          ListEmptyComponent={
            loadingSnaps ? null : (
              <View style={{ alignItems: "center", paddingTop: 70, gap: 12, paddingHorizontal: 32 }}>
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
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        />
      )}

      {/* ── Requests Tab ── */}
      {activeTab === "requests" && (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[inboxSt.row, { borderBottomColor: colors.border }]}>
              <UserAvatar username={item.other_user.username} url={item.other_user.avatar_url} size={50} />
              <View style={inboxSt.rowText}>
                <View style={inboxSt.rowHeader}>
                  <Text style={[inboxSt.rowName, inboxSt.bold, { color: colors.foreground }]}>{item.other_user.username}</Text>
                  <Text style={[inboxSt.rowTime, { color: colors.mutedForeground }]}>{timeAgo(item.last_message_at)}</Text>
                </View>
                <Text style={[inboxSt.rowMsg, { color: colors.mutedForeground, opacity: 0.5, letterSpacing: 2, fontStyle: "italic" }]} numberOfLines={1}>
                  {item.last_message || "Sent you a message"}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      await acceptMessageRequest(item.id);
                      setRequests((prev) => prev.filter((r) => r.id !== item.id));
                      setConversations((prev) => [{ ...item, unread_count: 1 }, ...prev]);
                    }}
                    style={{ flex: 1, borderRadius: 10, overflow: "hidden" }}
                    activeOpacity={0.8}
                  >
                    <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 9, alignItems: "center" }}>
                      <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 }}>Accept</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => Alert.alert("Delete Request?", `Delete message request from @${item.other_user.username}?`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: async () => { await deleteConversation(item.id); setRequests((prev) => prev.filter((r) => r.id !== item.id)); } },
                    ])}
                    style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 9, alignItems: "center" }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: bottomInset }}
          ListEmptyComponent={
            loadingReqs ? (
              <View style={{ paddingTop: 20 }}>{[1].map((i) => <SkeletonPost key={i} />)}</View>
            ) : (
              <View style={{ alignItems: "center", paddingTop: 80, gap: 10 }}>
                <Text style={{ fontSize: 48 }}>📭</Text>
                <Text style={{ color: colors.foreground, fontFamily: "Poppins_600SemiBold", fontSize: 16 }}>No message requests</Text>
              </View>
            )
          }
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        />
      )}

      {/* Snap send sheet */}
      {snapPreviewUri && (
        <SnapSendSheet
          uri={snapPreviewUri}
          conversations={conversations}
          onSendTo={handleSendTo}
          onCancel={() => setSnapPreviewUri(null)}
          sendingTo={sendingTo}
        />
      )}

      {/* Snap viewer */}
      {snapViewer && (
        <SnapViewerModal uri={snapViewer.uri} onClose={handleSnapViewerClose} />
      )}
    </View>
  );
}

// ─── ForYouPanel ──────────────────────────────────────────────────────────────

function ForYouPanel({
  userId,
  colors,
  insets,
  bottomInset,
}: {
  userId: string;
  colors: any;
  insets: ReturnType<typeof useSafeAreaInsets>;
  bottomInset: number;
}) {
  const isLoggedIn = !!userId;
  const { notifCount: rtNotifCount, clearNotifBadge } = useRealtime();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [feedAds, setFeedAds] = useState<AdItem[]>(HOUSE_ADS);
  const [refreshing, setRefreshing] = useState(false);
  const [trendingPosts, setTrendingPosts] = useState<{ id: string; image_url: string; likes_count: number }[]>([]);
  const [activeCategory, setActiveCategory] = useState("explore");
  const [unreadCount, setUnreadCount] = useState(0);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const postsRef = useRef(posts);
  const offsetRef = useRef(offset);
  const loadingMoreRef = useRef(loadingMore);
  const hasMoreRef = useRef(hasMore);
  useEffect(() => { postsRef.current = posts; }, [posts]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const loadForYou = useCallback(async (reset = false) => {
    if (!reset && (loadingMoreRef.current || !hasMoreRef.current)) return;
    const off = reset ? 0 : offsetRef.current;
    if (reset) { setLoading(true); setPosts([]); setOffset(0); setHasMore(true); }
    else setLoadingMore(true);
    try {
      let data: Post[] = [];
      if (userId) {
        data = await getForYouFeed(userId, PAGE_SIZE, off);
      } else {
        setPosts(MOCK_FOR_YOU);
        setLoading(false);
        setLoadingMore(false);
        setHasMore(false);
        return;
      }
      setPosts((prev) => reset ? data : [...prev, ...data]);
      setOffset(off + data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch {}
    setLoading(false);
    setLoadingMore(false);
  }, [userId]);

  useEffect(() => { loadForYou(true); }, [userId]);

  useEffect(() => {
    loadFeedAds(userId || undefined, "feed_post").then(setFeedAds).catch(() => setFeedAds(HOUSE_ADS));
  }, [userId]);

  useEffect(() => {
    if (userId) fetchUnreadCount(userId).then(setUnreadCount).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!loading && posts.length === 0) {
      Promise.resolve(
        supabase.from("posts").select("id, image_url, likes_count")
          .order("likes_count", { ascending: false }).limit(9)
      ).then(({ data }) => setTrendingPosts(data?.length ? data : MOCK_TRENDING))
        .catch(() => setTrendingPosts(MOCK_TRENDING));
    }
  }, [loading, posts.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadForYou(true);
    setRefreshing(false);
  }, [loadForYou]);

  const catDef = CATEGORIES.find((c) => c.id === activeCategory);
  const isTrending = activeCategory === "trending";
  const filteredPosts = (catDef && catDef.keywords.length > 0 && !loading)
    ? posts.filter((p) => catDef.keywords.some((kw) => (p.caption ?? "").toLowerCase().includes(kw)))
    : posts;
  const feedItems: (Post | AdItem)[] = loading ? [] : isTrending ? [] : (insertAdsInFeed(filteredPosts, feedAds) as (Post | AdItem)[]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: topPad + 6, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Poppins_400Regular", letterSpacing: 0.3 }}>←  Inbox</Text>
          </View>
          <VibeLogo />
          <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 2 }}>
            <TouchableOpacity
              style={{ padding: 6, position: "relative" }}
              onPress={() => { clearNotifBadge(); setUnreadCount(0); router.push("/notifications"); }}
            >
              <Ionicons name="notifications-outline" size={24} color={colors.foreground} />
              {(unreadCount + rtNotifCount) > 0 && (
                <View style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#F43F5E", borderWidth: 1.5, borderColor: "#0A0A0F", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
                  <Text style={{ fontSize: 9, fontFamily: "Poppins_700Bold", color: "#fff", lineHeight: 13 }}>
                    {(unreadCount + rtNotifCount) > 99 ? "99+" : String(unreadCount + rtNotifCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 6 }} onPress={() => router.push("/search")}>
              <Ionicons name="search-outline" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* For You label + Friends hint */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 4 }}>
          <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Poppins_700Bold", fontSize: 14 }}>For You</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Poppins_400Regular", letterSpacing: 0.3 }}>Friends  →</Text>
        </View>

        <CategoryPills active={activeCategory} onSelect={setActiveCategory} />
        <View style={{ height: 0.5, backgroundColor: colors.border }} />
      </View>

      {/* Feed */}
      <FlatList
        data={feedItems}
        keyExtractor={(item) => {
          if ("isAd" in item && (item as AdItem).isAd) return `ad-${(item as AdItem).ad_id}`;
          return (item as Post).id;
        }}
        renderItem={({ item, index }) => {
          if ("isAd" in item && (item as AdItem).isAd) {
            return <AdCard ad={item as AdItem} userId={userId || undefined} onHide={(adId) => setFeedAds((prev) => prev.filter((a) => a.ad_id !== adId))} />;
          }
          const post = item as Post;
          if (userId) markPostSeen(userId, post.id).catch(() => {});
          return (
            <View>
              <PostCard post={post} onRequireLogin={() => setShowLoginPrompt(true)} isLoggedIn={isLoggedIn} />
              <WhyThisButton index={index} />
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View>{[1, 2].map((i) => <SkeletonPost key={i} />)}</View>
          ) : isTrending ? (
            <TrendingGrid posts={trendingPosts.length > 0 ? trendingPosts : MOCK_TRENDING} colors={colors} title="🔥 Trending on Gundruk" />
          ) : (
            <View>
              <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 32, gap: 10, paddingBottom: 8 }}>
                <Text style={{ fontSize: 48 }}>✨</Text>
                <Text style={{ color: colors.foreground, fontFamily: "Poppins_600SemiBold", fontSize: 16, textAlign: "center" }}>Your feed is warming up</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", lineHeight: 20 }}>Interact with posts to personalise your For You feed</Text>
              </View>
              {trendingPosts.length > 0 && <TrendingGrid posts={trendingPosts} colors={colors} />}
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13 }}>Loading more…</Text>
            </View>
          ) : !hasMore && posts.length > 0 ? (
            <View style={{ paddingVertical: 24, alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 20 }}>🎉</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_500Medium", fontSize: 13 }}>You're all caught up!</Text>
              <TouchableOpacity onPress={onRefresh}>
                <Text style={{ color: "#7C3AED", fontFamily: "Poppins_500Medium", fontSize: 12, marginTop: 4 }}>Refresh for new posts ↑</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" colors={["#7C3AED"]} />}
        onEndReached={() => loadForYou()}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: colors.border }} />}
        nestedScrollEnabled
      />
      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
    </View>
  );
}

// ─── FriendsPanel ─────────────────────────────────────────────────────────────

function FriendsPanel({
  userId,
  colors,
  insets,
  bottomInset,
}: {
  userId: string;
  colors: any;
  insets: ReturnType<typeof useSafeAreaInsets>;
  bottomInset: number;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [friendStories, setFriendStories] = useState<StoryEntry[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<{ id: string; image_url: string; likes_count: number }[]>([]);

  const offsetRef = useRef(offset);
  const loadingMoreRef = useRef(loadingMore);
  const hasMoreRef = useRef(hasMore);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const loadFriends = useCallback(async (reset = false) => {
    if (!userId) { setLoading(false); return; }
    if (!reset && (loadingMoreRef.current || !hasMoreRef.current)) return;
    const off = reset ? 0 : offsetRef.current;
    if (reset) { setLoading(true); setPosts([]); setOffset(0); setHasMore(true); }
    else setLoadingMore(true);
    try {
      const data = await getFriendsFeed(userId, PAGE_SIZE, off);
      setPosts((prev) => reset ? data : [...prev, ...data]);
      setOffset(off + data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch {}
    setLoading(false);
    setLoadingMore(false);
  }, [userId]);

  useEffect(() => {
    loadFriends(true);
    if (!userId) return;
    fetchFriendStories(userId).then(setFriendStories).catch(() => {});
    const channel = supabase
      .channel("friend-stories-panel")
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "stories" }, () => {
        fetchFriendStories(userId).then(setFriendStories).catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFriends(true);
    if (userId) fetchFriendStories(userId).then(setFriendStories).catch(() => {});
    setRefreshing(false);
  }, [loadFriends, userId]);

  useEffect(() => {
    if (!loading && posts.length === 0) {
      Promise.resolve(
        supabase.from("posts").select("id, image_url, likes_count")
          .order("likes_count", { ascending: false }).limit(9)
      ).then(({ data }) => setTrendingPosts(data?.length ? data : MOCK_TRENDING))
        .catch(() => setTrendingPosts(MOCK_TRENDING));
    }
  }, [loading, posts.length]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: topPad + 8, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Poppins_400Regular", flex: 1, letterSpacing: 0.3 }}>←  For You</Text>
          <Text style={{ color: colors.foreground, fontFamily: "Poppins_700Bold", fontSize: 22 }}>Friends</Text>
          <View style={{ flex: 1 }} />
        </View>
      </View>

      {/* Friends feed */}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PostCard post={item} onRequireLogin={() => {}} isLoggedIn={!!userId} />}
        ListHeaderComponent={<FriendsStoriesBar stories={friendStories} colors={colors} />}
        ListEmptyComponent={
          loading ? (
            <View>{[1, 2].map((i) => <SkeletonPost key={i} />)}</View>
          ) : (
            <View>
              <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 32, gap: 10 }}>
                <Text style={{ fontSize: 48 }}>👥</Text>
                <Text style={{ color: colors.foreground, fontFamily: "Poppins_600SemiBold", fontSize: 16, textAlign: "center" }}>No friends posts yet</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", lineHeight: 20 }}>Follow people to see their posts here</Text>
              </View>
              <SuggestedCTA colors={colors} />
              {trendingPosts.length > 0 && <TrendingGrid posts={trendingPosts} colors={colors} title="🔥 Trending on Gundruk" />}
            </View>
          )
        }
        ListFooterComponent={loadingMore ? (
          <View style={{ paddingVertical: 20, alignItems: "center" }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 13 }}>Loading more…</Text>
          </View>
        ) : null}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" colors={["#7C3AED"]} />}
        onEndReached={() => loadFriends()}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: colors.border }} />}
        nestedScrollEnabled
      />
    </View>
  );
}

// ─── Main FeedScreen (3-panel swiper) ─────────────────────────────────────────

export default function FeedScreen() {
  const { width: W, height: H } = useWindowDimensions();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id ?? "";

  const outerScrollRef = useRef<ScrollView>(null);
  const hasScrolled = useRef(false);

  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 80;

  // Scroll to the For You center panel on first mount
  useLayoutEffect(() => {
    if (hasScrolled.current) return;
    const timer = setTimeout(() => {
      outerScrollRef.current?.scrollTo({ x: W * PAGE_FORYOU, animated: false });
      hasScrolled.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [W]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={outerScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        decelerationRate="fast"
        style={{ flex: 1 }}
        contentContainerStyle={{ flexDirection: "row" }}
        nestedScrollEnabled
      >
        {/* Panel 0 — Inbox */}
        <View style={{ width: W, height: H }}>
          <InboxPanel userId={userId} colors={colors} insets={insets} bottomInset={bottomInset} />
        </View>

        {/* Panel 1 — For You (default) */}
        <View style={{ width: W, height: H }}>
          <ForYouPanel userId={userId} colors={colors} insets={insets} bottomInset={bottomInset} />
        </View>

        {/* Panel 2 — Friends */}
        <View style={{ width: W, height: H }}>
          <FriendsPanel userId={userId} colors={colors} insets={insets} bottomInset={bottomInset} />
        </View>
      </ScrollView>
    </View>
  );
}
