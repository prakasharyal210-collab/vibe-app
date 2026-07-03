import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

async function signInWithOAuthProvider(
  provider: "google" | "facebook",
): Promise<void> {
  const redirectUri = makeRedirectUri({ scheme: "vibe", path: "auth/callback" });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
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
  // type === "cancel" or "dismiss" → user backed out, not an error
}

export const signInWithGoogle = () => signInWithOAuthProvider("google");
export const signInWithFacebook = () => signInWithOAuthProvider("facebook");
