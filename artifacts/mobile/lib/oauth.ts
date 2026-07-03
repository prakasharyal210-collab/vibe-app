import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "";

/**
 * Google: mobile gets the id_token via expo-auth-session/providers/google hook
 * (lives in OAuthButtons.tsx), then sends it here to exchange via the API server.
 * The API server calls supabase.auth.signInWithIdToken — we never call Supabase
 * auth directly for Google sign-in.
 */
export async function signInWithGoogleIdToken(idToken: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((body as any).error ?? "Google Sign In failed");
  }

  const { session } = await res.json();
  if (!session) throw new Error("No session returned from server");

  // Hydrate the Supabase client — triggers onAuthStateChange in AuthContext
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
}

/**
 * Facebook: still uses the Supabase redirect/PKCE flow (no native SDK required).
 */
async function signInWithFacebookOAuth(): Promise<void> {
  const redirectUri = makeRedirectUri({ scheme: "vibe", path: "auth/callback" });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "facebook",
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
}

export const signInWithFacebook = signInWithFacebookOAuth;
