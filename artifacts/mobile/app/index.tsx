import { router } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "@/context/AuthContext";

export default function Index() {
  const { loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    // Go straight to Reels — no login required to browse
    router.replace("/(tabs)");
  }, [loading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#7C3AED" size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0F",
    alignItems: "center",
    justifyContent: "center",
  },
});
