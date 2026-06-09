import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AllCategory,
  CATEGORY_LABELS,
  LENSES,
  LensCategory,
} from "./LensData";

interface Props {
  visible: boolean;
  activeLensId: string | null;
  onSelect: (id: string | null) => void;
}

const CATEGORIES: AllCategory[] = [
  "all",
  "cute",
  "beauty",
  "fun",
  "world",
  "spiritual",
];

export function LensSelector({ visible, activeLensId, onSelect }: Props) {
  const [category, setCategory] = useState<AllCategory>("all");

  if (!visible) return null;

  const filtered =
    category === "all" ? LENSES : LENSES.filter((l) => l.category === category);

  return (
    <View style={st.container}>
      {/* ── Category tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.catScroll}
        style={st.catRow}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            onPress={() => setCategory(cat)}
            style={[st.catTab, category === cat && st.catTabActive]}
            activeOpacity={0.75}
          >
            <Text style={[st.catText, category === cat && st.catTextActive]}>
              {CATEGORY_LABELS[cat as AllCategory]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Lens items ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.lensScroll}
      >
        {/* None / clear */}
        <TouchableOpacity
          onPress={() => onSelect(null)}
          style={st.lensWrap}
          activeOpacity={0.8}
        >
          <View
            style={[st.lensCircle, activeLensId === null && st.lensCircleActive]}
          >
            <Text style={st.lensX}>✕</Text>
          </View>
          <Text
            style={[
              st.lensLabel,
              activeLensId === null && { color: "#A78BFA" },
            ]}
          >
            None
          </Text>
        </TouchableOpacity>

        {filtered.map((lens) => {
          const active = activeLensId === lens.id;
          return (
            <TouchableOpacity
              key={lens.id}
              onPress={() => onSelect(active ? null : lens.id)}
              style={st.lensWrap}
              activeOpacity={0.8}
            >
              <View
                style={[st.lensCircle, active && st.lensCircleActive]}
              >
                {active && (
                  <LinearGradient
                    colors={["rgba(124,58,237,0.7)", "rgba(234,88,12,0.5)"]}
                    style={[StyleSheet.absoluteFill, { borderRadius: 30 }]}
                  />
                )}
                <Text style={st.lensEmoji}>{lens.icon}</Text>
                {active && (
                  <View style={st.activeDot} />
                )}
              </View>
              <Text
                style={[st.lensLabel, active && { color: "#A78BFA" }]}
                numberOfLines={1}
              >
                {lens.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 178,
    backgroundColor: "rgba(0,0,0,0.82)",
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  catRow: { marginBottom: 8 },
  catScroll: {
    paddingHorizontal: 14,
    gap: 6,
    alignItems: "center",
  },
  catTab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  catTabActive: {
    backgroundColor: "rgba(124,58,237,0.55)",
  },
  catText: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  catTextActive: {
    color: "#fff",
  },
  lensScroll: {
    paddingHorizontal: 14,
    gap: 10,
    alignItems: "center",
  },
  lensWrap: {
    alignItems: "center",
    gap: 4,
    width: 62,
  },
  lensCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  lensCircleActive: {
    borderColor: "#8B5CF6",
    borderWidth: 2.5,
  },
  lensEmoji: {
    fontSize: 26,
  },
  lensX: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 20,
    fontFamily: "Poppins_600SemiBold",
  },
  lensLabel: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    textAlign: "center",
  },
  activeDot: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#A78BFA",
  },
});
