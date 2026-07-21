import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { CommentsSheet } from "@/components/CommentsSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { formatCount } from "@/lib/supabase";
import { cardUrl } from "@/lib/imageUrl";
import { shareContent } from "@/lib/share";

const { height: H } = Dimensions.get("window");

interface ReelData {
  id: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
  caption?: string | null;
  likes_count?: number;
  comments_count?: number;
  profiles?: { username?: string; avatar_url?: string; is_verified?: boolean } | null;
}

interface ReelItemProps {
  item: ReelData;
  isActive: boolean;
  sessionUserId?: string;
  fallbackUsername: string;
  fallbackAvatar?: string;
}

// ─── Single reel card — defined at module scope to keep hook identity stable ───
function ReelItem({ item, isActive, sessionUserId, fallbackUsername, fallbackAvatar }: ReelItemProps) {
  const insets = useSafeAreaInsets();
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(item.likes_count ?? 0);
  const [showComments, setShowComments] = useState(false);

  const username = item.profiles?.username ?? fallbackUsername;
  const avatarUrl = item.profiles?.avatar_url ?? fallbackAvatar;
  const thumbnail = cardUrl(item.thumbnail_url ?? "") || `https://picsum.photos/seed/${item.id}/450/900`;
  const videoUrl = item.video_url ?? null;
  const shouldPlay = isActive && isPlaying && !!videoUrl && !videoError;

  const handleLike = async () => {
    if (!sessionUserId) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikesCount((n) => (wasLiked ? n - 1 : n + 1));
    try {
      const base = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
      await fetch(`${base}/reels/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: sessionUserId, reelId: item.id }),
      });
    } catch {}
  };

  const handleShare = () => {
    shareContent("reel", { username, id: item.id }, item.caption ?? "Watch this reel on Gundruk!");
  };

  return (
    <TouchableOpacity
      style={[S.item, { height: H }]}
      activeOpacity={1}
      onPress={() => setIsPlaying((p) => !p)}
    >
      {videoUrl && !videoError ? (
        <Video
          source={{ uri: videoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          isLooping
          isMuted={false}
          shouldPlay={shouldPlay}
          useNativeControls={false}
          posterSource={{ uri: thumbnail }}
          usePoster
          onError={() => setVideoError(true)}
        />
      ) : (
        <Image
          source={{ uri: thumbnail }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      )}

      <LinearGradient
        colors={["rgba(0,0,0,0.55)", "transparent", "transparent", "rgba(0,0,0,0.80)"]}
        locations={[0, 0.25, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Right actions */}
      <View style={[S.rightActions, { bottom: insets.bottom + 20 }]}>
        <TouchableOpacity style={S.actionBtn} onPress={handleLike}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={34} color={liked ? "#EF4444" : "#fff"} />
          <Text style={S.actionCount}>{formatCount(likesCount)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.actionBtn} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={30} color="#fff" />
          <Text style={S.actionCount}>{formatCount(item.comments_count ?? 0)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.actionBtn} onPress={handleShare}>
          <Ionicons name="paper-plane-outline" size={28} color="#fff" />
          <Text style={S.actionCount}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.actionBtn} onPress={() => setSaved((v) => !v)}>
          <Ionicons
            name={saved ? "bookmark" : "bookmark-outline"}
            size={28}
            color={saved ? "#7C3AED" : "#fff"}
          />
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View style={[S.bottomInfo, { bottom: insets.bottom + 24 }]}>
        <TouchableOpacity
          style={S.userRow}
          onPress={() => router.push(`/profile/${username}` as any)}
        >
          <UserAvatar username={username} url={avatarUrl} size={40} showBorder />
          <View style={{ flex: 1 }}>
            <Text style={S.username}>@{username}</Text>
            {item.profiles?.is_verified && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="checkmark-circle" size={12} color="#7C3AED" />
                <Text style={{ color: "#7C3AED", fontSize: 10, fontFamily: "Poppins_500Medium" }}>
                  Verified
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        {!!item.caption && (
          <Text style={S.caption} numberOfLines={3}>
            {item.caption}
          </Text>
        )}
      </View>

      {/* Play/pause indicator */}
      {(!shouldPlay) && (
        <View style={S.playOverlay} pointerEvents="none">
          <Ionicons
            name={isPlaying && videoUrl && !videoError ? "pause-circle" : "play-circle"}
            size={72}
            color="rgba(255,255,255,0.7)"
          />
        </View>
      )}

      <CommentsSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        postId={item.id}
        isLoggedIn={!!sessionUserId}
        onRequireLogin={() => setShowComments(false)}
        contentType="reel"
      />
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ReelDetailScreen() {
  const { id, userId, profileUsername, profileAvatar } =
    useLocalSearchParams<{
      id: string;
      userId?: string;
      profileUsername?: string;
      profileAvatar?: string;
    }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [reels, setReels] = useState<ReelData[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const startIdxRef = useRef(0);
  const flatListRef = useRef<FlatList>(null);

  const fallbackUsername = profileUsername ?? "user";
  const fallbackAvatar = profileAvatar ? decodeURIComponent(profileAvatar) : undefined;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/posts/user/${encodeURIComponent(userId)}`);
        if (res.ok) {
          const body = await res.json();
          const rls: ReelData[] = body.reels ?? [];
          if (rls.length > 0) {
            const idx = rls.findIndex((r) => r.id === id);
            const startIdx = idx >= 0 ? idx : 0;
            startIdxRef.current = startIdx;
            setActiveIndex(startIdx);
            setReels(rls);
          }
        }
      } catch (e: any) {
        if (__DEV__) console.warn("[ReelViewer] fetch failed:", e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, id]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const renderItem = useCallback(
    ({ item, index }: { item: ReelData; index: number }) => (
      <ReelItem
        item={item}
        isActive={index === activeIndex}
        sessionUserId={session?.user?.id}
        fallbackUsername={fallbackUsername}
        fallbackAvatar={fallbackAvatar}
      />
    ),
    [activeIndex, session?.user?.id, fallbackUsername, fallbackAvatar]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: H, offset: H * index, index }),
    []
  );

  if (loading) {
    return (
      <View style={[S.center, { backgroundColor: "#000" }]}>
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  if (reels.length === 0) {
    return (
      <View style={[S.center, { backgroundColor: "#000" }]}>
        <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.4)" />
        <Text style={{ color: "rgba(255,255,255,0.5)", marginTop: 12, fontFamily: "Poppins_400Regular" }}>
          Reel not found
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "#7C3AED", fontFamily: "Poppins_600SemiBold" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Back button — floats above the FlatList */}
      <TouchableOpacity
        style={[S.backBtn, { top: insets.top + 10 }]}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Reel count indicator */}
      {reels.length > 1 && (
        <View style={[S.counter, { top: insets.top + 14 }]}>
          <Text style={S.counterText}>
            {activeIndex + 1} / {reels.length}
          </Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={reels}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialScrollIndex={startIdxRef.current}
        snapToInterval={H}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
}

const S = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  item: { width: "100%", backgroundColor: "#000" },
  backBtn: {
    position: "absolute",
    left: 14,
    zIndex: 30,
    padding: 6,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 20,
  },
  counter: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 30,
    backgroundColor: "rgba(0,0,0,0.40)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  counterText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  rightActions: {
    position: "absolute",
    right: 14,
    alignItems: "center",
    gap: 14,
    zIndex: 10,
  },
  actionBtn: { alignItems: "center", gap: 3 },
  actionCount: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  bottomInfo: { position: "absolute", left: 14, right: 90, zIndex: 10, gap: 8 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  username: { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
  caption: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    lineHeight: 19,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
});
