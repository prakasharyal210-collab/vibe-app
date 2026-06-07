import React, { createContext, useContext, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/db";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Safety timeout — if Supabase never responds (no network at cold start),
    // release the loading gate after 8 s so the app isn't permanently frozen.
    const loadingTimeout = setTimeout(() => setLoading(false), 8000);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .catch(() => {
        // Network error on startup — continue as logged-out
      })
      .finally(() => {
        clearTimeout(loadingTimeout);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      if (session?.user && (_event === "SIGNED_IN" || _event === "TOKEN_REFRESHED")) {
        const u = session.user;
        const username = u.user_metadata?.username ?? u.email?.split("@")[0] ?? "user";
        ensureUserSetup(u.id, username, u.email ?? undefined).catch(() => {});
      }
    });

    return () => {
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    // 1. Wipe all cached user data from AsyncStorage (scores, lock state, rewards, etc.)
    try {
      await AsyncStorage.clear();
    } catch {}
    // 2. Sign out from Supabase — clears the stored session token
    try {
      await supabase.auth.signOut();
    } catch {}
    // 3. Force session to null immediately so the auth guard redirects right away
    //    (the onAuthStateChange listener will also set this, but doing it now is instant)
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
