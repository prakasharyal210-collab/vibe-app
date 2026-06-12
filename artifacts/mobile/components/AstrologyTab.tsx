import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { callAI, parseAIJson } from "@/lib/ai";

const { width: SCREEN_W } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// Zodiac Data
// ─────────────────────────────────────────────────────────────────────────────

interface ZodiacSign {
  sign: string;
  emoji: string;
  symbol: string;
  dates: string;
  element: string;
  planet: string;
  traits: string[];
  love: string;
  career: string;
  color: string;
}

const ZODIAC_SIGNS: ZodiacSign[] = [
  { sign: "Aries", emoji: "♈", symbol: "Ram", dates: "Mar 21 – Apr 19", element: "Fire 🔥", planet: "Mars", traits: ["Bold", "Passionate", "Ambitious"], love: "Aries loves deeply and fiercely — they'll pursue their person with unstoppable energy.", career: "Natural leaders who thrive under pressure and love starting new ventures.", color: "#EF4444" },
  { sign: "Taurus", emoji: "♉", symbol: "Bull", dates: "Apr 20 – May 20", element: "Earth 🌍", planet: "Venus", traits: ["Loyal", "Sensual", "Steadfast"], love: "Taurus is the most devoted lover — slow to fall but deeply committed once they do.", career: "Excel in finance, art, and anything requiring patience and precision.", color: "#10B981" },
  { sign: "Gemini", emoji: "♊", symbol: "Twins", dates: "May 21 – Jun 20", element: "Air 💨", planet: "Mercury", traits: ["Curious", "Witty", "Adaptable"], love: "Gemini needs mental connection above all — stimulate their mind and you'll have their heart.", career: "Thrive in communication, media, writing, and fast-paced environments.", color: "#F59E0B" },
  { sign: "Cancer", emoji: "♋", symbol: "Crab", dates: "Jun 21 – Jul 22", element: "Water 🌊", planet: "Moon", traits: ["Intuitive", "Nurturing", "Empathetic"], love: "Cancer loves with their whole soul — protective, tender, and deeply sentimental.", career: "Excel in caregiving, real estate, food, and roles that help others.", color: "#60A5FA" },
  { sign: "Leo", emoji: "♌", symbol: "Lion", dates: "Jul 23 – Aug 22", element: "Fire 🔥", planet: "Sun", traits: ["Charismatic", "Generous", "Dramatic"], love: "Leo loves grand gestures and wants a partner who matches their golden energy.", career: "Born performers and leaders — entertainment, management, and creative fields.", color: "#F97316" },
  { sign: "Virgo", emoji: "♍", symbol: "Maiden", dates: "Aug 23 – Sep 22", element: "Earth 🌍", planet: "Mercury", traits: ["Analytical", "Kind", "Precise"], love: "Virgo shows love through acts of service — they notice every detail about their person.", career: "Thrive in healthcare, research, editing, and systems optimization.", color: "#84CC16" },
  { sign: "Libra", emoji: "♎", symbol: "Scales", dates: "Sep 23 – Oct 22", element: "Air 💨", planet: "Venus", traits: ["Charming", "Fair", "Romantic"], love: "Libra is the zodiac's true romantic — seeking harmony, beauty, and perfect partnership.", career: "Excel in law, design, diplomacy, and any field requiring balance.", color: "#EC4899" },
  { sign: "Scorpio", emoji: "♏", symbol: "Scorpion", dates: "Oct 23 – Nov 21", element: "Water 🌊", planet: "Pluto", traits: ["Intense", "Magnetic", "Transformative"], love: "Scorpio loves with volcanic intensity — all or nothing, total devotion or nothing at all.", career: "Drawn to psychology, research, finance, and uncovering hidden truths.", color: "#8B5CF6" },
  { sign: "Sagittarius", emoji: "♐", symbol: "Archer", dates: "Nov 22 – Dec 21", element: "Fire 🔥", planet: "Jupiter", traits: ["Adventurous", "Philosophical", "Free-spirited"], love: "Sagittarius needs a partner who is also their best adventure companion.", career: "Thrive in travel, education, philosophy, and entrepreneurship.", color: "#F59E0B" },
  { sign: "Capricorn", emoji: "♑", symbol: "Sea-goat", dates: "Dec 22 – Jan 19", element: "Earth 🌍", planet: "Saturn", traits: ["Disciplined", "Ambitious", "Resilient"], love: "Capricorn builds love like an empire — slowly and built to last forever.", career: "Natural executives who dominate business, finance, and long-term projects.", color: "#6B7280" },
  { sign: "Aquarius", emoji: "♒", symbol: "Water-bearer", dates: "Jan 20 – Feb 18", element: "Air 💨", planet: "Uranus", traits: ["Visionary", "Humanitarian", "Original"], love: "Aquarius falls for people who challenge them intellectually and share their ideals.", career: "Excel in technology, social justice, innovation, and futurist fields.", color: "#06B6D4" },
  { sign: "Pisces", emoji: "♓", symbol: "Fish", dates: "Feb 19 – Mar 20", element: "Water 🌊", planet: "Neptune", traits: ["Dreamy", "Compassionate", "Mystical"], love: "Pisces is the most romantic sign — they love with their soul, art, and full imagination.", career: "Thrive in music, film, healing arts, and spiritual or creative work.", color: "#A78BFA" },
];

function getZodiacSign(birthDate: string): string {
  const parts = birthDate.split("-");
  if (parts.length !== 3) return "Aries";
  const month = parseInt(parts[1] ?? "1", 10);
  const day = parseInt(parts[2] ?? "1", 10);
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return "Aries";
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return "Taurus";
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return "Gemini";
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return "Cancer";
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return "Leo";
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return "Virgo";
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return "Libra";
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return "Scorpio";
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return "Sagittarius";
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "Capricorn";
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return "Aquarius";
  return "Pisces";
}

function getZodiacData(sign: string): ZodiacSign {
  return ZODIAC_SIGNS.find((z) => z.sign === sign) ?? ZODIAC_SIGNS[0]!;
}

const ASTRO_CACHE_KEY = "gundruk_astro_profile_v1";
const HOROSCOPE_CACHE_KEY = (sign: string) => `gundruk_horoscope_v1:${sign}:${new Date().toDateString()}`;

// ─────────────────────────────────────────────────────────────────────────────
// Star Background
// ─────────────────────────────────────────────────────────────────────────────
function StarField() {
  const stars = useRef(
    Array.from({ length: 40 }, (_, i) => ({
      x: Math.random() * SCREEN_W,
      y: Math.random() * 300,
      size: Math.random() * 2 + 0.5,
      anim: new Animated.Value(Math.random()),
    }))
  ).current;

  useEffect(() => {
    stars.forEach((s) => {
      const pulse = () => {
        Animated.sequence([
          Animated.timing(s.anim, { toValue: 1, duration: 800 + Math.random() * 1200, useNativeDriver: false }),
          Animated.timing(s.anim, { toValue: 0.2, duration: 800 + Math.random() * 1200, useNativeDriver: false }),
        ]).start(pulse);
      };
      setTimeout(pulse, Math.random() * 2000);
    });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: s.x,
            top: s.y,
            width: s.size * 2,
            height: s.size * 2,
            borderRadius: s.size,
            backgroundColor: "#fff",
            opacity: s.anim,
          }}
        />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding: Birth Date Setup
// ─────────────────────────────────────────────────────────────────────────────
function AstrologySetup({ onComplete }: { onComplete: (birthDate: string) => void }) {
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");
  const slideIn = useRef(new Animated.Value(40)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideIn, { toValue: 0, duration: 500, useNativeDriver: false }),
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: false }),
    ]).start();
  }, []);

  const handleConfirm = () => {
    if (!birthDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setError("Please enter a valid date (YYYY-MM-DD)");
      return;
    }
    const d = new Date(birthDate);
    if (isNaN(d.getTime()) || d > new Date()) {
      setError("Please enter a valid birth date");
      return;
    }
    setError("");
    onComplete(birthDate);
  };

  const sign = birthDate.match(/^\d{4}-\d{2}-\d{2}$/) ? getZodiacSign(birthDate) : null;
  const signData = sign ? getZodiacData(sign) : null;

  return (
    <ScrollView contentContainerStyle={astroStyles.setupContainer} showsVerticalScrollIndicator={false}>
      <StarField />
      <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: slideIn }], alignItems: "center" }}>
        <Text style={astroStyles.setupStars}>✨ 🔮 ✨</Text>
        <Text style={astroStyles.setupTitle}>Discover Your Cosmic Blueprint</Text>
        <Text style={astroStyles.setupSub}>Enter your birth date to reveal your zodiac sign and unlock personalized daily horoscopes</Text>

        {signData && (
          <View style={[astroStyles.previewSign, { borderColor: signData.color + "60" }]}>
            <LinearGradient colors={[signData.color + "20", "transparent"]} style={astroStyles.previewGrad}>
              <Text style={{ fontSize: 42 }}>{signData.emoji}</Text>
              <Text style={[astroStyles.previewSignName, { color: signData.color }]}>{signData.sign}</Text>
              <Text style={astroStyles.previewSignDates}>{signData.dates}</Text>
            </LinearGradient>
          </View>
        )}

        <View style={astroStyles.inputGroup}>
          <Text style={astroStyles.inputLabel}>Date of Birth</Text>
          <TextInput
            style={astroStyles.dateInput}
            value={birthDate}
            onChangeText={(t) => { setBirthDate(t); setError(""); }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="rgba(255,255,255,0.25)"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          {error ? <Text style={astroStyles.errorText}>{error}</Text> : null}
        </View>

        <TouchableOpacity onPress={handleConfirm} activeOpacity={0.85} style={astroStyles.confirmBtn}>
          <LinearGradient colors={["#8B5CF6", "#6D28D9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={astroStyles.confirmBtnGrad}>
            <Text style={astroStyles.confirmBtnText}>Reveal My Stars ⭐</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={astroStyles.privacyNote}>🔒 Your birth date is stored only on this device</Text>
      </Animated.View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Horoscope Section
// ─────────────────────────────────────────────────────────────────────────────
interface HoroscopeData {
  love: string;
  career: string;
  health: string;
  money: string;
  energy: string;
  luckyNumber: number;
  luckyColor: string;
}

const HOROSCOPE_SECTIONS = [
  { key: "love" as const, emoji: "💕", label: "Love" },
  { key: "career" as const, emoji: "💼", label: "Career" },
  { key: "health" as const, emoji: "💪", label: "Health" },
  { key: "money" as const, emoji: "💰", label: "Money" },
  { key: "energy" as const, emoji: "🌙", label: "Energy" },
];

function HoroscopeSection({ sign, signData }: { sign: string; signData: ZodiacSign }) {
  const [horoscope, setHoroscope] = useState<HoroscopeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>("love");

  const fetchHoroscope = useCallback(async () => {
    const cacheKey = HOROSCOPE_CACHE_KEY(sign);
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setHoroscope(JSON.parse(cached));
        return;
      }
    } catch {}

    setLoading(true);
    try {
      const result = await callAI("astro_horoscope", { sign }, { noCache: false });
      const data = parseAIJson<HoroscopeData>(result, {
        love: "The stars align beautifully for your heart today.",
        career: "Cosmic winds favor bold professional moves.",
        health: "Your energy fields are vibrant and strong.",
        money: "The universe supports your financial intentions.",
        energy: "You radiate a magnetic, transformative aura today.",
        luckyNumber: 7,
        luckyColor: "violet",
      });
      setHoroscope(data);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {}
    setLoading(false);
  }, [sign]);

  useEffect(() => { fetchHoroscope(); }, [fetchHoroscope]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      {/* Sign header */}
      <LinearGradient colors={["#1A0A2E", "#0A0A1F"]} style={astroStyles.horoHeader}>
        <StarField />
        <Text style={{ fontSize: 60, marginBottom: 8 }}>{signData.emoji}</Text>
        <Text style={[astroStyles.horoSignName, { color: signData.color }]}>{sign}</Text>
        <Text style={astroStyles.horoDate}>{today}</Text>
        <View style={astroStyles.horoMeta}>
          <View style={astroStyles.metaPill}>
            <Text style={astroStyles.metaText}>{signData.element}</Text>
          </View>
          <View style={astroStyles.metaPill}>
            <Text style={astroStyles.metaText}>♟ {signData.planet}</Text>
          </View>
          <View style={astroStyles.metaPill}>
            <Text style={astroStyles.metaText}>{signData.dates}</Text>
          </View>
        </View>
      </LinearGradient>

      {loading && (
        <View style={astroStyles.loadingBox}>
          <ActivityIndicator color="#8B5CF6" size="large" />
          <Text style={astroStyles.loadingText}>Reading the stars...</Text>
        </View>
      )}

      {horoscope && (
        <>
          {/* Lucky numbers */}
          <View style={astroStyles.luckyRow}>
            <View style={astroStyles.luckyCard}>
              <Text style={astroStyles.luckyLabel}>Lucky Number</Text>
              <Text style={astroStyles.luckyValue}>✨ {horoscope.luckyNumber}</Text>
            </View>
            <View style={astroStyles.luckyCard}>
              <Text style={astroStyles.luckyLabel}>Lucky Color</Text>
              <Text style={astroStyles.luckyValue}>🎨 {horoscope.luckyColor}</Text>
            </View>
          </View>

          {/* Horoscope sections */}
          {HOROSCOPE_SECTIONS.map((sec) => (
            <TouchableOpacity
              key={sec.key}
              activeOpacity={0.8}
              onPress={() => setExpanded(expanded === sec.key ? null : sec.key)}
              style={[astroStyles.horoCard, expanded === sec.key && { borderColor: signData.color + "80" }]}
            >
              <View style={astroStyles.horoCardRow}>
                <Text style={astroStyles.horoCardEmoji}>{sec.emoji}</Text>
                <Text style={astroStyles.horoCardLabel}>{sec.label}</Text>
                <Ionicons
                  name={expanded === sec.key ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="rgba(255,255,255,0.4)"
                />
              </View>
              {expanded === sec.key && (
                <Text style={astroStyles.horoCardText}>{horoscope[sec.key]}</Text>
              )}
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            onPress={fetchHoroscope}
            style={astroStyles.refreshBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={15} color="#8B5CF6" />
            <Text style={astroStyles.refreshText}>Refresh reading</Text>
          </TouchableOpacity>
        </>
      )}

      {!horoscope && !loading && (
        <TouchableOpacity onPress={fetchHoroscope} style={astroStyles.retryBtn}>
          <Text style={astroStyles.retryText}>🔮 Read Today's Horoscope</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility Section
// ─────────────────────────────────────────────────────────────────────────────
interface CompatResult {
  score: number;
  strengths: string[];
  challenges: string[];
  verdict: string;
  emoji: string;
}

function CompatibilitySection({ mySign }: { mySign: string }) {
  const [sign2, setSign2] = useState<string | null>(null);
  const [result, setResult] = useState<CompatResult | null>(null);
  const [loading, setLoading] = useState(false);

  const checkCompat = async (other: string) => {
    setSign2(other);
    setResult(null);
    setLoading(true);
    try {
      const ai = await callAI("astro_compatibility", { sign1: mySign, sign2: other });
      const data = parseAIJson<CompatResult>(ai, {
        score: 75,
        strengths: ["Deep emotional bond", "Complementary energies"],
        challenges: ["Different communication styles", "Varying life paces"],
        verdict: "A powerful pairing with beautiful growth potential. With understanding, this can be truly cosmic.",
        emoji: "✨",
      });
      setResult(data);
    } catch {}
    setLoading(false);
  };

  const myData = getZodiacData(mySign);
  const otherData = sign2 ? getZodiacData(sign2) : null;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={astroStyles.compatHeader}>
        <Text style={astroStyles.sectionTitle}>💫 Compatibility</Text>
        <Text style={astroStyles.sectionSub}>Discover cosmic connection between signs</Text>
      </View>

      <View style={astroStyles.mySignRow}>
        <View style={[astroStyles.signBubble, { borderColor: myData.color + "60" }]}>
          <Text style={{ fontSize: 32 }}>{myData.emoji}</Text>
          <Text style={[astroStyles.signBubbleName, { color: myData.color }]}>{mySign}</Text>
        </View>
        <Text style={astroStyles.plusSign}>+</Text>
        {otherData ? (
          <View style={[astroStyles.signBubble, { borderColor: otherData.color + "60" }]}>
            <Text style={{ fontSize: 32 }}>{otherData.emoji}</Text>
            <Text style={[astroStyles.signBubbleName, { color: otherData.color }]}>{sign2}</Text>
          </View>
        ) : (
          <View style={[astroStyles.signBubble, { borderColor: "rgba(255,255,255,0.1)" }]}>
            <Text style={{ fontSize: 28, color: "rgba(255,255,255,0.25)" }}>?</Text>
            <Text style={[astroStyles.signBubbleName, { color: "rgba(255,255,255,0.3)" }]}>Pick</Text>
          </View>
        )}
      </View>

      <Text style={astroStyles.pickLabel}>Choose a sign to check</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={astroStyles.signRow}>
        {ZODIAC_SIGNS.filter((z) => z.sign !== mySign).map((z) => (
          <TouchableOpacity
            key={z.sign}
            onPress={() => checkCompat(z.sign)}
            activeOpacity={0.8}
            style={[astroStyles.signChip, sign2 === z.sign && { backgroundColor: z.color + "30", borderColor: z.color }]}
          >
            <Text style={{ fontSize: 18 }}>{z.emoji}</Text>
            <Text style={[astroStyles.signChipText, sign2 === z.sign && { color: z.color }]}>{z.sign}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && (
        <View style={astroStyles.loadingBox}>
          <ActivityIndicator color="#8B5CF6" size="large" />
          <Text style={astroStyles.loadingText}>Reading cosmic energies...</Text>
        </View>
      )}

      {result && otherData && (
        <View style={astroStyles.compatResult}>
          {/* Score ring */}
          <View style={astroStyles.scoreContainer}>
            <LinearGradient colors={["#8B5CF6", "#EC4899"]} style={astroStyles.scoreRing}>
              <View style={astroStyles.scoreInner}>
                <Text style={astroStyles.scoreNumber}>{result.score}</Text>
                <Text style={astroStyles.scoreLabel}>%</Text>
              </View>
            </LinearGradient>
            <Text style={astroStyles.scoreEmoji}>{result.emoji}</Text>
            <Text style={astroStyles.scoreTitle}>
              {myData.emoji} {mySign} + {otherData.emoji} {sign2}
            </Text>
          </View>

          {/* Verdict */}
          <View style={astroStyles.verdictBox}>
            <Text style={astroStyles.verdictText}>"{result.verdict}"</Text>
          </View>

          {/* Strengths */}
          <View style={astroStyles.compatSection}>
            <Text style={astroStyles.compatSectionTitle}>✨ Strengths</Text>
            {result.strengths.map((s, i) => (
              <View key={i} style={astroStyles.compatItem}>
                <Text style={{ color: "#22C55E", fontSize: 13 }}>● </Text>
                <Text style={astroStyles.compatItemText}>{s}</Text>
              </View>
            ))}
          </View>

          {/* Challenges */}
          <View style={astroStyles.compatSection}>
            <Text style={astroStyles.compatSectionTitle}>🌙 Challenges</Text>
            {result.challenges.map((c, i) => (
              <View key={i} style={astroStyles.compatItem}>
                <Text style={{ color: "#F59E0B", fontSize: 13 }}>● </Text>
                <Text style={astroStyles.compatItemText}>{c}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ask the Stars Chat
// ─────────────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const QUICK_QUESTIONS = [
  "Will I find love this month?",
  "What does Mercury retrograde mean for me?",
  "What are my biggest strengths?",
  "What career path suits me?",
  "How can I improve my relationships?",
];

function AstroChatSection({ sign }: { sign: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: `🔮 The stars are aligned, ${sign}. Ask me anything about your cosmic journey, love, career, or the celestial forces shaping your path...` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");

    const newMsg: ChatMessage = { role: "user", content: trimmed };
    const updated = [...messages, newMsg];
    setMessages(updated);
    setLoading(true);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const apiMessages = updated.map((m) => ({ role: m.role, content: m.content }));
      const result = await callAI("astro_chat", { zodiacSign: sign }, {
        messages: apiMessages,
        noCache: true,
      });
      if (result) {
        setMessages((prev) => [...prev, { role: "assistant", content: result }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "The cosmic signal is weak right now 🌙 Please try again." }]);
    }
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={140}>
      <View style={astroStyles.chatHeader}>
        <Text style={astroStyles.sectionTitle}>🔮 Ask the Stars</Text>
        <Text style={astroStyles.sectionSub}>Your personal cosmic oracle awaits</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={astroStyles.quickQRow}>
        {QUICK_QUESTIONS.map((q) => (
          <TouchableOpacity key={q} onPress={() => sendMessage(q)} style={astroStyles.quickQChip} activeOpacity={0.8}>
            <Text style={astroStyles.quickQText}>{q}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView ref={scrollRef} style={astroStyles.chatMessages} contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 16, paddingBottom: 20 }}>
        {messages.map((m, i) => (
          <View key={i} style={[astroStyles.bubble, m.role === "user" ? astroStyles.userBubble : astroStyles.aiBubble]}>
            {m.role === "assistant" && <Text style={astroStyles.aiIcon}>🔮</Text>}
            <Text style={[astroStyles.bubbleText, m.role === "user" && astroStyles.userBubbleText]}>{m.content}</Text>
          </View>
        ))}
        {loading && (
          <View style={[astroStyles.bubble, astroStyles.aiBubble]}>
            <Text style={astroStyles.aiIcon}>🔮</Text>
            <ActivityIndicator color="#8B5CF6" size="small" />
          </View>
        )}
      </ScrollView>

      <View style={astroStyles.chatInputRow}>
        <TextInput
          style={astroStyles.chatInput}
          value={input}
          onChangeText={setInput}
          placeholder="Ask the stars anything..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          multiline
          onSubmitEditing={() => sendMessage(input)}
        />
        <TouchableOpacity
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={[astroStyles.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]}
        >
          <LinearGradient colors={["#8B5CF6", "#6D28D9"]} style={astroStyles.sendBtnGrad}>
            <Ionicons name="send" size={16} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// All Signs Browser
// ─────────────────────────────────────────────────────────────────────────────
function AllSignsSection({ mySign }: { mySign: string }) {
  const [selectedSign, setSelectedSign] = useState<ZodiacSign | null>(null);

  if (selectedSign) {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <LinearGradient colors={[selectedSign.color + "30", "#0A0A1F"]} style={astroStyles.signDetailHeader}>
          <TouchableOpacity onPress={() => setSelectedSign(null)} style={astroStyles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={{ fontSize: 64, marginTop: 16 }}>{selectedSign.emoji}</Text>
          <Text style={[astroStyles.signDetailName, { color: selectedSign.color }]}>{selectedSign.sign}</Text>
          <Text style={astroStyles.signDetailSymbol}>{selectedSign.symbol}</Text>
          <Text style={astroStyles.signDetailDates}>{selectedSign.dates}</Text>
        </LinearGradient>

        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <View style={astroStyles.signDetailMetaRow}>
            <View style={astroStyles.metaCard}>
              <Text style={astroStyles.metaCardLabel}>Element</Text>
              <Text style={astroStyles.metaCardValue}>{selectedSign.element}</Text>
            </View>
            <View style={astroStyles.metaCard}>
              <Text style={astroStyles.metaCardLabel}>Ruling Planet</Text>
              <Text style={astroStyles.metaCardValue}>♟ {selectedSign.planet}</Text>
            </View>
          </View>

          <View style={astroStyles.traitsRow}>
            {selectedSign.traits.map((t) => (
              <View key={t} style={[astroStyles.traitPill, { backgroundColor: selectedSign.color + "25", borderColor: selectedSign.color + "60" }]}>
                <Text style={[astroStyles.traitText, { color: selectedSign.color }]}>{t}</Text>
              </View>
            ))}
          </View>

          <View style={astroStyles.signDetailCard}>
            <Text style={astroStyles.signDetailCardTitle}>💕 Love</Text>
            <Text style={astroStyles.signDetailCardText}>{selectedSign.love}</Text>
          </View>
          <View style={astroStyles.signDetailCard}>
            <Text style={astroStyles.signDetailCardTitle}>💼 Career</Text>
            <Text style={astroStyles.signDetailCardText}>{selectedSign.career}</Text>
          </View>

          {mySign !== selectedSign.sign && (
            <View style={[astroStyles.signDetailCard, { borderColor: "#8B5CF620" }]}>
              <Text style={astroStyles.signDetailCardTitle}>✨ Compatibility with {mySign}</Text>
              <Text style={astroStyles.signDetailCardText}>Tap Compatibility tab to get a full AI reading between {mySign} and {selectedSign.sign}!</Text>
            </View>
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={astroStyles.compatHeader}>
        <Text style={astroStyles.sectionTitle}>🌌 All Zodiac Signs</Text>
        <Text style={astroStyles.sectionSub}>Tap any sign to explore its full cosmic profile</Text>
      </View>
      <View style={astroStyles.signsGrid}>
        {ZODIAC_SIGNS.map((z) => (
          <TouchableOpacity
            key={z.sign}
            onPress={() => setSelectedSign(z)}
            activeOpacity={0.8}
            style={[astroStyles.signGridCard, { borderColor: z.color + "50" }, z.sign === mySign && { borderColor: z.color, borderWidth: 2 }]}
          >
            <LinearGradient colors={[z.color + "20", "transparent"]} style={astroStyles.signGridGrad}>
              {z.sign === mySign && (
                <View style={astroStyles.mySignBadge}>
                  <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Poppins_600SemiBold" }}>YOU</Text>
                </View>
              )}
              <Text style={{ fontSize: 34, marginBottom: 4 }}>{z.emoji}</Text>
              <Text style={[astroStyles.signGridName, { color: z.color }]}>{z.sign}</Text>
              <Text style={astroStyles.signGridDates}>{z.dates.split("–")[0]?.trim()}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main AstrologyTab
// ─────────────────────────────────────────────────────────────────────────────
type AstroSection = "horoscope" | "compatibility" | "chat" | "signs";

const NAV_TABS: { id: AstroSection; emoji: string; label: string }[] = [
  { id: "horoscope", emoji: "⭐", label: "Today" },
  { id: "compatibility", emoji: "💫", label: "Compat" },
  { id: "chat", emoji: "🔮", label: "Ask Stars" },
  { id: "signs", emoji: "🌌", label: "All Signs" },
];

interface AstrologyProfile {
  birthDate: string;
  zodiacSign: string;
}

export function AstrologyTab({ userId }: { userId?: string }) {
  const [profile, setProfile] = useState<AstrologyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<AstroSection>("horoscope");

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(ASTRO_CACHE_KEY);
        if (raw) setProfile(JSON.parse(raw));
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handleSetup = async (birthDate: string) => {
    const zodiacSign = getZodiacSign(birthDate);
    const p: AstrologyProfile = { birthDate, zodiacSign };
    setProfile(p);
    try { await AsyncStorage.setItem(ASTRO_CACHE_KEY, JSON.stringify(p)); } catch {}
  };

  const handleReset = () => {
    setProfile(null);
    AsyncStorage.removeItem(ASTRO_CACHE_KEY).catch(() => {});
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#080810", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#8B5CF6" size="large" />
        <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 12, fontFamily: "Poppins_400Regular" }}>Reading the cosmos...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: "#080810" }}>
        <AstrologySetup onComplete={handleSetup} />
      </View>
    );
  }

  const signData = getZodiacData(profile.zodiacSign);

  return (
    <View style={{ flex: 1, backgroundColor: "#080810" }}>
      {/* Header with sign */}
      <View style={astroStyles.mainHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[astroStyles.mainHeaderSign, { color: signData.color }]}>
            {signData.emoji} {profile.zodiacSign}
          </Text>
          <Text style={astroStyles.mainHeaderSub}>{signData.dates} · {signData.element}</Text>
        </View>
        <TouchableOpacity onPress={handleReset} style={astroStyles.resetBtn}>
          <Ionicons name="settings-outline" size={18} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </View>

      {/* Nav tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={astroStyles.navTabRow}>
        {NAV_TABS.map((tab) => {
          const isActive = activeSection === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveSection(tab.id)}
              activeOpacity={0.8}
              style={[astroStyles.navTab, isActive && { borderColor: signData.color }]}
            >
              {isActive ? (
                <LinearGradient colors={[signData.color, signData.color + "AA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={astroStyles.navTabGrad}>
                  <Text style={astroStyles.navTabEmoji}>{tab.emoji}</Text>
                  <Text style={[astroStyles.navTabLabel, { color: "#fff" }]}>{tab.label}</Text>
                </LinearGradient>
              ) : (
                <View style={astroStyles.navTabInner}>
                  <Text style={astroStyles.navTabEmoji}>{tab.emoji}</Text>
                  <Text style={[astroStyles.navTabLabel, { color: "#6B7280" }]}>{tab.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeSection === "horoscope" && <HoroscopeSection sign={profile.zodiacSign} signData={signData} />}
        {activeSection === "compatibility" && <CompatibilitySection mySign={profile.zodiacSign} />}
        {activeSection === "chat" && <AstroChatSection sign={profile.zodiacSign} />}
        {activeSection === "signs" && <AllSignsSection mySign={profile.zodiacSign} />}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const astroStyles = StyleSheet.create({
  setupContainer: { flexGrow: 1, backgroundColor: "#080810", alignItems: "center", paddingHorizontal: 24, paddingTop: 40, paddingBottom: 60 },
  setupStars: { fontSize: 32, marginBottom: 16 },
  setupTitle: { color: "#fff", fontSize: 22, fontFamily: "Poppins_700Bold", textAlign: "center", marginBottom: 10 },
  setupSub: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  previewSign: { borderWidth: 1, borderRadius: 20, overflow: "hidden", marginBottom: 24, width: 160 },
  previewGrad: { padding: 20, alignItems: "center" },
  previewSignName: { fontSize: 20, fontFamily: "Poppins_700Bold", marginTop: 4 },
  previewSignDates: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 2 },
  inputGroup: { width: "100%", marginBottom: 20 },
  inputLabel: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_600SemiBold", fontSize: 13, marginBottom: 8 },
  dateInput: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", paddingHorizontal: 18, paddingVertical: 14, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 16, letterSpacing: 2 },
  errorText: { color: "#F87171", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 6 },
  confirmBtn: { borderRadius: 28, overflow: "hidden", width: "100%", marginBottom: 16 },
  confirmBtnGrad: { paddingVertical: 16, alignItems: "center" },
  confirmBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  privacyNote: { color: "rgba(255,255,255,0.3)", fontFamily: "Poppins_400Regular", fontSize: 12 },

  horoHeader: { paddingTop: 32, paddingBottom: 28, alignItems: "center" },
  horoSignName: { fontSize: 28, fontFamily: "Poppins_700Bold", marginTop: 4 },
  horoDate: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  horoMeta: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap", justifyContent: "center", paddingHorizontal: 16 },
  metaPill: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  metaText: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_400Regular", fontSize: 12 },
  loadingBox: { alignItems: "center", paddingVertical: 40 },
  loadingText: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 14, marginTop: 12 },
  luckyRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: 16, marginBottom: 8 },
  luckyCard: { flex: 1, backgroundColor: "rgba(139,92,246,0.12)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", padding: 14, alignItems: "center" },
  luckyLabel: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 11, marginBottom: 4 },
  luckyValue: { color: "#A78BFA", fontFamily: "Poppins_700Bold", fontSize: 15 },
  horoCard: { marginHorizontal: 16, marginVertical: 5, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 16 },
  horoCardRow: { flexDirection: "row", alignItems: "center" },
  horoCardEmoji: { fontSize: 20, marginRight: 10 },
  horoCardLabel: { flex: 1, color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  horoCardText: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22, marginTop: 12 },
  refreshBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 20, gap: 6, paddingVertical: 12 },
  refreshText: { color: "#8B5CF6", fontFamily: "Poppins_400Regular", fontSize: 13 },
  retryBtn: { margin: 24, backgroundColor: "rgba(139,92,246,0.15)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(139,92,246,0.3)", padding: 20, alignItems: "center" },
  retryText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 15 },

  compatHeader: { padding: 16, paddingBottom: 8 },
  sectionTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 20 },
  sectionSub: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 2 },
  mySignRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 20, gap: 16 },
  signBubble: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 20, borderWidth: 1, padding: 16, width: 110 },
  signBubbleName: { fontFamily: "Poppins_700Bold", fontSize: 14, marginTop: 4 },
  plusSign: { color: "rgba(255,255,255,0.3)", fontSize: 28, fontFamily: "Poppins_700Bold" },
  pickLabel: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, paddingLeft: 16, marginBottom: 8 },
  signRow: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  signChip: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", gap: 4, minWidth: 72 },
  signChipText: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 11 },
  compatResult: { marginHorizontal: 16, marginTop: 16 },
  scoreContainer: { alignItems: "center", marginBottom: 20 },
  scoreRing: { width: 110, height: 110, borderRadius: 55, justifyContent: "center", alignItems: "center" },
  scoreInner: { width: 90, height: 90, borderRadius: 45, backgroundColor: "#080810", justifyContent: "center", alignItems: "center", flexDirection: "row" },
  scoreNumber: { color: "#fff", fontSize: 32, fontFamily: "Poppins_700Bold" },
  scoreLabel: { color: "rgba(255,255,255,0.5)", fontSize: 16, fontFamily: "Poppins_400Regular", alignSelf: "flex-end", marginBottom: 6 },
  scoreEmoji: { fontSize: 28, marginTop: 12 },
  scoreTitle: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_400Regular", fontSize: 14, marginTop: 6 },
  verdictBox: { backgroundColor: "rgba(139,92,246,0.1)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", padding: 16, marginBottom: 16 },
  verdictText: { color: "#C4B5FD", fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22, fontStyle: "italic", textAlign: "center" },
  compatSection: { marginBottom: 16 },
  compatSectionTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15, marginBottom: 8 },
  compatItem: { flexDirection: "row", marginBottom: 6 },
  compatItemText: { flex: 1, color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 20 },

  chatHeader: { padding: 16, paddingBottom: 8 },
  quickQRow: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  quickQChip: { backgroundColor: "rgba(139,92,246,0.12)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", paddingHorizontal: 14, paddingVertical: 7 },
  quickQText: { color: "#A78BFA", fontFamily: "Poppins_400Regular", fontSize: 12 },
  chatMessages: { flex: 1 },
  bubble: { borderRadius: 18, padding: 14, marginVertical: 4, maxWidth: "85%", flexDirection: "row", gap: 8, alignItems: "flex-start" },
  aiBubble: { backgroundColor: "rgba(139,92,246,0.12)", borderWidth: 1, borderColor: "rgba(139,92,246,0.2)", alignSelf: "flex-start" },
  userBubble: { backgroundColor: "rgba(139,92,246,0.85)", alignSelf: "flex-end", borderWidth: 0 },
  aiIcon: { fontSize: 16, marginTop: 2 },
  bubbleText: { flex: 1, color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 21 },
  userBubbleText: { color: "#fff" },
  chatInputRow: { flexDirection: "row", padding: 12, gap: 10, alignItems: "flex-end", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", backgroundColor: "#0A0A0F" },
  chatInput: { flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 16, paddingVertical: 11, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, overflow: "hidden" },
  sendBtnGrad: { flex: 1, justifyContent: "center", alignItems: "center" },

  signDetailHeader: { padding: 28, alignItems: "center", paddingBottom: 32 },
  backBtn: { position: "absolute", top: 16, left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  signDetailName: { fontSize: 28, fontFamily: "Poppins_700Bold", marginTop: 8 },
  signDetailSymbol: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 14, marginTop: 2 },
  signDetailDates: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  signDetailMetaRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  metaCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 14 },
  metaCardLabel: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 11, marginBottom: 4 },
  metaCardValue: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  traitsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 20 },
  traitPill: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6 },
  traitText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  signDetailCard: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 16, marginBottom: 12 },
  signDetailCardTitle: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15, marginBottom: 8 },
  signDetailCardText: { color: "rgba(255,255,255,0.65)", fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22 },

  signsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 12, justifyContent: "center" },
  signGridCard: { width: (SCREEN_W - 52) / 3, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  signGridGrad: { padding: 14, alignItems: "center", minHeight: 100 },
  mySignBadge: { position: "absolute", top: 6, right: 6, backgroundColor: "#8B5CF6", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  signGridName: { fontFamily: "Poppins_700Bold", fontSize: 13, marginBottom: 2 },
  signGridDates: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_400Regular", fontSize: 9 },

  mainHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  mainHeaderSign: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  mainHeaderSub: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 1 },
  resetBtn: { padding: 8 },
  navTabRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  navTab: { borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  navTabGrad: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, gap: 5 },
  navTabInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, gap: 5 },
  navTabEmoji: { fontSize: 14 },
  navTabLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
});
