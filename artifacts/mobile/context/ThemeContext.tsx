import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ThemeId = "classic" | "gold" | "ocean" | "rose" | "forest" | "sunset" | "galaxy" | "arctic";

export interface ThemeDef {
  id: ThemeId;
  name: string;
  emoji: string;
  gradient: [string, string, string];
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  accent: string;
  premium: boolean;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  classic: {
    id: "classic", name: "Vibe Classic", emoji: "💜", premium: false,
    gradient: ["#8B5CF6", "#EC4899", "#F97316"],
    background: "#080810", surface: "#0F0F1A",
    primary: "#8B5CF6", secondary: "#EC4899", accent: "#F97316",
  },
  gold: {
    id: "gold", name: "Midnight Gold", emoji: "👑", premium: true,
    gradient: ["#F59E0B", "#D97706", "#92400E"],
    background: "#0A0800", surface: "#110D00",
    primary: "#F59E0B", secondary: "#D97706", accent: "#FFD700",
  },
  ocean: {
    id: "ocean", name: "Ocean Blue", emoji: "🌊", premium: false,
    gradient: ["#06B6D4", "#3B82F6", "#8B5CF6"],
    background: "#030712", surface: "#0A0F1E",
    primary: "#06B6D4", secondary: "#3B82F6", accent: "#8B5CF6",
  },
  rose: {
    id: "rose", name: "Rose Gold", emoji: "🌹", premium: true,
    gradient: ["#FB7185", "#F43F5E", "#E11D48"],
    background: "#0F0008", surface: "#1A000D",
    primary: "#FB7185", secondary: "#F43F5E", accent: "#E11D48",
  },
  forest: {
    id: "forest", name: "Forest Green", emoji: "🌿", premium: true,
    gradient: ["#10B981", "#059669", "#047857"],
    background: "#030A06", surface: "#071A0E",
    primary: "#10B981", secondary: "#059669", accent: "#047857",
  },
  sunset: {
    id: "sunset", name: "Sunset", emoji: "🌅", premium: false,
    gradient: ["#F97316", "#EF4444", "#DC2626"],
    background: "#0F0500", surface: "#1A0A00",
    primary: "#F97316", secondary: "#EF4444", accent: "#DC2626",
  },
  galaxy: {
    id: "galaxy", name: "Galaxy", emoji: "✨", premium: true,
    gradient: ["#6366F1", "#8B5CF6", "#A855F7"],
    background: "#05030F", surface: "#0D0A1F",
    primary: "#6366F1", secondary: "#8B5CF6", accent: "#A855F7",
  },
  arctic: {
    id: "arctic", name: "Arctic", emoji: "❄️", premium: true,
    gradient: ["#E2E8F0", "#CBD5E1", "#94A3B8"],
    background: "#020617", surface: "#0A0F1E",
    primary: "#E2E8F0", secondary: "#CBD5E1", accent: "#94A3B8",
  },
};

const STORAGE_KEY = "vibe_selected_theme";

export interface ThemeColors {
  text: string;
  tint: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  radius: number;
  gradient: [string, string, string];
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;
}

export function buildColorsFromTheme(theme: ThemeDef): ThemeColors {
  return {
    text: "#FFFFFF",
    tint: theme.primary,
    background: theme.background,
    foreground: "#FFFFFF",
    card: theme.surface,
    cardForeground: "#FFFFFF",
    primary: theme.primary,
    primaryForeground: "#FFFFFF",
    secondary: theme.surface,
    secondaryForeground: theme.secondary,
    muted: theme.surface,
    mutedForeground: "#9CA3AF",
    accent: theme.accent,
    accentForeground: "#FFFFFF",
    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",
    border: "rgba(255,255,255,0.08)",
    input: theme.surface,
    radius: 16,
    gradient: theme.gradient,
    gradientStart: theme.gradient[0],
    gradientMid: theme.gradient[1],
    gradientEnd: theme.gradient[2],
  };
}

function isValidThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && v in THEMES;
}

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeDef;
  colors: ThemeColors;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: "ocean",
  theme: THEMES.ocean,
  colors: buildColorsFromTheme(THEMES.ocean),
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>("ocean");
  const userIdRef = useRef<string | null>(null);

  // ── Boot: local first, then Supabase sync ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Immediate — apply local cache so there is no flash
      try {
        const local = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && isValidThemeId(local)) setThemeId(local);
      } catch {}

      // 2. Async — fetch from Supabase and override if different
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id ?? null;
        userIdRef.current = userId;

        if (!userId) return;

        const { data } = await supabase
          .from("user_settings")
          .select("selected_theme")
          .eq("user_id", userId)
          .maybeSingle();

        if (cancelled) return;

        const remote = data?.selected_theme;
        if (isValidThemeId(remote)) {
          setThemeId(remote);
          AsyncStorage.setItem(STORAGE_KEY, remote).catch(() => {});
        }
      } catch {}
    })();

    // 3. Keep userId in sync when auth state changes (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const userId = session?.user?.id ?? null;
        userIdRef.current = userId;

        if (!userId) return;

        // Re-sync theme from Supabase on login
        try {
          const { data } = await supabase
            .from("user_settings")
            .select("selected_theme")
            .eq("user_id", userId)
            .maybeSingle();

          const remote = data?.selected_theme;
          if (isValidThemeId(remote)) {
            setThemeId(remote);
            AsyncStorage.setItem(STORAGE_KEY, remote).catch(() => {});
          }
        } catch {}
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // ── setTheme: instant local + background Supabase write ───────────────────
  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);

    // Local — synchronous feel
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});

    // Remote — fire and forget
    const userId = userIdRef.current;
    if (userId) {
      void (async () => {
        try {
          await supabase
            .from("user_settings")
            .upsert(
              { user_id: userId, selected_theme: id, updated_at: new Date().toISOString() },
              { onConflict: "user_id" },
            );
        } catch {}
      })();
    }
  }, []);

  const theme = THEMES[themeId];
  const colors = buildColorsFromTheme(theme);

  return (
    <ThemeContext.Provider value={{ themeId, theme, colors, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
