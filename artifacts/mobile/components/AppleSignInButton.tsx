import * as AppleAuthentication from "expo-apple-authentication";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { supabase } from "@/lib/supabase";

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "";

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

      const fullName = [
        credential.fullName?.givenName,
        credential.fullName?.familyName,
      ]
        .filter(Boolean)
        .join(" ") || undefined;

      const res = await fetch(`${API_URL}/api/auth/apple`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identityToken: credential.identityToken,
          ...(fullName ? { fullName } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((body as any).error ?? "Apple Sign In failed");
      }

      const { session } = await res.json();
      if (!session) throw new Error("No session returned from server");

      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
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
        {loading ? "Signing in…" : "Sign in with Apple"}
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
    backgroundColor: "#000",
    gap: 10,
  },
  icon: { fontSize: 17, color: "#fff" },
  label: { fontSize: 15, fontFamily: "Poppins_500Medium", color: "#fff" },
});
