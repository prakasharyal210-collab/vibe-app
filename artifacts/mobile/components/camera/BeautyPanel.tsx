import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export interface BeautySettings {
  smooth: number;
  brighten: number;
  slim: number;
  eyes: number;
}

interface Props {
  visible: boolean;
  settings: BeautySettings;
  onChange: (key: keyof BeautySettings, val: number) => void;
  onClose: () => void;
}

const SLIDERS: { key: keyof BeautySettings; label: string; emoji: string; color: string }[] = [
  { key: "smooth", label: "Smooth", emoji: "✨", color: "#EC4899" },
  { key: "brighten", label: "Brighten", emoji: "☀️", color: "#FBBF24" },
  { key: "slim", label: "Slim", emoji: "💎", color: "#8B5CF6" },
  { key: "eyes", label: "Big Eyes", emoji: "👁", color: "#3B82F6" },
];

function BeautySlider({
  label, emoji, color, value, onChange,
}: {
  label: string; emoji: string; color: string; value: number; onChange: (v: number) => void;
}) {
  const trackRef = React.useRef<View>(null);

  const handleLayout = (width: number, x: number) => {
    if (width <= 0) return;
  };

  return (
    <View style={sl.row}>
      <Text style={sl.emoji}>{emoji}</Text>
      <Text style={sl.label}>{label}</Text>
      <View style={sl.trackWrap}>
        <View
          style={sl.track}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
          }}
        >
          <View style={[sl.fill, { width: `${value}%` as any, backgroundColor: color }]} />
          <View style={[sl.thumb, { left: `${value}%` as any, borderColor: color }]} />
        </View>
        <View style={sl.touchRow}>
          {[0, 25, 50, 75, 100].map((v) => (
            <TouchableOpacity
              key={v}
              style={sl.touchZone}
              onPress={() => onChange(v)}
              activeOpacity={0.7}
            />
          ))}
        </View>
      </View>
      <Text style={[sl.val, { color }]}>{value}</Text>
    </View>
  );
}

export function BeautyPanel({ visible, settings, onChange, onClose }: Props) {
  if (!visible) return null;
  return (
    <View style={styles.panel}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="color-wand" size={16} color="#EC4899" />
          <Text style={styles.title}>Beauty</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>
      {SLIDERS.map((s) => (
        <BeautySlider
          key={s.key}
          label={s.label}
          emoji={s.emoji}
          color={s.color}
          value={settings[s.key]}
          onChange={(v) => onChange(s.key, v)}
        />
      ))}
    </View>
  );
}

export function BeautyOverlay({ settings }: { settings: BeautySettings }) {
  const smoothOpacity = settings.smooth / 400;
  const brightenOpacity = settings.brighten / 300;
  if (settings.smooth === 0 && settings.brighten === 0) return null;
  return (
    <>
      {settings.smooth > 0 && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${smoothOpacity})`, borderRadius: 0 }]}
          pointerEvents="none"
        />
      )}
      {settings.brighten > 0 && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,220,180,${brightenOpacity})` }]}
          pointerEvents="none"
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    bottom: 200,
    left: 16,
    right: 16,
    backgroundColor: "rgba(10,10,20,0.92)",
    borderRadius: 20,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.3)",
  },
  handle: { width: 32, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", alignSelf: "center", marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  closeBtn: { padding: 4 },
});

const sl = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  emoji: { fontSize: 16, width: 22, textAlign: "center" },
  label: { color: "rgba(255,255,255,0.75)", fontFamily: "Poppins_500Medium", fontSize: 12, width: 60 },
  trackWrap: { flex: 1, position: "relative" },
  track: { height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, position: "relative", justifyContent: "center" },
  fill: { position: "absolute", left: 0, top: 0, height: 4, borderRadius: 2 },
  thumb: { position: "absolute", width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff", top: -6, marginLeft: -8, borderWidth: 2.5 },
  touchRow: { position: "absolute", top: -12, left: 0, right: 0, bottom: -12, flexDirection: "row" },
  touchZone: { flex: 1 },
  val: { fontFamily: "Poppins_600SemiBold", fontSize: 12, width: 28, textAlign: "right" },
});
