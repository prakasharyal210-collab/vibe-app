import Constants from "expo-constants";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { signInWithGoogleIdToken } from "@/lib/oauth";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID =
  "375944530592-m00jil1hf5ppqq02mnfgrgiaen3f2a8s.apps.googleusercontent.com";

// iOS client ID is separate from the web client ID and must be created in
// Google Cloud Console with bundle ID com.prakasharyal.gundruk (see report).
const GOOGLE_IOS_CLIENT_ID =
  (Constants.expoConfig?.extra?.googleIosClientId as string | undefined) ?? "";

// On iOS, Google Sign-In requires iosClientId.  If it hasn't been pasted yet
// show a safe "unavailable" state instead of the crash-looking error screen.
const IOS_GOOGLE_AVAILABLE =
  Platform.OS !== "ios" || GOOGLE_IOS_CLIENT_ID.length > 0;

interface Props {
  onError?: (msg: string) => void;
  disabled?: boolean;
}

export function GoogleSignInButton({ onError, disabled }: Props) {
  const [_request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
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

  if (!IOS_GOOGLE_AVAILABLE) {
    return (
      <TouchableOpacity
        disabled
        style={[styles.btn, styles.btnDisabled]}
        activeOpacity={1}
      >
        <Text style={styles.googleG}>G</Text>
        <Text style={[styles.label, styles.labelMuted]}>
          Google Sign In unavailable
        </Text>
      </TouchableOpacity>
    );
  }

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
  btnDisabled: {
    opacity: 0.45,
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
  labelMuted: {
    color: "rgba(255,255,255,0.45)",
  },
});
