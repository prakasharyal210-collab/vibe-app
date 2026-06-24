import React, { useCallback, useEffect, useRef, useState } from "react";
import {
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
  onLikeToggle,
  onComment,
}: {
  post: Post;
  coupleId: string;
  authorId: string;
  token: string | null;
  onLikeToggle: (postId: string, liked: boolean, newCount: number) => void;
  onComment: (post: Post) => void;
}) {
  const [liking, setLiking] = useState(false);
  const [photoHeight, setPhotoHeight] = useState<number>(220);
  const { width: screenWidth } = useWindowDimensions();
  const catColor = CAT_COLORS[post.category] ?? "#EC4899";

  const toggleLike = async () => {
    if (liking) return;
    setLiking(true);
    const newLiked = !post.likedByMe;
    const newCount = post.like_count + (newLiked ? 1 : -1);
    onLikeToggle(post.id, newLiked, newCount);
    try {
      const method = newLiked ? "POST" : "DELETE";
      await fetch(`${API_BASE}/api/couple-feed/posts/${post.id}/like`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ coupleId, likerId: authorId }),
      });
    } catch {
      onLikeToggle(post.id, !newLiked, post.like_count);
    } finally {
      setLiking(false);
    }
  };

  return (
    <View style={s.card}>
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
              const cardWidth = screenWidth - 32; // 16px padding each side
              const natural = (cardWidth / w) * h;
              setPhotoHeight(Math.min(natural, MAX_PHOTO_HEIGHT));
            }
          }}
        />
      ) : null}

      <View style={s.cardActions}>
        <TouchableOpacity onPress={toggleLike} style={s.actionBtn} activeOpacity={0.7}>
          <Ionicons
            name={post.likedByMe ? "heart" : "heart-outline"}
            size={20}
            color={post.likedByMe ? "#EC4899" : "rgba(255,255,255,0.45)"}
          />
          <Text style={[s.actionCount, post.likedByMe && { color: "#EC4899" }]}>{post.like_count}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onComment(post)} style={s.actionBtn} activeOpacity={0.7}>
          <Ionicons name="chatbubble-outline" size={18} color="rgba(255,255,255,0.45)" />
          <Text style={s.actionCount}>{post.comment_count}</Text>
        </TouchableOpacity>
      </View>
    </View>
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

  const handleLikeToggle = (postId: string, liked: boolean, newCount: number) => {
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likedByMe: liked, like_count: newCount } : p));
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
              onLikeToggle={handleLikeToggle}
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
  card: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
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
  cardActions: { flexDirection: "row", gap: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionCount: { fontFamily: "Poppins_500Medium", fontSize: 13, color: "rgba(255,255,255,0.45)" },
});
