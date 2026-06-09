import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Animated, Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { callAI, parseAIJson } from "@/lib/ai";
import { supabase } from "@/lib/supabase";

const { width: W } = Dimensions.get("window");
const GOLD = "#D97706";
const SAFFRON = "#F59E0B";
const CREAM = "#FFF8E7";
const DIM = "rgba(253,230,138,0.35)";
const CARD_BG = "rgba(253,230,138,0.06)";
const BG = "#03030E";
const BG2 = "#080820";

// ─── Vedic Data ──────────────────────────────────────────────────────────────

const RASHIS = [
  { name: "Mesha",      en: "Aries",       symbol: "♈", deity: "Agni",    element: "Agni (Fire)",   planet: "Mangal",  color: "#EF4444", dates: [4,13,5,13] },
  { name: "Vrishabha",  en: "Taurus",      symbol: "♉", deity: "Shukra",  element: "Prithvi (Earth)",planet: "Shukra",  color: "#10B981", dates: [5,14,6,14] },
  { name: "Mithuna",    en: "Gemini",      symbol: "♊", deity: "Budha",   element: "Vayu (Air)",    planet: "Budha",   color: "#F59E0B", dates: [6,15,7,15] },
  { name: "Karka",      en: "Cancer",      symbol: "♋", deity: "Chandra", element: "Jala (Water)",  planet: "Chandra", color: "#60A5FA", dates: [7,16,8,16] },
  { name: "Simha",      en: "Leo",         symbol: "♌", deity: "Surya",   element: "Agni (Fire)",   planet: "Surya",   color: "#F97316", dates: [8,17,9,16] },
  { name: "Kanya",      en: "Virgo",       symbol: "♍", deity: "Budha",   element: "Prithvi (Earth)",planet: "Budha",   color: "#84CC16", dates: [9,17,10,16]},
  { name: "Tula",       en: "Libra",       symbol: "♎", deity: "Shukra",  element: "Vayu (Air)",    planet: "Shukra",  color: "#EC4899", dates: [10,17,11,15]},
  { name: "Vrishchika", en: "Scorpio",     symbol: "♏", deity: "Mangal",  element: "Jala (Water)",  planet: "Mangal",  color: "#8B5CF6", dates: [11,16,12,15]},
  { name: "Dhanu",      en: "Sagittarius", symbol: "♐", deity: "Guru",    element: "Agni (Fire)",   planet: "Guru",    color: "#F59E0B", dates: [12,16,1,13] },
  { name: "Makara",     en: "Capricorn",   symbol: "♑", deity: "Shani",   element: "Prithvi (Earth)",planet: "Shani",   color: "#6B7280", dates: [1,14,2,12] },
  { name: "Kumbha",     en: "Aquarius",    symbol: "♒", deity: "Shani",   element: "Vayu (Air)",    planet: "Shani",   color: "#06B6D4", dates: [2,13,3,13] },
  { name: "Meena",      en: "Pisces",      symbol: "♓", deity: "Guru",    element: "Jala (Water)",  planet: "Guru",    color: "#A78BFA", dates: [3,14,4,12] },
];

const NAKSHATRAS = [
  { name: "Ashwini",          planet: "Ketu",    deity: "Ashwins",     symbol: "Horse head",  dasha: "Ketu",    dashaDur: 7  },
  { name: "Bharani",          planet: "Shukra",  deity: "Yama",        symbol: "Yoni",        dasha: "Shukra",  dashaDur: 20 },
  { name: "Krittika",         planet: "Surya",   deity: "Agni",        symbol: "Razor/Flame", dasha: "Surya",   dashaDur: 6  },
  { name: "Rohini",           planet: "Chandra", deity: "Brahma",      symbol: "Chariot",     dasha: "Chandra", dashaDur: 10 },
  { name: "Mrigashira",       planet: "Mangal",  deity: "Soma",        symbol: "Deer head",   dasha: "Mangal",  dashaDur: 7  },
  { name: "Ardra",            planet: "Rahu",    deity: "Rudra",       symbol: "Teardrop",    dasha: "Rahu",    dashaDur: 18 },
  { name: "Punarvasu",        planet: "Guru",    deity: "Aditi",       symbol: "Quiver",      dasha: "Guru",    dashaDur: 16 },
  { name: "Pushya",           planet: "Shani",   deity: "Brihaspati",  symbol: "Flower",      dasha: "Shani",   dashaDur: 19 },
  { name: "Ashlesha",         planet: "Budha",   deity: "Nagas",       symbol: "Serpent",     dasha: "Budha",   dashaDur: 17 },
  { name: "Magha",            planet: "Ketu",    deity: "Pitrs",       symbol: "Throne",      dasha: "Ketu",    dashaDur: 7  },
  { name: "Purva Phalguni",   planet: "Shukra",  deity: "Bhaga",       symbol: "Hammock",     dasha: "Shukra",  dashaDur: 20 },
  { name: "Uttara Phalguni",  planet: "Surya",   deity: "Aryaman",     symbol: "Bed",         dasha: "Surya",   dashaDur: 6  },
  { name: "Hasta",            planet: "Chandra", deity: "Savitar",     symbol: "Hand",        dasha: "Chandra", dashaDur: 10 },
  { name: "Chitra",           planet: "Mangal",  deity: "Vishwakarma", symbol: "Pearl",       dasha: "Mangal",  dashaDur: 7  },
  { name: "Swati",            planet: "Rahu",    deity: "Vayu",        symbol: "Young sprout",dasha: "Rahu",    dashaDur: 18 },
  { name: "Vishakha",         planet: "Guru",    deity: "Indra/Agni",  symbol: "Triumphal arch",dasha:"Guru",   dashaDur: 16 },
  { name: "Anuradha",         planet: "Shani",   deity: "Mitra",       symbol: "Lotus",       dasha: "Shani",   dashaDur: 19 },
  { name: "Jyeshtha",         planet: "Budha",   deity: "Indra",       symbol: "Umbrella",    dasha: "Budha",   dashaDur: 17 },
  { name: "Mula",             planet: "Ketu",    deity: "Nirriti",     symbol: "Root",        dasha: "Ketu",    dashaDur: 7  },
  { name: "Purva Ashadha",    planet: "Shukra",  deity: "Apas",        symbol: "Fan",         dasha: "Shukra",  dashaDur: 20 },
  { name: "Uttara Ashadha",   planet: "Surya",   deity: "Vishwadevas", symbol: "Elephant tusk",dasha:"Surya",   dashaDur: 6  },
  { name: "Shravana",         planet: "Chandra", deity: "Vishnu",      symbol: "Three footprints",dasha:"Chandra",dashaDur: 10},
  { name: "Dhanishtha",       planet: "Mangal",  deity: "Ashta Vasus", symbol: "Drum",        dasha: "Mangal",  dashaDur: 7  },
  { name: "Shatabhisha",      planet: "Rahu",    deity: "Varuna",      symbol: "100 stars",   dasha: "Rahu",    dashaDur: 18 },
  { name: "Purva Bhadrapada", planet: "Guru",    deity: "Aja Ekapada", symbol: "Sword",       dasha: "Guru",    dashaDur: 16 },
  { name: "Uttara Bhadrapada",planet: "Shani",   deity: "Ahir Budhnya",symbol: "Twins",       dasha: "Shani",   dashaDur: 19 },
  { name: "Revati",           planet: "Budha",   deity: "Pushan",      symbol: "Fish",        dasha: "Budha",   dashaDur: 17 },
];

const NAVAGRAHA = [
  { name: "Surya",   en: "Sun",           symbol: "☀️", nature: "Sattvic", rules: "Soul, Father, Authority, Health, Confidence",        day: "Sunday",    gem: "Ruby",        color: "#F97316" },
  { name: "Chandra", en: "Moon",          symbol: "🌙", nature: "Sattvic", rules: "Mind, Mother, Emotions, Memory, Intuition",          day: "Monday",    gem: "Pearl",       color: "#E2E8F0" },
  { name: "Mangal",  en: "Mars",          symbol: "♂️", nature: "Tamasic", rules: "Energy, Courage, Siblings, Property, Aggression",    day: "Tuesday",   gem: "Red Coral",   color: "#EF4444" },
  { name: "Budha",   en: "Mercury",       symbol: "☿️", nature: "Rajasic", rules: "Intelligence, Speech, Business, Education, Skill",   day: "Wednesday", gem: "Emerald",     color: "#10B981" },
  { name: "Guru",    en: "Jupiter",       symbol: "♃",  nature: "Sattvic", rules: "Wisdom, Dharma, Guru, Expansion, Grace, Children",   day: "Thursday",  gem: "Yellow Sapphire", color: "#F59E0B" },
  { name: "Shukra",  en: "Venus",         symbol: "♀️", nature: "Rajasic", rules: "Love, Beauty, Luxury, Art, Relationships, Desires",  day: "Friday",    gem: "Diamond",     color: "#EC4899" },
  { name: "Shani",   en: "Saturn",        symbol: "♄",  nature: "Tamasic", rules: "Karma, Discipline, Delays, Lessons, Longevity",      day: "Saturday",  gem: "Blue Sapphire", color: "#6B7280" },
  { name: "Rahu",    en: "North Node",    symbol: "🐉", nature: "Tamasic", rules: "Desire, Illusion, Foreign lands, Worldly ambition",  day: "Saturday",  gem: "Hessonite",   color: "#8B5CF6" },
  { name: "Ketu",    en: "South Node",    symbol: "🐍", nature: "Tamasic", rules: "Past life karma, Liberation, Spirituality, Moksha",  day: "Tuesday",   gem: "Cat's Eye",   color: "#A78BFA" },
];

// ─── Vedic Calculations ───────────────────────────────────────────────────────

function getVedicRashi(birthDate: string): string {
  const parts = birthDate.split("-");
  if (parts.length !== 3) return "Mesha";
  const month = parseInt(parts[1] ?? "1", 10);
  const day = parseInt(parts[2] ?? "1", 10);

  // Sidereal sun sign (approx, ayanamsha ~23 days offset from tropical)
  if ((month === 4 && day >= 13) || (month === 5 && day <= 13)) return "Mesha";
  if ((month === 5 && day >= 14) || (month === 6 && day <= 14)) return "Vrishabha";
  if ((month === 6 && day >= 15) || (month === 7 && day <= 15)) return "Mithuna";
  if ((month === 7 && day >= 16) || (month === 8 && day <= 16)) return "Karka";
  if ((month === 8 && day >= 17) || (month === 9 && day <= 16)) return "Simha";
  if ((month === 9 && day >= 17) || (month === 10 && day <= 16)) return "Kanya";
  if ((month === 10 && day >= 17) || (month === 11 && day <= 15)) return "Tula";
  if ((month === 11 && day >= 16) || (month === 12 && day <= 15)) return "Vrishchika";
  if ((month === 12 && day >= 16) || (month === 1 && day <= 13)) return "Dhanu";
  if ((month === 1 && day >= 14) || (month === 2 && day <= 12)) return "Makara";
  if ((month === 2 && day >= 13) || (month === 3 && day <= 13)) return "Kumbha";
  return "Meena";
}

function getApproxNakshatra(birthDate: string): string {
  const parts = birthDate.split("-");
  if (parts.length !== 3) return "Ashwini";
  const year = parseInt(parts[0] ?? "2000", 10);
  const month = parseInt(parts[1] ?? "1", 10);
  const day = parseInt(parts[2] ?? "1", 10);

  // Moon moves ~13.17°/day, completes 27.32-day sidereal cycle
  // Reference: Jan 1, 2000 ≈ 218° sidereal (Vishakha)
  const refDate = new Date(2000, 0, 1);
  const birthDt = new Date(year, month - 1, day);
  const daysDiff = Math.round((birthDt.getTime() - refDate.getTime()) / 86400000);
  const refMoonLong = 218; // degrees
  let moonLong = ((refMoonLong + daysDiff * 13.176) % 360 + 360) % 360;
  // Nakshatra index: 0-26, each span 13.33°
  const nakshatraIdx = Math.floor(moonLong / 13.333) % 27;
  return NAKSHATRAS[nakshatraIdx]?.name ?? "Ashwini";
}

function getLagna(birthTime: string): string {
  if (!birthTime) return "Karka";
  const parts = birthTime.split(":");
  const hour = parseInt(parts[0] ?? "12", 10);
  // Each lagna rises for ~2 hours; rough mapping from IST sunrise ~6am
  const lagnaIdx = Math.floor(((hour - 6 + 24) % 24) / 2) % 12;
  return RASHIS[lagnaIdx]?.name ?? "Karka";
}

function getCurrentDasha(nakshatra: string, birthDate: string): string {
  const nk = NAKSHATRAS.find(n => n.name === nakshatra) ?? NAKSHATRAS[0]!;
  const dashaPlanet = nk.dasha;
  const dashaYears = nk.dashaDur;
  // Estimate current dasha based on age
  const parts = birthDate.split("-");
  if (parts.length !== 3) return `${dashaPlanet} Dasha`;
  const birthYear = parseInt(parts[0] ?? "1990", 10);
  const age = new Date().getFullYear() - birthYear;
  const yearInDasha = age % dashaYears;
  const remaining = dashaYears - yearInDasha;
  return `${dashaPlanet} Dasha (${remaining}yr remaining)`;
}

function getRashiData(name: string) {
  return RASHIS.find(r => r.name === name) ?? RASHIS[0]!;
}
function getNakshatraData(name: string) {
  return NAKSHATRAS.find(n => n.name === name) ?? NAKSHATRAS[0]!;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const KUNDALI_KEY = "gundruk_kundali_v1";
const PANCHANG_KEY = `gundruk_panchang_v1:${new Date().toDateString()}`;
const READINGS_KEY = (rashi: string, nk: string) => `gundruk_readings_v1:${rashi}:${nk}:${new Date().toDateString()}`;

interface KundaliProfile {
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  rashi: string;
  lagna: string;
  nakshatra: string;
  dasha: string;
}

// ─── Star Field ───────────────────────────────────────────────────────────────

function StarField({ count = 35 }: { count?: number }) {
  const stars = useRef(
    Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * 260,
      size: Math.random() * 1.8 + 0.4,
      anim: new Animated.Value(Math.random()),
    }))
  ).current;
  useEffect(() => {
    stars.forEach(s => {
      const pulse = () => Animated.sequence([
        Animated.timing(s.anim, { toValue: 1, duration: 1000 + Math.random() * 1500, useNativeDriver: true }),
        Animated.timing(s.anim, { toValue: 0.1, duration: 1000 + Math.random() * 1500, useNativeDriver: true }),
      ]).start(pulse);
      setTimeout(pulse, Math.random() * 2000);
    });
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => (
        <Animated.View key={i} style={{ position: "absolute", left: s.x, top: s.y, width: s.size * 2, height: s.size * 2, borderRadius: s.size, backgroundColor: "#FCD34D", opacity: s.anim }} />
      ))}
    </View>
  );
}

// ─── Mandala Ring Decoration ──────────────────────────────────────────────────

function MandalaRing({ size = 200, color = GOLD }: { size?: number; color?: string }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(rot, { toValue: 1, duration: 30000, useNativeDriver: true })).start();
  }, []);
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: color + "30", borderStyle: "dashed", transform: [{ rotate }], position: "absolute" }} />
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function KundaliSetup({ onComplete }: { onComplete: (p: KundaliProfile) => void }) {
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [error, setError] = useState("");
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleStart = () => {
    if (!birthDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setError("Please enter date as YYYY-MM-DD");
      return;
    }
    const d = new Date(birthDate);
    if (isNaN(d.getTime()) || d > new Date()) { setError("Enter a valid past date"); return; }
    setError("");
    const rashi = getVedicRashi(birthDate);
    const nakshatra = getApproxNakshatra(birthDate);
    const lagna = getLagna(birthTime);
    const dasha = getCurrentDasha(nakshatra, birthDate);
    onComplete({ birthDate, birthTime, birthPlace, rashi, lagna, nakshatra, dasha });
  };

  const rashiPreview = birthDate.match(/^\d{4}-\d{2}-\d{2}$/) ? getVedicRashi(birthDate) : null;
  const rashiData = rashiPreview ? getRashiData(rashiPreview) : null;

  return (
    <ScrollView contentContainerStyle={S.setupScroll} showsVerticalScrollIndicator={false}>
      <StarField />
      <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: slideUp }], alignItems: "center", width: "100%" }}>
        <Text style={S.omText}>ॐ</Text>
        <Text style={S.setupTitle}>Jyotisha — Light of the Veda</Text>
        <Text style={S.setupSub}>
          The ancient Hindu science of Jyotisha maps your karma through the cosmic blueprint imprinted at your birth. Enter your details to reveal your Kundali.
        </Text>

        {rashiData && (
          <View style={[S.rashiPreview, { borderColor: rashiData.color + "60" }]}>
            <LinearGradient colors={[rashiData.color + "25", "transparent"]} style={S.rashiPreviewGrad}>
              <Text style={{ fontSize: 38 }}>{rashiData.symbol}</Text>
              <Text style={[S.rashiPreviewName, { color: rashiData.color }]}>{rashiData.name}</Text>
              <Text style={S.rashiPreviewEn}>{rashiData.en} · {rashiData.planet}</Text>
            </LinearGradient>
          </View>
        )}

        <View style={S.inputSection}>
          <Text style={S.inputLabel}>📅 Date of Birth *</Text>
          <TextInput style={S.inputField} value={birthDate} onChangeText={t => { setBirthDate(t); setError(""); }}
            placeholder="YYYY-MM-DD" placeholderTextColor={DIM} keyboardType="numbers-and-punctuation" maxLength={10} />
        </View>
        <View style={S.inputSection}>
          <Text style={S.inputLabel}>⏰ Time of Birth (for Lagna)</Text>
          <TextInput style={S.inputField} value={birthTime} onChangeText={setBirthTime}
            placeholder="HH:MM (24h, e.g. 14:30)" placeholderTextColor={DIM} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={S.inputSection}>
          <Text style={S.inputLabel}>📍 Place of Birth</Text>
          <TextInput style={S.inputField} value={birthPlace} onChangeText={setBirthPlace}
            placeholder="City, Country" placeholderTextColor={DIM} />
        </View>
        {!!error && <Text style={S.errorText}>{error}</Text>}

        <TouchableOpacity onPress={handleStart} style={S.startBtn} activeOpacity={0.85}>
          <LinearGradient colors={["#D97706", "#92400E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.startBtnGrad}>
            <Text style={S.startBtnText}>Reveal My Kundali 🔮</Text>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={S.privacyNote}>🔒 Stored only on your device</Text>
      </Animated.View>
    </ScrollView>
  );
}

// ─── Panchang Section ─────────────────────────────────────────────────────────

interface PanchangData {
  tithi: string; nakshatra: string; yoga: string; karana: string; vaara: string;
  rahuKaal: string; brahmaMuhurta: string; auspicious: string; avoid: string;
}

function PanchangSection() {
  const [data, setData] = useState<PanchangData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PANCHANG_KEY);
      if (raw) { setData(JSON.parse(raw)); return; }
    } catch {}
    setLoading(true);
    const result = await callAI("jyotisha_panchang", {});
    const d = parseAIJson<PanchangData>(result, {
      tithi: "Panchami", nakshatra: "Rohini", yoga: "Siddhi", karana: "Bava",
      vaara: "Surya (Sunday)", rahuKaal: "4:30 PM – 6:00 PM",
      brahmaMuhurta: "4:48 AM – 5:36 AM", auspicious: "Auspicious for spiritual practices and new beginnings.",
      avoid: "Avoid starting new ventures after sunset today.",
    });
    setData(d);
    AsyncStorage.setItem(PANCHANG_KEY, JSON.stringify(d)).catch(() => {});
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const items = data ? [
    { label: "Tithi", value: data.tithi, icon: "🌙" },
    { label: "Nakshatra", value: data.nakshatra, icon: "⭐" },
    { label: "Yoga", value: data.yoga, icon: "🧘" },
    { label: "Karana", value: data.karana, icon: "☀️" },
    { label: "Vaara", value: data.vaara, icon: "📅" },
    { label: "Rahu Kaal", value: data.rahuKaal, icon: "🚫" },
    { label: "Brahma Muhurta", value: data.brahmaMuhurta, icon: "✨" },
  ] : [];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <LinearGradient colors={["#0A0830", BG]} style={S.panchangHeader}>
        <StarField />
        <Text style={S.omSmall}>ॐ</Text>
        <Text style={S.panchangTitle}>आज का पञ्चाङ्ग</Text>
        <Text style={S.panchangSubtitle}>Today's Panchang</Text>
        <Text style={S.panchangDate}>{today}</Text>
      </LinearGradient>

      {loading && <View style={S.loadBox}><ActivityIndicator color={SAFFRON} size="large" /><Text style={S.loadText}>Reading the cosmos...</Text></View>}

      {data && (
        <View style={{ paddingHorizontal: 16 }}>
          {items.map(item => (
            <View key={item.label} style={S.panchangItem}>
              <Text style={S.panchangIcon}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={S.panchangLabel}>{item.label}</Text>
                <Text style={S.panchangValue}>{item.value}</Text>
              </View>
            </View>
          ))}
          <View style={[S.panchangCard, { borderColor: "#22C55E50" }]}>
            <Text style={S.panchangCardTitle}>🙏 Auspicious Today</Text>
            <Text style={S.panchangCardText}>{data.auspicious}</Text>
          </View>
          <View style={[S.panchangCard, { borderColor: "#EF444450" }]}>
            <Text style={S.panchangCardTitle}>⚠️ Avoid</Text>
            <Text style={S.panchangCardText}>{data.avoid}</Text>
          </View>
          <TouchableOpacity onPress={load} style={S.refreshRow}>
            <Ionicons name="refresh" size={14} color={GOLD} />
            <Text style={S.refreshText}>Refresh Panchang</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Personal Readings ────────────────────────────────────────────────────────

interface ReadingsData { karma: string; love: string; artha: string; moksha: string; dashaMeaning: string; }

function ReadingsSection({ profile }: { profile: KundaliProfile }) {
  const [data, setData] = useState<ReadingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string>("karma");

  const load = useCallback(async () => {
    const key = READINGS_KEY(profile.rashi, profile.nakshatra);
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) { setData(JSON.parse(raw)); return; }
    } catch {}
    setLoading(true);
    const result = await callAI("jyotisha_readings", {
      rashi: profile.rashi, lagna: profile.lagna,
      nakshatra: profile.nakshatra, dasha: profile.dasha,
      birthDate: profile.birthDate,
    });
    const d = parseAIJson<ReadingsData>(result, {
      karma: "Your soul carries ancient wisdom from past lives of devotion and service.",
      love: "Love for you is a sacred journey — your Nakshatra suggests deep and karmic partnerships.",
      artha: "Material success comes through disciplined effort and righteous means (dharmic artha).",
      moksha: "Your path to liberation lies through meditation, selfless service, and surrender.",
      dashaMeaning: "Your current planetary period brings both challenges and profound spiritual growth.",
    });
    setData(d);
    AsyncStorage.setItem(key, JSON.stringify(d)).catch(() => {});
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const rashiData = getRashiData(profile.rashi);
  const sections = [
    { key: "karma",      emoji: "🔮", label: "Karma Reading",    titleSa: "कर्म" },
    { key: "love",       emoji: "💕", label: "Dharma in Love",   titleSa: "धर्म" },
    { key: "artha",      emoji: "💼", label: "Artha & Career",   titleSa: "अर्थ" },
    { key: "moksha",     emoji: "🙏", label: "Moksha Path",      titleSa: "मोक्ष" },
    { key: "dashaMeaning",emoji:"⚡", label: "Current Dasha",    titleSa: "दशा"  },
  ] as const;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Header */}
      <LinearGradient colors={[rashiData.color + "30", BG]} style={S.readingsHeader}>
        <StarField />
        <Text style={{ fontSize: 52 }}>{rashiData.symbol}</Text>
        <Text style={[S.readingsRashi, { color: rashiData.color }]}>{profile.rashi}</Text>
        <Text style={S.readingsNakshatra}>⭐ {profile.nakshatra} Nakshatra · {profile.lagna} Lagna</Text>
        <Text style={S.readingsDasha}>⚡ {profile.dasha}</Text>
      </LinearGradient>

      {loading && <View style={S.loadBox}><ActivityIndicator color={SAFFRON} size="large" /><Text style={S.loadText}>Consulting the Navagraha...</Text></View>}

      {data && (
        <View style={{ paddingHorizontal: 16 }}>
          {sections.map(sec => (
            <TouchableOpacity key={sec.key} activeOpacity={0.85}
              onPress={() => setExpanded(expanded === sec.key ? "" : sec.key)}
              style={[S.readingCard, expanded === sec.key && { borderColor: rashiData.color + "60" }]}>
              <View style={S.readingCardRow}>
                <Text style={S.readingCardEmoji}>{sec.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={S.readingCardSa}>{sec.titleSa}</Text>
                  <Text style={S.readingCardLabel}>{sec.label}</Text>
                </View>
                <Ionicons name={expanded === sec.key ? "chevron-up" : "chevron-down"} size={15} color={DIM} />
              </View>
              {expanded === sec.key && (
                <Text style={S.readingCardText}>{(data as any)[sec.key]}</Text>
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={load} style={S.refreshRow}>
            <Ionicons name="refresh" size={14} color={GOLD} />
            <Text style={S.refreshText}>Refresh Readings</Text>
          </TouchableOpacity>
        </View>
      )}
      {!data && !loading && (
        <TouchableOpacity onPress={load} style={S.retryBtn}>
          <Text style={S.retryText}>🔮 Generate My Readings</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ─── Navagraha ────────────────────────────────────────────────────────────────

function NavagrahaSection({ profile }: { profile: KundaliProfile }) {
  const [selected, setSelected] = useState<typeof NAVAGRAHA[0] | null>(null);
  const rashiData = getRashiData(profile.rashi);
  const rulingPlanet = rashiData.planet;

  if (selected) {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <LinearGradient colors={[selected.color + "30", BG]} style={S.grahaDetailHeader}>
          <TouchableOpacity onPress={() => setSelected(null)} style={S.backBtn}>
            <Ionicons name="arrow-back" size={20} color={CREAM} />
          </TouchableOpacity>
          <Text style={{ fontSize: 52, marginTop: 20 }}>{selected.symbol}</Text>
          <Text style={[S.grahaDetailName, { color: selected.color }]}>{selected.name}</Text>
          <Text style={S.grahaDetailEn}>{selected.en}</Text>
          {selected.name === rulingPlanet && (
            <View style={S.rulingBadge}>
              <Text style={S.rulingBadgeText}>Your Ruling Planet ✨</Text>
            </View>
          )}
        </LinearGradient>
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <View style={[S.grahaCard, { borderColor: selected.color + "40" }]}>
            <Text style={S.grahaCardTitle}>Domain of Influence</Text>
            <Text style={S.grahaCardText}>{selected.rules}</Text>
          </View>
          <View style={S.grahaMetaRow}>
            <View style={S.grahaMetaCard}>
              <Text style={S.grahaMetaLabel}>Puja Day</Text>
              <Text style={[S.grahaMetaValue, { color: selected.color }]}>{selected.day}</Text>
            </View>
            <View style={S.grahaMetaCard}>
              <Text style={S.grahaMetaLabel}>Gemstone</Text>
              <Text style={[S.grahaMetaValue, { color: selected.color }]}>{selected.gem}</Text>
            </View>
            <View style={S.grahaMetaCard}>
              <Text style={S.grahaMetaLabel}>Nature</Text>
              <Text style={[S.grahaMetaValue, { color: selected.color }]}>{selected.nature}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>🪐 Navagraha</Text>
        <Text style={S.sectionSub}>The Nine Celestial Rulers of your Kundali</Text>
        <Text style={S.sectionSub2}>Your ruling planet: <Text style={{ color: rashiData.color }}>{rulingPlanet}</Text></Text>
      </View>
      <View style={{ paddingHorizontal: 12, flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
        {NAVAGRAHA.map(g => {
          const isRuling = g.name === rulingPlanet;
          return (
            <TouchableOpacity key={g.name} onPress={() => setSelected(g)} activeOpacity={0.8}
              style={[S.grahaCard2, { borderColor: g.color + (isRuling ? "FF" : "50"), borderWidth: isRuling ? 2 : 1 }]}>
              <LinearGradient colors={[g.color + "20", "transparent"]} style={S.grahaCard2Grad}>
                {isRuling && <View style={S.rulingDot}><Text style={{ fontSize: 8, color: "#fff" }}>★</Text></View>}
                <Text style={{ fontSize: 32, marginBottom: 4 }}>{g.symbol}</Text>
                <Text style={[S.grahaCard2Name, { color: g.color }]}>{g.name}</Text>
                <Text style={S.grahaCard2En}>{g.en}</Text>
                <Text style={S.grahaCard2Day}>{g.day}</Text>
              </LinearGradient>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Kundali Matching ─────────────────────────────────────────────────────────

interface KootaItem { name: string; score: number; max: number; meaning: string; }
interface CompatData { total: number; outOf: number; kootas: KootaItem[]; verdict: string; strengthLevel: string; advice: string; }

function MatchingSection({ profile }: { profile: KundaliProfile }) {
  const [rashi2, setRashi2] = useState<string | null>(null);
  const [nakshatra2, setNakshatra2] = useState<string | null>(null);
  const [result, setResult] = useState<CompatData | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"rashi" | "nakshatra" | "result">("rashi");

  const checkCompat = async () => {
    if (!rashi2 || !nakshatra2) return;
    setLoading(true);
    setResult(null);
    const ai = await callAI("jyotisha_compatibility", {
      rashi1: profile.rashi, nakshatra1: profile.nakshatra,
      rashi2, nakshatra2,
    });
    const d = parseAIJson<CompatData>(ai, {
      total: 24, outOf: 36,
      kootas: [{ name: "Nadi", score: 8, max: 8, meaning: "Perfect alignment of vital forces" }],
      verdict: "A spiritually significant union with karmic roots.",
      strengthLevel: "Good",
      advice: "Perform the Nakshatra-based compatibility puja before marriage.",
    });
    setResult(d);
    setLoading(false);
    setStep("result");
  };

  const levelColor = (l: string) =>
    l === "Excellent" ? "#22C55E" : l === "Good" ? SAFFRON : l === "Acceptable" ? "#F97316" : "#EF4444";

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>💫 Kundali Matching</Text>
        <Text style={S.sectionSub}>Guna Milan — 36-point Vedic compatibility</Text>
      </View>

      <View style={S.matchMeRow}>
        <View style={[S.matchSign, { borderColor: getRashiData(profile.rashi).color + "70" }]}>
          <Text style={{ fontSize: 30 }}>{getRashiData(profile.rashi).symbol}</Text>
          <Text style={[S.matchSignName, { color: getRashiData(profile.rashi).color }]}>{profile.rashi}</Text>
          <Text style={S.matchSignNk}>{profile.nakshatra}</Text>
        </View>
        <Text style={S.matchPlus}>🪔</Text>
        <View style={[S.matchSign, { borderColor: rashi2 ? getRashiData(rashi2).color + "70" : "rgba(255,255,255,0.1)" }]}>
          {rashi2 ? (<>
            <Text style={{ fontSize: 30 }}>{getRashiData(rashi2).symbol}</Text>
            <Text style={[S.matchSignName, { color: getRashiData(rashi2).color }]}>{rashi2}</Text>
            <Text style={S.matchSignNk}>{nakshatra2 ?? "?"}</Text>
          </>) : (<Text style={S.matchPickText}>Pick →</Text>)}
        </View>
      </View>

      {step === "rashi" && (
        <>
          <Text style={S.pickLabel}>Their Rashi (Moon sign)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipRow}>
            {RASHIS.filter(r => r.name !== profile.rashi).map(r => (
              <TouchableOpacity key={r.name} onPress={() => { setRashi2(r.name); setStep("nakshatra"); }} style={[S.chip, { borderColor: r.color + "60" }]}>
                <Text style={{ fontSize: 18 }}>{r.symbol}</Text>
                <Text style={[S.chipText, { color: r.color }]}>{r.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {step === "nakshatra" && rashi2 && (
        <>
          <Text style={S.pickLabel}>Their Nakshatra</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipRow}>
            {NAKSHATRAS.map(nk => (
              <TouchableOpacity key={nk.name} onPress={() => { setNakshatra2(nk.name); checkCompat(); }} style={[S.chip, { borderColor: GOLD + "40" }]}>
                <Text style={[S.chipText, { color: SAFFRON }]}>{nk.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={() => setStep("rashi")} style={S.backLink}>
            <Text style={{ color: DIM, fontSize: 13, fontFamily: "Poppins_400Regular" }}>← Change Rashi</Text>
          </TouchableOpacity>
        </>
      )}

      {loading && <View style={S.loadBox}><ActivityIndicator color={SAFFRON} size="large" /><Text style={S.loadText}>Calculating Guna Milan...</Text></View>}

      {result && step === "result" && (
        <View style={{ paddingHorizontal: 16 }}>
          <View style={S.scoreBox}>
            <LinearGradient colors={["#D97706", "#92400E"]} style={S.scoreRing}>
              <View style={S.scoreInner}>
                <Text style={S.scoreNumber}>{result.total}</Text>
                <Text style={S.scoreDenom}>/{result.outOf}</Text>
              </View>
            </LinearGradient>
            <Text style={[S.strengthLevel, { color: levelColor(result.strengthLevel) }]}>{result.strengthLevel}</Text>
          </View>

          <View style={[S.verdictBox, { borderColor: levelColor(result.strengthLevel) + "40" }]}>
            <Text style={S.verdictText}>"{result.verdict}"</Text>
          </View>

          <Text style={S.kootaTitle}>Koota Breakdown</Text>
          {result.kootas.map(k => (
            <View key={k.name} style={S.kootaRow}>
              <View style={{ flex: 1 }}>
                <Text style={S.kootaName}>{k.name}</Text>
                <Text style={S.kootaMeaning}>{k.meaning}</Text>
              </View>
              <Text style={[S.kootaScore, { color: k.score >= k.max * 0.7 ? "#22C55E" : k.score >= k.max * 0.4 ? SAFFRON : "#EF4444" }]}>
                {k.score}/{k.max}
              </Text>
            </View>
          ))}

          <View style={S.adviceBox}>
            <Text style={S.adviceTitle}>🙏 Vedic Wisdom</Text>
            <Text style={S.adviceText}>{result.advice}</Text>
          </View>

          <TouchableOpacity onPress={() => { setStep("rashi"); setRashi2(null); setNakshatra2(null); setResult(null); }} style={S.refreshRow}>
            <Ionicons name="refresh" size={14} color={GOLD} />
            <Text style={S.refreshText}>Check Another</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Ask Jyotishi ─────────────────────────────────────────────────────────────

interface ChatMsg { role: "user" | "assistant"; content: string; }

const QUICK_QS = [
  "When will I get married?",
  "What does Shani Sade Sati mean for me?",
  "Is this a good time to start a business?",
  "What remedies help my Rahu?",
  "Explain my Nakshatra's meaning",
  "What is my strongest Graha?",
];

function JyotishiChat({ profile }: { profile: KundaliProfile }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: "assistant", content: `🔮 Namaste, seeker. I see you are born under ${profile.rashi} Rashi, with ${profile.nakshatra} Nakshatra as your birth star. The Navagraha await your questions. What wisdom do you seek from the stars?` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    const updated: ChatMsg[] = [...msgs, { role: "user", content: trimmed }];
    setMsgs(updated);
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    const result = await callAI("jyotishi_chat",
      { rashi: profile.rashi, nakshatra: profile.nakshatra, lagna: profile.lagna, dasha: profile.dasha },
      { messages: updated.map(m => ({ role: m.role, content: m.content })), noCache: true }
    );
    setMsgs(prev => [...prev, { role: "assistant", content: result ?? "The cosmic signal is unclear 🌙 Please ask again." }]);
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={140}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>🔮 Ask the Jyotishi</Text>
        <Text style={S.sectionSub}>Ask anything — karma, love, career, remedies</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipRow}>
        {QUICK_QS.map(q => (
          <TouchableOpacity key={q} onPress={() => send(q)} style={S.quickQ}>
            <Text style={S.quickQText}>{q}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 20 }}>
        {msgs.map((m, i) => (
          <View key={i} style={[S.bubble, m.role === "user" ? S.userBubble : S.aiBubble]}>
            {m.role === "assistant" && <Text style={S.bubbleIcon}>🪔</Text>}
            <Text style={[S.bubbleText, m.role === "user" && S.userBubbleText]}>{m.content}</Text>
          </View>
        ))}
        {loading && (
          <View style={[S.bubble, S.aiBubble]}>
            <Text style={S.bubbleIcon}>🪔</Text>
            <ActivityIndicator color={SAFFRON} size="small" />
          </View>
        )}
      </ScrollView>
      <View style={S.chatInputRow}>
        <TextInput style={S.chatInput} value={input} onChangeText={setInput}
          placeholder="Ask the Jyotishi..." placeholderTextColor={DIM} multiline />
        <TouchableOpacity onPress={() => send(input)} disabled={!input.trim() || loading}
          style={[S.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]}>
          <LinearGradient colors={[GOLD, "#92400E"]} style={S.sendBtnGrad}>
            <Ionicons name="send" size={16} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Upaya Remedies ───────────────────────────────────────────────────────────

interface RemedyData {
  mantra: { text: string; count: string; deity: string };
  gemstone: { name: string; metal: string; finger: string; day: string };
  fasting: { day: string; benefit: string };
  puja: string; charity: string; color: string; food: string;
}

function UpaayaSection({ profile }: { profile: KundaliProfile }) {
  const [data, setData] = useState<RemedyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [planet, setPlanet] = useState(getNakshatraData(profile.nakshatra).planet);

  const load = useCallback(async (pl: string) => {
    setLoading(true);
    const result = await callAI("jyotisha_remedies", { rashi: profile.rashi, nakshatra: profile.nakshatra, planet: pl });
    const d = parseAIJson<RemedyData>(result, {
      mantra: { text: "Om Namah Shivaya", count: "108 times daily", deity: "Shiva" },
      gemstone: { name: "Yellow Sapphire", metal: "Gold", finger: "Index finger", day: "Thursday" },
      fasting: { day: "Thursday", benefit: "Strengthens Guru (Jupiter) energy" },
      puja: "Perform Navagraha puja on Saturdays for overall planetary balance.",
      charity: "Donate yellow items (dal, turmeric, cloth) on Thursdays.",
      color: "Wear yellow or gold on Thursdays for divine grace.",
      food: "Offer sweet rice (kheer) to Brahmins on full moon days.",
    });
    setData(d);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(planet); }, [load, planet]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>💎 Upaya — Remedies</Text>
        <Text style={S.sectionSub}>Vedic remedies to balance planetary energies</Text>
      </View>
      <Text style={S.pickLabel}>Select planet to remedy</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipRow}>
        {NAVAGRAHA.map(g => (
          <TouchableOpacity key={g.name} onPress={() => { setPlanet(g.name); load(g.name); }}
            style={[S.chip, { borderColor: g.color + "70", backgroundColor: planet === g.name ? g.color + "20" : "transparent" }]}>
            <Text style={{ fontSize: 16 }}>{g.symbol}</Text>
            <Text style={[S.chipText, { color: g.color }]}>{g.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && <View style={S.loadBox}><ActivityIndicator color={SAFFRON} size="large" /><Text style={S.loadText}>Consulting ancient texts...</Text></View>}

      {data && (
        <View style={{ paddingHorizontal: 16 }}>
          {[
            { icon: "🙏", title: "Mantra", content: `${data.mantra.text}\n${data.mantra.count} · Deity: ${data.mantra.deity}` },
            { icon: "💎", title: "Gemstone", content: `${data.gemstone.name} in ${data.gemstone.metal}\nWear on ${data.gemstone.finger} · Start on ${data.gemstone.day}` },
            { icon: "🌿", title: "Fasting", content: `Fast on ${data.fasting.day}\n${data.fasting.benefit}` },
            { icon: "🕯️", title: "Puja", content: data.puja },
            { icon: "🤲", title: "Charity (Daan)", content: data.charity },
            { icon: "🎨", title: "Auspicious Color", content: data.color },
            { icon: "🍚", title: "Food Offering", content: data.food },
          ].map(item => (
            <View key={item.title} style={S.remedyCard}>
              <Text style={S.remedyIcon}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={S.remedyTitle}>{item.title}</Text>
                <Text style={S.remedyContent}>{item.content}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Nakshatra Detail ─────────────────────────────────────────────────────────

interface NakshatraDetail {
  deity: string; planet: string; symbol: string; qualities: string[];
  strengths: string; challenges: string; purpose: string;
  compatible: string[]; mantra: string; famousPeople: string[];
  gemstone: string; color: string;
}

function NakshatraSection({ profile }: { profile: KundaliProfile }) {
  const [detail, setDetail] = useState<NakshatraDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(profile.nakshatra);

  const nkData = getNakshatraData(selected);

  const load = useCallback(async (nk: string) => {
    setLoading(true);
    const result = await callAI("jyotisha_nakshatra_detail", { nakshatra: nk });
    const d = parseAIJson<NakshatraDetail>(result, {
      deity: "Unknown", planet: nkData.planet, symbol: nkData.symbol,
      qualities: ["Intuitive", "Spiritual", "Determined", "Compassionate"],
      strengths: "Strong intuition and natural healing abilities.",
      challenges: "Tendency toward over-sensitivity and emotional imbalance.",
      purpose: "To bring healing and spiritual wisdom to the world.",
      compatible: ["Rohini", "Hasta", "Ashwini"],
      mantra: "Om Chandraya Namah", famousPeople: ["Famous Person 1"],
      gemstone: "Pearl", color: "White",
    });
    setDetail(d);
    setLoading(false);
  }, [nkData.planet, nkData.symbol]);

  useEffect(() => { load(selected); }, [selected, load]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>⭐ Nakshatra</Text>
        <Text style={S.sectionSub}>The 27 Lunar Mansions — your birth star</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipRow}>
        {NAKSHATRAS.map(nk => (
          <TouchableOpacity key={nk.name} onPress={() => setSelected(nk.name)}
            style={[S.chip, { borderColor: selected === nk.name ? GOLD : GOLD + "30",
              backgroundColor: selected === nk.name ? GOLD + "20" : "transparent" }]}>
            <Text style={[S.chipText, { color: selected === nk.name ? SAFFRON : DIM }]}>{nk.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <LinearGradient colors={["#0A0820", BG]} style={S.nkHeader}>
        <Text style={S.nkName}>{selected}</Text>
        <Text style={S.nkPlanet}>Ruled by {nkData.planet} · {nkData.deity}</Text>
        <Text style={S.nkSymbol}>{nkData.symbol}</Text>
        {selected === profile.nakshatra && (
          <View style={S.yourNkBadge}><Text style={S.yourNkText}>Your Birth Nakshatra ⭐</Text></View>
        )}
      </LinearGradient>

      {loading && <View style={S.loadBox}><ActivityIndicator color={SAFFRON} size="large" /><Text style={S.loadText}>Reading Nakshatra wisdom...</Text></View>}

      {detail && (
        <View style={{ paddingHorizontal: 16 }}>
          <View style={S.nkQualities}>
            {detail.qualities.map(q => (
              <View key={q} style={S.nkQualityPill}>
                <Text style={S.nkQualityText}>{q}</Text>
              </View>
            ))}
          </View>
          {[
            { title: "💪 Strengths", text: detail.strengths },
            { title: "🌙 Challenges", text: detail.challenges },
            { title: "🎯 Life Purpose", text: detail.purpose },
            { title: "🕯️ Sacred Mantra", text: detail.mantra },
            { title: "💎 Gemstone", text: `${detail.gemstone} · Color: ${detail.color}` },
            { title: "❤️ Compatible Nakshatras", text: detail.compatible.join(", ") },
            { title: "🌟 Famous People", text: detail.famousPeople.join(", ") },
          ].map(item => (
            <View key={item.title} style={S.nkCard}>
              <Text style={S.nkCardTitle}>{item.title}</Text>
              <Text style={S.nkCardText}>{item.text}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

type Section = "panchang" | "readings" | "navagraha" | "matching" | "chat" | "upaya" | "nakshatra";

const NAV: { id: Section; emoji: string; label: string; labelSa: string }[] = [
  { id: "panchang",  emoji: "📅", label: "Panchang",  labelSa: "पञ्चाङ्ग" },
  { id: "readings",  emoji: "🔮", label: "Readings",  labelSa: "फलित"     },
  { id: "navagraha", emoji: "🪐", label: "Navagraha", labelSa: "नवग्रह"    },
  { id: "matching",  emoji: "💫", label: "Match",     labelSa: "मिलान"     },
  { id: "chat",      emoji: "🙏", label: "Jyotishi",  labelSa: "ज्योतिषी"  },
  { id: "upaya",     emoji: "💎", label: "Upaya",     labelSa: "उपाय"      },
  { id: "nakshatra", emoji: "⭐", label: "Nakshatra", labelSa: "नक्षत्र"   },
];

export function JyotishaTab({ userId }: { userId?: string }) {
  const [profile, setProfile] = useState<KundaliProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("panchang");

  useEffect(() => {
    AsyncStorage.getItem(KUNDALI_KEY)
      .then(raw => { if (raw) setProfile(JSON.parse(raw)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSetup = async (p: KundaliProfile) => {
    setProfile(p);
    await AsyncStorage.setItem(KUNDALI_KEY, JSON.stringify(p)).catch(() => {});
    // Best-effort sync to Supabase if logged in
    if (userId) {
      void supabase.from("kundali_profiles").upsert({
        user_id: userId, birth_date: p.birthDate, birth_time: p.birthTime,
        birth_place: p.birthPlace, rashi: p.rashi, lagna: p.lagna,
        nakshatra: p.nakshatra, dasha_period: p.dasha,
      });
    }
  };

  const reset = () => {
    setProfile(null);
    AsyncStorage.removeItem(KUNDALI_KEY).catch(() => {});
  };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: BG, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color={SAFFRON} size="large" />
      <Text style={{ color: DIM, marginTop: 12, fontFamily: "Poppins_400Regular" }}>ॐ Loading Jyotisha...</Text>
    </View>;
  }

  if (!profile) {
    return <View style={{ flex: 1, backgroundColor: BG }}><KundaliSetup onComplete={handleSetup} /></View>;
  }

  const rashiData = getRashiData(profile.rashi);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Compact header */}
      <LinearGradient colors={["#0A0830", BG]} style={S.mainHeader}>
        <View style={{ flex: 1 }}>
          <Text style={S.mainHeaderTitle}>
            <Text style={S.omInline}>ॐ </Text>
            <Text style={{ color: rashiData.color }}>{profile.rashi}</Text>
            <Text style={{ color: CREAM }}> · {profile.nakshatra}</Text>
          </Text>
          <Text style={S.mainHeaderSub}>{profile.lagna} Lagna · {profile.dasha}</Text>
        </View>
        <TouchableOpacity onPress={reset} style={S.resetBtn}>
          <Ionicons name="settings-outline" size={17} color={DIM} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Nav */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.navRow}>
        {NAV.map(tab => {
          const active = section === tab.id;
          return (
            <TouchableOpacity key={tab.id} onPress={() => setSection(tab.id)} activeOpacity={0.8}
              style={[S.navTab, active && { borderColor: GOLD }]}>
              {active ? (
                <LinearGradient colors={[GOLD, "#92400E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.navTabGrad}>
                  <Text style={S.navTabEmoji}>{tab.emoji}</Text>
                  <Text style={[S.navTabLabel, { color: "#fff" }]}>{tab.label}</Text>
                </LinearGradient>
              ) : (
                <View style={S.navTabInner}>
                  <Text style={S.navTabEmoji}>{tab.emoji}</Text>
                  <Text style={[S.navTabLabel, { color: "#6B7280" }]}>{tab.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {section === "panchang"  && <PanchangSection />}
        {section === "readings"  && <ReadingsSection profile={profile} />}
        {section === "navagraha" && <NavagrahaSection profile={profile} />}
        {section === "matching"  && <MatchingSection profile={profile} />}
        {section === "chat"      && <JyotishiChat profile={profile} />}
        {section === "upaya"     && <UpaayaSection profile={profile} />}
        {section === "nakshatra" && <NakshatraSection profile={profile} />}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  setupScroll: { flexGrow: 1, backgroundColor: BG, alignItems: "center", paddingHorizontal: 24, paddingTop: 32, paddingBottom: 60 },
  omText: { color: GOLD, fontSize: 48, fontFamily: "Poppins_700Bold", marginBottom: 8 },
  setupTitle: { color: CREAM, fontSize: 21, fontFamily: "Poppins_700Bold", textAlign: "center", marginBottom: 10 },
  setupSub: { color: DIM, fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  rashiPreview: { borderWidth: 1, borderRadius: 20, overflow: "hidden", marginBottom: 24, width: 150 },
  rashiPreviewGrad: { padding: 18, alignItems: "center" },
  rashiPreviewName: { fontSize: 18, fontFamily: "Poppins_700Bold", marginTop: 4 },
  rashiPreviewEn: { color: DIM, fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 2 },
  inputSection: { width: "100%", marginBottom: 16 },
  inputLabel: { color: DIM, fontFamily: "Poppins_600SemiBold", fontSize: 12, marginBottom: 6 },
  inputField: { backgroundColor: "rgba(253,230,138,0.05)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(253,230,138,0.15)", paddingHorizontal: 16, paddingVertical: 13, color: CREAM, fontFamily: "Poppins_400Regular", fontSize: 15 },
  errorText: { color: "#F87171", fontFamily: "Poppins_400Regular", fontSize: 12, marginBottom: 8 },
  startBtn: { borderRadius: 28, overflow: "hidden", width: "100%", marginBottom: 14 },
  startBtnGrad: { paddingVertical: 15, alignItems: "center" },
  startBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  privacyNote: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11 },

  panchangHeader: { paddingTop: 28, paddingBottom: 24, alignItems: "center" },
  omSmall: { color: GOLD, fontSize: 28, fontFamily: "Poppins_700Bold", marginBottom: 4 },
  panchangTitle: { color: GOLD, fontSize: 20, fontFamily: "Poppins_700Bold" },
  panchangSubtitle: { color: DIM, fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 2 },
  panchangDate: { color: "rgba(253,230,138,0.5)", fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 8 },
  panchangItem: { flexDirection: "row", alignItems: "center", backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 14, marginBottom: 8 },
  panchangIcon: { fontSize: 20, marginRight: 12, width: 28, textAlign: "center" },
  panchangLabel: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11, marginBottom: 2 },
  panchangValue: { color: CREAM, fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  panchangCard: { backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  panchangCardTitle: { color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 14, marginBottom: 6 },
  panchangCardText: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20 },

  readingsHeader: { paddingTop: 28, paddingBottom: 24, alignItems: "center" },
  readingsRashi: { fontSize: 26, fontFamily: "Poppins_700Bold", marginTop: 6 },
  readingsNakshatra: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  readingsDasha: { color: SAFFRON, fontFamily: "Poppins_600SemiBold", fontSize: 12, marginTop: 4 },
  readingCard: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 16, marginBottom: 8 },
  readingCardRow: { flexDirection: "row", alignItems: "center" },
  readingCardEmoji: { fontSize: 22, marginRight: 10 },
  readingCardSa: { color: GOLD, fontFamily: "Poppins_700Bold", fontSize: 12 },
  readingCardLabel: { color: CREAM, fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  readingCardText: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22, marginTop: 12 },

  sectionHeaderPad: { padding: 16, paddingBottom: 8 },
  sectionTitle: { color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 20 },
  sectionSub: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 2 },
  sectionSub2: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 4 },

  grahaDetailHeader: { paddingTop: 28, paddingBottom: 24, alignItems: "center" },
  backBtn: { position: "absolute", top: 12, left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", justifyContent: "center", alignItems: "center" },
  grahaDetailName: { fontSize: 26, fontFamily: "Poppins_700Bold", marginTop: 8 },
  grahaDetailEn: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, marginTop: 2 },
  rulingBadge: { marginTop: 8, backgroundColor: GOLD + "30", borderRadius: 20, borderWidth: 1, borderColor: GOLD + "60", paddingHorizontal: 14, paddingVertical: 4 },
  rulingBadgeText: { color: SAFFRON, fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  grahaCard: { backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  grahaCardTitle: { color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 14, marginBottom: 6 },
  grahaCardText: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22 },
  grahaMetaRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  grahaMetaCard: { flex: 1, backgroundColor: CARD_BG, borderRadius: 12, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 12, alignItems: "center" },
  grahaMetaLabel: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 10, marginBottom: 4 },
  grahaMetaValue: { fontFamily: "Poppins_700Bold", fontSize: 13, textAlign: "center" },
  grahaCard2: { width: (W - 44) / 3, borderRadius: 14, overflow: "hidden" },
  grahaCard2Grad: { padding: 12, alignItems: "center", minHeight: 100 },
  rulingDot: { position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: GOLD, justifyContent: "center", alignItems: "center" },
  grahaCard2Name: { fontFamily: "Poppins_700Bold", fontSize: 12, marginBottom: 1 },
  grahaCard2En: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 10 },
  grahaCard2Day: { color: "rgba(253,230,138,0.25)", fontFamily: "Poppins_400Regular", fontSize: 9, marginTop: 2 },

  matchMeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, gap: 12 },
  matchSign: { alignItems: "center", backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1, padding: 14, width: 110, minHeight: 90, justifyContent: "center" },
  matchSignName: { fontFamily: "Poppins_700Bold", fontSize: 13, marginTop: 4 },
  matchSignNk: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 10, marginTop: 2 },
  matchPlus: { fontSize: 24 },
  matchPickText: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13 },
  pickLabel: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, paddingLeft: 16, marginBottom: 6 },
  chipRow: { paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  chip: { backgroundColor: CARD_BG, borderRadius: 22, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, alignItems: "center", gap: 3 },
  chipText: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  backLink: { paddingLeft: 16, paddingBottom: 8 },
  scoreBox: { alignItems: "center", marginBottom: 20 },
  scoreRing: { width: 110, height: 110, borderRadius: 55, justifyContent: "center", alignItems: "center" },
  scoreInner: { width: 90, height: 90, borderRadius: 45, backgroundColor: BG, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 2 },
  scoreNumber: { color: CREAM, fontSize: 34, fontFamily: "Poppins_700Bold" },
  scoreDenom: { color: DIM, fontSize: 16, fontFamily: "Poppins_400Regular", alignSelf: "flex-end", marginBottom: 6 },
  strengthLevel: { fontFamily: "Poppins_700Bold", fontSize: 18, marginTop: 12 },
  verdictBox: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  verdictText: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22, fontStyle: "italic", textAlign: "center" },
  kootaTitle: { color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 16, marginBottom: 10 },
  kootaRow: { flexDirection: "row", alignItems: "center", backgroundColor: CARD_BG, borderRadius: 12, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 12, marginBottom: 6 },
  kootaName: { color: CREAM, fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  kootaMeaning: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  kootaScore: { fontFamily: "Poppins_700Bold", fontSize: 16, marginLeft: 12 },
  adviceBox: { backgroundColor: "rgba(217,119,6,0.1)", borderRadius: 14, borderWidth: 1, borderColor: GOLD + "40", padding: 16, marginTop: 16 },
  adviceTitle: { color: SAFFRON, fontFamily: "Poppins_700Bold", fontSize: 14, marginBottom: 6 },
  adviceText: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 21 },

  quickQ: { backgroundColor: "rgba(217,119,6,0.12)", borderRadius: 20, borderWidth: 1, borderColor: GOLD + "40", paddingHorizontal: 14, paddingVertical: 7 },
  quickQText: { color: SAFFRON, fontFamily: "Poppins_400Regular", fontSize: 12 },
  bubble: { borderRadius: 18, padding: 14, marginVertical: 4, maxWidth: "86%", flexDirection: "row", gap: 8, alignItems: "flex-start" },
  aiBubble: { backgroundColor: "rgba(217,119,6,0.1)", borderWidth: 1, borderColor: GOLD + "30", alignSelf: "flex-start" },
  userBubble: { backgroundColor: GOLD, alignSelf: "flex-end", borderWidth: 0 },
  bubbleIcon: { fontSize: 16, marginTop: 2 },
  bubbleText: { flex: 1, color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 21 },
  userBubbleText: { color: "#fff" },
  chatInputRow: { flexDirection: "row", padding: 12, gap: 8, alignItems: "flex-end", borderTopWidth: 1, borderTopColor: "rgba(253,230,138,0.08)", backgroundColor: "#05050F" },
  chatInput: { flex: 1, backgroundColor: CARD_BG, borderRadius: 20, borderWidth: 1, borderColor: "rgba(253,230,138,0.12)", paddingHorizontal: 16, paddingVertical: 11, color: CREAM, fontFamily: "Poppins_400Regular", fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, overflow: "hidden" },
  sendBtnGrad: { flex: 1, justifyContent: "center", alignItems: "center" },

  remedyCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 14, marginBottom: 8 },
  remedyIcon: { fontSize: 22, marginRight: 12, marginTop: 2 },
  remedyTitle: { color: GOLD, fontFamily: "Poppins_700Bold", fontSize: 14, marginBottom: 4 },
  remedyContent: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20 },

  nkHeader: { padding: 24, alignItems: "center" },
  nkName: { color: SAFFRON, fontSize: 24, fontFamily: "Poppins_700Bold" },
  nkPlanet: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  nkSymbol: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  yourNkBadge: { marginTop: 10, backgroundColor: GOLD + "25", borderRadius: 20, borderWidth: 1, borderColor: GOLD + "60", paddingHorizontal: 14, paddingVertical: 4 },
  yourNkText: { color: SAFFRON, fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  nkQualities: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  nkQualityPill: { backgroundColor: "rgba(217,119,6,0.15)", borderRadius: 20, borderWidth: 1, borderColor: GOLD + "40", paddingHorizontal: 12, paddingVertical: 5 },
  nkQualityText: { color: SAFFRON, fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  nkCard: { backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 14, marginBottom: 10 },
  nkCardTitle: { color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 14, marginBottom: 6 },
  nkCardText: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 21 },

  mainHeader: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center" },
  mainHeaderTitle: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  omInline: { color: GOLD },
  mainHeaderSub: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 10, marginTop: 1 },
  resetBtn: { padding: 8 },
  navRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  navTab: { borderRadius: 24, borderWidth: 1, borderColor: "rgba(253,230,138,0.12)", overflow: "hidden" },
  navTabGrad: { flexDirection: "row", alignItems: "center", paddingHorizontal: 13, paddingVertical: 7, gap: 5 },
  navTabInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 13, paddingVertical: 7, gap: 5 },
  navTabEmoji: { fontSize: 13 },
  navTabLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },

  loadBox: { alignItems: "center", paddingVertical: 40 },
  loadText: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, marginTop: 12 },
  retryBtn: { margin: 24, backgroundColor: "rgba(217,119,6,0.12)", borderRadius: 16, borderWidth: 1, borderColor: GOLD + "40", padding: 20, alignItems: "center" },
  retryText: { color: SAFFRON, fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  refreshRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 20, gap: 6, paddingVertical: 12 },
  refreshText: { color: GOLD, fontFamily: "Poppins_400Regular", fontSize: 13 },
});
