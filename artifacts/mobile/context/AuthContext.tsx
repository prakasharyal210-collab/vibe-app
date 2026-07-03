import React, { createContext, useContext, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/db";
import { registerForPushNotificationsAsync, setupNotificationHandler } from "@/lib/pushNotifications";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  needsOnboarding: boolean;
  clearNeedsOnboarding: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  needsOnboarding: false,
  clearNeedsOnboarding: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    setupNotificationHandler();

    const loadingTimeout = setTimeout(() => setLoading(false), 8000);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(loadingTimeout);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setLoading(false);

      if (newSession?.user && _event === "SIGNED_IN") {
        const u = newSession.user;
        const provider = u.app_metadata?.provider ?? "email";
        const isOAuth = provider !== "email";

        if (isOAuth) {
          // Check if this OAuth user already has a username in the profiles table
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", u.id)
            .maybeSingle();

          if (!profile?.username) {
            // First-time OAuth sign-in — needs to pick a username
            setNeedsOnboarding(true);
          }

          registerForPushNotificationsAsync(u.id).catch(() => {});
          setSession(newSession);
          return;
        }

        // Email sign-up / sign-in — set up profile as before
        const username =
          u.user_metadata?.["username"] ??
          u.email?.split("@")[0] ??
          "user";
        ensureUserSetup(u.id, username, u.email ?? undefined).catch(() => {});
        registerForPushNotificationsAsync(u.id).catch(() => {});
      } else if (newSession?.user && _event === "TOKEN_REFRESHED") {
        const u = newSession.user;
        const username =
          u.user_metadata?.["username"] ??
          u.email?.split("@")[0] ??
          "user";
        ensureUserSetup(u.id, username, u.email ?? undefined).catch(() => {});
        registerForPushNotificationsAsync(u.id).catch(() => {});
      }

      setSession(newSession);
    });

    return () => {
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const clearNeedsOnboarding = () => setNeedsOnboarding(false);

  const signOut = async () => {
    setSession(null);
    setNeedsOnboarding(false);
    supabase.auth.signOut().catch(() => {});
    AsyncStorage.clear().catch(() => {});
  };

  return (
    <AuthContext.Provider
      value={{ session, loading, needsOnboarding, clearNeedsOnboarding, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
