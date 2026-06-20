import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
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

const { width: W, height: H } = Dimensions.get("window");
const PARTICLE_COUNT = 12;

export interface StoryFilter {
  id: string;
  label: string;
  emoji: string;
  color: string;
  opacity: number;
}

export type ParticleType = "snow" | "sparkles" | "confetti" | "hearts";

export const STORY_FILTERS: StoryFilter[] = [
  { id: "warm",      label: "Warm",      emoji: "🌅", color: "#F97316", opacity: 0.22 },
  { id: "cool",      label: "Cool",      emoji: "🩵", color: "#3B82F6", opacity: 0.20 },
  { id: "moody",     label: "Moody",     emoji: "🌙", color: "#7C3AED", opacity: 0.25 },
  { id: "cinematic", label: "Cinematic", emoji: "🎬", color: "#000000", opacity: 0.30 },
  { id: "fade",      label: "Fade",      emoji: "🤍", color: "#E5E7EB", opacity: 0.18 },
  { id: "golden",    label: "Golden",    emoji: "✨", color: "#FBBF24", opacity: 0.20 },
  { id: "noir",      label: "Noir",      emoji: "🖤", color: "#1F2937", opacity: 0.40 },
];

export const PARTICLE_TYPES: { id: ParticleType; label: string; emoji: string }[] = [
  { id: "snow",     label: "Snow",     emoji: "❄️" },
  { id: "sparkles", label: "Sparkles", emoji: "✨" },
  { id: "confetti", label: "Confetti", emoji: "🎊" },
  { id: "hearts",   label: "Hearts",   emoji: "❤️" },
];

const PARTICLE_EMOJI: Record<ParticleType, string> = {
  snow:     "❄",
  sparkles: "✨",
  confetti: "🎊",
  hearts:   "❤️",
};

function SingleSparkle({ index }: { index: number }) {
  const xPos = useRef(Math.random() * (W - 20)).current;
  const yPos = useRef(Math.random() * (H * 0.75)).current;
  const delay = useRef(index * Math.floor(3000 / PARTICLE_COUNT)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 650, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.5, duration: 500, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.5, duration: 500, useNativeDriver: true }),
          ]),
        ]),
        Animated.delay(400 + Math.random() * 800),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: xPos,
        top: yPos,
        opacity,
        transform: [{ scale }],
      }}
      pointerEvents="none"
    >
      <Text style={{ fontSize: 16 }}>✨</Text>
    </Animated.View>
  );
}

function SingleFaller({ type, index }: { type: "snow" | "confetti" | "hearts"; index: number }) {
  const xPos = useRef(Math.random() * (W - 20)).current;
  const delay = useRef(index * Math.floor(5000 / PARTICLE_COUNT)).current;
  const duration = useRef(3200 + Math.random() * 2200).current;
  const yAnim = useRef(new Animated.Value(-20)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: duration - 800, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
          ]),
          Animated.timing(yAnim, { toValue: H + 20, duration, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const size = type === "hearts" ? 18 : type === "snow" ? 14 : 16;
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: xPos,
        top: 0,
        opacity,
        transform: [{ translateY: yAnim }],
      }}
      pointerEvents="none"
    >
      <Text style={{ fontSize: size }}>{PARTICLE_EMOJI[type]}</Text>
    </Animated.View>
  );
}

export function ParticleOverlay({ type }: { type: ParticleType | null }) {
  if (!type) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: PARTICLE_COUNT }, (_, i) =>
        type === "sparkles"
          ? <SingleSparkle key={i} index={i} />
          : <SingleFaller key={i} type={type} index={i} />
      )}
    </View>
  );
}

export function FilterOverlay({ filter }: { filter: StoryFilter | null }) {
  if (!filter) return null;
  if (filter.id === "cinematic") {
    return (
      <>
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.22)" }]}
          pointerEvents="none"
        />
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 72, backgroundColor: "#000" }}
          pointerEvents="none"
        />
        <View
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 72, backgroundColor: "#000" }}
          pointerEvents="none"
        />
      </>
    );
  }
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: filter.color, opacity: filter.opacity }]}
      pointerEvents="none"
    />
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedFilter: StoryFilter | null;
  selectedParticle: ParticleType | null;
  onSelectFilter: (f: StoryFilter | null) => void;
  onSelectParticle: (p: ParticleType | null) => void;
}

export function StoryEffectsSheet({
  visible,
  onClose,
  selectedFilter,
  selectedParticle,
  onSelectFilter,
  onSelectParticle,
}: Props) {
  useColors();
  const slideAnim = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, damping: 18, stiffness: 90, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 500, duration: 260, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[st.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={st.handle} />
        <View style={st.header}>
          <Text style={st.title}>Effects</Text>
          <TouchableOpacity onPress={onClose} style={st.closeBtn}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
          <Text style={st.sectionLabel}>Color Filters</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.row}
          >
            <TouchableOpacity
              onPress={() => onSelectFilter(null)}
              style={[st.item, !selectedFilter && st.itemActive]}
            >
              <View style={[st.circle, st.circleNone]}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.45)" />
              </View>
              <Text style={[st.label, !selectedFilter && st.labelActive]}>None</Text>
            </TouchableOpacity>
            {STORY_FILTERS.map((f) => {
              const active = selectedFilter?.id === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => onSelectFilter(active ? null : f)}
                  style={[st.item, active && st.itemActive]}
                >
                  <View style={[st.circle, { backgroundColor: f.color + "30", borderColor: active ? "#A78BFA" : f.color + "66" }]}>
                    <View style={{ ...StyleSheet.absoluteFillObject as any, backgroundColor: f.color, opacity: Math.min(f.opacity * 2.5, 0.6), borderRadius: 31 }} />
                    <Text style={st.emoji}>{f.emoji}</Text>
                  </View>
                  <Text style={[st.label, active && st.labelActive]}>{f.label}</Text>
                  {active && <View style={st.dot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[st.sectionLabel, { marginTop: 16 }]}>Animated Overlays</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.row}
          >
            <TouchableOpacity
              onPress={() => onSelectParticle(null)}
              style={[st.item, !selectedParticle && st.itemActive]}
            >
              <View style={[st.circle, st.circleNone]}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.45)" />
              </View>
              <Text style={[st.label, !selectedParticle && st.labelActive]}>None</Text>
            </TouchableOpacity>
            {PARTICLE_TYPES.map((p) => {
              const active = selectedParticle === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => onSelectParticle(active ? null : p.id)}
                  style={[st.item, active && st.itemActive]}
                >
                  <View style={[st.circle, { backgroundColor: "rgba(255,255,255,0.07)", borderColor: active ? "#A78BFA" : "rgba(255,255,255,0.14)" }]}>
                    <Text style={st.emoji}>{p.emoji}</Text>
                  </View>
                  <Text style={[st.label, active && st.labelActive]}>{p.label}</Text>
                  {active && <View style={st.dot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#0F0F1A",
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderTopWidth: 1, borderTopColor: "rgba(139,92,246,0.2)",
    paddingBottom: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center", marginTop: 10,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { flex: 1, color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  closeBtn: { padding: 6 },
  sectionLabel: {
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  row: { paddingHorizontal: 14, gap: 10, paddingVertical: 8 },
  item: { alignItems: "center", gap: 5, padding: 4, borderRadius: 14, minWidth: 70 },
  itemActive: { backgroundColor: "rgba(139,92,246,0.12)" },
  circle: {
    width: 62, height: 62, borderRadius: 31,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  circleNone: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.18)" },
  emoji: { fontSize: 26 },
  label: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_500Medium", fontSize: 10, textAlign: "center" },
  labelActive: { color: "#A78BFA" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#A78BFA" },
});
