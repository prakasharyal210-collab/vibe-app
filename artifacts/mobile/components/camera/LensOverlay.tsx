import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import RAnimated, {
  cancelAnimation,
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

const { width: W, height: H } = Dimensions.get("window");

// ── Face anchor constants (front-camera portrait selfie approximation) ────────
// These percentages target a centered face in typical selfie framing.
const FC = { x: W * 0.5, y: H * 0.30 };    // face center
const FW = W * 0.56;                          // face width
const FH = H * 0.38;                          // face height

const CROWN   = { x: FC.x,            y: FC.y - FH * 0.72 };
const EAR_L   = { x: FC.x - FW * 0.62, y: FC.y - FH * 0.30 };
const EAR_R   = { x: FC.x + FW * 0.62, y: FC.y - FH * 0.30 };
const EYE_L   = { x: FC.x - FW * 0.24, y: FC.y - FH * 0.17 };
const EYE_R   = { x: FC.x + FW * 0.24, y: FC.y - FH * 0.17 };
const NOSE    = { x: FC.x,            y: FC.y + FH * 0.04 };
const MOUTH   = { x: FC.x,            y: FC.y + FH * 0.22 };
const CHEEK_L = { x: FC.x - FW * 0.37, y: FC.y + FH * 0.09 };
const CHEEK_R = { x: FC.x + FW * 0.37, y: FC.y + FH * 0.09 };
const FOREHEAD= { x: FC.x,            y: FC.y - FH * 0.52 };

const EAR_RX = FW * 0.16;
const EAR_RY = FH * 0.21;

// ── Rashi aura colors ────────────────────────────────────────────────────────
const RASHI_COLORS: Record<string, [string, string]> = {
  aries:       ["#EF4444", "#B91C1C"],
  taurus:      ["#22C55E", "#15803D"],
  gemini:      ["#EAB308", "#A16207"],
  cancer:      ["#94A3B8", "#475569"],
  leo:         ["#F59E0B", "#D97706"],
  virgo:       ["#10B981", "#065F46"],
  libra:       ["#EC4899", "#9D174D"],
  scorpio:     ["#7C3AED", "#4C1D95"],
  sagittarius: ["#F97316", "#C2410C"],
  capricorn:   ["#92400E", "#78350F"],
  aquarius:    ["#3B82F6", "#1D4ED8"],
  pisces:      ["#14B8A6", "#0F766E"],
};
const RASHI_SYMBOLS: Record<string, string> = {
  aries: "♈", taurus: "♉", gemini: "♊", cancer: "♋",
  leo: "♌", virgo: "♍", libra: "♎", scorpio: "♏",
  sagittarius: "♐", capricorn: "♑", aquarius: "♒", pisces: "♓",
};
const CHAKRA_DATA = [
  { name: "Crown",       color: "#8B5CF6", y: H * 0.06 },
  { name: "Third Eye",   color: "#6366F1", y: H * 0.16 },
  { name: "Throat",      color: "#3B82F6", y: H * 0.28 },
  { name: "Heart",       color: "#22C55E", y: H * 0.40 },
  { name: "Solar",       color: "#EAB308", y: H * 0.52 },
  { name: "Sacral",      color: "#F97316", y: H * 0.64 },
  { name: "Root",        color: "#EF4444", y: H * 0.76 },
];

// ── Generic particle helpers ──────────────────────────────────────────────────
function usePulse(duration = 1200): SharedValue<number> {
  const sv = useSharedValue(1);
  useEffect(() => {
    sv.value = withRepeat(
      withSequence(withTiming(1.18, { duration }), withTiming(1, { duration })),
      -1, false
    );
    return () => cancelAnimation(sv);
  }, []);
  return sv;
}

function useFloat(duration = 2400, range = 8): SharedValue<number> {
  const sv = useSharedValue(0);
  useEffect(() => {
    sv.value = withRepeat(
      withSequence(withTiming(-range, { duration }), withTiming(range, { duration })),
      -1, false
    );
    return () => cancelAnimation(sv);
  }, []);
  return sv;
}

function FloatItem({
  sv, children, style, reverse = false, mult = 1,
}: {
  sv: SharedValue<number>;
  children: React.ReactNode;
  style?: object;
  reverse?: boolean;
  mult?: number;
}) {
  const m = reverse ? -mult : mult;
  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sv.value * m }] }));
  return <RAnimated.Text style={[style, animStyle]}>{children}</RAnimated.Text>;
}

function FloatViewItem({
  sv, children, style,
}: {
  sv: SharedValue<number>;
  children?: React.ReactNode;
  style?: object;
}) {
  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sv.value }] }));
  return <RAnimated.View style={[style, animStyle]}>{children}</RAnimated.View>;
}

function FallingEmoji({
  emoji, x, delay, duration, size,
}: { emoji: string; x: number; delay: number; duration: number; size: number }) {
  const y = useSharedValue(-60);
  useEffect(() => {
    y.value = withDelay(delay, withRepeat(withTiming(H + 80, { duration }), -1, false));
    return () => cancelAnimation(y);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <RAnimated.Text style={[{ position: "absolute", left: x, fontSize: size }, animStyle]}>
      {emoji}
    </RAnimated.Text>
  );
}

function RisingBubble({ x, delay }: { x: number; delay: number }) {
  const y = useSharedValue(H + 20);
  const opacity = useSharedValue(0.7);
  const size = useRef(8 + Math.floor(Math.random() * 14)).current;
  const dur = useRef(3500 + Math.random() * 2000).current;
  useEffect(() => {
    y.value = withDelay(delay, withRepeat(withTiming(-40, { duration: dur }), -1, false));
    opacity.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(0.7, { duration: dur - 1000 }),
        withTiming(0, { duration: 1000 }),
      ),
      -1,
      false,
    ));
    return () => { cancelAnimation(y); cancelAnimation(opacity); };
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));
  return (
    <RAnimated.View
      style={[{
        position: "absolute",
        left: x,
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 1.5, borderColor: "rgba(147,210,255,0.7)",
        backgroundColor: "transparent",
      }, animStyle]}
    />
  );
}

// ── Shared face elements ──────────────────────────────────────────────────────
function BlushCheeks({ color = "rgba(251,113,133,0.45)" }: { color?: string }) {
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Ellipse cx={CHEEK_L.x} cy={CHEEK_L.y} rx={30} ry={18} fill={color} />
      <Ellipse cx={CHEEK_R.x} cy={CHEEK_R.y} rx={30} ry={18} fill={color} />
    </Svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CUTE ANIMAL LENSES
// ════════════════════════════════════════════════════════════════════════════

function DogLens() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        {/* Left floppy ear */}
        <Ellipse cx={EAR_L.x}    cy={EAR_L.y + 12} rx={EAR_RX * 1.15} ry={EAR_RY * 1.4} fill="#92400E" />
        <Ellipse cx={EAR_L.x}    cy={EAR_L.y + 18} rx={EAR_RX * 0.75} ry={EAR_RY * 1.1} fill="#B45309" />
        {/* Right floppy ear */}
        <Ellipse cx={EAR_R.x}    cy={EAR_R.y + 12} rx={EAR_RX * 1.15} ry={EAR_RY * 1.4} fill="#92400E" />
        <Ellipse cx={EAR_R.x}    cy={EAR_R.y + 18} rx={EAR_RX * 0.75} ry={EAR_RY * 1.1} fill="#B45309" />
        {/* Dog nose */}
        <Ellipse cx={NOSE.x}     cy={NOSE.y - 2}   rx={22}             ry={14}            fill="#1C1917" />
        <Ellipse cx={NOSE.x - 7} cy={NOSE.y}        rx={5}              ry={5}             fill="#0C0A09" />
        <Ellipse cx={NOSE.x + 7} cy={NOSE.y}        rx={5}              ry={5}             fill="#0C0A09" />
        <Ellipse cx={NOSE.x - 5} cy={NOSE.y - 4}   rx={4}              ry={3}             fill="rgba(255,255,255,0.3)" />
        {/* Cheek blush */}
        <Ellipse cx={CHEEK_L.x}  cy={CHEEK_L.y}    rx={28}             ry={16}            fill="rgba(252,165,165,0.5)" />
        <Ellipse cx={CHEEK_R.x}  cy={CHEEK_R.y}    rx={28}             ry={16}            fill="rgba(252,165,165,0.5)" />
      </Svg>
      {/* Tongue */}
      <Text style={{ position: "absolute", left: MOUTH.x - 18, top: MOUTH.y - 6, fontSize: 36 }}>👅</Text>
    </View>
  );
}

function CatLens() {
  const WLEN = FW * 0.28;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        {/* Left cat ear */}
        <Path
          d={`M${EAR_L.x - 24} ${EAR_L.y + 28} L${EAR_L.x} ${EAR_L.y - 38} L${EAR_L.x + 24} ${EAR_L.y + 28} Z`}
          fill="#6B21A8"
        />
        <Path
          d={`M${EAR_L.x - 14} ${EAR_L.y + 22} L${EAR_L.x} ${EAR_L.y - 22} L${EAR_L.x + 14} ${EAR_L.y + 22} Z`}
          fill="#EC4899"
        />
        {/* Right cat ear */}
        <Path
          d={`M${EAR_R.x - 24} ${EAR_R.y + 28} L${EAR_R.x} ${EAR_R.y - 38} L${EAR_R.x + 24} ${EAR_R.y + 28} Z`}
          fill="#6B21A8"
        />
        <Path
          d={`M${EAR_R.x - 14} ${EAR_R.y + 22} L${EAR_R.x} ${EAR_R.y - 22} L${EAR_R.x + 14} ${EAR_R.y + 22} Z`}
          fill="#EC4899"
        />
        {/* Cat nose (heart shape approximation) */}
        <Path
          d={`M${NOSE.x} ${NOSE.y + 8} C${NOSE.x - 14} ${NOSE.y - 4} ${NOSE.x - 14} ${NOSE.y - 12} ${NOSE.x} ${NOSE.y - 2} C${NOSE.x + 14} ${NOSE.y - 12} ${NOSE.x + 14} ${NOSE.y - 4} ${NOSE.x} ${NOSE.y + 8} Z`}
          fill="#F472B6"
        />
        {/* Whiskers left */}
        <Line x1={CHEEK_L.x - 30} y1={NOSE.y - 5} x2={CHEEK_L.x + 10} y2={NOSE.y - 3} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />
        <Line x1={CHEEK_L.x - 30} y1={NOSE.y + 3} x2={CHEEK_L.x + 10} y2={NOSE.y + 4} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />
        <Line x1={CHEEK_L.x - 28} y1={NOSE.y + 11} x2={CHEEK_L.x + 10} y2={NOSE.y + 10} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />
        {/* Whiskers right */}
        <Line x1={CHEEK_R.x + 30} y1={NOSE.y - 5} x2={CHEEK_R.x - 10} y2={NOSE.y - 3} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />
        <Line x1={CHEEK_R.x + 30} y1={NOSE.y + 3} x2={CHEEK_R.x - 10} y2={NOSE.y + 4} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />
        <Line x1={CHEEK_R.x + 28} y1={NOSE.y + 11} x2={CHEEK_R.x - 10} y2={NOSE.y + 10} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />
        {/* Blush */}
        <Ellipse cx={CHEEK_L.x} cy={CHEEK_L.y} rx={26} ry={15} fill="rgba(251,113,133,0.4)" />
        <Ellipse cx={CHEEK_R.x} cy={CHEEK_R.y} rx={26} ry={15} fill="rgba(251,113,133,0.4)" />
      </Svg>
    </View>
  );
}

function BunnyLens() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        {/* Left bunny ear */}
        <Ellipse cx={FC.x - FW * 0.22} cy={CROWN.y - 30} rx={EAR_RX * 0.65} ry={EAR_RY * 2.0} fill="#F8FAFC" />
        <Ellipse cx={FC.x - FW * 0.22} cy={CROWN.y - 28} rx={EAR_RX * 0.35} ry={EAR_RY * 1.6} fill="#FDA4AF" />
        {/* Right bunny ear */}
        <Ellipse cx={FC.x + FW * 0.22} cy={CROWN.y - 30} rx={EAR_RX * 0.65} ry={EAR_RY * 2.0} fill="#F8FAFC" />
        <Ellipse cx={FC.x + FW * 0.22} cy={CROWN.y - 28} rx={EAR_RX * 0.35} ry={EAR_RY * 1.6} fill="#FDA4AF" />
        {/* Bunny nose */}
        <Ellipse cx={NOSE.x} cy={NOSE.y} rx={10} ry={7} fill="#FDA4AF" />
        {/* Whiskers left */}
        <Line x1={CHEEK_L.x - 28} y1={NOSE.y - 2} x2={CHEEK_L.x + 8} y2={NOSE.y}  stroke="rgba(255,255,255,0.8)" strokeWidth={1.5} />
        <Line x1={CHEEK_L.x - 28} y1={NOSE.y + 7} x2={CHEEK_L.x + 8} y2={NOSE.y + 6} stroke="rgba(255,255,255,0.8)" strokeWidth={1.5} />
        {/* Whiskers right */}
        <Line x1={CHEEK_R.x + 28} y1={NOSE.y - 2} x2={CHEEK_R.x - 8} y2={NOSE.y}  stroke="rgba(255,255,255,0.8)" strokeWidth={1.5} />
        <Line x1={CHEEK_R.x + 28} y1={NOSE.y + 7} x2={CHEEK_R.x - 8} y2={NOSE.y + 6} stroke="rgba(255,255,255,0.8)" strokeWidth={1.5} />
        {/* Blush */}
        <Ellipse cx={CHEEK_L.x} cy={CHEEK_L.y} rx={26} ry={15} fill="rgba(252,165,165,0.55)" />
        <Ellipse cx={CHEEK_R.x} cy={CHEEK_R.y} rx={26} ry={15} fill="rgba(252,165,165,0.55)" />
      </Svg>
    </View>
  );
}

function BearLens() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        {/* Round ears */}
        <Circle cx={EAR_L.x} cy={EAR_L.y} r={EAR_RX * 1.1} fill="#7C2D12" />
        <Circle cx={EAR_L.x} cy={EAR_L.y} r={EAR_RX * 0.65} fill="#92400E" />
        <Circle cx={EAR_R.x} cy={EAR_R.y} r={EAR_RX * 1.1} fill="#7C2D12" />
        <Circle cx={EAR_R.x} cy={EAR_R.y} r={EAR_RX * 0.65} fill="#92400E" />
        {/* Bear snout */}
        <Ellipse cx={NOSE.x} cy={NOSE.y + 4} rx={30} ry={22} fill="rgba(217,119,6,0.3)" />
        {/* Bear nose */}
        <Ellipse cx={NOSE.x} cy={NOSE.y - 2} rx={16} ry={10} fill="#1C1917" />
        <Ellipse cx={NOSE.x - 4} cy={NOSE.y - 5} rx={4} ry={3} fill="rgba(255,255,255,0.3)" />
        {/* Cheeks */}
        <Ellipse cx={CHEEK_L.x} cy={CHEEK_L.y} rx={26} ry={15} fill="rgba(254,202,202,0.5)" />
        <Ellipse cx={CHEEK_R.x} cy={CHEEK_R.y} rx={26} ry={15} fill="rgba(254,202,202,0.5)" />
      </Svg>
    </View>
  );
}

function DeerLens() {
  const AX = FC.x;
  const AY = CROWN.y;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        {/* Left antler */}
        <Path d={`M${AX - 26} ${AY + 10} C${AX - 46} ${AY - 30} ${AX - 60} ${AY - 10} ${AX - 70} ${AY - 50}`}
          stroke="#92400E" strokeWidth={7} fill="none" strokeLinecap="round" />
        <Path d={`M${AX - 55} ${AY - 20} C${AX - 65} ${AY - 35} ${AX - 75} ${AY - 28} ${AX - 82} ${AY - 45}`}
          stroke="#92400E" strokeWidth={5} fill="none" strokeLinecap="round" />
        <Path d={`M${AX - 46} ${AY - 10} C${AX - 50} ${AY - 22} ${AX - 44} ${AY - 30} ${AX - 48} ${AY - 42}`}
          stroke="#92400E" strokeWidth={4} fill="none" strokeLinecap="round" />
        {/* Right antler */}
        <Path d={`M${AX + 26} ${AY + 10} C${AX + 46} ${AY - 30} ${AX + 60} ${AY - 10} ${AX + 70} ${AY - 50}`}
          stroke="#92400E" strokeWidth={7} fill="none" strokeLinecap="round" />
        <Path d={`M${AX + 55} ${AY - 20} C${AX + 65} ${AY - 35} ${AX + 75} ${AY - 28} ${AX + 82} ${AY - 45}`}
          stroke="#92400E" strokeWidth={5} fill="none" strokeLinecap="round" />
        <Path d={`M${AX + 46} ${AY - 10} C${AX + 50} ${AY - 22} ${AX + 44} ${AY - 30} ${AX + 48} ${AY - 42}`}
          stroke="#92400E" strokeWidth={4} fill="none" strokeLinecap="round" />
        {/* Deer nose */}
        <Circle cx={NOSE.x} cy={NOSE.y} r={9} fill="#1C1917" />
        {/* Freckles */}
        {[[-18, -6], [18, -6], [-22, 4], [22, 4], [-10, 10], [10, 10]].map(([dx, dy], i) => (
          <Circle key={i} cx={NOSE.x + dx} cy={NOSE.y + 20 + dy} r={3} fill="rgba(146,64,14,0.55)" />
        ))}
        {/* Sparkle eyes */}
        <Circle cx={EYE_L.x} cy={EYE_L.y} r={10} fill="rgba(255,255,255,0.35)" />
        <Circle cx={EYE_R.x} cy={EYE_R.y} r={10} fill="rgba(255,255,255,0.35)" />
        {/* Blush */}
        <Ellipse cx={CHEEK_L.x} cy={CHEEK_L.y} rx={24} ry={14} fill="rgba(252,165,165,0.45)" />
        <Ellipse cx={CHEEK_R.x} cy={CHEEK_R.y} rx={24} ry={14} fill="rgba(252,165,165,0.45)" />
      </Svg>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BEAUTY LENSES
// ════════════════════════════════════════════════════════════════════════════

function NaturalGlowLens() {
  const floatY = useFloat(2200, 6);
  const sparkles = ["✨", "⭐", "✨", "🌟", "✨"];
  const positions = [
    { x: W * 0.12, y: H * 0.15 }, { x: W * 0.80, y: H * 0.18 },
    { x: W * 0.05, y: H * 0.45 }, { x: W * 0.88, y: H * 0.40 },
    { x: W * 0.50, y: H * 0.08 },
  ];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,240,220,0.12)" }]} />
      {sparkles.map((s, i) => (
        <FloatItem
          key={i}
          sv={floatY}
          mult={i % 2 === 0 ? 1 : -1}
          style={{ position: "absolute", left: positions[i].x, top: positions[i].y, fontSize: 20 + (i % 3) * 4 }}
        >
          {s}
        </FloatItem>
      ))}
      <BlushCheeks color="rgba(251,191,36,0.18)" />
    </View>
  );
}

function FullGlamLens() {
  const floatY = useFloat(1800, 5);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={["rgba(124,58,237,0.18)", "transparent", "rgba(234,88,12,0.12)"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Smoky eye tint */}
      <Svg width={W} height={H}>
        <Ellipse cx={EYE_L.x} cy={EYE_L.y} rx={28} ry={14} fill="rgba(88,28,135,0.35)" />
        <Ellipse cx={EYE_R.x} cy={EYE_R.y} rx={28} ry={14} fill="rgba(88,28,135,0.35)" />
        <Ellipse cx={EYE_L.x} cy={EYE_L.y + 2} rx={22} ry={10} fill="rgba(167,139,250,0.2)" />
        <Ellipse cx={EYE_R.x} cy={EYE_R.y + 2} rx={22} ry={10} fill="rgba(167,139,250,0.2)" />
        {/* Lip highlight */}
        <Ellipse cx={MOUTH.x} cy={MOUTH.y} rx={30} ry={12} fill="rgba(220,38,38,0.4)" />
      </Svg>
      {["✨", "💫", "⭐", "✨"].map((s, i) => (
        <FloatItem
          key={i}
          sv={floatY}
          style={{
            position: "absolute",
            left: [W * 0.08, W * 0.85, W * 0.04, W * 0.90][i],
            top:  [H * 0.20, H * 0.22, H * 0.38, H * 0.35][i],
            fontSize: 18 + i * 2,
          }}
        >
          {s}
        </FloatItem>
      ))}
    </View>
  );
}

function KoreanBeautyLens() {
  const positions = useRef(
    Array.from({ length: 8 }, () => Math.random() * (W - 30))
  ).current;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(253,242,248,0.10)" }]} />
      <BlushCheeks color="rgba(249,168,212,0.5)" />
      {positions.map((x, i) => (
        <FallingEmoji
          key={i}
          emoji="🌸"
          x={x}
          delay={i * 600}
          duration={3500 + i * 200}
          size={14 + i % 4 * 3}
        />
      ))}
    </View>
  );
}

function BoldLipLens() {
  const pulse = usePulse(900);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        {/* Lower face red tint */}
        <Ellipse cx={MOUTH.x} cy={MOUTH.y + 4} rx={42} ry={18} fill="rgba(220,38,38,0.55)" />
        <Ellipse cx={MOUTH.x} cy={MOUTH.y - 4} rx={36} ry={12} fill="rgba(239,68,68,0.35)" />
        {/* Lip shine */}
        <Ellipse cx={MOUTH.x - 6} cy={MOUTH.y - 6} rx={10} ry={4} fill="rgba(255,255,255,0.28)" />
      </Svg>
      <RAnimated.Text style={[{ position: "absolute", left: W * 0.04, top: H * 0.06, fontSize: 22 }, pulseStyle]}>
        💋
      </RAnimated.Text>
    </View>
  );
}

function EyeColorLens() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        <Defs>
          <RadialGradient id="lb" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#60A5FA" stopOpacity="0.7" />
            <Stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.4" />
          </RadialGradient>
          <RadialGradient id="rb" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#60A5FA" stopOpacity="0.7" />
            <Stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.4" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={EYE_L.x} cy={EYE_L.y} rx={18} ry={14} fill="url(#lb)" />
        <Ellipse cx={EYE_R.x} cy={EYE_R.y} rx={18} ry={14} fill="url(#rb)" />
        <Circle cx={EYE_L.x} cy={EYE_L.y} r={6} fill="rgba(0,0,0,0.5)" />
        <Circle cx={EYE_R.x} cy={EYE_R.y} r={6} fill="rgba(0,0,0,0.5)" />
        <Circle cx={EYE_L.x + 5} cy={EYE_L.y - 4} r={3} fill="rgba(255,255,255,0.5)" />
        <Circle cx={EYE_R.x + 5} cy={EYE_R.y - 4} r={3} fill="rgba(255,255,255,0.5)" />
      </Svg>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FUN LENSES
// ════════════════════════════════════════════════════════════════════════════

function FlowerCrownLens() {
  const floatY = useFloat(2000, 4);
  const flowers = ["🌸", "🌺", "🌼", "🌸", "🌹", "🌼", "🌸"];
  const spacing = FW * 1.1 / (flowers.length - 1);
  const startX  = FC.x - FW * 0.55;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {flowers.map((f, i) => (
        <FloatItem
          key={i}
          sv={floatY}
          mult={i % 3 === 0 ? 1 : -0.6}
          style={{ position: "absolute", left: startX + i * spacing - 14, top: CROWN.y - 10, fontSize: i % 2 === 1 ? 26 : 20 }}
        >
          {f}
        </FloatItem>
      ))}
    </View>
  );
}

function CryingSparklesLens() {
  const STAR_COUNT = 10;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {[...Array(STAR_COUNT)].map((_, i) => {
        const fromEye = i % 2 === 0 ? EYE_L : EYE_R;
        return (
          <FallingEmoji
            key={i}
            emoji={i % 3 === 0 ? "⭐" : i % 3 === 1 ? "✨" : "💫"}
            x={fromEye.x - 8 + (i % 5) * 4}
            delay={i * 280}
            duration={1600 + i * 100}
            size={12 + i % 4 * 3}
          />
        );
      })}
      <Svg width={W} height={H}>
        <Ellipse cx={EYE_L.x} cy={EYE_L.y + 14} rx={6} ry={8} fill="rgba(147,210,255,0.7)" />
        <Ellipse cx={EYE_R.x} cy={EYE_R.y + 14} rx={6} ry={8} fill="rgba(147,210,255,0.7)" />
      </Svg>
    </View>
  );
}

function RainbowMouthLens() {
  const floatY = useFloat(1600, 5);
  const fwdStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
  const revStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -floatY.value }] }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <RAnimated.View
        style={[{
          position: "absolute",
          left: MOUTH.x - 55,
          top: MOUTH.y - 18,
          width: 110,
          height: 36,
          borderRadius: 18,
          overflow: "hidden",
        }, fwdStyle]}
      >
        <LinearGradient
          colors={["#EF4444", "#F97316", "#EAB308", "#22C55E", "#3B82F6", "#8B5CF6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, opacity: 0.75 }}
        />
      </RAnimated.View>
      {["🌈", "🌈"].map((e, i) => (
        <RAnimated.Text
          key={i}
          style={[{
            position: "absolute",
            left: i === 0 ? W * 0.06 : W * 0.82,
            top: H * 0.38,
            fontSize: 28,
          }, i === 0 ? fwdStyle : revStyle]}
        >
          {e}
        </RAnimated.Text>
      ))}
    </View>
  );
}

function GiantEyesLens() {
  const pulse = usePulse(1600);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        {/* Giant cartoon eyes */}
        <Ellipse cx={EYE_L.x} cy={EYE_L.y} rx={36} ry={28} fill="white" />
        <Ellipse cx={EYE_R.x} cy={EYE_R.y} rx={36} ry={28} fill="white" />
        <Circle cx={EYE_L.x + 4} cy={EYE_L.y + 2} r={20} fill="#7C3AED" />
        <Circle cx={EYE_R.x + 4} cy={EYE_R.y + 2} r={20} fill="#7C3AED" />
        <Circle cx={EYE_L.x + 4} cy={EYE_L.y + 2} r={12} fill="#1C1917" />
        <Circle cx={EYE_R.x + 4} cy={EYE_R.y + 2} r={12} fill="#1C1917" />
        {/* Sparkle reflections */}
        <Circle cx={EYE_L.x - 6} cy={EYE_L.y - 6} r={5} fill="white" />
        <Circle cx={EYE_R.x - 6} cy={EYE_R.y - 6} r={5} fill="white" />
        <Circle cx={EYE_L.x + 10} cy={EYE_L.y + 6} r={3} fill="white" />
        <Circle cx={EYE_R.x + 10} cy={EYE_R.y + 6} r={3} fill="white" />
      </Svg>
      <RAnimated.Text style={[{ position: "absolute", left: W * 0.82, top: H * 0.20, fontSize: 20 }, pulseStyle]}>
        ✨
      </RAnimated.Text>
    </View>
  );
}

function NeonGlowLens() {
  const pulse = usePulse(800);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const NEON_COLORS = ["#A78BFA", "#F97316", "#34D399"];
  const color = NEON_COLORS[0];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <RAnimated.View
        style={[
          {
            position: "absolute",
            left: FC.x - FW * 0.55,
            top: CROWN.y - 10,
            width: FW * 1.1,
            height: FH * 1.15,
            borderRadius: FW * 0.55,
            borderWidth: 3,
            borderColor: color,
          },
          {
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 20,
            elevation: 10,
          },
          pulseStyle,
        ]}
      />
      <Svg width={W} height={H}>
        {/* Neon lip */}
        <Ellipse cx={MOUTH.x} cy={MOUTH.y} rx={34} ry={11} stroke={color} strokeWidth={2} fill="transparent" />
        {/* Neon eye liner */}
        <Ellipse cx={EYE_L.x} cy={EYE_L.y} rx={22} ry={10} stroke="#F97316" strokeWidth={1.5} fill="transparent" />
        <Ellipse cx={EYE_R.x} cy={EYE_R.y} rx={22} ry={10} stroke="#F97316" strokeWidth={1.5} fill="transparent" />
      </Svg>
    </View>
  );
}

function AgeFilterLens() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(180,150,100,0.22)" }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.06)" }]} />
      <Svg width={W} height={H}>
        {/* Simulated wrinkle lines */}
        <Path d={`M${FOREHEAD.x - 60} ${FOREHEAD.y + 10} Q${FOREHEAD.x} ${FOREHEAD.y + 4} ${FOREHEAD.x + 60} ${FOREHEAD.y + 10}`}
          stroke="rgba(0,0,0,0.2)" strokeWidth={1.5} fill="none" />
        <Path d={`M${FOREHEAD.x - 50} ${FOREHEAD.y + 22} Q${FOREHEAD.x} ${FOREHEAD.y + 16} ${FOREHEAD.x + 50} ${FOREHEAD.y + 22}`}
          stroke="rgba(0,0,0,0.15)" strokeWidth={1} fill="none" />
        <Path d={`M${EYE_L.x - 14} ${EYE_L.y + 14} Q${EYE_L.x} ${EYE_L.y + 18} ${EYE_L.x + 14} ${EYE_L.y + 14}`}
          stroke="rgba(0,0,0,0.2)" strokeWidth={1} fill="none" />
        <Path d={`M${EYE_R.x - 14} ${EYE_R.y + 14} Q${EYE_R.x} ${EYE_R.y + 18} ${EYE_R.x + 14} ${EYE_R.y + 14}`}
          stroke="rgba(0,0,0,0.2)" strokeWidth={1} fill="none" />
      </Svg>
      <Text style={{ position: "absolute", right: 16, top: H * 0.08, color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_500Medium", fontSize: 11 }}>
        📷 Vintage
      </Text>
    </View>
  );
}

function AnimeLens() {
  const floatY = useFloat(2000, 5);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        {/* Big anime eyes */}
        <Ellipse cx={EYE_L.x} cy={EYE_L.y} rx={28} ry={20} fill="rgba(255,255,255,0.9)" />
        <Ellipse cx={EYE_R.x} cy={EYE_R.y} rx={28} ry={20} fill="rgba(255,255,255,0.9)" />
        <Ellipse cx={EYE_L.x} cy={EYE_L.y + 2} rx={22} ry={16} fill="#7C3AED" />
        <Ellipse cx={EYE_R.x} cy={EYE_R.y + 2} rx={22} ry={16} fill="#7C3AED" />
        <Ellipse cx={EYE_L.x} cy={EYE_L.y + 2} rx={14} ry={12} fill="#1C1917" />
        <Ellipse cx={EYE_R.x} cy={EYE_R.y + 2} rx={14} ry={12} fill="#1C1917" />
        <Ellipse cx={EYE_L.x - 6} cy={EYE_L.y - 4} rx={6} ry={5} fill="rgba(255,255,255,0.8)" />
        <Ellipse cx={EYE_R.x - 6} cy={EYE_R.y - 4} rx={6} ry={5} fill="rgba(255,255,255,0.8)" />
        {/* Anime blush marks */}
        <Rect x={CHEEK_L.x - 20} y={CHEEK_L.y - 4} width={40} height={8} rx={4} fill="rgba(251,113,133,0.55)" />
        <Rect x={CHEEK_R.x - 20} y={CHEEK_R.y - 4} width={40} height={8} rx={4} fill="rgba(251,113,133,0.55)" />
      </Svg>
      {["⭐", "✨", "💫"].map((s, i) => (
        <FloatItem
          key={i}
          sv={floatY}
          style={{
            position: "absolute",
            left: [W * 0.08, W * 0.82, W * 0.48][i],
            top:  [H * 0.16, H * 0.18, H * 0.08][i],
            fontSize: 22,
          }}
        >
          {s}
        </FloatItem>
      ))}
    </View>
  );
}

function CrownLens() {
  const floatY = useFloat(1800, 6);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <FloatViewItem sv={floatY}>
        <Svg width={W} height={H}>
          {/* Crown body */}
          <Path
            d={`M${CROWN.x - 46} ${CROWN.y + 28} L${CROWN.x - 46} ${CROWN.y - 8} L${CROWN.x - 24} ${CROWN.y + 10} L${CROWN.x} ${CROWN.y - 28} L${CROWN.x + 24} ${CROWN.y + 10} L${CROWN.x + 46} ${CROWN.y - 8} L${CROWN.x + 46} ${CROWN.y + 28} Z`}
            fill="#D97706"
            stroke="#F59E0B"
            strokeWidth={2}
          />
          {/* Crown gems */}
          <Circle cx={CROWN.x}      cy={CROWN.y - 24} r={7} fill="#EF4444" />
          <Circle cx={CROWN.x - 24} cy={CROWN.y + 14} r={5} fill="#8B5CF6" />
          <Circle cx={CROWN.x + 24} cy={CROWN.y + 14} r={5} fill="#3B82F6" />
          <Circle cx={CROWN.x - 46} cy={CROWN.y - 4}  r={4} fill="#10B981" />
          <Circle cx={CROWN.x + 46} cy={CROWN.y - 4}  r={4} fill="#10B981" />
          {/* Crown shine */}
          <Path
            d={`M${CROWN.x - 20} ${CROWN.y + 14} L${CROWN.x - 14} ${CROWN.y} L${CROWN.x + 14} ${CROWN.y} L${CROWN.x + 20} ${CROWN.y + 14} Z`}
            fill="rgba(255,255,255,0.2)"
          />
          {/* Sparkle dots */}
          <Circle cx={CROWN.x - 60} cy={CROWN.y + 10} r={2} fill="#FDE68A" opacity={0.7} />
          <Circle cx={CROWN.x + 60} cy={CROWN.y + 10} r={2} fill="#FDE68A" opacity={0.7} />
          <Circle cx={CROWN.x}      cy={CROWN.y - 44} r={2.5} fill="#FDE68A" opacity={0.8} />
        </Svg>
      </FloatViewItem>
    </View>
  );
}

function MaskSwapLens() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        {/* Circular mask over face */}
        <Circle cx={FC.x} cy={FC.y} r={FW * 0.52} fill="rgba(10,10,15,0.75)" stroke="#8B5CF6" strokeWidth={3} />
        {/* Gundruk "G" */}
        <SvgText
          x={FC.x} y={FC.y + 16}
          fontSize="72"
          fontWeight="bold"
          textAnchor="middle"
          fill="#A78BFA"
        >
          G
        </SvgText>
        {/* Outer ring */}
        <Circle cx={FC.x} cy={FC.y} r={FW * 0.52 + 10} fill="none" stroke="rgba(167,139,250,0.4)" strokeWidth={2} strokeDasharray="12,8" />
      </Svg>
    </View>
  );
}

function DistortionLens() {
  const wiggle = useSharedValue(0);
  useEffect(() => {
    wiggle.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 120 }),
        withTiming(-8, { duration: 120 }),
        withTiming(5, { duration: 90 }),
        withTiming(-5, { duration: 90 }),
        withTiming(0, { duration: 400 }),
        withTiming(0, { duration: 600 })
      ),
      -1, false
    );
    return () => cancelAnimation(wiggle);
  }, []);
  const wiggleStyle = useAnimatedStyle(() => ({
    transform: [{ skewX: `${interpolate(wiggle.value, [-8, 8], [-4, 4])}deg` }],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <RAnimated.View
        style={[{
          position: "absolute",
          left: FC.x - FW * 0.55,
          top: CROWN.y - 10,
          width: FW * 1.1,
          height: FH * 1.15,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: "rgba(167,139,250,0.5)",
        }, wiggleStyle]}
      />
      <Text style={{ position: "absolute", left: W * 0.04, top: H * 0.08, color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_600SemiBold", fontSize: 12 }}>
        🫠 Distortion
      </Text>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// WORLD / BACKGROUND LENSES
// ════════════════════════════════════════════════════════════════════════════

function SnowLens() {
  const xs = [0.05, 0.15, 0.28, 0.42, 0.55, 0.68, 0.78, 0.88, 0.12, 0.35, 0.60, 0.82, 0.22, 0.72, 0.48];
  const delays = [0, 600, 300, 900, 150, 750, 450, 1100, 200, 700, 400, 1000, 550, 250, 850];
  const durations = [3500, 4000, 3200, 4500, 3800, 3600, 4200, 3900, 4100, 3400, 4600, 3700, 4300, 3300, 4400];
  const sizes = [14, 16, 12, 18, 14, 16, 12, 14, 18, 14, 16, 12, 18, 14, 16];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {xs.map((x, i) => (
        <FallingEmoji key={i} emoji="❄️" x={W * x} delay={delays[i]} duration={durations[i]} size={sizes[i]} />
      ))}
    </View>
  );
}

function Butterfly({ x, y, idx }: { x: number; y: number; idx: number }) {
  const floatX = useSharedValue(0);
  const floatY2 = useSharedValue(0);
  const range = 25 + idx * 8;
  useEffect(() => {
    const dur = 2000 + idx * 300;
    const t = setTimeout(() => {
      floatX.value = withRepeat(
        withSequence(
          withTiming(range, { duration: dur }),
          withTiming(-range * 0.5, { duration: dur * 0.8 })
        ),
        -1, false
      );
      floatY2.value = withRepeat(
        withSequence(
          withTiming(-20, { duration: dur * 0.7 }),
          withTiming(15, { duration: dur })
        ),
        -1, false
      );
    }, idx * 200);
    return () => { clearTimeout(t); cancelAnimation(floatX); cancelAnimation(floatY2); };
  }, []);
  const flyStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: floatX.value }, { translateY: floatY2.value }],
  }));
  return (
    <RAnimated.Text style={[{ position: "absolute", left: x, top: y, fontSize: 22 + idx % 3 * 4 }, flyStyle]}>
      🦋
    </RAnimated.Text>
  );
}

function ButterfliesLens() {
  const positions = [
    { x: W * 0.08, y: H * 0.22 }, { x: W * 0.72, y: H * 0.18 },
    { x: W * 0.14, y: H * 0.55 }, { x: W * 0.78, y: H * 0.50 },
    { x: W * 0.32, y: H * 0.12 }, { x: W * 0.60, y: H * 0.10 },
    { x: W * 0.44, y: H * 0.65 }, { x: W * 0.88, y: H * 0.35 },
  ];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {positions.map((pos, i) => (
        <Butterfly key={i} x={pos.x} y={pos.y} idx={i} />
      ))}
    </View>
  );
}

function ConfettiLens() {
  const PIECES = 22;
  const colors = ["#7C3AED", "#F97316", "#EF4444", "#10B981", "#3B82F6", "#FBBF24", "#EC4899", "#A78BFA"];
  const emojis = ["🎊", "🎉", "⭐", "✨", "🌟"];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {[...Array(PIECES)].map((_, i) => (
        <FallingEmoji
          key={i}
          emoji={emojis[i % emojis.length]}
          x={(W / PIECES) * i}
          delay={i * 150}
          duration={2500 + i * 80}
          size={14 + i % 4 * 3}
        />
      ))}
    </View>
  );
}

function HaloWingsLens() {
  const floatY = useFloat(2200, 5);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        {/* Halo */}
        <Ellipse cx={CROWN.x} cy={CROWN.y - 16} rx={52} ry={16} fill="none" stroke="#F59E0B" strokeWidth={6} opacity={0.9} />
        <Ellipse cx={CROWN.x} cy={CROWN.y - 16} rx={52} ry={16} fill="none" stroke="#FDE68A" strokeWidth={2} opacity={0.5} />
        {/* Left wing */}
        <Path
          d={`M${FC.x - FW * 0.55} ${FC.y - FH * 0.1}
              C${FC.x - FW * 1.4} ${FC.y - FH * 0.5}
               ${FC.x - FW * 1.5} ${FC.y + FH * 0.1}
               ${FC.x - FW * 0.6} ${FC.y + FH * 0.25}
               ${FC.x - FW * 0.55} ${FC.y - FH * 0.1} Z`}
          fill="rgba(255,255,255,0.22)"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={1.5}
        />
        {/* Right wing */}
        <Path
          d={`M${FC.x + FW * 0.55} ${FC.y - FH * 0.1}
              C${FC.x + FW * 1.4} ${FC.y - FH * 0.5}
               ${FC.x + FW * 1.5} ${FC.y + FH * 0.1}
               ${FC.x + FW * 0.6} ${FC.y + FH * 0.25}
               ${FC.x + FW * 0.55} ${FC.y - FH * 0.1} Z`}
          fill="rgba(255,255,255,0.22)"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={1.5}
        />
      </Svg>
      {["✨", "⭐"].map((s, i) => (
        <FloatItem
          key={i}
          sv={floatY}
          style={{ position: "absolute", left: i === 0 ? W * 0.05 : W * 0.86, top: H * 0.25, fontSize: 20 }}
        >{s}</FloatItem>
      ))}
    </View>
  );
}

function SpaceLens() {
  const STAR_COUNT = 30;
  const floatY = useFloat(3000, 3);
  const starPos = useRef(
    Array.from({ length: STAR_COUNT }, (_, i) => ({
      x: (W / STAR_COUNT) * i + Math.random() * (W / STAR_COUNT),
      y: Math.random() * H,
      size: 6 + Math.random() * 10,
    }))
  ).current;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(3,7,30,0.45)" }]} />
      {starPos.map((s, i) => (
        <FloatItem
          key={i}
          sv={floatY}
          mult={i % 3 === 0 ? 1 : -0.5}
          style={{ position: "absolute", left: s.x, top: s.y, fontSize: s.size, opacity: 0.6 + (i % 4) * 0.1 }}
        >
          {i % 7 === 0 ? "🌙" : i % 11 === 0 ? "🪐" : i % 5 === 0 ? "💫" : "⭐"}
        </FloatItem>
      ))}
    </View>
  );
}

function MatrixLens() {
  const COLS = 8;
  const colWidth = W / COLS;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,20,0,0.35)" }]} />
      {[...Array(COLS)].map((_, i) => (
        <FallingEmoji
          key={i}
          emoji={["0", "1", "01", "10", "1", "0"][i % 6]}
          x={i * colWidth + colWidth * 0.2}
          delay={i * 180}
          duration={1800 + i * 120}
          size={16}
        />
      ))}
      {[...Array(COLS)].map((_, i) => (
        <FallingEmoji
          key={`b${i}`}
          emoji={["10", "01", "1", "0", "10", "1"][i % 6]}
          x={i * colWidth + colWidth * 0.6}
          delay={i * 230 + 900}
          duration={2200 + i * 100}
          size={14}
        />
      ))}
      <Text style={{ position: "absolute", left: 14, top: H * 0.08, color: "#22C55E", fontFamily: "Poppins_700Bold", fontSize: 13, opacity: 0.85 }}>
        GUNDRUK://MATRIX
      </Text>
    </View>
  );
}

function UnderwaterLens() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={["rgba(7,89,133,0.45)", "rgba(3,105,161,0.30)", "rgba(14,116,144,0.20)"]}
        style={StyleSheet.absoluteFill}
      />
      {/* Bubbles */}
      {[20, 60, 100, 150, 200, 260, 310, 360, 40, 130, 250, 320, 80, 180, 290].map((x, i) => (
        <RisingBubble key={i} x={x} delay={i * 400} />
      ))}
      {/* Fish */}
      <FallingEmoji emoji="🐠" x={-20}  delay={500}  duration={5000} size={28} />
      <FallingEmoji emoji="🐟" x={W + 20} delay={2000} duration={4500} size={24} />
    </View>
  );
}

function FireLens() {
  const FIRE_COUNT = 10;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {[...Array(FIRE_COUNT)].map((_, i) => {
        const baseX = W * 0.15 + (i * (W * 0.7 / FIRE_COUNT));
        return (
          <FallingEmoji
            key={i}
            emoji={i % 3 === 0 ? "🔥" : i % 3 === 1 ? "💥" : "✨"}
            x={baseX}
            delay={i * 200}
            duration={1200 + i * 100}
            size={20 + i % 4 * 5}
          />
        );
      })}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(239,68,68,0.07)" }]} />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SPIRITUAL / JYOTISHA LENSES (unique to Gundruk)
// ════════════════════════════════════════════════════════════════════════════

function ZodiacAuraLens({ rashi }: { rashi?: string }) {
  const key   = (rashi ?? "scorpio").toLowerCase();
  const [c1, c2] = RASHI_COLORS[key] ?? RASHI_COLORS.scorpio;
  const symbol = RASHI_SYMBOLS[key] ?? "♏";
  const floatY = useFloat(2000, 8);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Aura glow */}
      <Svg width={W} height={H}>
        <Defs>
          <RadialGradient id="aura" cx="50%" cy="40%" r="55%">
            <Stop offset="0%"   stopColor={c1} stopOpacity="0.0" />
            <Stop offset="55%"  stopColor={c1} stopOpacity="0.25" />
            <Stop offset="100%" stopColor={c2} stopOpacity="0.55" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#aura)" />
        {/* Constellation dots */}
        {[...Array(12)].map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const r = FW * 0.75;
          return (
            <Circle
              key={i}
              cx={FC.x + r * Math.cos(angle)}
              cy={FC.y + r * Math.sin(angle)}
              r={2.5}
              fill={c1}
              opacity={0.5}
            />
          );
        })}
      </Svg>
      {/* Zodiac symbol */}
      <FloatItem
        sv={floatY}
        style={{ position: "absolute", left: FC.x - 22, top: CROWN.y - 44, fontSize: 42, color: c1 }}
      >
        {symbol}
      </FloatItem>
    </View>
  );
}

function ChakraOrb({ chakra, index }: { chakra: typeof CHAKRA_DATA[0]; index: number }) {
  const pulse = usePulse(1000 + index * 120);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <RAnimated.View
      style={[{
        position: "absolute",
        left: FC.x - 14,
        top: chakra.y - 14,
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: chakra.color,
        opacity: 0.82,
        shadowColor: chakra.color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9, shadowRadius: 12,
        elevation: 6,
      }, pulseStyle]}
    />
  );
}

function ChakraLens() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {CHAKRA_DATA.map((chakra, i) => (
        <ChakraOrb key={i} chakra={chakra} index={i} />
      ))}
      <Svg width={W} height={H}>
        <Path
          d={`M${FC.x} ${H * 0.08} L${FC.x} ${H * 0.82}`}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={2}
          strokeDasharray="6,10"
        />
      </Svg>
    </View>
  );
}

function GoddessLens() {
  const floatY = useFloat(2200, 6);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Golden aura */}
      <LinearGradient
        colors={["rgba(217,119,6,0.25)", "transparent", "transparent"]}
        style={StyleSheet.absoluteFill}
      />
      {/* Crown */}
      <Svg width={W} height={H}>
        {/* Base of tiara */}
        <Path
          d={`M${CROWN.x - 56} ${CROWN.y + 26} L${CROWN.x - 36} ${CROWN.y + 8} L${CROWN.x - 18} ${CROWN.y - 12} L${CROWN.x} ${CROWN.y - 34} L${CROWN.x + 18} ${CROWN.y - 12} L${CROWN.x + 36} ${CROWN.y + 8} L${CROWN.x + 56} ${CROWN.y + 26} Z`}
          fill="#D97706"
          stroke="#F59E0B"
          strokeWidth={1.5}
        />
        {/* Center gem */}
        <Circle cx={CROWN.x} cy={CROWN.y - 30} r={9} fill="#EF4444" />
        <Circle cx={CROWN.x - 5} cy={CROWN.y - 33} r={3} fill="rgba(255,255,255,0.5)" />
        {/* Side gems */}
        <Circle cx={CROWN.x - 22} cy={CROWN.y - 8} r={6} fill="#EC4899" />
        <Circle cx={CROWN.x + 22} cy={CROWN.y - 8} r={6} fill="#EC4899" />
        <Circle cx={CROWN.x - 40} cy={CROWN.y + 12} r={5} fill="#A78BFA" />
        <Circle cx={CROWN.x + 40} cy={CROWN.y + 12} r={5} fill="#A78BFA" />
        {/* Lotus petals framing face (lower) */}
        {[-50, -26, 0, 26, 50].map((dx, i) => (
          <Ellipse key={i} cx={FC.x + dx} cy={FC.y + FH * 0.65} rx={16} ry={10}
            fill="rgba(217,119,6,0.3)" stroke="#F59E0B" strokeWidth={0.8}
            transform={`rotate(${dx * 1.2} ${FC.x + dx} ${FC.y + FH * 0.65})`} />
        ))}
      </Svg>
      <FloatItem
        sv={floatY}
        style={{ position: "absolute", left: FC.x - 14, top: H * 0.07, fontSize: 24 }}
      >🌸</FloatItem>
    </View>
  );
}

function OmAuraLens() {
  const pulse   = usePulse(1200);
  const rotateSV = useSharedValue(0);
  const floatY  = useFloat(2600, 8);

  useEffect(() => {
    rotateSV.value = withRepeat(withTiming(1, { duration: 12000 }), -1, false);
    return () => cancelAnimation(rotateSV);
  }, []);

  const rotStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateSV.value * 360}deg` }],
  }));
  const omStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }, { translateY: floatY.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Outer sacred geometry */}
      <Svg width={W} height={H}>
        <Defs>
          <RadialGradient id="omglow" cx="50%" cy="35%" r="40%">
            <Stop offset="0%" stopColor="#F59E0B" stopOpacity="0.35" />
            <Stop offset="100%" stopColor="#D97706" stopOpacity="0.0" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#omglow)" />
      </Svg>
      {/* Rotating sacred geometry */}
      <RAnimated.View
        style={[{
          position: "absolute",
          left: FC.x - 80,
          top: FC.y - FH * 0.75 - 80,
          width: 160,
          height: 160,
        }, rotStyle]}
      >
        <Svg width={160} height={160}>
          {/* Sri Yantra simplified - two triangles */}
          <Path d="M80 20 L140 120 L20 120 Z" fill="none" stroke="rgba(245,158,11,0.4)" strokeWidth={1.5} />
          <Path d="M80 140 L140 40 L20 40 Z" fill="none" stroke="rgba(245,158,11,0.4)" strokeWidth={1.5} />
          <Circle cx={80} cy={80} r={70} fill="none" stroke="rgba(245,158,11,0.2)" strokeWidth={1} />
          <Circle cx={80} cy={80} r={55} fill="none" stroke="rgba(245,158,11,0.15)" strokeWidth={1} />
        </Svg>
      </RAnimated.View>
      {/* Om symbol */}
      <RAnimated.Text
        style={[{
          position: "absolute",
          left: FC.x - 30,
          top: CROWN.y - 56,
          fontSize: 56,
          color: "#F59E0B",
          textShadowColor: "rgba(245,158,11,0.8)",
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 14,
        }, omStyle]}
      >
        ॐ
      </RAnimated.Text>
    </View>
  );
}

function NavagrahaLens() {
  // Default: Jupiter (most benefic, golden glow)
  const pulse  = usePulse(1400);
  const floatY = useFloat(2000, 7);
  const symStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }, { translateY: floatY.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Jupiter golden aura */}
      <Svg width={W} height={H}>
        <Defs>
          <RadialGradient id="jup" cx="50%" cy="38%" r="50%">
            <Stop offset="0%"   stopColor="#F59E0B" stopOpacity="0.0" />
            <Stop offset="50%"  stopColor="#D97706" stopOpacity="0.22" />
            <Stop offset="100%" stopColor="#92400E" stopOpacity="0.45" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#jup)" />
        {/* Planet orbit ring */}
        <Ellipse cx={FC.x} cy={FC.y} rx={FW * 0.8} ry={FW * 0.3} fill="none"
          stroke="rgba(245,158,11,0.35)" strokeWidth={2} strokeDasharray="14,8" />
      </Svg>
      {/* Jupiter symbol ♃ */}
      <RAnimated.Text
        style={[{
          position: "absolute",
          left: FC.x - 24,
          top: CROWN.y - 50,
          fontSize: 48,
          color: "#F59E0B",
          textShadowColor: "rgba(245,158,11,0.7)",
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 12,
        }, symStyle]}
      >
        ♃
      </RAnimated.Text>
      {/* Planets orbiting */}
      {["☉", "☽", "♂", "♀", "☿"].map((sym, i) => {
        const angle = (i / 5) * Math.PI * 2;
        const rx = FW * 0.8, ry = FW * 0.3;
        return (
          <Text
            key={i}
            style={{
              position: "absolute",
              left: FC.x + rx * Math.cos(angle) - 10,
              top: FC.y + ry * Math.sin(angle) - 10,
              fontSize: 16,
              color: "rgba(245,158,11,0.7)",
            }}
          >
            {sym}
          </Text>
        );
      })}
    </View>
  );
}

// ── Main router ───────────────────────────────────────────────────────────────
interface LensOverlayProps {
  lensId: string | null;
  rashi?: string;
}

export function LensOverlay({ lensId, rashi }: LensOverlayProps) {
  if (!lensId) return null;
  switch (lensId) {
    case "dog":           return <DogLens />;
    case "cat":           return <CatLens />;
    case "bunny":         return <BunnyLens />;
    case "bear":          return <BearLens />;
    case "deer":          return <DeerLens />;
    case "natural_glow":  return <NaturalGlowLens />;
    case "full_glam":     return <FullGlamLens />;
    case "korean":        return <KoreanBeautyLens />;
    case "bold_lip":      return <BoldLipLens />;
    case "eye_color":     return <EyeColorLens />;
    case "flower_crown":  return <FlowerCrownLens />;
    case "crying_stars":  return <CryingSparklesLens />;
    case "rainbow":       return <RainbowMouthLens />;
    case "giant_eyes":    return <GiantEyesLens />;
    case "neon_glow":     return <NeonGlowLens />;
    case "vintage":       return <AgeFilterLens />;
    case "anime":         return <AnimeLens />;
    case "crown":         return <CrownLens />;
    case "mask":          return <MaskSwapLens />;
    case "distortion":    return <DistortionLens />;
    case "snow":          return <SnowLens />;
    case "butterflies":   return <ButterfliesLens />;
    case "confetti":      return <ConfettiLens />;
    case "halo_wings":    return <HaloWingsLens />;
    case "space":         return <SpaceLens />;
    case "matrix":        return <MatrixLens />;
    case "underwater":    return <UnderwaterLens />;
    case "fire":          return <FireLens />;
    case "zodiac_aura":   return <ZodiacAuraLens rashi={rashi} />;
    case "chakra":        return <ChakraLens />;
    case "goddess":       return <GoddessLens />;
    case "om_aura":       return <OmAuraLens />;
    case "navagraha":     return <NavagrahaLens />;
    default:              return null;
  }
}
