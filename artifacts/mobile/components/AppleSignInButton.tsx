import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import React, { useState } from "react";
import { Alert } from "react-native";
import { supabase } from "@/lib/supabase";

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "";

interface Props {
  onError?: (msg: string) => void;
}

export function AppleSignInButton({ onError }: Props) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        const msg = "Sign in with Apple is not available on this device.";
        onError?.(msg);
        return;
      }

      // Generate a cryptographic nonce.
      // Apple embeds a SHA-256 hash of the nonce inside the identity token;
      // Supabase verifies that the raw nonce hashes to the same value.
      // Without a matching nonce the token is rejected and sign-in silently
      // fails. We must generate the nonce BEFORE calling signInAsync so both
      // sides use the same value.
      const rawNonce = Array.from(
        Crypto.getRandomBytes(16),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");

      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      // signInAsync must be called directly (not deferred) so it runs inside
      // the native press-event context. On iPad, Apple Sign-In renders as a
      // popover anchored to the tapping view; deferring via setTimeout drops
      // the anchor and triggers ERR_REQUEST_CANCELED before the sheet appears.
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
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
          nonce: rawNonce,
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

      // Success — navigation is driven by onAuthStateChange in _layout.tsx
    } catch (e: any) {
      // ERR_REQUEST_CANCELED / ERR_CANCELED = user dismissed the Apple sheet.
      // Suppress silently — this is an intentional user action, not an error.
      if (
        e?.code === "ERR_REQUEST_CANCELED" ||
        e?.code === "ERR_CANCELED"
      ) {
        return;
      }

      const msg = e?.message ?? "Apple Sign In failed. Please try again.";
      onError?.(msg);
      // Always show an Alert so the error is visible regardless of scroll
      // position (the inline error banner in the card can be off-screen when
      // the user taps the Apple button at the bottom of the login form).
      Alert.alert("Sign In Failed", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={14}
      style={{ height: 52, width: "100%", opacity: loading ? 0.6 : 1 }}
      onPress={handlePress}
    />
  );
}
