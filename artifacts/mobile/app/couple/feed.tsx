import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "");

const CATEGORIES = ["All", "Confession", "Advice", "Story", "Venting", "Milestone"] as const;
type Category = (typeof CATEGORIES)[number];

type ReactionType = "support" | "relate" | "strength" | "love";

const REACTIONS: { type: ReactionType; emoji: string; color: string }[] = [
  { type: "support",  emoji: "🫂", color: "#ffffff" },
  { type: "relate",   emoji: "🥲", color: "#ffffff" },
  { type: "strength", emoji: "💪", color: "#ffffff" },
  { type: "love",     emoji: "❤️", color: "#ffffff" },
];

const CAT_COLORS: Record<string, string> = {
  Confession: "#ffffff",
  Advice:     "#888888",
  Story:      "#888888",
  Milestone:  "#ffffff",
  Venting:    "#888888",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

interface Post {
  id: string;
  couple_id: string;
  content: string;
  photo_url: string | null;
  category: string;
  like_count: number;
  comment_count: number;
  created_at: string;
  likedByMe: boolean;
  myReaction: ReactionType | null;
  reactions: { support: number; relate: number; strength: number; love: number };
  totalReactions: number;
  isAnonymous: boolean;
  postNumber: number | null;
  age: number | null;
  location: string | null;
  coupleName: string;
  author: { name: string; avatar: string | null } | null;
  partner: { name: string; avatar: string | null } | null;
}

function AvatarPair({ author, partner }: { author: Post["author"]; partner: Post["partner"] }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {author?.avatar ? (
        <Image source={{ uri: author.avatar }} style={s.avatar} />
      ) : (
        <View style={[s.avatar, s.avatarPlaceholder]}>
          <Ionicons name="person" size={14} color="#555555" />
        </View>
      )}
      <View style={{ marginLeft: -8 }}>
        {partner?.avatar ? (
          <Image source={{ uri: partner.avatar }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarPlaceholder]}>
            <Ionicons name="person" size={14} color="#555555" />
          </View>
        )}
      </View>
    </View>
  );
}

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const limit = 220;
  const long = text.length > limit;
  return (
    <TouchableOpacity onPress={() => long && setExpanded((v) => !v)} activeOpacity={long ? 0.7 : 1}>
      <Text style={s.content}>
        {long && !expanded ? text.slice(0, limit) + "…" : text}
        {long && !expanded ? (
          <Text style={s.readMore}> read more</Text>
        ) : long && expanded ? (
          <Text style={s.readMore}> show less</Text>
        ) : null}
      </Text>
    </TouchableOpacity>
  );
}

const MAX_PHOTO_HEIGHT = 400;

function PostCard({
  post,
  coupleId,
  authorId,
  token,
  onReact,
  onComment,
}: {
  post: Post;
  coupleId: string;
  authorId: string;
  token: string | null;
  onReact: (postId: string, myReaction: ReactionType | null, reactions: Post["reactions"], totalReactions: number) => void;
  onComment: (post: Post) => void;
}) {
  const [reacting, setReacting] = useState(false);
  const [photoHeight, setPhotoHeight] = useState<number>(220);
  const [popVisible, setPopVisible] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const lastTapRef = useRef<number>(0);
  const popScale = useRef(new Animated.Value(0)).current;
  const popOpacity = useRef(new Animated.Value(0)).current;
  const catColor = CAT_COLORS[post.category] ?? "#ffffff";

  const reactions = post.reactions ?? { support: 0, relate: 0, strength: 0, love: 0 };
  const totalReactions = post.totalReactions ?? 0;

  const handleReact = async (reaction: ReactionType) => {
    if (reacting) return;
    setReacting(true);
    const isSame = post.myReaction === reaction;
    const prevMyReaction = post.myReaction;

    const newReactions = { ...reactions };
    if (isSame) {
      newReactions[reaction] = Math.max(0, (newReactions[reaction] ?? 0) - 1);
    } else {
      if (prevMyReaction) newReactions[prevMyReaction] = Math.max(0, (newReactions[prevMyReaction] ?? 0) - 1);
      newReactions[reaction] = (newReactions[reaction] ?? 0) + 1;
    }
    const newTotal = Object.values(newReactions).reduce((a, b) => a + b, 0);
    onReact(post.id, isSame ? null : reaction, newReactions, newTotal);

    try {
      if (isSame) {
        await fetch(`${API_BASE}/api/couple-feed/posts/${post.id}/react`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ coupleId }),
        });
      } else {
        await fetch(`${API_BASE}/api/couple-feed/posts/${post.id}/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ coupleId, likerId: authorId, reaction }),
        });
      }
    } catch {
      onReact(post.id, prevMyReaction, reactions, totalReactions);
    } finally {
      setReacting(false);
    }
  };

  const triggerPop = () => {
    setPopVisible(true);
    popScale.setValue(0.2);
    popOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(popScale, { toValue: 1.6, useNativeDriver: true, damping: 8, stiffness: 120 }),
      Animated.timing(popOpacity, { toValue: 0, delay: 480, duration: 320, useNativeDriver: true }),
    ]).start(() => setPopVisible(false));
  };

  const handleCardPress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      handleReact("support");
      triggerPop();
    }
    lastTapRef.current = now;
  };

  return (
    <TouchableOpacity onPress={handleCardPress} activeOpacity={1} style={s.card}>
      <View style={s.cardTop}>
        <View style={s.cardTopLeft}>
          {post.postNumber != null && (
            <Text style={s.postNumber}>#{post.postNumber}</Text>
          )}
        </View>
        <View style={[s.catBadge, { backgroundColor: catColor + "18", borderColor: catColor + "44" }]}>
          <Text style={[s.catText, { color: catColor }]}>{post.category}</Text>
        </View>
      </View>

      <View style={s.authorRow}>
        <AvatarPair author={post.author} partner={post.partner} />
        <Text style={s.coupleName} numberOfLines={1}>{post.coupleName}</Text>
        <Text style={s.timeAgo}>{timeAgo(post.created_at)}</Text>
      </View>
      {(post.age || post.location) && (
        <Text style={s.ageLocation}>
          {[post.age ? `${post.age}` : null, post.location].filter(Boolean).join(" · ")}
        </Text>
      )}

      <ExpandableText text={post.content} />

      {post.photo_url?.startsWith("http") ? (
        <Image
          source={{ uri: post.photo_url }}
          style={[s.postPhoto, { height: photoHeight }]}
          resizeMode="cover"
          onLoad={(e) => {
            const { width: w, height: h } = e.nativeEvent.source;
            if (w && h) {
              const cardWidth = screenWidth - 32;
              setPhotoHeight(Math.min((cardWidth / w) * h, MAX_PHOTO_HEIGHT));
            }
          }}
        />
      ) : null}

      {/* Reaction bar */}
      <View style={s.reactionBar}>
        {REACTIONS.map(({ type, emoji, color }) => {
          const count = reactions[type] ?? 0;
          const isActive = post.myReaction === type;
          return (
            <TouchableOpacity
              key={type}
              onPress={() => handleReact(type)}
              activeOpacity={0.72}
              style={[
                s.reactionPill,
                isActive && { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.3)" },
              ]}
            >
              <Text style={s.reactionEmoji}>{emoji}</Text>
              {count > 0 && (
                <Text style={[s.reactionCount, isActive && { color: "#ffffff" }]}>{count}</Text>
              )}
            </TouchableOpacity>
          );
        })}
        <View style={{ flex: 1 }} />
        {totalReactions > 0 && (
          <Text style={s.totalReactions}>{totalReactions}</Text>
        )}
        <TouchableOpacity onPress={() => onComment(post)} style={s.commentBtn} activeOpacity={0.7}>
          <Ionicons name="chatbubble-outline" size={17} color="#555555" />
          <Text style={s.actionCount}>{post.comment_count}</Text>
        </TouchableOpacity>
      </View>

      {/* Double-tap 🫂 pop */}
      {popVisible && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, s.popWrap, { opacity: popOpacity }]}
        >
          <Animated.Text style={[s.popEmoji, { transform: [{ scale: popScale }] }]}>🫂</Animated.Text>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

export default function CoupleFeedScreen() {
  const insets = useSafeAreaInsets();
  const { coupleId, userId } = useLocalSearchParams<{ coupleId: string; userId: string }>();
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [unreadCount, setUnreadCount] = useState(0);
  const genRef = useRef(0);

  const fetchUnread = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/couple-feed/notifications?userId=${encodeURIComponent(userId)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      const data = await res.json();
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // silently ignore
    }
  }, [userId, token]);

  const fetchPosts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const gen = ++genRef.current;
    try {
      const url = `${API_BASE}/api/couple-feed/posts?coupleId=${encodeURIComponent(coupleId ?? "")}&limit=50`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (gen === genRef.current) setPosts(data.posts ?? []);
    } catch {
      if (gen === genRef.current) setPosts([]);
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [coupleId, token]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => { fetchUnread(); }, [fetchUnread]);
  useFocusEffect(useCallback(() => { fetchPosts(true); fetchUnread(); }, [fetchPosts, fetchUnread]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPosts(true);
    setRefreshing(false);
  }, [fetchPosts]);

  const handleReact = (
    postId: string,
    myReaction: ReactionType | null,
    reactions: Post["reactions"],
    totalReactions: number,
  ) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, myReaction, reactions, totalReactions, likedByMe: myReaction !== null, like_count: totalReactions }
          : p
      )
    );
  };

  const handleComment = (post: Post) => {
    router.push({
      pathname: "/couple/feed-comments",
      params: {
        postId: post.id,
        coupleId: coupleId ?? "",
        authorId: userId ?? "",
        postJson: JSON.stringify(post),
      },
    } as any);
  };

  const filtered = activeCategory === "All"
    ? posts
    : posts.filter((p) => p.category === activeCategory);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Confessions</Text>
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/couple/feed-notifications",
              params: { coupleId: coupleId ?? "", userId: userId ?? "" },
            } as any)
          }
          style={s.bellBtn}
        >
          <Ionicons name="notifications-outline" size={22} color="#ffffff" />
          {unreadCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/couple/feed-create",
              params: { coupleId: coupleId ?? "", authorId: userId ?? "" },
            } as any)
          }
          style={s.shareBtn}
        >
          <Ionicons name="add" size={18} color="#000000" />
          <Text style={s.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterRow}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            onPress={() => setActiveCategory(cat)}
            style={[
              s.filterChip,
              activeCategory === cat && {
                backgroundColor: "#ffffff",
                borderColor: "#ffffff",
              },
            ]}
          >
            <Text style={[s.filterChipText, activeCategory === cat && { color: "#000000" }]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#ffffff" size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>💬</Text>
          <Text style={s.emptyTitle}>{activeCategory === "All" ? "No confessions yet" : `No ${activeCategory} posts`}</Text>
          <Text style={s.emptySub}>Be the first to share — all posts are anonymous by default.</Text>
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/couple/feed-create",
                params: { coupleId: coupleId ?? "", authorId: userId ?? "" },
              } as any)
            }
            style={s.emptyBtn}
          >
            <Text style={s.emptyBtnText}>+ Share Now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              coupleId={coupleId ?? ""}
              authorId={userId ?? ""}
              token={token}
              onReact={handleReact}
              onComment={handleComment}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 28, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#141414", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 18, color: "#ffffff" },
  bellBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#141414", alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { fontSize: 9, color: "#ffffff", fontFamily: "Poppins_700Bold", lineHeight: 16 },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#ffffff" },
  shareBtnText: { fontFamily: "Poppins_700Bold", fontSize: 13, color: "#000000" },
  filterScroll: { flexGrow: 0, maxHeight: 44 },
  filterRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", height: 34, justifyContent: "center" },
  filterChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#888888" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 52, marginBottom: 8 },
  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#ffffff", textAlign: "center" },
  emptySub: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "#888888", textAlign: "center" },
  emptyBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, backgroundColor: "#ffffff" },
  emptyBtnText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: "#000000" },
  card: { backgroundColor: "#141414", borderRadius: 16, padding: 16, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 },
  cardTopLeft: { gap: 2 },
  postNumber: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#ffffff" },
  ageLocation: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#888888", marginTop: 2, marginBottom: 10 },
  catBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  catText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "#000000" },
  avatarPlaceholder: { backgroundColor: "#1f1f1f", alignItems: "center", justifyContent: "center" },
  coupleName: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#ffffff", flex: 1 },
  timeAgo: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "#555555" },
  content: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "#ffffff", lineHeight: 22, marginBottom: 12 },
  readMore: { color: "#888888", fontFamily: "Poppins_600SemiBold" },
  postPhoto: { width: "100%", borderRadius: 12, marginBottom: 12, overflow: "hidden" },
  reactionBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  reactionPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, backgroundColor: "#1f1f1f", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#888888" },
  totalReactions: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "#555555", marginRight: 4 },
  commentBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
  actionCount: { fontFamily: "Poppins_500Medium", fontSize: 13, color: "#555555" },
  popWrap: { alignItems: "center", justifyContent: "center" },
  popEmoji: { fontSize: 80 },
});
