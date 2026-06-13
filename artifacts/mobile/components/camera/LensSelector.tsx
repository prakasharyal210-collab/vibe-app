import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
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

const NUM_COLS = 4;

export function LensSelector({ visible, activeLensId, onSelect }: Props) {
  const [category, setCategory] = useState<AllCategory>("all");

  const filtered =
    category === "all" ? LENSES : LENSES.filter((l) => l.category === category);

  // Include "None" as first item, then lenses
  const items = [{ id: null as null, name: "None", icon: "✕" }, ...filtered.map(l => ({ ...l, id: l.id as string | null }))];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => onSelect(null)}
    >
      {/* Tap outside to close */}
      <Pressable style={st.backdrop} onPress={() => onSelect(activeLensId)} />

      <View style={st.sheet}>
        {/* Drag handle */}
        <View style={st.handle} />

        {/* Header */}
        <View style={st.headerRow}>
          <Text style={st.title}>Lenses</Text>
          <TouchableOpacity onPress={() => onSelect(activeLensId)} style={st.closeBtn}>
            <Text style={st.closeX}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Category tabs */}
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

        {/* Lens grid */}
        <ScrollView
          style={st.gridScroll}
          contentContainerStyle={st.grid}
          showsVerticalScrollIndicator={false}
        >
          {items.map((lens) => {
            const active = activeLensId === lens.id;
            const isNone = lens.id === null;
            return (
              <TouchableOpacity
                key={lens.id ?? "__none__"}
                onPress={() => onSelect(active && !isNone ? null : lens.id)}
                style={st.cell}
                activeOpacity={0.8}
              >
                <View style={[st.circle, active && st.circleActive]}>
                  {active && !isNone && (
                    <LinearGradient
                      colors={["rgba(124,58,237,0.75)", "rgba(234,88,12,0.55)"]}
                      style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
                    />
                  )}
                  <Text style={isNone ? st.noneIcon : st.lensEmoji}>
                    {lens.icon}
                  </Text>
                  {active && !isNone && <View style={st.activeDot} />}
                </View>
                <Text
                  style={[st.lensLabel, active && st.lensLabelActive]}
                  numberOfLines={1}
                >
                  {lens.name}
                </Text>
              </TouchableOpacity>
            );
          })}
          {/* Padding rows so last row isn't clipped */}
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const CELL_W = `${Math.floor(100 / NUM_COLS)}%` as const;

const st = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: "#0F0F1A",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: "rgba(139,92,246,0.25)",
    maxHeight: "72%",
    paddingBottom: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  title: {
    flex: 1,
    color: "#fff",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  closeBtn: {
    padding: 6,
  },
  closeX: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  catRow: {
    maxHeight: 40,
    marginBottom: 10,
  },
  catScroll: {
    paddingHorizontal: 14,
    gap: 6,
    alignItems: "center",
  },
  catTab: {
    paddingHorizontal: 13,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  catTabActive: {
    backgroundColor: "rgba(124,58,237,0.55)",
  },
  catText: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  catTextActive: {
    color: "#fff",
  },
  gridScroll: {
    height: 300,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
  },
  cell: {
    width: CELL_W,
    alignItems: "center",
    paddingVertical: 10,
    gap: 5,
  },
  circle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  circleActive: {
    borderColor: "#8B5CF6",
    borderWidth: 2.5,
  },
  lensEmoji: {
    fontSize: 28,
  },
  noneIcon: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 20,
    fontFamily: "Poppins_600SemiBold",
  },
  lensLabel: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    textAlign: "center",
  },
  lensLabelActive: {
    color: "#A78BFA",
  },
  activeDot: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#A78BFA",
  },
});
