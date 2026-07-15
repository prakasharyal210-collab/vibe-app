import * as AppleAuthentication from "expo-apple-authentication";
import React, { useState } from "react";
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
        onError?.("Sign in with Apple is not available on this device.");
        return;
      }

      // signInAsync must be called directly (not deferred via setTimeout) so it
      // runs inside the native press-event context. On iPad, Apple Sign-In
      // renders as a popover anchored to the tapping view; deferring the call
      // out of the native event drops that anchor, causing an immediate
      // ERR_REQUEST_CANCELED before any sheet appears. Calling synchronously
      // here keeps the anchor intact on both iPhone and iPad.
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

      // Success — navigation is driven by onAuthStateChange in _layout.tsx
    } catch (e: any) {
      // ERR_REQUEST_CANCELED / ERR_CANCELED means the user dismissed the sheet
      // intentionally. Because we call signInAsync synchronously (no deferred
      // setTimeout), this error no longer fires due to anchor failure — it only
      // fires on genuine user dismissal. Suppress it silently.
      if (
        e?.code === "ERR_REQUEST_CANCELED" ||
        e?.code === "ERR_CANCELED"
      ) {
        return;
      }
      onError?.(e?.message ?? "Apple Sign In failed. Please try again.");
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
