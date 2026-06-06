import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

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

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeDef;
  colors: ThemeColors;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: "classic",
  theme: THEMES.classic,
  colors: buildColorsFromTheme(THEMES.classic),
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>("classic");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => { if (saved && saved in THEMES) setThemeId(saved as ThemeId); })
      .catch(() => {});
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
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
