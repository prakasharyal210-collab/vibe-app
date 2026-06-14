import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useColors } from "@/hooks/useColors";
import { supabase, Post, formatCount, timeAgo } from "@/lib/supabase";
import { shareContent } from "@/lib/share";

const { width: W } = Dimensions.get("window");

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(0);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("posts")
        .select("*, profiles(id, username, avatar_url, is_verified)")
        .eq("id", id)
        .single();
      if (data) {
        setPost(data as Post);
        setLikesCount((data as any).likes_count ?? 0);
      }
      setLoading(false);
    })();
  }, [id]);

  const handleLike = async () => {
    setLiked((v) => !v);
    setLikesCount((n) => liked ? n - 1 : n + 1);
  };

  const handleShare = () => {
    if (!post) return;
    shareContent("post", {
      username: post.profiles?.username ?? "user",
      id: post.id,
    }, post.caption ?? "Check out this post on Gundruk!");
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color="#7C3AED" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12, fontFamily: "Poppins_400Regular" }}>
          Post not found
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "#7C3AED", fontFamily: "Poppins_600SemiBold" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const username = post.profiles?.username ?? "user";
  const imageUrl = (post.images && post.images.length > 0 ? post.images[0] : post.image_url) ?? "";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Post</Text>
        <TouchableOpacity onPress={handleShare} style={styles.backBtn}>
          <Ionicons name="share-social-outline" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* User row */}
        <TouchableOpacity
          style={styles.userRow}
          onPress={() => router.push(`/profile/${username}` as any)}
        >
          <UserAvatar username={username} url={post.profiles?.avatar_url} size={40} showBorder />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[styles.username, { color: colors.foreground }]}>{username}</Text>
              {post.profiles?.is_verified && (
                <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
              )}
            </View>
            <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
              {timeAgo(post.created_at)}
            </Text>
          </View>
          <TouchableOpacity style={[styles.followBtn, { borderColor: "#7C3AED" }]}>
            <Text style={{ color: "#7C3AED", fontSize: 13, fontFamily: "Poppins_600SemiBold" }}>Follow</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Image */}
        <Image source={{ uri: imageUrl }} style={{ width: W, height: W }} contentFit="cover" />

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={handleLike} style={styles.actionItem}>
            <Ionicons name={liked ? "heart" : "heart-outline"} size={28} color={liked ? "#EF4444" : colors.foreground} />
            <Text style={[styles.actionCount, { color: colors.foreground }]}>{formatCount(likesCount)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {}} style={styles.actionItem}>
            <Ionicons name="chatbubble-outline" size={26} color={colors.foreground} />
            <Text style={[styles.actionCount, { color: colors.foreground }]}>{formatCount(post.comments_count ?? 0)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {}} style={styles.actionItem}>
            <Ionicons name="refresh" size={28} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => setSaved((v) => !v)} style={styles.actionItem}>
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={26} color={saved ? "#7C3AED" : colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={styles.actionItem}>
            <Ionicons name="paper-plane-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Caption */}
        {post.caption ? (
          <View style={styles.captionSection}>
            <Text style={[styles.captionText, { color: colors.foreground }]}>
              <Text style={styles.captionUser}>{username} </Text>
              {post.caption}
            </Text>
          </View>
        ) : null}

        {/* Share link */}
        <TouchableOpacity style={styles.linkRow} onPress={handleShare}>
          <Ionicons name="link-outline" size={14} color="#7C3AED" />
          <Text style={styles.linkText}>gundruk.app/@{username}/post/{post.id.slice(0, 8)}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Poppins_700Bold" },
  backBtn: { padding: 4, width: 40 },
  userRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  username: { fontSize: 14, fontFamily: "Poppins_700Bold" },
  timeText: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  followBtn: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  actionsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  actionItem: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 4, paddingVertical: 4 },
  actionCount: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  captionSection: { paddingHorizontal: 14, paddingBottom: 12 },
  captionText: { fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 21 },
  captionUser: { fontFamily: "Poppins_700Bold" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingBottom: 32 },
  linkText: { color: "#7C3AED", fontSize: 12, fontFamily: "Poppins_500Medium" },
});
