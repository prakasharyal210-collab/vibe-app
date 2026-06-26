import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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
import { supabase, Reel, formatCount } from "@/lib/supabase";
import { shareContent } from "@/lib/share";

const { width: W, height: H } = Dimensions.get("window");

export default function ReelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [reel, setReel] = useState<Reel | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    if (!id) return;
    const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/reels/${encodeURIComponent(id)}`);
        if (res.ok) {
          const body = await res.json();
          const data = body.data as any;
          if (data) {
            setReel(data as Reel);
            setLikesCount(data.likes_count ?? 0);
          }
        } else {
          console.error("[reel-detail] API error", res.status);
        }
      } catch (e: any) {
        console.error("[reel-detail] fetch threw:", e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleLike = async () => {
    if (!session?.user?.id || !id) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikesCount((n) => wasLiked ? n - 1 : n + 1);
    try {
      const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
      await fetch(`${apiBase}/reels/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.user.id, reelId: id }),
      });
    } catch {}
  };

  const handleShare = () => {
    if (!reel) return;
    shareContent("reel", {
      username: (reel as any).profiles?.username ?? "user",
      id: reel.id,
    }, reel.caption ?? "Watch this reel on Gundruk!");
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: "#000" }]}>
        <ActivityIndicator color="#7C3AED" />
      </View>
    );
  }

  if (!reel) {
    return (
      <View style={[styles.center, { backgroundColor: "#000" }]}>
        <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.5)" />
        <Text style={{ color: "rgba(255,255,255,0.5)", marginTop: 12, fontFamily: "Poppins_400Regular" }}>
          Reel not found
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "#7C3AED", fontFamily: "Poppins_600SemiBold" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const username = (reel as any).profiles?.username ?? "user";
  const thumbnail = reel.thumbnail_url ?? `https://picsum.photos/seed/${reel.id}/450/900`;
  const videoUrl = reel.video_url;

  const handleVideoTap = () => {
    setIsPlaying((p) => !p);
  };

  return (
    <TouchableOpacity style={styles.container} activeOpacity={1} onPress={handleVideoTap}>
      {/* Video player — falls back to thumbnail image if no video_url or on error */}
      {videoUrl && !videoError ? (
        <Video
          ref={videoRef}
          source={{ uri: videoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          isLooping
          isMuted={false}
          shouldPlay={isPlaying}
          useNativeControls={false}
          posterSource={{ uri: thumbnail }}
          usePoster
          onError={() => setVideoError(true)}
        />
      ) : (
        <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}

      <LinearGradient
        colors={["rgba(0,0,0,0.55)", "transparent", "transparent", "rgba(0,0,0,0.75)"]}
        locations={[0, 0.25, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Back button */}
      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 10 }]} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Right actions */}
      <View style={[styles.rightActions, { bottom: insets.bottom + 80 }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={32} color={liked ? "#EF4444" : "#fff"} />
          <Text style={styles.actionCount}>{formatCount(likesCount)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={30} color="#fff" />
          <Text style={styles.actionCount}>{formatCount(reel.comments_count ?? 0)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
          <Ionicons name="paper-plane-outline" size={28} color="#fff" />
          <Text style={styles.actionCount}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setSaved((v) => !v)}>
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={28} color={saved ? "#7C3AED" : "#fff"} />
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View style={[styles.bottomInfo, { bottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.userRow}
          onPress={() => router.push(`/profile/${username}` as any)}
        >
          <UserAvatar username={username} url={(reel as any).profiles?.avatar_url} size={38} showBorder />
          <View>
            <Text style={styles.username}>@{username}</Text>
            {(reel as any).profiles?.is_verified && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="checkmark-circle" size={12} color="#7C3AED" />
                <Text style={{ color: "#7C3AED", fontSize: 10, fontFamily: "Poppins_500Medium" }}>Verified</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        {reel.caption ? (
          <Text style={styles.caption} numberOfLines={3}>{reel.caption}</Text>
        ) : null}
        {reel.original_sound_post_id ? (
          <TouchableOpacity
            style={styles.soundRow}
            onPress={() => router.push(`/post/${reel.original_sound_post_id}` as any)}
          >
            <Ionicons name="musical-notes" size={12} color="#A78BFA" />
            <Text style={styles.soundText} numberOfLines={1}>
              Original sound · @{reel.original_sound_username ?? "user"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Play/pause indicator — shown briefly when toggling, or always if no video */}
      {(!videoUrl || videoError || !isPlaying) && (
        <View style={styles.playOverlay} pointerEvents="none">
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
        postId={id!}
        isLoggedIn={!!session}
        onRequireLogin={() => setShowComments(false)}
        contentType="reel"
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  backBtn: { position: "absolute", left: 14, zIndex: 20, padding: 6, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 20 },
  rightActions: { position: "absolute", right: 14, alignItems: "center", gap: 22, zIndex: 10 },
  actionBtn: { alignItems: "center", gap: 3 },
  actionCount: { color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  bottomInfo: { position: "absolute", left: 14, right: 90, zIndex: 10, gap: 6 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  username: { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
  caption: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "Poppins_400Regular", lineHeight: 19 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  linkText: { color: "#A78BFA", fontSize: 11, fontFamily: "Poppins_500Medium" },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  soundText: { color: "#A78BFA", fontSize: 12, fontFamily: "Poppins_500Medium", flex: 1 },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 5 },
});
