import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { signInWithFacebook } from "@/lib/oauth";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { AppleSignInButton } from "./AppleSignInButton";

interface Props {
  onError?: (msg: string) => void;
}

export function OAuthButtons({ onError }: Props) {
  const [loadingFacebook, setLoadingFacebook] = useState(false);

  const handleFacebook = async () => {
    setLoadingFacebook(true);
    try {
      await signInWithFacebook();
    } catch (e: any) {
      onError?.(e?.message ?? "Facebook Sign In failed");
    } finally {
      setLoadingFacebook(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.dividerRow}>
        <View style={styles.line} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.line} />
      </View>

      <View style={styles.buttons}>
        <GoogleSignInButton onError={onError} disabled={loadingFacebook} />

        <TouchableOpacity
          onPress={handleFacebook}
          disabled={loadingFacebook}
          style={[styles.btn, styles.fbBtn]}
          activeOpacity={0.75}
        >
          <Text style={styles.fbF}>f</Text>
          <Text style={styles.label}>
            {loadingFacebook ? "Signing in…" : "Continue with Facebook"}
          </Text>
        </TouchableOpacity>

        <AppleSignInButton onError={onError} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  orText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 0.5,
  },
  buttons: { gap: 12 },
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
  fbBtn: {
    borderColor: "rgba(24,119,242,0.25)",
    backgroundColor: "rgba(24,119,242,0.07)",
  },
  fbF: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: "#1877F2",
    lineHeight: 22,
  },
  label: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: "#fff",
  },
});
