import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { THEMES, ThemeId, useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";

const { width: W } = Dimensions.get("window");
const CARD_GAP = 12;
const CARD_W = (W - 16 * 2 - CARD_GAP) / 2;

const THEME_ORDER: ThemeId[] = [
  "classic", "ocean", "sunset", "gold", "rose", "forest", "galaxy", "arctic",
];

export default function ThemeScreen() {
  const colors = useColors();
  const { themeId, theme, setTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Appearance</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Choose your vibe</Text>

        <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient
            colors={theme.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.previewBar}
          />
          <Text style={[styles.previewText, { color: colors.foreground }]}>
            {theme.emoji} {theme.name}
          </Text>
          <Text style={[styles.previewHint, { color: colors.mutedForeground }]}>
            Currently active
          </Text>
        </View>

        <View style={styles.grid}>
          {THEME_ORDER.map((id) => {
            const t = THEMES[id];
            const isSelected = themeId === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setTheme(id)}
                activeOpacity={0.8}
                style={[
                  styles.card,
                  { backgroundColor: t.surface, borderColor: isSelected ? t.primary : "rgba(255,255,255,0.07)" },
                  isSelected && { borderWidth: 2 },
                ]}
              >
                <LinearGradient
                  colors={t.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.swatch}
                >
                  <View style={styles.mockupRow}>
                    <View style={[styles.mockupAvatar, { backgroundColor: "rgba(255,255,255,0.35)" }]} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={[styles.mockupLine, { backgroundColor: "rgba(255,255,255,0.6)", width: "80%" }]} />
                      <View style={[styles.mockupLine, { backgroundColor: "rgba(255,255,255,0.35)", width: "55%" }]} />
                    </View>
                  </View>
                  <View style={[styles.mockupBody, { backgroundColor: t.surface + "99" }]}>
                    <View style={[styles.mockupLine, { backgroundColor: "rgba(255,255,255,0.4)", width: "90%" }]} />
                    <View style={[styles.mockupLine, { backgroundColor: "rgba(255,255,255,0.25)", width: "60%" }]} />
                  </View>
                  {isSelected && (
                    <View style={styles.checkCircle}>
                      <Ionicons name="checkmark-circle" size={26} color="#fff" />
                    </View>
                  )}
                </LinearGradient>

                <View style={styles.cardBottom}>
                  <Text style={styles.cardName}>{t.emoji} {t.name}</Text>
                  {t.premium ? (
                    <View style={styles.premiumBadge}>
                      <Ionicons name="ribbon" size={9} color="#F59E0B" />
                      <Text style={styles.premiumText}>Premium</Text>
                    </View>
                  ) : (
                    <View style={styles.freeBadge}>
                      <Text style={styles.freeText}>Free</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.infoSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: `${colors.primary}22` }]}>
              <Ionicons name="moon-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: colors.foreground }]}>Dark Mode</Text>
              <Text style={[styles.infoHint, { color: colors.mutedForeground }]}>
                Always on — optimized for Vibe
              </Text>
            </View>
            <View style={styles.alwaysOnBadge}>
              <Text style={styles.alwaysOnText}>ON</Text>
            </View>
          </View>

          <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={[styles.infoIcon, { backgroundColor: "rgba(249,115,22,0.15)" }]}>
              <Ionicons name="sparkles-outline" size={18} color="#F97316" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: colors.foreground }]}>Unlock Premium Themes</Text>
              <Text style={[styles.infoHint, { color: colors.mutedForeground }]}>
                Get verified or purchase coins
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
  },

  subtitle: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  previewCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  previewBar: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  previewText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    flex: 1,
  },
  previewHint: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
    paddingHorizontal: 16,
    marginBottom: 24,
  },

  card: {
    width: CARD_W,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },

  swatch: {
    height: 130,
    padding: 12,
    justifyContent: "space-between",
    position: "relative",
  },

  mockupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mockupAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  mockupLine: {
    height: 6,
    borderRadius: 3,
  },
  mockupBody: {
    borderRadius: 8,
    padding: 8,
    gap: 5,
  },

  checkCircle: {
    position: "absolute",
    top: 8,
    right: 8,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  cardBottom: {
    padding: 10,
    gap: 4,
  },
  cardName: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: "#FFFFFF",
  },

  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  premiumText: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    color: "#F59E0B",
  },

  freeBadge: {
    backgroundColor: "rgba(16,185,129,0.15)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  freeText: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    color: "#10B981",
  },

  infoSection: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  infoHint: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginTop: 1,
  },
  alwaysOnBadge: {
    backgroundColor: "rgba(16,185,129,0.15)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  alwaysOnText: {
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
    color: "#10B981",
  },
});
