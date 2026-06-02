import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

const { height: H } = Dimensions.get("window");

export interface FilterConfig {
  id: string;
  label: string;
  color: string;
  opacity: number;
  blendHex: string;
}

export interface EffectConfig {
  id: string;
  label: string;
  icon: string;
  active: boolean;
  requiresNative?: boolean;
}

export type TimerValue = 0 | 3 | 5 | 10;

export const FILTERS: FilterConfig[] = [
  { id: "none", label: "None", color: "transparent", opacity: 0, blendHex: "transparent" },
  { id: "warm", label: "Warm", color: "#F97316", opacity: 0.18, blendHex: "#F97316" },
  { id: "cool", label: "Cool", color: "#3B82F6", opacity: 0.18, blendHex: "#3B82F6" },
  { id: "vintage", label: "Vintage", color: "#92400E", opacity: 0.22, blendHex: "#92400E" },
  { id: "noir", label: "Noir", color: "#111827", opacity: 0.35, blendHex: "#111827" },
  { id: "vivid", label: "Vivid", color: "#EC4899", opacity: 0.14, blendHex: "#EC4899" },
  { id: "fade", label: "Fade", color: "#E2E8F0", opacity: 0.25, blendHex: "#E2E8F0" },
  { id: "golden", label: "Golden", color: "#FBBF24", opacity: 0.2, blendHex: "#FBBF24" },
  { id: "rose", label: "Rose", color: "#FB7185", opacity: 0.18, blendHex: "#FB7185" },
];

const SPEED_OPTIONS = [
  { id: "half", label: "0.5x", icon: "remove-circle-outline" },
  { id: "normal", label: "1x", icon: "radio-button-on-outline" },
  { id: "double", label: "2x", icon: "add-circle-outline" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  activeFilter: string;
  onFilterChange: (f: FilterConfig) => void;
  showGrid: boolean;
  onGridToggle: () => void;
  showMirror: boolean;
  onMirrorToggle: () => void;
  timer: TimerValue;
  onTimerChange: (t: TimerValue) => void;
  speed: string;
  onSpeedChange: (s: string) => void;
  showBeauty: boolean;
  onBeautyToggle: () => void;
}

function FilterSwatch({ filter, active, onPress }: { filter: FilterConfig; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.swatchWrap} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.swatchOuter, active && { borderColor: "#7C3AED", borderWidth: 2.5 }]}>
        {filter.id === "none" ? (
          <View style={[styles.swatchInner, { backgroundColor: "#1F1035" }]}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
          </View>
        ) : (
          <View style={[styles.swatchInner, { backgroundColor: "#1F1035" }]}>
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: filter.blendHex, opacity: filter.opacity * 3, borderRadius: 10 },
              ]}
            />
            <Ionicons name="image-outline" size={14} color="rgba(255,255,255,0.7)" />
          </View>
        )}
      </View>
      <Text style={[styles.swatchLabel, active && { color: "#7C3AED" }]}>{filter.label}</Text>
    </TouchableOpacity>
  );
}

function ToggleRow({
  icon, label, sub, active, onPress, badge, color,
}: {
  icon: string; label: string; sub?: string; active: boolean; onPress: () => void; badge?: string; color?: string;
}) {
  const c = useColors();
  return (
    <TouchableOpacity onPress={onPress} style={[styles.toggleRow, { borderColor: c.border }]}>
      <View style={[styles.toggleIcon, { backgroundColor: (color || "#7C3AED") + "22" }]}>
        <Ionicons name={icon as any} size={20} color={color || "#7C3AED"} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.toggleLabel, { color: c.foreground }]}>{label}</Text>
        {sub && <Text style={[styles.toggleSub, { color: c.mutedForeground }]}>{sub}</Text>}
        {badge && (
          <View style={styles.nativeBadge}>
            <Text style={styles.nativeBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <View style={[styles.toggleSwitch, active && { backgroundColor: "#7C3AED" }]}>
        <View style={[styles.toggleKnob, active && { transform: [{ translateX: 18 }] }]} />
      </View>
    </TouchableOpacity>
  );
}

export function EffectsPickerSheet({
  visible, onClose,
  activeFilter, onFilterChange,
  showGrid, onGridToggle,
  showMirror, onMirrorToggle,
  timer, onTimerChange,
  speed, onSpeedChange,
  showBeauty, onBeautyToggle,
}: Props) {
  const colors = useColors();
  const slideAnim = useRef(new Animated.Value(H)).current;
  const [tab, setTab] = useState<"filters" | "effects">("filters");

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: H, duration: 260, useNativeDriver: true }).start();
    }
  }, [visible]);

  const TIMERS: TimerValue[] = [0, 3, 5, 10];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={[styles.sheet, { backgroundColor: colors.background, transform: [{ translateY: slideAnim }] }]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Effects & Filters</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.doneBtn}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabRow}>
          {(["filters", "effects"] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tabPill, tab === t && { backgroundColor: "#7C3AED" }]}>
              <Text style={[styles.tabText, { color: tab === t ? "#fff" : colors.mutedForeground }]}>
                {t === "filters" ? "🎨 Filters" : "✨ Effects"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          {tab === "filters" ? (
            <View style={{ padding: 16 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Color Filters</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
                {FILTERS.map((f) => (
                  <FilterSwatch
                    key={f.id}
                    filter={f}
                    active={activeFilter === f.id}
                    onPress={() => onFilterChange(f)}
                  />
                ))}
              </ScrollView>

              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>Beauty</Text>
              <ToggleRow
                icon="sparkles-outline"
                label="Beauty Filter"
                sub="Smooth skin and soft lighting"
                active={showBeauty}
                onPress={onBeautyToggle}
                color="#EC4899"
              />

              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>Advanced</Text>
              {[
                { icon: "person-circle-outline", label: "Big Head", sub: "Face magnify effect", badge: "📱 Mobile Only" },
                { icon: "copy-outline", label: "Mirror", sub: "Horizontal mirror split", badge: null },
                { icon: "flash-outline", label: "Glitch", sub: "Retro digital glitch", badge: null },
                { icon: "blur", label: "Blur Background", sub: "Depth of field blur", badge: "📱 Mobile Only" },
                { icon: "color-filter-outline", label: "Green Screen", sub: "Replace background", badge: "📱 Mobile Only" },
              ].map((e) => (
                <ToggleRow
                  key={e.label}
                  icon={e.icon as any}
                  label={e.label}
                  sub={e.sub}
                  active={e.label === "Mirror" ? showMirror : false}
                  onPress={e.label === "Mirror" ? onMirrorToggle : () => {}}
                  badge={e.badge || undefined}
                  color="#7C3AED"
                />
              ))}
            </View>
          ) : (
            <View style={{ padding: 16 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Timer</Text>
              <View style={styles.timerRow}>
                {TIMERS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => onTimerChange(t)}
                    style={[styles.timerPill, timer === t && { backgroundColor: "#7C3AED" }]}
                  >
                    <Ionicons name="timer-outline" size={14} color={timer === t ? "#fff" : colors.mutedForeground} />
                    <Text style={[styles.timerText, { color: timer === t ? "#fff" : colors.mutedForeground }]}>
                      {t === 0 ? "Off" : `${t}s`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>Speed</Text>
              <View style={styles.timerRow}>
                {SPEED_OPTIONS.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => onSpeedChange(s.id)}
                    style={[styles.timerPill, { flex: 1 }, speed === s.id && { backgroundColor: "#7C3AED" }]}
                  >
                    <Ionicons name={s.icon as any} size={14} color={speed === s.id ? "#fff" : colors.mutedForeground} />
                    <Text style={[styles.timerText, { color: speed === s.id ? "#fff" : colors.mutedForeground }]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>Overlays</Text>
              <ToggleRow
                icon="grid-outline"
                label="Grid"
                sub="Alignment guide overlay"
                active={showGrid}
                onPress={onGridToggle}
                color="#10B981"
              />
              <ToggleRow
                icon="camera-reverse-outline"
                label="Mirror View"
                sub="Flip viewfinder horizontally"
                active={showMirror}
                onPress={onMirrorToggle}
                color="#3B82F6"
              />

              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>Video Modes</Text>
              {[
                { icon: "repeat-outline", label: "Boomerang", sub: "Loop back and forth", color: "#F97316" },
                { icon: "film-outline", label: "Slow Motion", sub: "0.5x playback speed", color: "#8B5CF6" },
                { icon: "play-skip-forward-outline", label: "Fast Forward", sub: "2x playback speed", color: "#EF4444" },
              ].map((e) => (
                <ToggleRow
                  key={e.label}
                  icon={e.icon as any}
                  label={e.label}
                  sub={e.sub}
                  active={
                    (e.label === "Slow Motion" && speed === "half") ||
                    (e.label === "Fast Forward" && speed === "double")
                  }
                  onPress={() => {
                    if (e.label === "Slow Motion") onSpeedChange(speed === "half" ? "normal" : "half");
                    if (e.label === "Fast Forward") onSpeedChange(speed === "double" ? "normal" : "double");
                  }}
                  color={e.color}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: H * 0.78,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: "hidden",
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  sheetTitle: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  doneBtn: { color: "#7C3AED", fontSize: 15, fontFamily: "Poppins_700Bold" },
  tabRow: { flexDirection: "row", gap: 8, padding: 12, paddingBottom: 6 },
  tabPill: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 9, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)",
  },
  tabText: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  sectionTitle: { fontSize: 14, fontFamily: "Poppins_700Bold", marginBottom: 10 },
  swatchWrap: { alignItems: "center", gap: 6, width: 64 },
  swatchOuter: { borderRadius: 12, borderWidth: 2, borderColor: "transparent" },
  swatchInner: {
    width: 56, height: 56, borderRadius: 10,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  swatchLabel: { fontSize: 11, fontFamily: "Poppins_500Medium", color: "rgba(255,255,255,0.7)" },
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, borderBottomWidth: 0.5,
  },
  toggleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toggleLabel: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  toggleSub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  nativeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(249,115,22,0.18)",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2,
  },
  nativeBadgeText: { color: "#F97316", fontSize: 10, fontFamily: "Poppins_600SemiBold" },
  toggleSwitch: {
    width: 40, height: 22, borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.15)",
    padding: 2, justifyContent: "center",
  },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff" },
  timerRow: { flexDirection: "row", gap: 8 },
  timerPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  timerText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
});
