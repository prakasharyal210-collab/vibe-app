import React, { useState } from "react";
import { Image, StyleSheet, Text, View, ViewStyle } from "react-native";

const COLORS = ["#7C3AED", "#F97316", "#10B981", "#3B82F6", "#EC4899", "#06B6D4"];

interface UserAvatarProps {
  username?: string;
  url?: string | null;
  size?: number;
  style?: ViewStyle;
  showBorder?: boolean;
}

export function UserAvatar({ username, url, size = 40, style, showBorder = false }: UserAvatarProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const initials = username ? username.substring(0, 2).toUpperCase() : "VB";
  const colorIndex = username ? username.charCodeAt(0) % COLORS.length : 0;
  const bgColor = COLORS[colorIndex];
  const borderStyle = showBorder
    ? { borderWidth: 2, borderColor: "#7C3AED", padding: 2 }
    : {};

  if (url && !imageError) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bgColor,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            ...borderStyle,
          },
          style,
        ]}
      >
        <Text style={[styles.initials, { fontSize: size * 0.35 }]}>{initials}</Text>
        <Image
          source={{ uri: url }}
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: size / 2, opacity: imageLoaded ? 1 : 0 },
          ]}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          ...borderStyle,
        },
        style,
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#FFFFFF",
    fontFamily: "Poppins_600SemiBold",
  },
});
