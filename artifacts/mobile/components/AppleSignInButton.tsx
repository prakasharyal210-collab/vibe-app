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

  // Apple's own button component — required by Guideline 4 for a clear,
  // unambiguous button affordance (correct rounded shape, Apple logo + label,
  // native press feedback). Never re-style this with custom borders/colors
  // beyond the officially supported buttonStyle options.
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
