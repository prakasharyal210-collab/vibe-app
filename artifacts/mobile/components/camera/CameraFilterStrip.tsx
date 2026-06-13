import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export interface CameraFilter {
  id: string;
  label: string;
  blendColor: string;
  blendOpacity: number;
  grayscale?: boolean;
  saturation?: number;
}

export const CAMERA_FILTERS: CameraFilter[] = [
  { id: "none", label: "Natural", blendColor: "transparent", blendOpacity: 0 },
  { id: "vivid", label: "Vivid", blendColor: "#EC4899", blendOpacity: 0.12 },
  { id: "warm", label: "Warm", blendColor: "#F97316", blendOpacity: 0.2 },
  { id: "cool", label: "Cool", blendColor: "#3B82F6", blendOpacity: 0.18 },
  { id: "vintage", label: "Vintage", blendColor: "#92400E", blendOpacity: 0.22 },
  { id: "cinematic", label: "Cinematic", blendColor: "#1E1B4B", blendOpacity: 0.28 },
  { id: "bw", label: "B&W", blendColor: "#374151", blendOpacity: 0.7, grayscale: true },
  { id: "fade", label: "Fade", blendColor: "#E2E8F0", blendOpacity: 0.28 },
  { id: "golden", label: "Golden", blendColor: "#FBBF24", blendOpacity: 0.22 },
  { id: "rose", label: "Rose", blendColor: "#FB7185", blendOpacity: 0.18 },
  { id: "teal", label: "Teal", blendColor: "#14B8A6", blendOpacity: 0.18 },
  { id: "dusk", label: "Dusk", blendColor: "#7C3AED", blendOpacity: 0.2 },
];

interface Props {
  visible: boolean;
  activeFilter: string;
  intensity: number;
  onFilterChange: (f: CameraFilter) => void;
  onIntensityChange: (v: number) => void;
}

function FilterThumb({ filter, active, onPress }: { filter: CameraFilter; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={st.thumbWrap} activeOpacity={0.8}>
      <View style={[st.thumb, active && st.thumbActive]}>
        <LinearGradient
          colors={["#1a0a2e", "#2d1b55"]}
          style={StyleSheet.absoluteFill}
        />
        {filter.id === "none" ? (
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>✕</Text>
        ) : filter.grayscale ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(180,180,180,0.6)", borderRadius: 8 }]} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: filter.blendColor, opacity: Math.min(1, filter.blendOpacity * 3.5), borderRadius: 8 }]} />
        )}
        {active && (
          <View style={st.checkDot}>
            <Text style={{ fontSize: 7, color: "#fff", lineHeight: 10 }}>✓</Text>
          </View>
        )}
      </View>
      <Text style={[st.thumbLabel, active && { color: "#A78BFA" }]} numberOfLines={1}>{filter.label}</Text>
    </TouchableOpacity>
  );
}

function IntensityBar({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={st.intensityRow}>
      <Text style={st.intensityLabel}>Intensity</Text>
      <View style={st.intensityTrack}>
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => onChange(v)}
            style={[st.intensityMark, value >= v && st.intensityMarkActive]}
          />
        ))}
        <View style={[st.intensityFill, { width: `${value}%` as any }]} />
      </View>
      <Text style={st.intensityVal}>{value}%</Text>
    </View>
  );
}

export function CameraFilterStrip({ visible, activeFilter, intensity, onFilterChange, onIntensityChange }: Props) {
  if (!visible) return null;
  const active = CAMERA_FILTERS.find((f) => f.id === activeFilter) ?? CAMERA_FILTERS[0];
  return (
    <View style={st.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.scroll}
      >
        {CAMERA_FILTERS.map((f) => (
          <FilterThumb
            key={f.id}
            filter={f}
            active={f.id === activeFilter}
            onPress={() => onFilterChange(f)}
          />
        ))}
      </ScrollView>
      {activeFilter !== "none" && (
        <IntensityBar value={intensity} onChange={onIntensityChange} />
      )}
    </View>
  );
}

export function FilterOverlay({ filter, intensity }: { filter: CameraFilter; intensity: number }) {
  if (!filter || filter.id === "none") return null;
  const adjustedOpacity = filter.blendOpacity * (intensity / 100);
  if (filter.grayscale) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: adjustedOpacity * 0.5 }]} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: filter.blendColor, opacity: adjustedOpacity }]} />
      </View>
    );
  }
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: filter.blendColor, opacity: adjustedOpacity }]}
      pointerEvents="none"
    />
  );
}

const st = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 180,
    backgroundColor: "rgba(5,5,15,0.97)",
    paddingTop: 10,
    paddingBottom: 6,
    zIndex: 100,
    elevation: 100,
  },
  scroll: { paddingHorizontal: 14, gap: 12, alignItems: "flex-start" },
  thumbWrap: { alignItems: "center", gap: 5 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbActive: { borderColor: "#8B5CF6", borderWidth: 2.5 },
  checkDot: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbLabel: { color: "rgba(255,255,255,0.65)", fontFamily: "Poppins_500Medium", fontSize: 10 },
  intensityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  intensityLabel: { color: "rgba(255,255,255,0.55)", fontFamily: "Poppins_500Medium", fontSize: 11, width: 55 },
  intensityTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    position: "relative",
    overflow: "hidden",
  },
  intensityFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "#8B5CF6", borderRadius: 2 },
  intensityMark: { width: 16, height: 16, borderRadius: 8, zIndex: 1 },
  intensityMarkActive: {},
  intensityVal: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 11, width: 32, textAlign: "right" },
});
