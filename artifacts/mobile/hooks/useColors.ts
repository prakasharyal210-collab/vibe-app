import colors from "@/constants/colors";

/**
 * Always returns the dark palette — Vibe is a dark-theme app.
 */
export function useColors() {
  const palette =
    "dark" in colors
      ? (colors as Record<string, typeof colors.light>).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
