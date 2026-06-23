import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { CoupleTab } from "@/components/CoupleTab";

export default function CoupleIndexScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <CoupleTab userId={session?.user?.id ?? ""} session={session} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080810" },
});
