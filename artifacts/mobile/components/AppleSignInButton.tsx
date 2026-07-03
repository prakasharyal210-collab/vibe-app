import * as AppleAuthentication from "expo-apple-authentication";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { supabase } from "@/lib/supabase";

interface Props {
  onError?: (msg: string) => void;
}

export function AppleSignInButton({ onError }: Props) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error("No identity token returned from Apple");
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (error) throw error;
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") return;
      onError?.(e?.message ?? "Apple Sign In failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={loading}
      style={styles.btn}
      activeOpacity={0.75}
    >
      <Text style={styles.icon}></Text>
      <Text style={styles.label}>
        {loading ? "Signing in…" : "Continue with Apple"}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.08)",
    gap: 10,
  },
  icon: { fontSize: 17, color: "#fff" },
  label: { fontSize: 15, fontFamily: "Poppins_500Medium", color: "#fff" },
});
