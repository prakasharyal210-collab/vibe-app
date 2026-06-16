import React from "react";
import { StyleSheet, Text, View } from "react-native";

export type ZodiacSign =
  | "Aries" | "Taurus" | "Gemini" | "Cancer" | "Leo" | "Virgo"
  | "Libra" | "Scorpio" | "Sagittarius" | "Capricorn" | "Aquarius" | "Pisces";

export const ALL_ZODIAC_SIGNS: ZodiacSign[] = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

const ZODIAC_SYMBOLS: Record<ZodiacSign, string> = {
  Aries:       "♈",
  Taurus:      "♉",
  Gemini:      "♊",
  Cancer:      "♋",
  Leo:         "♌",
  Virgo:       "♍",
  Libra:       "♎",
  Scorpio:     "♏",
  Sagittarius: "♐",
  Capricorn:   "♑",
  Aquarius:    "♒",
  Pisces:      "♓",
};

export function getZodiacSymbol(sign: string): string {
  return ZODIAC_SYMBOLS[sign as ZodiacSign] ?? "✦";
}

export function ZodiacSignBadge({ sign }: { sign: string }) {
  const symbol = ZODIAC_SYMBOLS[sign as ZodiacSign];
  if (!symbol) return null;
  return (
    <View style={st.pill}>
      <Text style={st.symbol}>{symbol}</Text>
      <Text style={st.label}>{sign}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
    backgroundColor: "rgba(55,65,200,0.15)",
    borderColor: "rgba(99,118,245,0.35)",
  },
  symbol: { fontSize: 13, color: "#a5b4fc" },
  label: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#a5b4fc" },
});
