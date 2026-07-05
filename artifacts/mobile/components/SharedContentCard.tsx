import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { SharedPreview } from "@/lib/supabase";
import { UserAvatar } from "./UserAvatar";

interface SharedContentCardProps {
  contentType: "post" | "reel" | "confession";
  contentId: string;
  preview: SharedPreview;
}

const TYPE_LABELS: Record<string, string> = {
  post: "Post",
  reel: "Reel",
  confession: "Confession",
};

const TYPE_ICONS: Record<string, string> = {
  post: "image-outline",
  reel: "play-circle-outline",
  confession: "heart-outline",
};

function handleTap(contentType: string) {
  if (contentType === "reel") {
    router.push("/(tabs)/reels" as any);
  } else if (contentType === "confession") {
    router.push("/(tabs)/couple" as any);
  } else {
    router.push("/(tabs)/" as any);
  }
}

export function SharedContentCard({ contentType, contentId: _contentId, preview }: SharedContentCardProps) {
  const colors = useColors();
  const label = TYPE_LABELS[contentType] ?? "Content";
  const iconName = TYPE_ICONS[contentType] ?? "document-outline";

  if (preview.content_unavailable) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.unavailableRow}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
          <Text style={[styles.unavailableText, { color: colors.mutedForeground }]}>
            Content unavailable
          </Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => handleTap(contentType)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {/* Author row */}
      <View style={styles.header}>
        <UserAvatar
          url={preview.author_avatar_url ?? undefined}
          username={preview.author_username ?? "?"}
          size={26}
        />
        <Text style={[styles.username, { color: colors.foreground }]} numberOfLines={1}>
          {preview.author_username ?? ""}
        </Text>
        <View style={styles.typeChip}>
          <Ionicons name={iconName as any} size={11} color="#A78BFA" />
          <Text style={styles.typeChipText}>{label}</Text>
        </View>
      </View>

      {/* Thumbnail */}
      {preview.thumbnail_url ? (
        <Image
          source={{ uri: preview.thumbnail_url }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.muted }]}>
          <Ionicons name={iconName as any} size={30} color={colors.mutedForeground} />
        </View>
      )}

      {/* Caption */}
      {!!preview.caption && (
        <Text
          style={[styles.caption, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {preview.caption}
        </Text>
      )}

      {/* Poll badge */}
      {preview.has_poll && (
        <View style={styles.pollRow}>
          <Ionicons name="stats-chart-outline" size={11} color="#A78BFA" />
          <Text style={styles.pollText}>Has poll</Text>
        </View>
      )}

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
          Tap to view {label.toLowerCase()}
        </Text>
        <Ionicons name="chevron-forward" size={12} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    maxWidth: 232,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 7,
  },
  username: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(124,58,237,0.18)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  typeChipText: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
    color: "#A78BFA",
  },
  thumbnail: {
    width: "100%",
    height: 136,
  },
  thumbnailPlaceholder: {
    width: "100%",
    height: 136,
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    paddingHorizontal: 10,
    paddingTop: 8,
    lineHeight: 17,
  },
  pollRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingTop: 5,
  },
  pollText: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
    color: "#A78BFA",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
  unavailableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
  },
  unavailableText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
});
