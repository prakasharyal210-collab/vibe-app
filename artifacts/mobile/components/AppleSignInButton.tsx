import * as AppleAuthentication from "expo-apple-authentication";
import React, { useRef, useState } from "react";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "";

interface Props {
  onError?: (msg: string) => void;
}

export function AppleSignInButton({ onError }: Props) {
  const [loading, setLoading] = useState(false);
  // Track whether signInAsync actually presented the Apple sheet.
  // On iPad the call can throw ERR_REQUEST_CANCELED BEFORE showing anything
  // (presentation anchor failure) vs AFTER the user dismisses the sheet.
  // We use this flag to distinguish the two so we can show an error in the
  // first case instead of silently ignoring it.
  const sheetPresentedRef = useRef(false);

  const doSignIn = async () => {
    setLoading(true);
    sheetPresentedRef.current = false;

    try {
      // Confirm Apple Sign In is available on this device/OS before calling
      // signInAsync. On iPad the feature is available but the presentation can
      // fail; isAvailableAsync returning false is a different (config) problem.
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        onError?.("Sign in with Apple is not available on this device.");
        return;
      }

      // Mark that we're about to present the sheet. If ERR_REQUEST_CANCELED is
      // thrown *before* this point (e.g. the call itself fails) the flag stays
      // false and we surface the error. If it's thrown after (user dismissal),
      // the flag is true and we suppress it as an intentional cancel.
      sheetPresentedRef.current = true;

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
      const canceled =
        e?.code === "ERR_REQUEST_CANCELED" ||
        e?.code === "ERR_CANCELED";

      if (canceled && sheetPresentedRef.current) {
        // User saw the sheet and dismissed it intentionally — no error needed.
        return;
      }
      if (canceled && !sheetPresentedRef.current) {
        // Sheet never appeared (iPad presentation failure). Give the user
        // a helpful prompt rather than silent nothing.
        onError?.(
          "Apple Sign In could not open. Please try again, or use email/password to sign in."
        );
        return;
      }
      onError?.(e?.message ?? "Apple Sign In failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePress = () => {
    // On iPad, Apple Sign In presents as a popover anchored to the tapped view.
    // Calling signInAsync synchronously during the press event can fail because
    // the UIKit view hierarchy hasn't fully settled after the touch animation.
    // A short defer lets the animation complete and the key window resolve
    // before ASAuthorizationController tries to anchor its popover.
    // On iPhone (modal sheet, no anchor needed) the delay is harmless.
    if (Platform.OS === "ios") {
      setTimeout(doSignIn, 100);
    } else {
      doSignIn();
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
