import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

interface Props {
  onError?: (msg: string) => void;
  disabled?: boolean;
}

export function GoogleSignInButton({ onError, disabled }: Props) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    setLoading(true);
    try {
      const redirectUri = makeRedirectUri({ scheme: "vibe", path: "auth/callback" });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error("No OAuth URL returned");

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

      if (result.type === "success") {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          result.url,
        );
        if (exchangeError) throw exchangeError;
      }
      // type === "cancel" / "dismiss" → user backed out, not an error
    } catch (e: any) {
      onError?.(e?.message ?? "Google Sign In failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || loading}
      style={styles.btn}
      activeOpacity={0.75}
    >
      <Text style={styles.googleG}>G</Text>
      <Text style={styles.label}>
        {loading ? "Signing in…" : "Continue with Google"}
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
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 10,
  },
  googleG: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: "#EA4335",
    lineHeight: 20,
  },
  label: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: "#fff",
  },
});
