import { LinearGradient } from "expo-linear-gradient";
import React, { useRef } from "react";
import {
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Ellipse } from "react-native-svg";

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
  bottomOffset?: number;
}

const SLIDERS: { key: keyof BeautySettings; label: string; emoji: string; color: string }[] = [
  { key: "smooth",   label: "Smooth",   emoji: "✨", color: "#EC4899" },
  { key: "brighten", label: "Brighten", emoji: "☀️", color: "#FBBF24" },
  { key: "slim",     label: "Slim",     emoji: "💎", color: "#8B5CF6" },
  { key: "eyes",     label: "Big Eyes", emoji: "👁",  color: "#3B82F6" },
];

// ── Working draggable slider ───────────────────────────────────────────────
function BeautySlider({
  label, emoji, color, value, onChange,
}: {
  label: string; emoji: string; color: string; value: number; onChange: (v: number) => void;
}) {
  const trackWidth = useRef(0);

  const clamp = (x: number) =>
    Math.round(Math.max(0, Math.min(100, (x / Math.max(trackWidth.current, 1)) * 100)));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        onChange(clamp(e.nativeEvent.locationX));
      },
      onPanResponderMove: (e) => {
        onChange(clamp(e.nativeEvent.locationX));
      },
    })
  ).current;

  const pct = `${value}%` as any;

  return (
    <View style={sl.row}>
      <Text style={sl.emoji}>{emoji}</Text>
      <Text style={sl.label}>{label}</Text>

      {/* Touch target covers the whole track area */}
      <View
        style={sl.trackWrap}
        onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
        hitSlop={{ top: 14, bottom: 14 }}
      >
        <View style={sl.track}>
          <View style={[sl.fill, { width: pct, backgroundColor: color }]} />
        </View>
        {/* Thumb — positioned by percentage, offset by -8 to centre */}
        <View
          pointerEvents="none"
          style={[
            sl.thumb,
            { borderColor: color },
            value === 0  ? { left: 0 }
              : value === 100 ? { right: 0, left: undefined }
              : { left: pct, marginLeft: -8 },
          ]}
        />
      </View>

      <Text style={[sl.val, { color }]}>{value}</Text>
    </View>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────
export function BeautyPanel({ visible, settings, onChange, onClose, bottomOffset = 200 }: Props) {
  if (!visible) return null;

  const allZero = Object.values(settings).every((v) => v === 0);

  return (
    <View style={[styles.panel, { bottom: bottomOffset }]}>
      <View style={styles.handle} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={{ fontSize: 14 }}>🪄</Text>
          <Text style={styles.title}>Beauty</Text>
        </View>
        <View style={styles.headerRight}>
          {!allZero && (
            <TouchableOpacity
              onPress={() => {
                (["smooth", "brighten", "slim", "eyes"] as (keyof BeautySettings)[]).forEach(
                  (k) => onChange(k, 0)
                );
              }}
              style={styles.resetBtn}
            >
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={{ fontSize: 16, color: "rgba(255,255,255,0.6)" }}>✕</Text>
          </TouchableOpacity>
        </View>
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

// ── Live overlay effects on the camera view ────────────────────────────────
export function BeautyOverlay({ settings }: { settings: BeautySettings }) {
  const { smooth, brighten, slim, eyes } = settings;

  if (smooth === 0 && brighten === 0 && slim === 0 && eyes === 0) return null;

  // Slim: dark gradient bars on the sides — creates face-narrowing illusion
  const slimOpacity = slim / 200;          // max ~0.5 at 100
  // Smooth: soft white frosted veil
  const smoothOpacity = smooth / 500;      // max ~0.2 at 100
  // Brighten: warm glow
  const brightOpacity = brighten / 280;    // max ~0.36 at 100

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* ── Smooth ── white frosted veil */}
      {smooth > 0 && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: `rgba(255,255,255,${smoothOpacity})` },
          ]}
        />
      )}

      {/* ── Brighten ── warm radial glow */}
      {brighten > 0 && (
        <LinearGradient
          colors={[
            `rgba(255,240,200,${brightOpacity})`,
            `rgba(255,220,160,${brightOpacity * 0.5})`,
            "transparent",
          ]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* ── Slim ── dark side bars narrow the face */}
      {slim > 0 && (
        <>
          <LinearGradient
            colors={[`rgba(0,0,0,${slimOpacity})`, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.22, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["transparent", `rgba(0,0,0,${slimOpacity})`]}
            start={{ x: 0.78, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}

      {/* ── Eyes ── bright spotlight around the eye area */}
      {eyes > 0 && (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Ellipse
            cx="37%"
            cy="30%"
            rx="12%"
            ry="7%"
            fill={`rgba(255,255,255,${eyes / 600})`}
          />
          <Ellipse
            cx="63%"
            cy="30%"
            rx="12%"
            ry="7%"
            fill={`rgba(255,255,255,${eyes / 600})`}
          />
        </Svg>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "rgba(10,10,20,0.97)",
    borderRadius: 20,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.3)",
    zIndex: 100,
    elevation: 100,
  },
  handle: {
    width: 32, height: 3, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center", marginBottom: 2,
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  resetBtn: {
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  resetText: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
  },
  closeBtn: { padding: 4 },
});

const sl = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  emoji: { fontSize: 16, width: 22, textAlign: "center" },
  label: {
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    width: 58,
  },
  trackWrap: {
    flex: 1,
    height: 28,
    justifyContent: "center",
  },
  track: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
    borderRadius: 2,
  },
  thumb: {
    position: "absolute",
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#fff",
    top: 5,
    borderWidth: 2.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  val: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    width: 28,
    textAlign: "right",
  },
});
