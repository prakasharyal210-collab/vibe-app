import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface Props {
  lensId: string | null;
}

export default function LensOverlay({ lensId }: Props) {
  if (!lensId) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.badge}>
        <Text style={styles.emoji}>✨</Text>
        <Text style={styles.text}>AR Lenses{"\n"}coming soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(10,10,20,0.72)",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.35)",
  },
  emoji: { fontSize: 18 },
  text: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    lineHeight: 19,
  },
});
