import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { signInWithGoogleIdToken } from "@/lib/oauth";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID =
  "375944530592-m00jil1hf5ppqq02mnfgrgiaen3f2a8s.apps.googleusercontent.com";

interface Props {
  onError?: (msg: string) => void;
  disabled?: boolean;
}

export function GoogleSignInButton({ onError, disabled }: Props) {
  const [_request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ["openid", "profile", "email"],
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!response) return;

    if (response.type === "success") {
      const idToken = response.authentication?.idToken;
      if (idToken) {
        signInWithGoogleIdToken(idToken)
          .catch((e: any) => onError?.(e?.message ?? "Google Sign In failed"))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
        onError?.("Google Sign In failed: no id_token received");
      }
    } else if (response.type === "error") {
      setLoading(false);
      onError?.(response.error?.message ?? "Google Sign In failed");
    } else if (response.type === "cancel" || response.type === "dismiss") {
      setLoading(false);
    }
  }, [response]);

  const handlePress = async () => {
    setLoading(true);
    await promptAsync();
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
