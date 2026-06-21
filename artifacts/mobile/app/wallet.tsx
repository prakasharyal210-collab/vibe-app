import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Wallet</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        <LinearGradient
          colors={["rgba(124,58,237,0.15)", "rgba(249,115,22,0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, { borderColor: "rgba(124,58,237,0.25)" }]}
        >
          <Text style={styles.icon}>🪙</Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>Wallet Coming Soon</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Earn coins from live gifts, reel views, and post boosts. Withdraw to your bank or PayPal once the system launches.
          </Text>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  title: { flex: 1, fontSize: 20, fontFamily: "Poppins_700Bold", textAlign: "center" },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  card: {
    width: "100%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 14,
  },
  icon: { fontSize: 52 },
  heading: { fontSize: 20, fontFamily: "Poppins_700Bold", textAlign: "center" },
  sub: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
});
