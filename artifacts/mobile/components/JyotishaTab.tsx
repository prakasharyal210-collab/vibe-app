import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Dimensions,
} from "react-native";
import RAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
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
const SPIRITUAL_PATH_KEY = (rashi: string, nk: string) => `gundruk_spiritual_path_v2:${rashi}:${nk}`;
const PAST_LIFE_KEY = (rashi: string, nk: string) => `gundruk_past_life_v2:${rashi}:${nk}`;
const KARMA_TYPES_KEY = (rashi: string, nk: string) => `gundruk_karma_types_v2:${rashi}:${nk}`;
const ISHTA_KEY = (rashi: string, nk: string) => `gundruk_ishta_devata_v2:${rashi}:${nk}`;
const NAVAMSA_KEY = (rashi: string, nk: string) => `gundruk_navamsa_v2:${rashi}:${nk}`;
const JAPA_COUNTS_KEY = "gundruk_japa_counts_v1";

// ─── Dasha Calendar Helpers ───────────────────────────────────────────────────

const DASHA_ORDER = ["Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn","Mercury"] as const;
const DASHA_YEARS: Record<string, number> = { Ketu:7, Venus:20, Sun:6, Moon:10, Mars:7, Rahu:18, Jupiter:16, Saturn:19, Mercury:17 };
const DASHA_COLORS: Record<string, string> = { Ketu:"#7C3AED", Venus:"#EC4899", Sun:"#F97316", Moon:"#3B82F6", Mars:"#EF4444", Rahu:"#6B7280", Jupiter:"#FBBF24", Saturn:"#1D4ED8", Mercury:"#10B981" };
const NAKSHATRA_DASHA: Record<string, string> = {
  "Ashwini":"Ketu","Bharani":"Venus","Krittika":"Sun","Rohini":"Moon","Mrigashira":"Mars","Ardra":"Rahu",
  "Punarvasu":"Jupiter","Pushya":"Saturn","Ashlesha":"Mercury","Magha":"Ketu","Purva Phalguni":"Venus",
  "Uttara Phalguni":"Sun","Hasta":"Moon","Chitra":"Mars","Swati":"Rahu","Vishakha":"Jupiter",
  "Anuradha":"Saturn","Jyeshtha":"Mercury","Mula":"Ketu","Purva Ashadha":"Venus","Uttara Ashadha":"Sun",
  "Shravana":"Moon","Dhanishtha":"Mars","Shatabhisha":"Rahu","Purva Bhadrapada":"Jupiter",
  "Uttara Bhadrapada":"Saturn","Revati":"Mercury",
};

function calcDashas(nakshatra: string, birthDateStr: string) {
  const startPlanet = NAKSHATRA_DASHA[nakshatra] ?? "Ketu";
  const startIdx = DASHA_ORDER.indexOf(startPlanet as (typeof DASHA_ORDER)[number]);
  const birthDate = new Date(birthDateStr);
  const results: Array<{ planet: string; start: Date; end: Date; years: number; color: string }> = [];
  let cur = new Date(birthDate);
  for (let i = 0; i < DASHA_ORDER.length; i++) {
    const planet = DASHA_ORDER[(startIdx + i) % DASHA_ORDER.length];
    const years = DASHA_YEARS[planet] ?? 7;
    const end = new Date(cur);
    end.setFullYear(end.getFullYear() + years);
    results.push({ planet, start: new Date(cur), end, years, color: DASHA_COLORS[planet] ?? "#6B7280" });
    cur = end;
  }
  return results;
}

// ─── Mantra Library Data ──────────────────────────────────────────────────────

const MANTRA_LIBRARY = [
  { planet: "Surya", emoji: "☀️", color: "#F97316", mantra: "ॐ ह्रां ह्रीं ह्रौं सः सूर्याय नमः", transliteration: "Om Hraam Hreem Hraum Sah Suryaya Namah", deity: "Surya Dev", benefit: "Health, vitality, leadership, father's blessings", day: "Sunday", count: 108 },
  { planet: "Chandra", emoji: "🌙", color: "#3B82F6", mantra: "ॐ श्रां श्रीं श्रौं सः चन्द्राय नमः", transliteration: "Om Shraam Shreem Shraum Sah Chandraya Namah", deity: "Chandra Dev", benefit: "Peace of mind, emotions, intuition, mother's blessings", day: "Monday", count: 108 },
  { planet: "Mangal", emoji: "🔴", color: "#EF4444", mantra: "ॐ क्रां क्रीं क्रौं सः भौमाय नमः", transliteration: "Om Kraam Kreem Kraum Sah Bhaumaya Namah", deity: "Mangal Dev", benefit: "Courage, energy, victory over enemies, property", day: "Tuesday", count: 108 },
  { planet: "Budha", emoji: "💚", color: "#10B981", mantra: "ॐ ब्रां ब्रीं ब्रौं सः बुधाय नमः", transliteration: "Om Braam Breem Braum Sah Budhaya Namah", deity: "Budha Dev", benefit: "Intelligence, clarity, communication, business", day: "Wednesday", count: 108 },
  { planet: "Guru", emoji: "🌟", color: "#FBBF24", mantra: "ॐ ग्रां ग्रीं ग्रौं सः गुरवे नमः", transliteration: "Om Graam Greem Graum Sah Gurave Namah", deity: "Brihaspati Dev", benefit: "Wisdom, dharma, children, wealth, expansion, guru's grace", day: "Thursday", count: 108 },
  { planet: "Shukra", emoji: "💎", color: "#EC4899", mantra: "ॐ द्रां द्रीं द्रौं सः शुक्राय नमः", transliteration: "Om Draam Dreem Draum Sah Shukraya Namah", deity: "Shukra Dev", benefit: "Love, beauty, luxury, marriage harmony, artistic success", day: "Friday", count: 108 },
  { planet: "Shani", emoji: "⚫", color: "#9CA3AF", mantra: "ॐ प्रां प्रीं प्रौं सः शनैश्चराय नमः", transliteration: "Om Praam Preem Praum Sah Shanaischaraya Namah", deity: "Shani Dev", benefit: "Remove obstacles, karma clearing, discipline, longevity", day: "Saturday", count: 108 },
  { planet: "Rahu", emoji: "🌑", color: "#7C3AED", mantra: "ॐ भ्रां भ्रीं भ्रौं सः राहवे नमः", transliteration: "Om Bhraam Bhreem Bhraum Sah Rahave Namah", deity: "Rahu", benefit: "Protection from illusion, foreign gains, technical success", day: "Saturday", count: 108 },
  { planet: "Ketu", emoji: "☄️", color: "#D97706", mantra: "ॐ स्रां स्रीं स्रौं सः केतवे नमः", transliteration: "Om Sraam Sreem Sraum Sah Ketave Namah", deity: "Ketu", benefit: "Liberation, past karma healing, mysticism, moksha path", day: "Tuesday", count: 108 },
] as const;

interface KundaliProfile {
  fullName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  rashi: string;
  lagna: string;
  nakshatra: string;
  dasha: string;
}

// ─── Star Field ───────────────────────────────────────────────────────────────

function StarDot({ x, y, size, initialOpacity }: { x: number; y: number; size: number; initialOpacity: number }) {
  const opacity = useSharedValue(initialOpacity);
  useEffect(() => {
    const dur1 = 1000 + Math.random() * 1500;
    const dur2 = 1000 + Math.random() * 1500;
    const delay = Math.random() * 2000;
    const timer = setTimeout(() => {
      opacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: dur1 }),
          withTiming(0.1, { duration: dur2 })
        ),
        -1,
        false
      );
    }, delay);
    return () => { clearTimeout(timer); cancelAnimation(opacity); };
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <RAnimated.View
      style={[
        { position: "absolute", left: x, top: y, width: size * 2, height: size * 2, borderRadius: size, backgroundColor: "#FCD34D" },
        dotStyle,
      ]}
    />
  );
}

function StarField({ count = 35 }: { count?: number }) {
  const stars = useRef(
    Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * 260,
      size: Math.random() * 1.8 + 0.4,
      initialOpacity: Math.random(),
    }))
  ).current;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => (
        <StarDot key={i} x={s.x} y={s.y} size={s.size} initialOpacity={s.initialOpacity} />
      ))}
    </View>
  );
}

// ─── Mandala Ring Decoration ──────────────────────────────────────────────────

function MandalaRing({ size = 200, color = GOLD }: { size?: number; color?: string }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(
      withTiming(360, { duration: 30000, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(rot);
  }, []);
  const rotStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }));
  return (
    <RAnimated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: color + "30", borderStyle: "dashed", position: "absolute" },
        rotStyle,
      ]}
    />
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function KundaliSetup({ onComplete }: { onComplete: (p: KundaliProfile) => void }) {
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [error, setError] = useState("");
  const slideUp = useSharedValue(30);
  const slideStyle = useAnimatedStyle(() => ({
    opacity: 1,
    transform: [{ translateY: slideUp.value }],
  }));

  useEffect(() => {
    slideUp.value = withTiming(0, { duration: 600 });
    return () => cancelAnimation(slideUp);
  }, []);

  const handleStart = () => {
    if (!fullName.trim()) { setError("Please enter your full name"); return; }
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
    onComplete({ fullName: fullName.trim(), birthDate, birthTime, birthPlace, rashi, lagna, nakshatra, dasha });
  };

  const rashiPreview = birthDate.match(/^\d{4}-\d{2}-\d{2}$/) ? getVedicRashi(birthDate) : null;
  const rashiData = rashiPreview ? getRashiData(rashiPreview) : null;

  return (
    <ScrollView contentContainerStyle={S.setupScroll} showsVerticalScrollIndicator={false}>
      <StarField />
      <RAnimated.View style={[slideStyle, { alignItems: "center", width: "100%" }]}>
        <Text style={S.omText}>ॐ</Text>
        <Text style={S.setupTitle}>Astrology — Light of the Veda</Text>
        <Text style={S.setupSub}>
          The ancient Hindu science of Astrology maps your karma through the cosmic blueprint imprinted at your birth. Enter your details to reveal your Kundali.
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
          <Text style={S.inputLabel}>🙏 Full Name *</Text>
          <TextInput
            style={S.inputField}
            value={fullName}
            onChangeText={t => { setFullName(t); setError(""); }}
            placeholder="Enter your full name"
            placeholderTextColor={DIM}
            autoCapitalize="words"
            returnKeyType="next"
          />
          <Text style={S.inputHint}>Used for Namank (name numerology) and personalised readings</Text>
        </View>
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
      </RAnimated.View>
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
      birthDate: profile.birthDate, name: profile.fullName,
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

// ─── Daily Mantra ─────────────────────────────────────────────────────────────

interface MantraData {
  mantra: string; transliteration: string; meaning: string;
  deity: string; deityDescription: string; chantCount: string;
  chantTime: string; benefits: string; daySpecial: string;
}

const MANTRA_KEY = `gundruk_mantra_v1:${new Date().toDateString()}`;

function DailyMantraSection({ profile }: { profile: KundaliProfile }) {
  const [data, setData] = useState<MantraData | null>(null);
  const [loading, setLoading] = useState(false);
  const glowAnim = useSharedValue(0.4);

  useEffect(() => {
    glowAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200 }),
        withTiming(0.4, { duration: 2200 })
      ),
      -1,
      false
    );
    return () => cancelAnimation(glowAnim);
  }, []);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glowAnim.value }));

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MANTRA_KEY + profile.nakshatra);
      if (raw) { setData(JSON.parse(raw)); return; }
    } catch {}
    setLoading(true);
    const result = await callAI("jyotisha_daily_mantra", { nakshatra: profile.nakshatra });
    const d = parseAIJson<MantraData>(result, {
      mantra: "ॐ नमः शिवाय",
      transliteration: "Om Namah Shivaya",
      meaning: "I bow to the divine consciousness that resides within me.",
      deity: "Shiva", deityDescription: "The auspicious one, lord of transformation and liberation.",
      chantCount: "108", chantTime: "Brahma Muhurta (4:00 AM – 6:00 AM) or at sunrise",
      benefits: "Purifies the mind, removes obstacles, brings inner peace and divine grace.",
      daySpecial: "Today's planetary energy amplifies the power of this mantra.",
    });
    setData(d);
    AsyncStorage.setItem(MANTRA_KEY + profile.nakshatra, JSON.stringify(d)).catch(() => {});
    setLoading(false);
  }, [profile.nakshatra]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" });

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <LinearGradient colors={["#0C0830", "#050515", BG]} style={S.mantraHeader}>
        <StarField count={50} />
        <RAnimated.Text style={[S.mantraOm, glowStyle]}>ॐ</RAnimated.Text>
        <Text style={S.mantraTitle}>आज का मंत्र</Text>
        <Text style={S.mantraSubtitle}>Daily Mantra for {profile.nakshatra} Nakshatra</Text>
        <Text style={S.mantraDate}>{today}</Text>
      </LinearGradient>

      {loading && <View style={S.loadBox}><ActivityIndicator color={SAFFRON} size="large" /><Text style={S.loadText}>Invoking sacred vibrations...</Text></View>}

      {data && (
        <View style={{ paddingHorizontal: 16 }}>
          {/* Main mantra card */}
          <LinearGradient colors={["rgba(217,119,6,0.15)", "rgba(217,119,6,0.04)"]} style={S.mantraCard}>
            <Text style={S.mantraSanskrit}>{data.mantra}</Text>
            <Text style={S.mantraTranslit}>{data.transliteration}</Text>
            <View style={S.mantraDivider} />
            <Text style={S.mantraMeaning}>{data.meaning}</Text>
          </LinearGradient>

          {/* Deity */}
          <View style={S.deityRow}>
            <Text style={S.deityEmoji}>🙏</Text>
            <View style={{ flex: 1 }}>
              <Text style={S.deityName}>Deity: {data.deity}</Text>
              <Text style={S.deityDesc}>{data.deityDescription}</Text>
            </View>
          </View>

          {/* Practice guide */}
          <View style={S.practiceBox}>
            <Text style={S.practiceTitle}>📿 Chanting Practice</Text>
            <View style={S.practiceRow}>
              <View style={S.practiceItem}>
                <Text style={S.practiceLabel}>Count</Text>
                <Text style={S.practiceValue}>{data.chantCount} times</Text>
              </View>
              <View style={[S.practiceItem, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: "rgba(253,230,138,0.1)", paddingHorizontal: 12 }]}>
                <Text style={S.practiceLabel}>Best Time</Text>
                <Text style={S.practiceValue}>Brahma Muhurta</Text>
              </View>
              <View style={S.practiceItem}>
                <Text style={S.practiceLabel}>Days</Text>
                <Text style={S.practiceValue}>Every day</Text>
              </View>
            </View>
          </View>

          {/* Benefits */}
          <View style={S.remedyCard}>
            <Text style={S.remedyIcon}>✨</Text>
            <View style={{ flex: 1 }}>
              <Text style={S.remedyTitle}>Benefits of Chanting</Text>
              <Text style={S.remedyContent}>{data.benefits}</Text>
            </View>
          </View>

          {/* Day significance */}
          <View style={S.remedyCard}>
            <Text style={S.remedyIcon}>📅</Text>
            <View style={{ flex: 1 }}>
              <Text style={S.remedyTitle}>Today's Significance</Text>
              <Text style={S.remedyContent}>{data.daySpecial}</Text>
            </View>
          </View>

          <TouchableOpacity onPress={load} style={S.refreshRow}>
            <Ionicons name="refresh" size={14} color={GOLD} />
            <Text style={S.refreshText}>Refresh Today's Mantra</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Sade Sati Calculator ─────────────────────────────────────────────────────

interface SadeSatiData {
  inSadeSati: boolean; phase: string; sadeSatiStart: string; sadeSatiEnd: string;
  inDhaiya: boolean; dhaiyaDetails: string; affectedAreas: string[];
  currentEffects: string;
  remedies: { name: string; description: string }[];
  scriptureQuote: string; message: string;
}

function SadeSatiSection({ profile }: { profile: KundaliProfile }) {
  const [data, setData] = useState<SadeSatiData | null>(null);
  const [loading, setLoading] = useState(false);

  const age = Math.max(0, new Date().getFullYear() - parseInt((profile.birthDate.split("-")[0] ?? "1990"), 10));

  const load = useCallback(async () => {
    const key = `gundruk_sadesati_v1:${profile.rashi}`;
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) { setData(JSON.parse(raw)); return; }
    } catch {}
    setLoading(true);
    const result = await callAI("jyotisha_sade_sati", { rashi: profile.rashi, age });
    const d = parseAIJson<SadeSatiData>(result, {
      inSadeSati: false, phase: "Not in Sade Sati",
      sadeSatiStart: "2029", sadeSatiEnd: "2032",
      inDhaiya: false, dhaiyaDetails: "Not currently in Shani Dhaiya.",
      affectedAreas: ["Career", "Relationships", "Health", "Finances"],
      currentEffects: "Saturn is a great teacher, bringing discipline and spiritual growth.",
      remedies: [
        { name: "Shani Puja", description: "Perform Shani puja every Saturday" },
        { name: "Oil Donation", description: "Donate sesame oil and black sesame on Saturdays" },
      ],
      scriptureQuote: "शनि देव, कर्म के देवता।",
      message: "Saturn's transits are opportunities for profound spiritual growth and karmic resolution.",
    });
    setData(d);
    AsyncStorage.setItem(key, JSON.stringify(d)).catch(() => {});
    setLoading(false);
  }, [profile.rashi, age]);

  useEffect(() => { load(); }, [load]);

  const statusColor = data?.inSadeSati ? "#EF4444" : data?.inDhaiya ? "#F97316" : "#22C55E";
  const statusIcon = data?.inSadeSati ? "⚠️" : data?.inDhaiya ? "🟡" : "✅";

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <LinearGradient colors={["#150A0A", "#0A0830", BG]} style={S.sadeSatiHeader}>
        <Text style={{ fontSize: 48 }}>♄</Text>
        <Text style={S.sadeSatiTitle}>शनि साढ़े साती</Text>
        <Text style={S.sadeSatiSubtitle}>Shani Sade Sati Calculator</Text>
        <Text style={S.sadeSatiRashi}>Your Rashi: <Text style={{ color: getRashiData(profile.rashi).color }}>{profile.rashi}</Text></Text>
      </LinearGradient>

      {loading && <View style={S.loadBox}><ActivityIndicator color={SAFFRON} size="large" /><Text style={S.loadText}>Calculating Saturn's transit...</Text></View>}

      {data && (
        <View style={{ paddingHorizontal: 16 }}>
          {/* Status box */}
          <View style={[S.sadeSatiStatus, { borderColor: statusColor + "60" }]}>
            <LinearGradient colors={[statusColor + "20", "transparent"]} style={S.sadeSatiStatusGrad}>
              <Text style={{ fontSize: 36, marginBottom: 6 }}>{statusIcon}</Text>
              <Text style={[S.sadeSatiStatusLabel, { color: statusColor }]}>
                {data.inSadeSati ? "You Are In Sade Sati" : data.inDhaiya ? "You Are In Shani Dhaiya" : "Not in Sade Sati"}
              </Text>
              <Text style={S.sadeSatiPhase}>{data.phase}</Text>
            </LinearGradient>
          </View>

          {/* Timeline */}
          <View style={S.timelineBox}>
            <Text style={S.timelineTitle}>⏳ Saturn Timeline</Text>
            <View style={S.timelineRow}>
              <View style={S.timelineItem}>
                <Text style={S.timelineLabel}>Starts / Started</Text>
                <Text style={[S.timelineYear, { color: SAFFRON }]}>{data.sadeSatiStart}</Text>
              </View>
              <View style={S.timelineLine} />
              <View style={S.timelineItem}>
                <Text style={S.timelineLabel}>Ends</Text>
                <Text style={[S.timelineYear, { color: "#22C55E" }]}>{data.sadeSatiEnd}</Text>
              </View>
            </View>
          </View>

          {/* Affected areas */}
          <View style={S.affectedBox}>
            <Text style={S.affectedTitle}>🌑 Areas Under Saturn's Eye</Text>
            <View style={S.affectedChips}>
              {data.affectedAreas.map(a => (
                <View key={a} style={S.affectedChip}>
                  <Text style={S.affectedChipText}>{a}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={S.nkCard}>
            <Text style={S.nkCardTitle}>🪐 Saturn's Teaching</Text>
            <Text style={S.nkCardText}>{data.currentEffects}</Text>
          </View>

          {data.inDhaiya && !data.inSadeSati && (
            <View style={[S.nkCard, { borderColor: "#F97316" + "40" }]}>
              <Text style={S.nkCardTitle}>🟡 Shani Dhaiya</Text>
              <Text style={S.nkCardText}>{data.dhaiyaDetails}</Text>
            </View>
          )}

          {/* Remedies */}
          <Text style={[S.affectedTitle, { marginTop: 16, marginBottom: 10 }]}>💎 Saturn Remedies</Text>
          {data.remedies.map((r, i) => (
            <View key={i} style={S.remedyCard}>
              <Text style={S.remedyIcon}>{["🙏","🪔","🫘","⚫","🌿"][i] ?? "✨"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={S.remedyTitle}>{r.name}</Text>
                <Text style={S.remedyContent}>{r.description}</Text>
              </View>
            </View>
          ))}

          <View style={[S.verdictBox, { borderColor: "#6B728040" }]}>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, fontStyle: "italic", textAlign: "center" }}>"{data.scriptureQuote}"</Text>
          </View>

          <View style={[S.adviceBox, { marginTop: 8 }]}>
            <Text style={S.adviceTitle}>🙏 Spiritual Message</Text>
            <Text style={S.adviceText}>{data.message}</Text>
          </View>

          <TouchableOpacity onPress={load} style={S.refreshRow}>
            <Ionicons name="refresh" size={14} color={GOLD} />
            <Text style={S.refreshText}>Recalculate</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Gemstone Finder ──────────────────────────────────────────────────────────

interface GemRec { planet: string; gem: string; gemSanskrit: string; finger: string; metal: string; day: string; mantra?: string; benefit: string; time?: string; carats?: string; }
interface GemstoneData {
  primaryGemstone: GemRec; secondaryGemstone: GemRec; thirdGemstone: GemRec;
  avoid: string[]; warning: string; activationRitual: string;
}

const GEM_PLANETS = [
  { planet: "Surya",  gem: "Ruby",            gemSa: "Manikya",    symbol: "☀️", finger: "Ring",   metal: "Gold",        color: "#F97316" },
  { planet: "Chandra",gem: "Pearl",            gemSa: "Moti",       symbol: "🌙", finger: "Little", metal: "Silver",      color: "#E2E8F0" },
  { planet: "Mangal", gem: "Red Coral",        gemSa: "Moonga",     symbol: "♂️", finger: "Ring",   metal: "Silver/Gold", color: "#EF4444" },
  { planet: "Budha",  gem: "Emerald",          gemSa: "Panna",      symbol: "☿", finger: "Little", metal: "Gold",        color: "#10B981" },
  { planet: "Guru",   gem: "Yellow Sapphire",  gemSa: "Pukhraj",    symbol: "♃",  finger: "Index",  metal: "Gold",        color: "#F59E0B" },
  { planet: "Shukra", gem: "Diamond",          gemSa: "Heera",      symbol: "♀", finger: "Middle", metal: "Platinum",    color: "#EC4899" },
  { planet: "Shani",  gem: "Blue Sapphire",    gemSa: "Neelam",     symbol: "♄",  finger: "Middle", metal: "Silver",      color: "#6B7280" },
  { planet: "Rahu",   gem: "Hessonite",        gemSa: "Gomed",      symbol: "🐉", finger: "Middle", metal: "Panchdhatu",  color: "#8B5CF6" },
  { planet: "Ketu",   gem: "Cat's Eye",        gemSa: "Lahsuniya",  symbol: "🐍", finger: "Middle", metal: "Panchdhatu",  color: "#A78BFA" },
];

function GemstoneSection({ profile }: { profile: KundaliProfile }) {
  const [data, setData] = useState<GemstoneData | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"all" | "personal">("personal");

  const load = useCallback(async () => {
    const key = `gundruk_gems_v1:${profile.rashi}:${profile.lagna}`;
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) { setData(JSON.parse(raw)); return; }
    } catch {}
    setLoading(true);
    const result = await callAI("jyotisha_gemstone_finder", {
      lagna: profile.lagna, rashi: profile.rashi, dasha: profile.dasha, nakshatra: profile.nakshatra,
    });
    const d = parseAIJson<GemstoneData>(result, {
      primaryGemstone: { planet: "Guru", gem: "Yellow Sapphire", gemSanskrit: "Pukhraj", finger: "Index", metal: "Gold", day: "Thursday", mantra: "Om Gram Greem Groom Sah Gurave Namah", carats: "3-5 carats", benefit: "Brings wisdom and prosperity", time: "Sunrise" },
      secondaryGemstone: { planet: "Chandra", gem: "Pearl", gemSanskrit: "Moti", finger: "Little", metal: "Silver", day: "Monday", mantra: "Om Som Somaya Namah", benefit: "Enhances emotional balance and intuition" },
      thirdGemstone: { planet: "Budha", gem: "Emerald", gemSanskrit: "Panna", finger: "Little", metal: "Gold", day: "Wednesday", mantra: "Om Bum Budhaya Namah", benefit: "Sharpens intellect and communication" },
      avoid: ["Blue Sapphire (conflicts with Lagna lord)"],
      warning: "Never wear Blue Sapphire and Ruby together — they represent opposing planetary energies.",
      activationRitual: "1. Soak in milk and Gangajal for 24 hours. 2. Chant the mantra 108 times. 3. Wear on the prescribed day at sunrise. 4. Place in front of deity first.",
    });
    setData(d);
    AsyncStorage.setItem(key, JSON.stringify(d)).catch(() => {});
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const rashiData = getRashiData(profile.rashi);

  const RecCard = ({ rec, isPrimary }: { rec: GemRec; isPrimary?: boolean }) => {
    const gd = GEM_PLANETS.find(g => g.planet === rec.planet);
    const c = gd?.color ?? GOLD;
    return (
      <View style={[S.gemCard, { borderColor: c + (isPrimary ? "90" : "40"), borderWidth: isPrimary ? 2 : 1 }]}>
        {isPrimary && <LinearGradient colors={[c + "20", "transparent"]} style={StyleSheet.absoluteFill} />}
        {isPrimary && (
          <View style={S.gemPrimaryBadge}>
            <Text style={S.gemPrimaryText}>⭐ Most Beneficial</Text>
          </View>
        )}
        <View style={S.gemCardTop}>
          <Text style={{ fontSize: 32 }}>{gd?.symbol ?? "💎"}</Text>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[S.gemName, { color: c }]}>{rec.gem}</Text>
            <Text style={S.gemSanskrit}>{rec.gemSanskrit}</Text>
            <Text style={S.gemPlanet}>For {rec.planet}</Text>
          </View>
        </View>
        <Text style={S.gemBenefit}>{rec.benefit}</Text>
        <View style={S.gemMeta}>
          {[
            { label: "Finger", value: rec.finger },
            { label: "Metal", value: rec.metal },
            { label: "Day", value: rec.day },
          ].map(m => (
            <View key={m.label} style={S.gemMetaItem}>
              <Text style={S.gemMetaLabel}>{m.label}</Text>
              <Text style={[S.gemMetaValue, { color: c }]}>{m.value}</Text>
            </View>
          ))}
        </View>
        {rec.mantra && (
          <View style={S.gemMantraBox}>
            <Text style={S.gemMantraLabel}>Activation Mantra</Text>
            <Text style={S.gemMantraText}>{rec.mantra}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>💎 Gemstone Finder</Text>
        <Text style={S.sectionSub}>Vedic ratna shastra — 9 planetary gemstones</Text>
      </View>

      <View style={S.viewToggle}>
        {(["personal", "all"] as const).map(v => (
          <TouchableOpacity key={v} onPress={() => setView(v)} style={[S.viewToggleBtn, view === v && S.viewToggleBtnActive]}>
            <Text style={[S.viewToggleText, view === v && { color: "#fff" }]}>
              {v === "personal" ? "My Recommendations" : "All 9 Gemstones"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === "personal" && (
        <>
          {loading && <View style={S.loadBox}><ActivityIndicator color={SAFFRON} size="large" /><Text style={S.loadText}>Consulting Ratna Shastra...</Text></View>}
          {data && (
            <View style={{ paddingHorizontal: 16 }}>
              <RecCard rec={data.primaryGemstone} isPrimary />
              <RecCard rec={data.secondaryGemstone} />
              <RecCard rec={data.thirdGemstone} />

              <View style={[S.nkCard, { borderColor: "#EF444440", marginTop: 8 }]}>
                <Text style={[S.nkCardTitle, { color: "#EF4444" }]}>⚠️ Gemstones to Avoid</Text>
                {data.avoid.map((a, i) => <Text key={i} style={S.nkCardText}>• {a}</Text>)}
                <Text style={[S.nkCardText, { marginTop: 8, color: "#F87171" }]}>{data.warning}</Text>
              </View>

              <View style={S.remedyCard}>
                <Text style={S.remedyIcon}>🕯️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={S.remedyTitle}>Activation Ritual</Text>
                  <Text style={S.remedyContent}>{data.activationRitual}</Text>
                </View>
              </View>

              <TouchableOpacity onPress={load} style={S.refreshRow}>
                <Ionicons name="refresh" size={14} color={GOLD} />
                <Text style={S.refreshText}>Refresh Recommendations</Text>
              </TouchableOpacity>
            </View>
          )}
          {!data && !loading && (
            <TouchableOpacity onPress={load} style={S.retryBtn}>
              <Text style={S.retryText}>💎 Get My Gemstone Reading</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {view === "all" && (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={[S.affectedTitle, { marginBottom: 12 }]}>All 9 Navagraha Gemstones</Text>
          {GEM_PLANETS.map(g => (
            <View key={g.planet} style={[S.gemCard, { borderColor: g.color + "40" }]}>
              <View style={S.gemCardTop}>
                <Text style={{ fontSize: 26 }}>{g.symbol}</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[S.gemName, { color: g.color }]}>{g.gem}</Text>
                  <Text style={S.gemSanskrit}>{g.gemSa}</Text>
                  <Text style={S.gemPlanet}>Planet: {g.planet}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: DIM, fontSize: 10, fontFamily: "Poppins_400Regular" }}>{g.finger} finger</Text>
                  <Text style={{ color: DIM, fontSize: 10, fontFamily: "Poppins_400Regular" }}>{g.metal}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Marriage Timing ──────────────────────────────────────────────────────────

interface MarriageData {
  likelyAgeRange: string; bestYears: string[]; currentDashaFavorable: boolean;
  dashaAnalysis: string; partnerQualities: string; marriagePlanets: string[];
  obstacles: string[]; remedies: string[]; mangalDosha: boolean;
  mangalDoshaDetails: string; auspiciousMonths: string[]; vedicWisdom: string;
}

function MarriageTimingSection({ profile }: { profile: KundaliProfile }) {
  const [data, setData] = useState<MarriageData | null>(null);
  const [loading, setLoading] = useState(false);

  const age = Math.max(0, new Date().getFullYear() - parseInt((profile.birthDate.split("-")[0] ?? "1990"), 10));

  const load = useCallback(async () => {
    const key = `gundruk_marriage_v1:${profile.rashi}:${profile.lagna}`;
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) { setData(JSON.parse(raw)); return; }
    } catch {}
    setLoading(true);
    const result = await callAI("jyotisha_marriage_timing", {
      rashi: profile.rashi, lagna: profile.lagna, dasha: profile.dasha, age,
    });
    const d = parseAIJson<MarriageData>(result, {
      likelyAgeRange: "24-30 years",
      bestYears: [String(new Date().getFullYear() + 1), String(new Date().getFullYear() + 2), String(new Date().getFullYear() + 3)],
      currentDashaFavorable: true,
      dashaAnalysis: "Your current planetary period creates opportunities for meaningful partnerships.",
      partnerQualities: "Your partner will likely be intellectual, warm, and spiritually inclined.",
      marriagePlanets: ["Shukra — natural karaka of love", "Guru — bestows auspicious timing"],
      obstacles: ["Shani's aspect may cause delays", "Rahu may bring unconventional circumstances"],
      remedies: ["Worship Goddess Parvati on Fridays", "Donate white items on Mondays"],
      mangalDosha: false, mangalDoshaDetails: "No Mangal Dosha indicated.",
      auspiciousMonths: ["November", "March", "May"],
      vedicWisdom: "Marriage is a sacred dharmic union — धर्मपत्नी — a partner in righteous living.",
    });
    setData(d);
    AsyncStorage.setItem(key, JSON.stringify(d)).catch(() => {});
    setLoading(false);
  }, [profile, age]);

  useEffect(() => { load(); }, [load]);

  const rashiData = getRashiData(profile.rashi);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <LinearGradient colors={["#1A0830", BG]} style={S.marriageHeader}>
        <StarField count={30} />
        <Text style={{ fontSize: 48 }}>💕</Text>
        <Text style={S.marriageTitle}>Marriage Timing</Text>
        <Text style={S.marriageSubtitle}>Vivah Muhurta · 7th House Analysis</Text>
        <Text style={S.marriageRashi}>
          <Text style={{ color: rashiData.color }}>{profile.rashi}</Text> · Age {age}
        </Text>
      </LinearGradient>

      {loading && <View style={S.loadBox}><ActivityIndicator color={SAFFRON} size="large" /><Text style={S.loadText}>Reading 7th house vibrations...</Text></View>}

      {data && (
        <View style={{ paddingHorizontal: 16 }}>
          {/* Age range + Dasha status */}
          <View style={S.marriageTopRow}>
            <LinearGradient colors={["#EC489920", "transparent"]} style={[S.marriageStatBox, { borderColor: "#EC489950" }]}>
              <Text style={S.marriageStatLabel}>Likely Age</Text>
              <Text style={[S.marriageStatValue, { color: "#EC4899" }]}>{data.likelyAgeRange}</Text>
            </LinearGradient>
            <LinearGradient colors={[data.currentDashaFavorable ? "#22C55E20" : "#F9731620", "transparent"]}
              style={[S.marriageStatBox, { borderColor: (data.currentDashaFavorable ? "#22C55E" : "#F97316") + "50" }]}>
              <Text style={S.marriageStatLabel}>Current Dasha</Text>
              <Text style={[S.marriageStatValue, { color: data.currentDashaFavorable ? "#22C55E" : "#F97316" }]}>
                {data.currentDashaFavorable ? "✅ Favorable" : "⏳ Patience"}
              </Text>
            </LinearGradient>
          </View>

          <Text style={S.nkCardText}>{data.dashaAnalysis}</Text>

          {/* Best years */}
          <View style={S.remedyCard}>
            <Text style={S.remedyIcon}>📅</Text>
            <View style={{ flex: 1 }}>
              <Text style={S.remedyTitle}>Most Favorable Years</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {data.bestYears.map(y => (
                  <View key={y} style={[S.nkQualityPill, { borderColor: "#EC489960" }]}>
                    <Text style={[S.nkQualityText, { color: "#EC4899" }]}>{y}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Auspicious months */}
          <View style={S.remedyCard}>
            <Text style={S.remedyIcon}>🌸</Text>
            <View style={{ flex: 1 }}>
              <Text style={S.remedyTitle}>Auspicious Months</Text>
              <Text style={S.remedyContent}>{data.auspiciousMonths.join(" · ")}</Text>
            </View>
          </View>

          {/* Partner qualities */}
          <View style={S.nkCard}>
            <Text style={S.nkCardTitle}>💫 Your Future Partner</Text>
            <Text style={S.nkCardText}>{data.partnerQualities}</Text>
          </View>

          {/* Marriage planets */}
          <View style={S.nkCard}>
            <Text style={S.nkCardTitle}>🪐 Marriage-Giving Planets</Text>
            {data.marriagePlanets.map((p, i) => (
              <Text key={i} style={[S.nkCardText, { marginTop: 4 }]}>• {p}</Text>
            ))}
          </View>

          {/* Mangal Dosha */}
          {data.mangalDosha && (
            <View style={[S.nkCard, { borderColor: "#EF444440" }]}>
              <Text style={[S.nkCardTitle, { color: "#EF4444" }]}>⚠️ Mangal Dosha</Text>
              <Text style={S.nkCardText}>{data.mangalDoshaDetails}</Text>
            </View>
          )}

          {/* Obstacles + Remedies */}
          <View style={S.nkCard}>
            <Text style={S.nkCardTitle}>🌙 Obstacles to Navigate</Text>
            {data.obstacles.map((o, i) => (
              <Text key={i} style={[S.nkCardText, { marginTop: 4 }]}>• {o}</Text>
            ))}
          </View>

          <View style={S.nkCard}>
            <Text style={S.nkCardTitle}>🙏 Remedies for Vivah</Text>
            {data.remedies.map((r, i) => (
              <Text key={i} style={[S.nkCardText, { marginTop: 4 }]}>• {r}</Text>
            ))}
          </View>

          <View style={S.adviceBox}>
            <Text style={S.adviceTitle}>📖 Vedic Wisdom</Text>
            <Text style={S.adviceText}>{data.vedicWisdom}</Text>
          </View>

          <TouchableOpacity onPress={load} style={S.refreshRow}>
            <Ionicons name="refresh" size={14} color={GOLD} />
            <Text style={S.refreshText}>Refresh Reading</Text>
          </TouchableOpacity>
        </View>
      )}

      {!data && !loading && (
        <TouchableOpacity onPress={load} style={S.retryBtn}>
          <Text style={S.retryText}>💕 Reveal Marriage Timing</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ─── 12 Houses ────────────────────────────────────────────────────────────────

interface HouseData {
  houseName: string; houseArea: string; houseNumber: number;
  houseLord: string; naturalSignificator: string; strength: string;
  strengthReason: string; positives: string; challenges: string;
  keyAreas: string[]; remedy: string; mantra: string; vedicInsight: string;
}

const HOUSES = [
  { num: 1,  name: "Tanu",    area: "Self & Body",            emoji: "👤" },
  { num: 2,  name: "Dhana",   area: "Wealth & Family",         emoji: "💰" },
  { num: 3,  name: "Sahaja",  area: "Siblings & Comm.",        emoji: "🗣️" },
  { num: 4,  name: "Sukha",   area: "Home & Happiness",        emoji: "🏠" },
  { num: 5,  name: "Putra",   area: "Children & Creativity",   emoji: "🎨" },
  { num: 6,  name: "Shatru",  area: "Health & Enemies",        emoji: "⚔️" },
  { num: 7,  name: "Kalatra", area: "Marriage & Partnership",  emoji: "💕" },
  { num: 8,  name: "Randhra", area: "Transformation",          emoji: "🌀" },
  { num: 9,  name: "Bhagya",  area: "Fortune & Dharma",        emoji: "🙏" },
  { num: 10, name: "Karma",   area: "Career & Status",         emoji: "🏆" },
  { num: 11, name: "Labha",   area: "Gains & Aspirations",     emoji: "⭐" },
  { num: 12, name: "Vyaya",   area: "Loss & Liberation",       emoji: "🌙" },
];

function TwelveHousesSection({ profile }: { profile: KundaliProfile }) {
  const [selected, setSelected] = useState<typeof HOUSES[0] | null>(null);
  const [detail, setDetail] = useState<HouseData | null>(null);
  const [loading, setLoading] = useState(false);

  const openHouse = async (h: typeof HOUSES[0]) => {
    setSelected(h);
    setDetail(null);
    const key = `gundruk_house_v1:${profile.lagna}:${profile.rashi}:${h.num}`;
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) { setDetail(JSON.parse(raw)); return; }
    } catch {}
    setLoading(true);
    const result = await callAI("jyotisha_house_reading", {
      houseNumber: h.num, lagna: profile.lagna, rashi: profile.rashi, nakshatra: profile.nakshatra,
    });
    const d = parseAIJson<HouseData>(result, {
      houseName: h.name, houseArea: h.area, houseNumber: h.num,
      houseLord: "Surya", naturalSignificator: "Surya", strength: "Moderate",
      strengthReason: "Balanced energy present in this house.",
      positives: "This house brings positive opportunities in its domain.",
      challenges: "Some obstacles may arise that require patience.",
      keyAreas: [h.area, "Spiritual growth", "Karmic lessons"],
      remedy: "Meditate on this house's themes during sunrise.",
      mantra: "Om Namah Shivaya", vedicInsight: "Each house in the Kundali is a mirror of cosmic order.",
    });
    setDetail(d);
    AsyncStorage.setItem(key, JSON.stringify(d)).catch(() => {});
    setLoading(false);
  };

  const strengthColor = (s: string) =>
    s === "Strong" ? "#22C55E" : s === "Moderate" ? SAFFRON : "#F97316";

  if (selected) {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <LinearGradient colors={["#0A0830", BG]} style={S.houseDetailHeader}>
          <TouchableOpacity onPress={() => setSelected(null)} style={[S.backBtn, { top: 16 }]}>
            <Ionicons name="arrow-back" size={20} color={CREAM} />
          </TouchableOpacity>
          <Text style={{ fontSize: 44, marginTop: 20 }}>{selected.emoji}</Text>
          <Text style={S.houseNum}>{selected.num}th House</Text>
          <Text style={S.houseDetailName}>{selected.name} Bhava</Text>
          <Text style={S.houseDetailArea}>{selected.area}</Text>
        </LinearGradient>

        {(loading || !detail) && <View style={S.loadBox}><ActivityIndicator color={SAFFRON} size="large" /><Text style={S.loadText}>Reading Bhava {selected.num}...</Text></View>}

        {detail && (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={S.houseMetaRow}>
              <View style={S.houseMetaItem}>
                <Text style={S.houseMetaLabel}>House Lord</Text>
                <Text style={[S.houseMetaValue, { color: SAFFRON }]}>{detail.houseLord}</Text>
              </View>
              <View style={S.houseMetaItem}>
                <Text style={S.houseMetaLabel}>Significator</Text>
                <Text style={[S.houseMetaValue, { color: GOLD }]}>{detail.naturalSignificator}</Text>
              </View>
              <View style={S.houseMetaItem}>
                <Text style={S.houseMetaLabel}>Strength</Text>
                <Text style={[S.houseMetaValue, { color: strengthColor(detail.strength) }]}>{detail.strength}</Text>
              </View>
            </View>
            <Text style={[S.nkCardText, { marginBottom: 16 }]}>{detail.strengthReason}</Text>

            {[
              { title: "✨ Blessings & Positives", text: detail.positives },
              { title: "🌙 Challenges", text: detail.challenges },
              { title: "🕯️ Remedy", text: detail.remedy },
              { title: "🙏 Mantra", text: detail.mantra },
              { title: "📖 Vedic Insight", text: detail.vedicInsight },
            ].map(item => (
              <View key={item.title} style={S.nkCard}>
                <Text style={S.nkCardTitle}>{item.title}</Text>
                <Text style={S.nkCardText}>{item.text}</Text>
              </View>
            ))}

            <View style={S.nkCard}>
              <Text style={S.nkCardTitle}>🎯 Key Life Areas</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {detail.keyAreas.map(a => (
                  <View key={a} style={S.nkQualityPill}>
                    <Text style={S.nkQualityText}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>🏛️ 12 Houses</Text>
        <Text style={S.sectionSub}>Complete Bhava reading — tap any house for AI insight</Text>
        <Text style={S.sectionSub2}>Lagna: <Text style={{ color: getRashiData(profile.rashi).color }}>{profile.lagna}</Text> · {profile.rashi}</Text>
      </View>
      <View style={{ paddingHorizontal: 12, flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
        {HOUSES.map(h => (
          <TouchableOpacity key={h.num} onPress={() => openHouse(h)} activeOpacity={0.8}
            style={[S.houseCard, { width: (W - 40) / 2 }]}>
            <LinearGradient colors={["rgba(253,230,138,0.08)", "transparent"]} style={S.houseCardGrad}>
              <Text style={S.houseCardNum}>{h.num}</Text>
              <Text style={{ fontSize: 24 }}>{h.emoji}</Text>
              <Text style={S.houseCardName}>{h.name} Bhava</Text>
              <Text style={S.houseCardArea}>{h.area}</Text>
              <View style={S.houseCardArrow}>
                <Ionicons name="chevron-forward" size={14} color={DIM} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Prashna Section ──────────────────────────────────────────────────────────

function PrashnaSection({ profile }: { profile: KundaliProfile }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState(false);

  const ask = async () => {
    if (!question.trim()) return;
    setLoading(true); setError(false);
    try {
      const raw = await callAI("jyotisha_prashna", { question, rashi: profile.rashi, nakshatra: profile.nakshatra, lagna: profile.lagna });
      const d = parseAIJson<Record<string, string> | null>(raw, null);
      if (d) setData(d);
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>🔮 Prashna Kundali</Text>
        <Text style={S.sectionSub}>प्रश्न — Horary Astrology</Text>
        <Text style={S.sectionSub2}>Ask anything · Chart cast for this exact moment</Text>
      </View>
      <View style={S.prashnaInputCard}>
        <Text style={{ color: DIM, fontFamily: "Poppins_600SemiBold", fontSize: 12, marginBottom: 8 }}>YOUR QUESTION</Text>
        <TextInput
          value={question} onChangeText={setQuestion} multiline
          placeholder="e.g. Will I get this job? Should I move cities? When will I marry?"
          placeholderTextColor="rgba(255,255,255,0.18)"
          style={S.prashnaInput}
        />
        <TouchableOpacity onPress={ask} disabled={!question.trim() || loading} style={{ marginTop: 12 }}>
          <LinearGradient colors={[GOLD, "#92400E"]} style={{ borderRadius: 22, paddingVertical: 13, alignItems: "center" }}>
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 }}>🔮 Ask the Stars</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
      {error && <Text style={S.errorText}>The stars are silent. Please try again.</Text>}
      {!data && !loading && !error && (
        <View style={{ alignItems: "center", paddingTop: 28 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🌌</Text>
          <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 }}>
            Prashna is Horary Astrology — the Jyotishi casts a chart for the exact moment you ask your question. No birth details needed.
          </Text>
        </View>
      )}
      {data && (
        <>
          <View style={S.prashnaAnswerCard}>
            <Text style={{ color: DIM, fontFamily: "Poppins_600SemiBold", fontSize: 11, marginBottom: 6 }}>PRASHNA ANSWER</Text>
            <Text style={{ color: CREAM, fontFamily: "Poppins_600SemiBold", fontSize: 15, lineHeight: 24 }}>{data.answer}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <View style={[S.grahaCard, { flex: 1 }]}>
              <Text style={S.grahaCardTitle}>⏱️ Timing</Text>
              <Text style={S.grahaCardText}>{data.timing}</Text>
            </View>
            <View style={[S.grahaCard, { flex: 1 }]}>
              <Text style={S.grahaCardTitle}>🪐 Key Planet</Text>
              <Text style={S.grahaCardText}>{data.keyPlanet}</Text>
            </View>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>🌙 Moon's Indication</Text>
            <Text style={S.grahaCardText}>{data.moonIndication}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>💡 Advice</Text>
            <Text style={S.grahaCardText}>{data.advice}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>✨ Sign from the Universe</Text>
            <Text style={S.grahaCardText}>{data.signFromUniverse}</Text>
          </View>
          <View style={S.adviceBox}>
            <Text style={S.adviceTitle}>🙏 Upaya — Remedy</Text>
            <Text style={S.adviceText}>{data.upaya}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>📿 Vedic Wisdom</Text>
            <Text style={[S.grahaCardText, { fontStyle: "italic" }]}>{data.scriptureWisdom}</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ─── Spiritual Path Section ───────────────────────────────────────────────────

function SpiritualPathSection({ profile }: { profile: KundaliProfile }) {
  const cacheKey = SPIRITUAL_PATH_KEY(profile.rashi, profile.nakshatra);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(cacheKey).then(raw => { if (raw) setData(JSON.parse(raw)); }).catch(() => {});
  }, [cacheKey]);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const raw = await callAI("jyotisha_spiritual_path", { rashi: profile.rashi, lagna: profile.lagna, nakshatra: profile.nakshatra, dasha: profile.dasha });
      const d = parseAIJson<Record<string, unknown> | null>(raw, null);
      if (d) { setData(d); await AsyncStorage.setItem(cacheKey, JSON.stringify(d)).catch(() => {}); }
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  const pathColors: Record<string, string> = { "Bhakti Yoga": "#EC4899", "Karma Yoga": "#F97316", "Jnana Yoga": "#3B82F6", "Raja Yoga": "#7C3AED" };
  const primaryPath = (data?.primaryPath as string) ?? "";
  const pathColor = pathColors[primaryPath] ?? GOLD;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>🧘 Yoga Marga</Text>
        <Text style={S.sectionSub}>योग मार्ग — Your Spiritual Path</Text>
        <Text style={S.sectionSub2}>Bhakti · Karma · Jnana · Raja — which suits your soul?</Text>
      </View>
      {!data && !loading && (
        <TouchableOpacity onPress={load} style={{ marginBottom: 16 }}>
          <LinearGradient colors={[GOLD, "#92400E"]} style={{ borderRadius: 22, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 }}>🧘 Reveal My Spiritual Path</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
      {loading && <ActivityIndicator color={SAFFRON} size="large" style={{ marginTop: 32 }} />}
      {error && <Text style={S.errorText}>Could not load. Please try again.</Text>}
      {data && (
        <>
          <LinearGradient colors={[pathColor + "30", pathColor + "08"]} style={{ borderRadius: 20, borderWidth: 1, borderColor: pathColor + "60", padding: 20, marginBottom: 14, alignItems: "center" }}>
            <Text style={{ fontSize: 48, marginBottom: 8 }}>{data.pathEmoji as string}</Text>
            <Text style={{ color: pathColor, fontFamily: "Poppins_700Bold", fontSize: 24 }}>{primaryPath}</Text>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 }}>{data.pathSanskrit as string}</Text>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 12, textAlign: "center", lineHeight: 21 }}>{data.whyThisPath as string}</Text>
          </LinearGradient>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>📿 Daily Sadhana Practice</Text>
            {Array.isArray(data.dailyPractice) && (data.dailyPractice as string[]).map((p2: string, i: number) => (
              <Text key={i} style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22, marginTop: 4 }}>• {p2}</Text>
            ))}
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>🌟 Soul Purpose this Incarnation</Text>
            <Text style={S.grahaCardText}>{data.soulPurpose as string}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>⚠️ Spiritual Obstacle to Overcome</Text>
            <Text style={S.grahaCardText}>{data.spiritualObstacle as string}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <View style={[S.grahaCard, { flex: 1 }]}>
              <Text style={S.grahaCardTitle}>📚 Sacred Text</Text>
              <Text style={S.grahaCardText}>{data.sacredText as string}</Text>
            </View>
            <View style={[S.grahaCard, { flex: 1 }]}>
              <Text style={S.grahaCardTitle}>⏰ Best Sadhna Time</Text>
              <Text style={S.grahaCardText}>{data.idealSadhnaTime as string}</Text>
            </View>
          </View>
          <View style={S.adviceBox}>
            <Text style={S.adviceTitle}>🕉️ Path Mantra</Text>
            <Text style={[S.adviceText, { fontSize: 14, fontWeight: "600" }]}>{data.mantra as string}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>🔄 Secondary Path</Text>
            <Text style={S.grahaCardText}>{data.secondaryPath as string}</Text>
          </View>
          <TouchableOpacity onPress={() => { setData(null); AsyncStorage.removeItem(cacheKey).catch(() => {}); }} style={{ marginTop: 8 }}>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: "center" }}>↺ Refresh Reading</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// ─── Past Life Section ────────────────────────────────────────────────────────

function PastLifeSection({ profile }: { profile: KundaliProfile }) {
  const cacheKey = PAST_LIFE_KEY(profile.rashi, profile.nakshatra);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(cacheKey).then(raw => { if (raw) setData(JSON.parse(raw)); }).catch(() => {});
  }, [cacheKey]);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const raw = await callAI("jyotisha_past_life", { rashi: profile.rashi, lagna: profile.lagna, nakshatra: profile.nakshatra, dasha: profile.dasha });
      const d = parseAIJson<Record<string, unknown> | null>(raw, null);
      if (d) { setData(d); await AsyncStorage.setItem(cacheKey, JSON.stringify(d)).catch(() => {}); }
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>🌀 Purva Janma</Text>
        <Text style={S.sectionSub}>पूर्व जन्म — Past Life Reading</Text>
        <Text style={S.sectionSub2}>Ketu reveals your soul's ancient memories and past incarnations</Text>
      </View>
      {!data && !loading && (
        <TouchableOpacity onPress={load} style={{ marginBottom: 16 }}>
          <LinearGradient colors={["#7C3AED", "#4C1D95"]} style={{ borderRadius: 22, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 }}>🌀 Reveal Past Life</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
      {loading && <ActivityIndicator color="#7C3AED" size="large" style={{ marginTop: 32 }} />}
      {error && <Text style={S.errorText}>Could not load. Please try again.</Text>}
      {data && (
        <>
          <LinearGradient colors={["#7C3AED30", "#4C1D9508"]} style={{ borderRadius: 20, borderWidth: 1, borderColor: "#7C3AED60", padding: 20, marginBottom: 14 }}>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11, marginBottom: 6 }}>PAST LIFE THEME</Text>
            <Text style={{ color: "#A78BFA", fontFamily: "Poppins_700Bold", fontSize: 16, lineHeight: 24 }}>{data.pastLifeTheme as string}</Text>
          </LinearGradient>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <View style={[S.grahaCard, { flex: 1 }]}>
              <Text style={S.grahaCardTitle}>👤 Past Life Role</Text>
              <Text style={S.grahaCardText}>{data.pastLifeRole as string}</Text>
            </View>
            <View style={[S.grahaCard, { flex: 1 }]}>
              <Text style={S.grahaCardTitle}>🌍 Location & Era</Text>
              <Text style={S.grahaCardText}>{data.pastLifeLocation as string}</Text>
            </View>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>☄️ Ketu's Revelation</Text>
            <Text style={S.grahaCardText}>{data.ketuLesson as string}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>🎁 Karma Carried Forward</Text>
            <Text style={S.grahaCardText}>{data.karmaCarriedForward as string}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>🩹 Past Life Challenge Healing Now</Text>
            <Text style={S.grahaCardText}>{data.pastLifeChallenge as string}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>✨ Soul Gifts Brought from Past Life</Text>
            {Array.isArray(data.birthGifts) && (data.birthGifts as string[]).map((g: string, i: number) => (
              <Text key={i} style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22, marginTop: 4 }}>🌟 {g}</Text>
            ))}
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>🔮 Soul's Journey: Past → Present</Text>
            <Text style={S.grahaCardText}>{data.soulsJourney as string}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>🧭 Rahu — What This Life Demands</Text>
            <Text style={S.grahaCardText}>{data.rahuDirection as string}</Text>
          </View>
          <View style={S.adviceBox}>
            <Text style={S.adviceTitle}>🙏 Path to Moksha</Text>
            <Text style={S.adviceText}>{data.liberationPath as string}</Text>
          </View>
          <TouchableOpacity onPress={() => { setData(null); AsyncStorage.removeItem(cacheKey).catch(() => {}); }} style={{ marginTop: 8 }}>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: "center" }}>↺ Refresh Reading</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// ─── Karma Types Section ──────────────────────────────────────────────────────

function KarmaTypesSection({ profile }: { profile: KundaliProfile }) {
  const cacheKey = KARMA_TYPES_KEY(profile.rashi, profile.nakshatra);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(cacheKey).then(raw => { if (raw) setData(JSON.parse(raw)); }).catch(() => {});
  }, [cacheKey]);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const raw = await callAI("jyotisha_karma_types", { rashi: profile.rashi, lagna: profile.lagna, nakshatra: profile.nakshatra, dasha: profile.dasha });
      const d = parseAIJson<Record<string, unknown> | null>(raw, null);
      if (d) { setData(d); await AsyncStorage.setItem(cacheKey, JSON.stringify(d)).catch(() => {}); }
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  const karmaCards = [
    { key: "sanchita", color: "#6B7280", emoji: "🌌" },
    { key: "prarabdha", color: "#F97316", emoji: "📜" },
    { key: "kriyamana", color: "#10B981", emoji: "⚡" },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>⚖️ Tri-Karma</Text>
        <Text style={S.sectionSub}>तीन कर्म — The Three Karmas</Text>
        <Text style={S.sectionSub2}>Sanchita · Prarabdha · Kriyamana — your karmic blueprint</Text>
      </View>
      {!data && !loading && (
        <TouchableOpacity onPress={load} style={{ marginBottom: 16 }}>
          <LinearGradient colors={[GOLD, "#92400E"]} style={{ borderRadius: 22, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 }}>⚖️ Reveal My Karma Map</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
      {loading && <ActivityIndicator color={SAFFRON} size="large" style={{ marginTop: 32 }} />}
      {error && <Text style={S.errorText}>Could not load. Please try again.</Text>}
      {data && (
        <>
          {karmaCards.map(({ key, color, emoji }) => {
            const k = data[key] as Record<string, unknown> | undefined;
            if (!k) return null;
            return (
              <View key={key} style={{ backgroundColor: color + "15", borderRadius: 18, borderWidth: 1, borderColor: color + "50", padding: 18, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontSize: 28, marginRight: 10 }}>{emoji}</Text>
                  <View>
                    <Text style={{ color, fontFamily: "Poppins_700Bold", fontSize: 18 }}>{k.title as string}</Text>
                    <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12 }}>{k.titleSa as string}</Text>
                  </View>
                </View>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 12, fontStyle: "italic", marginBottom: 8 }}>{k.meaning as string}</Text>
                <Text style={{ color: CREAM, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22 }}>{k.forThisPerson as string}</Text>
                {key === "prarabdha" && Array.isArray(k.mainThemes) && (
                  <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {(k.mainThemes as string[]).map((t: string, i: number) => (
                      <View key={i} style={{ backgroundColor: color + "30", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 }}>
                        <Text style={{ color: color, fontFamily: "Poppins_600SemiBold", fontSize: 12 }}>{t}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {key === "kriyamana" && Array.isArray(k.powerActions) && (
                  <View style={{ marginTop: 10 }}>
                    {(k.powerActions as string[]).map((a: string, i: number) => (
                      <Text key={i} style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 22 }}>✅ {a}</Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
          <View style={S.adviceBox}>
            <Text style={S.adviceTitle}>🌟 Message for You</Text>
            <Text style={S.adviceText}>{data.overallMessage as string}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>📿 Bhagavad Gita Teaching</Text>
            <Text style={[S.grahaCardText, { fontStyle: "italic" }]}>{data.gitaVerse as string}</Text>
          </View>
          <TouchableOpacity onPress={() => { setData(null); AsyncStorage.removeItem(cacheKey).catch(() => {}); }} style={{ marginTop: 8 }}>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: "center" }}>↺ Refresh Reading</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// ─── Ishta Devata Section ─────────────────────────────────────────────────────

function IshtaDevataSection({ profile }: { profile: KundaliProfile }) {
  const cacheKey = ISHTA_KEY(profile.rashi, profile.nakshatra);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(cacheKey).then(raw => { if (raw) setData(JSON.parse(raw)); }).catch(() => {});
  }, [cacheKey]);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const raw = await callAI("jyotisha_ishta_devata", { rashi: profile.rashi, lagna: profile.lagna, nakshatra: profile.nakshatra, dasha: profile.dasha });
      const d = parseAIJson<Record<string, unknown> | null>(raw, null);
      if (d) { setData(d); await AsyncStorage.setItem(cacheKey, JSON.stringify(d)).catch(() => {}); }
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  const worship = data?.worship as Record<string, string> | undefined;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>🙏 Ishta Devata</Text>
        <Text style={S.sectionSub}>इष्ट देवता — Your Personal Deity</Text>
        <Text style={S.sectionSub2}>The divine form most aligned with your soul's path</Text>
      </View>
      {!data && !loading && (
        <TouchableOpacity onPress={load} style={{ marginBottom: 16 }}>
          <LinearGradient colors={[GOLD, "#92400E"]} style={{ borderRadius: 22, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 }}>🙏 Find My Ishta Devata</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
      {loading && <ActivityIndicator color={SAFFRON} size="large" style={{ marginTop: 32 }} />}
      {error && <Text style={S.errorText}>Could not load. Please try again.</Text>}
      {data && (
        <>
          <LinearGradient colors={[GOLD + "30", GOLD + "06"]} style={{ borderRadius: 22, borderWidth: 1, borderColor: GOLD + "60", padding: 22, marginBottom: 14, alignItems: "center" }}>
            <Text style={{ fontSize: 52, marginBottom: 8 }}>{data.devataEmoji as string}</Text>
            <Text style={{ color: GOLD, fontFamily: "Poppins_700Bold", fontSize: 26 }}>{data.ishtaDevata as string}</Text>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 16, marginTop: 4 }}>{data.devataSanskrit as string}</Text>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 12, textAlign: "center", lineHeight: 22 }}>{data.whyThisDeity as string}</Text>
          </LinearGradient>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>🌺 Sacred Form</Text>
            <Text style={S.grahaCardText}>{data.form as string}</Text>
          </View>
          {worship && (
            <View style={{ backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 16, marginBottom: 8 }}>
              <Text style={S.grahaCardTitle}>🕯️ How to Worship</Text>
              <View style={{ gap: 6, marginTop: 6 }}>
                {[["📅", "Day", worship.day],["⏰","Time",worship.time],["🌸","Offering",worship.offering]].map(([icon, label, val]) => (
                  <View key={label} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                    <Text style={{ fontSize: 16 }}>{icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11 }}>{label}</Text>
                      <Text style={{ color: CREAM, fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>{val}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={{ marginTop: 12, backgroundColor: GOLD + "15", borderRadius: 12, padding: 12 }}>
                <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11, marginBottom: 4 }}>MANTRA</Text>
                <Text style={{ color: SAFFRON, fontFamily: "Poppins_600SemiBold", fontSize: 14, lineHeight: 22 }}>{worship.mantra}</Text>
              </View>
              <View style={{ marginTop: 10, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 12 }}>
                <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11, marginBottom: 4 }}>INVOCATION PRAYER</Text>
                <Text style={{ color: CREAM, fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 21, fontStyle: "italic" }}>{worship.prayer}</Text>
              </View>
            </View>
          )}
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>📖 Sacred Story</Text>
            <Text style={S.grahaCardText}>{data.story as string}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>🌟 Divine Blessing for You</Text>
            <Text style={S.grahaCardText}>{data.blessing as string}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <View style={[S.grahaCard, { flex: 1 }]}>
              <Text style={S.grahaCardTitle}>⭐ Nakshatra Deity</Text>
              <Text style={S.grahaCardText}>{data.nakshatraDeity as string}</Text>
            </View>
            <View style={[S.grahaCard, { flex: 1 }]}>
              <Text style={S.grahaCardTitle}>🕌 Sacred Pilgrimage</Text>
              <Text style={S.grahaCardText}>{data.pilgrimage as string}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => { setData(null); AsyncStorage.removeItem(cacheKey).catch(() => {}); }} style={{ marginTop: 8 }}>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: "center" }}>↺ Refresh Reading</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// ─── Dasha Calendar Section ───────────────────────────────────────────────────

function DashaCalendarSection({ profile }: { profile: KundaliProfile }) {
  const dashas = useMemo(() => calcDashas(profile.nakshatra, profile.birthDate), [profile.nakshatra, profile.birthDate]);
  const today = useMemo(() => new Date(), []);
  const currentDasha = dashas.find(d => today >= d.start && today < d.end);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>📅 Vimshottari Dasha</Text>
        <Text style={S.sectionSub}>दशा — Planetary Period Calendar</Text>
        <Text style={S.sectionSub2}>120-year cycle based on birth Nakshatra: {profile.nakshatra}</Text>
      </View>

      {currentDasha && (
        <LinearGradient colors={[currentDasha.color + "35", currentDasha.color + "08"]} style={{ borderRadius: 20, borderWidth: 1, borderColor: currentDasha.color + "70", padding: 20, marginBottom: 16 }}>
          <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11, letterSpacing: 1 }}>CURRENT DASHA PERIOD</Text>
          <Text style={{ color: currentDasha.color, fontFamily: "Poppins_700Bold", fontSize: 30, marginTop: 4 }}>{currentDasha.planet} Dasha</Text>
          <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, marginTop: 6 }}>
            {currentDasha.start.getFullYear()} — {currentDasha.end.getFullYear()}
            <Text style={{ color: "rgba(255,255,255,0.4)" }}> · {currentDasha.years} year period</Text>
          </Text>
          <View style={{ marginTop: 12, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <View style={{
              height: 6, borderRadius: 3, backgroundColor: currentDasha.color,
              width: `${Math.min(100, Math.max(0, ((today.getTime() - currentDasha.start.getTime()) / (currentDasha.end.getTime() - currentDasha.start.getTime())) * 100))}%`,
            }} />
          </View>
          <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 4 }}>Progress through current Dasha</Text>
        </LinearGradient>
      )}

      <Text style={{ color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 15, marginBottom: 12 }}>Complete 9-Period Timeline</Text>

      {dashas.map((d, i) => {
        const isActive = today >= d.start && today < d.end;
        const isPast = today >= d.end;
        return (
          <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 6 }}>
            <View style={{ width: 3, borderRadius: 2, backgroundColor: d.color, marginTop: 8, marginBottom: 8, marginRight: 12, alignSelf: "stretch", opacity: isPast ? 0.25 : 1 }} />
            <View style={{ flex: 1, backgroundColor: isActive ? d.color + "18" : CARD_BG, borderRadius: 14, borderWidth: isActive ? 1 : 0, borderColor: d.color + "60", padding: 12, opacity: isPast ? 0.4 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color }} />
                  <Text style={{ color: isActive ? d.color : CREAM, fontFamily: "Poppins_700Bold", fontSize: 15 }}>{d.planet} Dasha</Text>
                  {isActive && <View style={{ backgroundColor: d.color + "30", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: d.color, fontFamily: "Poppins_600SemiBold", fontSize: 10 }}>NOW</Text></View>}
                </View>
                <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12 }}>{d.years}y</Text>
              </View>
              <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 3 }}>{d.start.getFullYear()} – {d.end.getFullYear()}</Text>
            </View>
          </View>
        );
      })}

      <View style={[S.adviceBox, { marginTop: 16 }]}>
        <Text style={S.adviceTitle}>📿 About Vimshottari Dasha</Text>
        <Text style={S.adviceText}>The 120-year Vimshottari Dasha system is based on your birth Moon's Nakshatra. Each planetary period powerfully colors life themes, events, and karma ripening. The Dasha lord becomes your most influential planet during its period. Sub-periods (Antardasha) within each Dasha further refine the timing of events.</Text>
      </View>
    </ScrollView>
  );
}

// ─── Mantra Library Section ───────────────────────────────────────────────────

function MantraLibrarySection() {
  const [japaCounts, setJapaCounts] = useState<Record<string, number>>({});
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(JAPA_COUNTS_KEY)
      .then(raw => { if (raw) setJapaCounts(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const saveJapa = async (counts: Record<string, number>) => {
    setJapaCounts(counts);
    await AsyncStorage.setItem(JAPA_COUNTS_KEY, JSON.stringify(counts)).catch(() => {});
  };

  const m = MANTRA_LIBRARY[selectedIdx];
  const count = japaCounts[m.planet] ?? 0;
  const malas = Math.floor(count / 108);
  const totalCounts = MANTRA_LIBRARY.reduce((sum, ml) => sum + (japaCounts[ml.planet] ?? 0), 0);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>📿 Mantra Kosha</Text>
        <Text style={S.sectionSub}>मंत्र कोश — Sacred Mantra Library</Text>
        <Text style={S.sectionSub2}>Select a Graha · Chant the mantra · Track your japa</Text>
      </View>

      {totalCounts > 0 && (
        <View style={{ backgroundColor: GOLD + "15", borderRadius: 14, borderWidth: 1, borderColor: GOLD + "40", padding: 12, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: GOLD, fontFamily: "Poppins_700Bold", fontSize: 18 }}>🕉️ {totalCounts.toLocaleString()}</Text>
          <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginLeft: 8 }}>total mantras chanted</Text>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 2, paddingBottom: 4 }}>
          {MANTRA_LIBRARY.map((ml, i) => (
            <TouchableOpacity key={ml.planet} onPress={() => setSelectedIdx(i)} activeOpacity={0.8}>
              <LinearGradient
                colors={selectedIdx === i ? [ml.color + "80", ml.color + "30"] : [CARD_BG, CARD_BG]}
                style={{ borderRadius: 16, borderWidth: 1, borderColor: selectedIdx === i ? ml.color : "rgba(253,230,138,0.1)", padding: 10, alignItems: "center", minWidth: 64 }}
              >
                <Text style={{ fontSize: 20 }}>{ml.emoji}</Text>
                <Text style={{ color: selectedIdx === i ? ml.color : DIM, fontFamily: "Poppins_600SemiBold", fontSize: 10, marginTop: 3 }}>{ml.planet}</Text>
                {(japaCounts[ml.planet] ?? 0) > 0 && (
                  <Text style={{ color: ml.color, fontFamily: "Poppins_400Regular", fontSize: 9, marginTop: 1 }}>{japaCounts[ml.planet]}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <LinearGradient colors={[m.color + "28", m.color + "08"]} style={{ borderRadius: 22, borderWidth: 1, borderColor: m.color + "55", padding: 20, marginBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          <Text style={{ fontSize: 36, marginRight: 12 }}>{m.emoji}</Text>
          <View>
            <Text style={{ color: m.color, fontFamily: "Poppins_700Bold", fontSize: 20 }}>{m.planet}</Text>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12 }}>{m.deity}</Text>
          </View>
        </View>
        <Text style={{ color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 16, lineHeight: 28, textAlign: "center", marginBottom: 8 }}>{m.mantra}</Text>
        <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: "center", fontStyle: "italic", marginBottom: 12 }}>{m.transliteration}</Text>
        <View style={{ backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 12, padding: 12 }}>
          <Text style={{ color: SAFFRON, fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>✨ {m.benefit}</Text>
          <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 4 }}>📅 Best day: {m.day} · {m.count} repetitions per session</Text>
        </View>
      </LinearGradient>

      <View style={{ backgroundColor: CARD_BG, borderRadius: 20, borderWidth: 1, borderColor: m.color + "40", padding: 20, alignItems: "center", marginBottom: 14 }}>
        <Text style={{ color: DIM, fontFamily: "Poppins_600SemiBold", fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>JAPA COUNTER</Text>
        <Text style={{ color: m.color, fontFamily: "Poppins_700Bold", fontSize: 60, lineHeight: 72 }}>{count.toLocaleString()}</Text>
        {malas > 0 && (
          <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginBottom: 4 }}>
            {malas} mala{malas > 1 ? "s" : ""} completed 🌸
          </Text>
        )}
        <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, marginBottom: 20, textAlign: "center" }}>
          {count === 0 ? "Begin your japa practice · OM" : `${108 - (count % 108)} more to complete this mala`}
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <TouchableOpacity onPress={() => saveJapa({ ...japaCounts, [m.planet]: count + 1 })}>
            <LinearGradient colors={[m.color, m.color + "90"]} style={{ borderRadius: 50, width: 72, height: 72, justifyContent: "center", alignItems: "center" }}>
              <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 22 }}>+1</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => saveJapa({ ...japaCounts, [m.planet]: count + 108 })}>
            <LinearGradient colors={[GOLD, "#92400E"]} style={{ borderRadius: 50, width: 72, height: 72, justifyContent: "center", alignItems: "center" }}>
              <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14, textAlign: "center" }}>+108</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => saveJapa({ ...japaCounts, [m.planet]: 0 })} style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: DIM, fontSize: 24 }}>↺</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Navamsa Section ──────────────────────────────────────────────────────────

function NavamsaSection({ profile }: { profile: KundaliProfile }) {
  const cacheKey = NAVAMSA_KEY(profile.rashi, profile.nakshatra);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(cacheKey).then(raw => { if (raw) setData(JSON.parse(raw)); }).catch(() => {});
  }, [cacheKey]);

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const raw = await callAI("jyotisha_navamsa", { rashi: profile.rashi, lagna: profile.lagna, nakshatra: profile.nakshatra, dasha: profile.dasha });
      const d = parseAIJson<Record<string, unknown> | null>(raw, null);
      if (d) { setData(d); await AsyncStorage.setItem(cacheKey, JSON.stringify(d)).catch(() => {}); }
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  const partner = data?.marriagePartner as Record<string, string> | undefined;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={S.sectionHeaderPad}>
        <Text style={S.sectionTitle}>💫 Navamsa D9</Text>
        <Text style={S.sectionSub}>नवांश — Soul & Marriage Chart</Text>
        <Text style={S.sectionSub2}>The 9th divisional chart reveals your soul's deepest truth</Text>
      </View>
      {!data && !loading && (
        <TouchableOpacity onPress={load} style={{ marginBottom: 16 }}>
          <LinearGradient colors={["#EC4899", "#9D174D"]} style={{ borderRadius: 22, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 }}>💫 Read My Soul Chart (D9)</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
      {loading && <ActivityIndicator color="#EC4899" size="large" style={{ marginTop: 32 }} />}
      {error && <Text style={S.errorText}>Could not load. Please try again.</Text>}
      {data && (
        <>
          <LinearGradient colors={["#EC489930", "#EC489906"]} style={{ borderRadius: 20, borderWidth: 1, borderColor: "#EC489960", padding: 20, marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <View>
                <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11 }}>NAVAMSA LAGNA</Text>
                <Text style={{ color: "#F9A8D4", fontFamily: "Poppins_700Bold", fontSize: 20 }}>{data.navamsaLagna as string}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11 }}>SPIRITUAL MATURITY</Text>
                <Text style={{ color: "#F9A8D4", fontFamily: "Poppins_700Bold", fontSize: 16 }}>{data.spiritualMaturity as string}</Text>
              </View>
            </View>
            <Text style={{ color: CREAM, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22 }}>{data.soulNature as string}</Text>
          </LinearGradient>
          {partner && (
            <View style={S.grahaCard}>
              <Text style={S.grahaCardTitle}>💕 Marriage Partner — True Nature (D9)</Text>
              <Text style={{ color: CREAM, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22, marginTop: 6 }}>{partner.nature}</Text>
              <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 21, marginTop: 8 }}>🌸 {partner.appearance}</Text>
              <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 21, marginTop: 4 }}>🏡 {partner.background}</Text>
            </View>
          )}
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>🌟 Vargottama — Soul's Strength</Text>
            <Text style={S.grahaCardText}>{data.vargottama as string}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>✨ Latent Soul Talents</Text>
            {Array.isArray(data.latentTalents) && (data.latentTalents as string[]).map((t: string, i: number) => (
              <Text key={i} style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22, marginTop: 4 }}>💎 {t}</Text>
            ))}
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>📜 Soul Lesson This Incarnation</Text>
            <Text style={S.grahaCardText}>{data.soulLesson as string}</Text>
          </View>
          <View style={S.grahaCard}>
            <Text style={S.grahaCardTitle}>🏆 Strengths from Past Lives</Text>
            <Text style={S.grahaCardText}>{data.pastLifeStrengths as string}</Text>
          </View>
          <View style={S.adviceBox}>
            <Text style={S.adviceTitle}>🙏 Divine Grace & Dharma Path</Text>
            <Text style={S.adviceText}>{data.divineGrace as string}</Text>
            <Text style={[S.adviceText, { marginTop: 8 }]}>{data.dharmaPath as string}</Text>
          </View>
          <TouchableOpacity onPress={() => { setData(null); AsyncStorage.removeItem(cacheKey).catch(() => {}); }} style={{ marginTop: 8 }}>
            <Text style={{ color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: "center" }}>↺ Refresh Reading</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

type Section = "panchang" | "readings" | "navagraha" | "matching" | "chat" | "upaya" | "nakshatra" | "mantra" | "sadesati" | "gemstone" | "marriage" | "houses" | "prashna" | "spiritual" | "pastlife" | "karma" | "ishta" | "dasha" | "mantras" | "navamsa";

const NAV: { id: Section; emoji: string; label: string; labelSa: string }[] = [
  { id: "panchang",  emoji: "📅", label: "Panchang",  labelSa: "पञ्चाङ्ग" },
  { id: "readings",  emoji: "🔮", label: "Readings",  labelSa: "फलित"     },
  { id: "mantra",    emoji: "🕉️", label: "Mantra",    labelSa: "मंत्र"     },
  { id: "navagraha", emoji: "🪐", label: "Navagraha", labelSa: "नवग्रह"    },
  { id: "matching",  emoji: "💫", label: "Match",     labelSa: "मिलान"     },
  { id: "sadesati",  emoji: "♄",  label: "Sade Sati", labelSa: "साढ़े साती" },
  { id: "gemstone",  emoji: "💎", label: "Gemstone",  labelSa: "रत्न"      },
  { id: "marriage",  emoji: "💕", label: "Marriage",  labelSa: "विवाह"     },
  { id: "houses",    emoji: "🏛️", label: "12 Houses", labelSa: "भाव"       },
  { id: "chat",      emoji: "🙏", label: "Jyotishi",  labelSa: "ज्योतिषी"  },
  { id: "upaya",     emoji: "✨", label: "Upaya",     labelSa: "उपाय"      },
  { id: "nakshatra", emoji: "⭐", label: "Nakshatra", labelSa: "नक्षत्र"   },
  { id: "prashna",   emoji: "🔮", label: "Prashna",   labelSa: "प्रश्न"    },
  { id: "spiritual", emoji: "🧘", label: "Yoga Path", labelSa: "योग मार्ग" },
  { id: "pastlife",  emoji: "🌀", label: "Past Life",  labelSa: "पूर्व जन्म"},
  { id: "karma",     emoji: "⚖️", label: "Karma",     labelSa: "त्रि-कर्म" },
  { id: "ishta",     emoji: "🙏", label: "Ishta",     labelSa: "इष्ट देवता"},
  { id: "dasha",     emoji: "📅", label: "Dasha",     labelSa: "दशा काल"   },
  { id: "mantras",   emoji: "📿", label: "Mantras",   labelSa: "मंत्र कोश" },
  { id: "navamsa",   emoji: "💫", label: "Navamsa",   labelSa: "नवांश D9"  },
];

// ── Error boundary — astrology crashes must never show pure black ─────────────
class JyotishaErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: BG, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🕉️</Text>
          <Text style={{ color: CREAM, fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 10 }}>Astrology failed to load</Text>
          <Text style={{ color: "rgba(253,230,138,0.45)", fontSize: 13, textAlign: "center", marginBottom: 28 }}>{this.state.error}</Text>
          <TouchableOpacity
            onPress={() => this.setState({ error: null })}
            style={{ backgroundColor: GOLD, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 25 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function JyotishaTabInner({ userId }: { userId?: string }) {
  const [profile, setProfile] = useState<KundaliProfile | null>(null);
  React.useEffect(() => { console.log("[JyotishaTab] mounted"); }, []);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("panchang");

  // Safety timeout — if AsyncStorage never resolves, unblock after 5s
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(KUNDALI_KEY)
      .then(raw => { if (raw) setProfile(JSON.parse(raw)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSetup = async (p: KundaliProfile) => {
    setProfile(p);
    await AsyncStorage.setItem(KUNDALI_KEY, JSON.stringify(p)).catch(() => {});
    // Best-effort sync to API server (uses service-role key, bypasses RLS)
    if (userId) {
      const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
      fetch(`${apiBase}/users/jyotisha/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId, fullName: p.fullName, birthDate: p.birthDate, birthTime: p.birthTime,
          birthPlace: p.birthPlace, rashi: p.rashi, lagna: p.lagna,
          nakshatra: p.nakshatra, dasha: p.dasha,
        }),
      }).catch(() => {});
    }
  };

  const reset = () => {
    setProfile(null);
    AsyncStorage.removeItem(KUNDALI_KEY).catch(() => {});
  };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: BG, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color={SAFFRON} size="large" />
      <Text style={{ color: CREAM, marginTop: 12, fontFamily: "Poppins_400Regular", opacity: 0.75 }}>ॐ Loading Astrology...</Text>
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
          {!!profile.fullName && (
            <Text style={[S.mainHeaderSub, { color: GOLD, marginBottom: 2 }]}>Namaste, {profile.fullName} 🙏</Text>
          )}
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
        {section === "mantra"    && <DailyMantraSection profile={profile} />}
        {section === "navagraha" && <NavagrahaSection profile={profile} />}
        {section === "matching"  && <MatchingSection profile={profile} />}
        {section === "sadesati"  && <SadeSatiSection profile={profile} />}
        {section === "gemstone"  && <GemstoneSection profile={profile} />}
        {section === "marriage"  && <MarriageTimingSection profile={profile} />}
        {section === "houses"    && <TwelveHousesSection profile={profile} />}
        {section === "chat"      && <JyotishiChat profile={profile} />}
        {section === "upaya"     && <UpaayaSection profile={profile} />}
        {section === "nakshatra" && <NakshatraSection profile={profile} />}
        {section === "prashna"   && <PrashnaSection profile={profile} />}
        {section === "spiritual" && <SpiritualPathSection profile={profile} />}
        {section === "pastlife"  && <PastLifeSection profile={profile} />}
        {section === "karma"     && <KarmaTypesSection profile={profile} />}
        {section === "ishta"     && <IshtaDevataSection profile={profile} />}
        {section === "dasha"     && <DashaCalendarSection profile={profile} />}
        {section === "mantras"   && <MantraLibrarySection />}
        {section === "navamsa"   && <NavamsaSection profile={profile} />}
      </View>
    </View>
  );
}

export function JyotishaTab({ userId }: { userId?: string }) {
  return (
    <JyotishaErrorBoundary>
      <JyotishaTabInner userId={userId} />
    </JyotishaErrorBoundary>
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
  inputHint: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 5, lineHeight: 16 },
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

  // Daily Mantra
  mantraHeader: { paddingTop: 32, paddingBottom: 28, alignItems: "center" },
  mantraOm: { color: GOLD, fontSize: 60, fontFamily: "Poppins_700Bold", marginBottom: 8 },
  mantraTitle: { color: GOLD, fontSize: 22, fontFamily: "Poppins_700Bold" },
  mantraSubtitle: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  mantraDate: { color: "rgba(253,230,138,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 6 },
  mantraCard: { borderRadius: 20, borderWidth: 1, borderColor: GOLD + "40", padding: 24, marginBottom: 16, alignItems: "center" },
  mantraSanskrit: { color: SAFFRON, fontSize: 24, fontFamily: "Poppins_700Bold", textAlign: "center", lineHeight: 38, marginBottom: 10 },
  mantraTranslit: { color: CREAM, fontSize: 15, fontFamily: "Poppins_400Regular", textAlign: "center", fontStyle: "italic", marginBottom: 16 },
  mantraDivider: { width: 60, height: 1, backgroundColor: GOLD + "40", marginBottom: 16 },
  mantraMeaning: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", lineHeight: 22 },
  deityRow: { flexDirection: "row", alignItems: "flex-start", backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 14, marginBottom: 10, gap: 10 },
  deityEmoji: { fontSize: 22 },
  deityName: { color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 14, marginBottom: 4 },
  deityDesc: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20 },
  practiceBox: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: "rgba(253,230,138,0.12)", padding: 16, marginBottom: 10 },
  practiceTitle: { color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 14, marginBottom: 12 },
  practiceRow: { flexDirection: "row", justifyContent: "space-around" },
  practiceItem: { alignItems: "center", flex: 1 },
  practiceLabel: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 10, marginBottom: 4 },
  practiceValue: { color: SAFFRON, fontFamily: "Poppins_700Bold", fontSize: 13, textAlign: "center" },

  // Sade Sati
  sadeSatiHeader: { paddingTop: 28, paddingBottom: 24, alignItems: "center" },
  sadeSatiTitle: { color: GOLD, fontSize: 22, fontFamily: "Poppins_700Bold", marginTop: 8 },
  sadeSatiSubtitle: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  sadeSatiRashi: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 8 },
  sadeSatiStatus: { borderRadius: 20, borderWidth: 2, overflow: "hidden", marginHorizontal: 16, marginBottom: 16 },
  sadeSatiStatusGrad: { padding: 24, alignItems: "center" },
  sadeSatiStatusLabel: { fontFamily: "Poppins_700Bold", fontSize: 20, marginBottom: 4 },
  sadeSatiPhase: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 14 },
  timelineBox: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 16, marginHorizontal: 16, marginBottom: 10 },
  timelineTitle: { color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 14, marginBottom: 14 },
  timelineRow: { flexDirection: "row", alignItems: "center" },
  timelineItem: { flex: 1, alignItems: "center" },
  timelineLabel: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11, marginBottom: 4 },
  timelineYear: { fontFamily: "Poppins_700Bold", fontSize: 22 },
  timelineLine: { flex: 1, height: 1, backgroundColor: "rgba(253,230,138,0.2)", marginHorizontal: 8 },
  affectedBox: { backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 14, marginHorizontal: 16, marginBottom: 10 },
  affectedTitle: { color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 14, marginHorizontal: 16, marginBottom: 8 },
  affectedChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  affectedChip: { backgroundColor: "rgba(107,114,128,0.2)", borderRadius: 20, borderWidth: 1, borderColor: "#6B728050", paddingHorizontal: 12, paddingVertical: 5 },
  affectedChipText: { color: "#9CA3AF", fontFamily: "Poppins_400Regular", fontSize: 12 },

  // Gemstone
  viewToggle: { flexDirection: "row", marginHorizontal: 16, marginBottom: 14, backgroundColor: "rgba(253,230,138,0.05)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 4, gap: 4 },
  viewToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: "center" },
  viewToggleBtnActive: { backgroundColor: GOLD },
  viewToggleText: { color: DIM, fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  gemCard: { backgroundColor: CARD_BG, borderRadius: 16, padding: 16, marginBottom: 12, overflow: "hidden" },
  gemPrimaryBadge: { backgroundColor: GOLD + "25", borderRadius: 20, borderWidth: 1, borderColor: GOLD + "60", paddingHorizontal: 12, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 12 },
  gemPrimaryText: { color: SAFFRON, fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  gemCardTop: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  gemName: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  gemSanskrit: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 12 },
  gemPlanet: { color: "rgba(253,230,138,0.4)", fontFamily: "Poppins_400Regular", fontSize: 11 },
  gemBenefit: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20, marginBottom: 12 },
  gemMeta: { flexDirection: "row", gap: 8 },
  gemMetaItem: { flex: 1, alignItems: "center", backgroundColor: "rgba(253,230,138,0.05)", borderRadius: 10, padding: 8 },
  gemMetaLabel: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 9, marginBottom: 3 },
  gemMetaValue: { fontFamily: "Poppins_700Bold", fontSize: 12, textAlign: "center" },
  gemMantraBox: { marginTop: 12, backgroundColor: "rgba(217,119,6,0.1)", borderRadius: 10, padding: 10 },
  gemMantraLabel: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 10, marginBottom: 4 },
  gemMantraText: { color: SAFFRON, fontFamily: "Poppins_400Regular", fontSize: 12, fontStyle: "italic" },

  // Marriage
  marriageHeader: { paddingTop: 28, paddingBottom: 24, alignItems: "center" },
  marriageTitle: { color: "#EC4899", fontSize: 22, fontFamily: "Poppins_700Bold", marginTop: 8 },
  marriageSubtitle: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  marriageRashi: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 8 },
  marriageTopRow: { flexDirection: "row", gap: 10, marginHorizontal: 0, marginBottom: 12 },
  marriageStatBox: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: "center" },
  marriageStatLabel: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11, marginBottom: 4 },
  marriageStatValue: { fontFamily: "Poppins_700Bold", fontSize: 14, textAlign: "center" },

  // 12 Houses
  houseDetailHeader: { paddingTop: 28, paddingBottom: 24, alignItems: "center" },
  houseNum: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 6 },
  houseDetailName: { color: SAFFRON, fontSize: 22, fontFamily: "Poppins_700Bold", marginTop: 2 },
  houseDetailArea: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  houseMetaRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  houseMetaItem: { flex: 1, backgroundColor: CARD_BG, borderRadius: 12, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", padding: 12, alignItems: "center" },
  houseMetaLabel: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 10, marginBottom: 4 },
  houseMetaValue: { fontFamily: "Poppins_700Bold", fontSize: 13, textAlign: "center" },
  houseCard: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: "rgba(253,230,138,0.1)", overflow: "hidden", marginBottom: 10 },
  houseCardGrad: { padding: 16, minHeight: 130, justifyContent: "center" },
  houseCardNum: { position: "absolute", top: 10, right: 12, color: "rgba(253,230,138,0.2)", fontFamily: "Poppins_700Bold", fontSize: 28 },
  houseCardName: { color: CREAM, fontFamily: "Poppins_700Bold", fontSize: 14, marginTop: 6 },
  houseCardArea: { color: DIM, fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 },
  houseCardArrow: { position: "absolute", bottom: 10, right: 12 },
  refreshText: { color: GOLD, fontFamily: "Poppins_400Regular", fontSize: 13 },

  // Prashna
  prashnaInputCard: { backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1, borderColor: "rgba(253,230,138,0.15)", padding: 16, marginBottom: 16 },
  prashnaInput: { color: CREAM, fontFamily: "Poppins_400Regular", fontSize: 14, borderWidth: 1, borderColor: "rgba(253,230,138,0.2)", borderRadius: 14, padding: 14, minHeight: 80, textAlignVertical: "top" },
  prashnaAnswerCard: { backgroundColor: "rgba(217,119,6,0.12)", borderRadius: 18, borderWidth: 1, borderColor: GOLD + "50", padding: 18, marginBottom: 10 },
});
