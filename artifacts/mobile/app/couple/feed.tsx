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
  { type: "support",  emoji: "🫂", color: "#8B5CF6" },
  { type: "relate",   emoji: "🥲", color: "#3B82F6" },
  { type: "strength", emoji: "💪", color: "#F59E0B" },
  { type: "love",     emoji: "❤️", color: "#EC4899" },
];

const CAT_COLORS: Record<string, string> = {
  Confession: "#EC4899",
  Advice: "#3B82F6",
  Story: "#10B981",
  Milestone: "#F59E0B",
  Venting: "#8B5CF6",
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
          <Text style={{ fontSize: 13 }}>💕</Text>
        </View>
      )}
      <View style={{ marginLeft: -8 }}>
        {partner?.avatar ? (
          <Image source={{ uri: partner.avatar }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarPlaceholder]}>
            <Text style={{ fontSize: 13 }}>💕</Text>
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
  const catColor = CAT_COLORS[post.category] ?? "#EC4899";

  // Fallback for posts loaded before the SQL migration
  const reactions = post.reactions ?? { support: 0, relate: 0, strength: 0, love: 0 };
  const totalReactions = post.totalReactions ?? 0;

  const handleReact = async (reaction: ReactionType) => {
    if (reacting) return;
    setReacting(true);
    const isSame = post.myReaction === reaction;
    const prevMyReaction = post.myReaction;

    // Optimistic update
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
      // Rollback on network error
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
          {(post.age || post.location) && (
            <Text style={s.ageLocation}>
              {[post.age ? `${post.age}` : null, post.location].filter(Boolean).join(" · ")}
            </Text>
          )}
        </View>
        <View style={[s.catBadge, { backgroundColor: catColor + "22", borderColor: catColor + "55" }]}>
          <Text style={[s.catText, { color: catColor }]}>{post.category}</Text>
        </View>
      </View>

      <View style={s.authorRow}>
        {post.isAnonymous ? (
          <>
            <View style={[s.avatar, s.anonAvatar]}>
              <Text style={{ fontSize: 14 }}>💕</Text>
            </View>
            <Text style={s.anonLabel}>Anonymous 💕</Text>
          </>
        ) : (
          <>
            <AvatarPair author={post.author} partner={post.partner} />
            <Text style={s.coupleName} numberOfLines={1}>{post.coupleName}</Text>
          </>
        )}
        <Text style={s.timeAgo}>{timeAgo(post.created_at)}</Text>
      </View>

      <ExpandableText text={post.content} />

      {post.photo_url ? (
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
                isActive && { backgroundColor: color + "22", borderColor: color + "55" },
              ]}
            >
              <Text style={s.reactionEmoji}>{emoji}</Text>
              {count > 0 && (
                <Text style={[s.reactionCount, isActive && { color }]}>{count}</Text>
              )}
            </TouchableOpacity>
          );
        })}
        <View style={{ flex: 1 }} />
        {totalReactions > 0 && (
          <Text style={s.totalReactions}>{totalReactions}</Text>
        )}
        <TouchableOpacity onPress={() => onComment(post)} style={s.commentBtn} activeOpacity={0.7}>
          <Ionicons name="chatbubble-outline" size={17} color="rgba(255,255,255,0.45)" />
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
  const genRef = useRef(0);

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
  useFocusEffect(useCallback(() => { fetchPosts(true); }, [fetchPosts]));

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
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Confessions 💕</Text>
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/couple/feed-create",
              params: { coupleId: coupleId ?? "", authorId: userId ?? "" },
            } as any)
          }
          style={s.shareBtn}
        >
          <Ionicons name="add" size={18} color="#EC4899" />
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
                backgroundColor: CAT_COLORS[cat] ?? "#EC4899",
                borderColor: CAT_COLORS[cat] ?? "#EC4899",
              },
            ]}
          >
            <Text style={[s.filterChipText, activeCategory === cat && { color: "#fff" }]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#EC4899" size="large" />
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EC4899" />}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080810" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 18, color: "#fff" },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#EC4899", backgroundColor: "rgba(236,72,153,0.12)" },
  shareBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#EC4899" },
  filterScroll: { flexGrow: 0, maxHeight: 44 },
  filterRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", height: 34, justifyContent: "center" },
  filterChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "rgba(255,255,255,0.55)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 52, marginBottom: 8 },
  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#fff", textAlign: "center" },
  emptySub: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.45)", textAlign: "center" },
  emptyBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, backgroundColor: "#EC4899" },
  emptyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#fff" },
  card: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 },
  cardTopLeft: { gap: 2 },
  postNumber: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#EC4899" },
  ageLocation: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.45)" },
  catBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  catText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "#1a1a2e" },
  avatarPlaceholder: { backgroundColor: "#2a1a3e", alignItems: "center", justifyContent: "center" },
  anonAvatar: { backgroundColor: "rgba(236,72,153,0.15)", alignItems: "center", justifyContent: "center" },
  anonLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: "rgba(255,255,255,0.55)", flex: 1 },
  coupleName: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#fff", flex: 1 },
  timeAgo: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.35)" },
  content: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 22, marginBottom: 12 },
  readMore: { color: "#EC4899", fontFamily: "Poppins_600SemiBold" },
  postPhoto: { width: "100%", borderRadius: 12, marginBottom: 12, overflow: "hidden" },
  // ── Reaction bar ─────────────────────────────────────────────────────────────
  reactionBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  reactionPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "rgba(255,255,255,0.5)" },
  totalReactions: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.3)", marginRight: 4 },
  commentBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
  actionCount: { fontFamily: "Poppins_500Medium", fontSize: 13, color: "rgba(255,255,255,0.45)" },
  // ── Double-tap pop ────────────────────────────────────────────────────────────
  popWrap: { alignItems: "center", justifyContent: "center" },
  popEmoji: { fontSize: 80 },
});
