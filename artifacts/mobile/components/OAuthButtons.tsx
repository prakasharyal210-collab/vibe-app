import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { signInWithGoogleIdToken, signInWithFacebook } from "@/lib/oauth";
import { AppleSignInButton } from "./AppleSignInButton";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID =
  "375944530592-m00jil1hf5ppqq02mnfgrgiaen3f2a8s.apps.googleusercontent.com";

interface Props {
  onError?: (msg: string) => void;
}

export function OAuthButtons({ onError }: Props) {
  const [_request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ["openid", "profile", "email"],
  });

  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingFacebook, setLoadingFacebook] = useState(false);
  const anyLoading = loadingGoogle || loadingFacebook;

  useEffect(() => {
    if (!response) return;

    if (response.type === "success") {
      const idToken = response.authentication?.idToken;
      if (idToken) {
        signInWithGoogleIdToken(idToken)
          .catch((e: any) => onError?.(e?.message ?? "Google Sign In failed"))
          .finally(() => setLoadingGoogle(false));
      } else {
        setLoadingGoogle(false);
        onError?.("Google Sign In failed: no id_token received");
      }
    } else if (response.type === "error") {
      setLoadingGoogle(false);
      onError?.(response.error?.message ?? "Google Sign In failed");
    } else if (response.type === "cancel" || response.type === "dismiss") {
      setLoadingGoogle(false);
    }
  }, [response]);

  const handleGoogle = async () => {
    setLoadingGoogle(true);
    await promptAsync();
  };

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
        <TouchableOpacity
          onPress={handleGoogle}
          disabled={anyLoading}
          style={styles.btn}
          activeOpacity={0.75}
        >
          <Text style={styles.googleG}>G</Text>
          <Text style={styles.label}>
            {loadingGoogle ? "Signing in…" : "Continue with Google"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleFacebook}
          disabled={anyLoading}
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
  googleG: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: "#EA4335",
    lineHeight: 20,
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
