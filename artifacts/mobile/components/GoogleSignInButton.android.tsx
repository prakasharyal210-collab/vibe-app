import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { supabase } from "@/lib/supabase";

// Required by expo-web-browser so the auth session completes on Android
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
      // vibe://google-auth is the deep-link URI that Supabase will redirect to
      // after the user completes Google OAuth in the browser.
      // openAuthSessionAsync intercepts any URL starting with this scheme,
      // closes the tab, and returns { type: "success", url: "<full callback URL>" }.
      const redirectUri = makeRedirectUri({ scheme: "vibe", path: "google-auth" });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUri,
          // skipBrowserRedirect: true — we open the browser ourselves via
          // openAuthSessionAsync so Expo can intercept the deep-link redirect.
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error("No OAuth URL returned from Supabase");

      // Open the Google OAuth page in an in-app browser tab.
      // The second argument is the redirect URI prefix; the browser tab closes
      // automatically when the URL starts with this scheme.
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

      if (result.type === "success") {
        // Supabase PKCE flow: the callback URL has the form
        //   vibe://google-auth?code=<pkce_code>&...
        // exchangeCodeForSession expects ONLY the code value (not the full URL).
        // Passing the raw URL would send it verbatim as the auth_code body param,
        // which the Supabase token endpoint rejects.
        const callbackUrl = new URL(result.url);
        const code = callbackUrl.searchParams.get("code");

        if (!code) {
          throw new Error(
            "Google OAuth callback did not contain an authorization code. " +
            `Full callback: ${result.url}`,
          );
        }

        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;

        // Session is now active. AuthContext's onAuthStateChange fires SIGNED_IN,
        // calls ensureUserSetup / registerForPushNotifications, sets session state,
        // and RootLayoutNav redirects to /(tabs)/feed automatically.
      }
      // result.type === "cancel" | "dismiss" → user closed the browser, not an error
    } catch (e: any) {
      onError?.(e?.message ?? "Google Sign In failed. Please try again.");
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
