import { useTheme } from "@/context/ThemeContext";

/**
 * Returns the active theme's color palette.
 * Theme is set via ThemeContext (persisted in AsyncStorage).
 */
export function useColors() {
  return useTheme().colors;
}
