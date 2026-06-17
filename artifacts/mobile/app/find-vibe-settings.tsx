import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Dimensions,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import type { Session } from "@supabase/supabase-js";
import { useColors } from "@/hooks/useColors";
import {
  fetchUserSettings,
  getGundrukProfile,
  RELATIONSHIP_GOALS,
  saveGundrukProfile,
  saveUserSettings,
} from "@/lib/db";

const { width: SW } = Dimensions.get("window");
const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

// ── Option arrays ─────────────────────────────────────────────────────────────

const FIND_GUNDRUK_MODE_OPTIONS = [
  { label: "❤️  Dating",        value: "dating",     icon: "heart-outline" },
  { label: "👫  Friends",       value: "friends",    icon: "people-outline" },
  { label: "🤝  Networking",    value: "networking", icon: "briefcase-outline" },
  { label: "👀  Just Browsing", value: "browsing",   icon: "eye-outline" },
];

const VIBE_REQUEST_OPTIONS = [
  { label: "Everyone",         value: "everyone",  icon: "earth-outline" },
  { label: "People I follow",  value: "following", icon: "people-outline" },
  { label: "Nobody",           value: "nobody",    icon: "ban-outline" },
];

const DISTANCE_OPTIONS = [
  { label: "5 km",         value: "5",   icon: "locate-outline" },
  { label: "10 km",        value: "10",  icon: "locate-outline" },
  { label: "25 km",        value: "25",  icon: "location-outline" },
  { label: "50 km",        value: "50",  icon: "location-outline" },
  { label: "100 km",       value: "100", icon: "navigate-outline" },
  { label: "Any distance", value: "999", icon: "earth-outline" },
];

const ZODIAC_OPTIONS = [
  { label: "♈ Aries",        value: "aries" },
  { label: "♉ Taurus",       value: "taurus" },
  { label: "♊ Gemini",       value: "gemini" },
  { label: "♋ Cancer",       value: "cancer" },
  { label: "♌ Leo",          value: "leo" },
  { label: "♍ Virgo",        value: "virgo" },
  { label: "♎ Libra",        value: "libra" },
  { label: "♏ Scorpio",      value: "scorpio" },
  { label: "♐ Sagittarius",  value: "sagittarius" },
  { label: "♑ Capricorn",    value: "capricorn" },
  { label: "♒ Aquarius",     value: "aquarius" },
  { label: "♓ Pisces",       value: "pisces" },
  { label: "🤷 Don't know",   value: "unknown" },
];

const EDUCATION_OPTIONS = [
  { label: "🏫 High school",        value: "high_school" },
  { label: "📚 Some college",       value: "some_college" },
  { label: "🎓 Bachelor's degree",  value: "bachelors" },
  { label: "🔬 Master's / PhD",     value: "postgrad" },
  { label: "🔧 Trade / Vocational", value: "trade" },
  { label: "🤐 Prefer not to say",  value: "prefer_not" },
];

const FAMILY_PLANS_OPTIONS = [
  { label: "💭 Want someday",       value: "want_someday" },
  { label: "⏰ Want soon",          value: "want_soon" },
  { label: "🤷 Open to it",         value: "open" },
  { label: "🚫 Don't want",         value: "dont_want" },
  { label: "👶 Already have kids",  value: "have_kids" },
  { label: "🤐 Prefer not to say",  value: "prefer_not" },
];

const COMMUNICATION_OPTIONS = [
  { label: "💬 Text all day",            value: "text_all_day" },
  { label: "📱 Text + occasional calls", value: "text_calls" },
  { label: "📞 Calls > texts",           value: "calls" },
  { label: "🎙️ Voice notes",             value: "voice_notes" },
  { label: "🤝 In person > all",         value: "in_person" },
];

const LOVE_STYLE_OPTIONS = [
  { label: "💬 Words of affirmation", value: "words" },
  { label: "⏰ Quality time",          value: "quality_time" },
  { label: "🤲 Acts of service",       value: "acts" },
  { label: "🤗 Physical touch",        value: "touch" },
  { label: "🎁 Receiving gifts",       value: "gifts" },
];

const PETS_OPTIONS = [
  { label: "🐶 Dog",          value: "dog" },
  { label: "🐱 Cat",          value: "cat" },
  { label: "🐠 Fish",         value: "fish" },
  { label: "🐦 Bird",         value: "bird" },
  { label: "🦎 Reptile",      value: "reptile" },
  { label: "🐾 No pets",      value: "no_pets" },
  { label: "🦁 All the pets", value: "all_pets" },
  { label: "🤧 Allergic",     value: "allergic" },
];

const DRINKING_OPTIONS = [
  { label: "🚫 Never",                value: "never" },
  { label: "💧 Sober curious",        value: "sober_curious" },
  { label: "🥂 On special occasions", value: "special" },
  { label: "🍻 Socially",             value: "socially" },
  { label: "🍷 Regularly",            value: "regularly" },
  { label: "🤐 Prefer not to say",    value: "prefer_not" },
];

const SMOKING_OPTIONS = [
  { label: "🚫 Never",              value: "never" },
  { label: "💪 Trying to quit",     value: "quitting" },
  { label: "🙈 Socially",           value: "socially" },
  { label: "🚬 Yes",                value: "yes" },
  { label: "🤐 Prefer not to say",  value: "prefer_not" },
];

const CANNABIS_OPTIONS = [
  { label: "🚫 Never",              value: "never" },
  { label: "🌿 Sometimes",          value: "sometimes" },
  { label: "✅ Yes",                 value: "yes" },
  { label: "🤐 Prefer not to say",  value: "prefer_not" },
];

const WORKOUT_OPTIONS = [
  { label: "💪 Every day", value: "everyday" },
  { label: "🏃 Often",     value: "often" },
  { label: "🧘 Sometimes", value: "sometimes" },
  { label: "🛋️ Rarely",   value: "rarely" },
  { label: "🤐 Never",     value: "never" },
];

const SOCIAL_MEDIA_OPTIONS = [
  { label: "📱 Very active",     value: "very_active" },
  { label: "👀 Sometimes",       value: "sometimes" },
  { label: "🙈 Lurker",          value: "lurker" },
  { label: "📵 Rarely",          value: "rarely" },
  { label: "🌍 Mostly offline",  value: "offline" },
];

const OPEN_TO_OPTIONS = [
  { label: "💍 Long-term",               value: "long_term" },
  { label: "💫 Short-term",              value: "short_term" },
  { label: "😌 Casual",                  value: "casual" },
  { label: "👯 New friends",             value: "friends" },
  { label: "🤷 Still figuring it out",   value: "unsure" },
];

const LANGUAGES_OPTIONS = [
  { label: "🇺🇸 English",               value: "en" },
  { label: "🇪🇸 Spanish",               value: "es" },
  { label: "🇫🇷 French",                value: "fr" },
  { label: "🇩🇪 German",                value: "de" },
  { label: "🇯🇵 Japanese",              value: "ja" },
  { label: "🇰🇷 Korean",                value: "ko" },
  { label: "🇧🇷 Portuguese",            value: "pt" },
  { label: "🇨🇳 Chinese (Simplified)",  value: "zh" },
  { label: "🇸🇦 Arabic",                value: "ar" },
  { label: "🇮🇳 Hindi",                 value: "hi" },
  { label: "🇮🇹 Italian",               value: "it" },
  { label: "🇷🇺 Russian",               value: "ru" },
  { label: "🇹🇷 Turkish",               value: "tr" },
  { label: "🇳🇱 Dutch",                 value: "nl" },
  { label: "🇸🇪 Swedish",               value: "sv" },
];

// ── useToast ──────────────────────────────────────────────────────────────────

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    setMsg(message);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMsg(null), 2000);
  }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return { msg, showToast };
}

// ── OptionPicker ─────────────────────────────────────────────────────────────

function OptionPicker({
  visible, title, options, selected, onSelect, onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: string; icon?: string }[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      <View style={[opStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[opStyles.handle, { backgroundColor: colors.border }]} />
        <Text style={[opStyles.title, { color: colors.foreground }]}>{title}</Text>
        {options.map((o) => (
          <TouchableOpacity key={o.value} onPress={() => { onSelect(o.value); onClose(); }}
            style={[opStyles.row, { borderBottomColor: colors.border }]}>
            {o.icon ? (
              <Ionicons name={o.icon as any} size={20} color={colors.foreground} style={{ marginRight: 12 }} />
            ) : null}
            <Text style={[opStyles.label, { color: colors.foreground, fontFamily: selected === o.value ? "Poppins_700Bold" : "Poppins_400Regular" }]}>
              {o.label}
            </Text>
            {selected === o.value && <Ionicons name="checkmark" size={18} color="#EC4899" />}
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

const opStyles = StyleSheet.create({
  sheet:  { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: StyleSheet.hairlineWidth },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title:  { fontSize: 17, fontFamily: "Poppins_700Bold", marginBottom: 16 },
  row:    { flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  label:  { flex: 1, fontSize: 15 },
});

// ── MultiSelectSheet ──────────────────────────────────────────────────────────

function MultiSelectSheet({
  visible, title, options, selected, onSave, onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: string }[];
  selected: string[] | null;
  onSave: (selected: string[] | null) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [local, setLocal] = useState<string[]>(() => selected ?? []);

  useEffect(() => { if (visible) setLocal(selected ?? []); }, [visible, selected]);

  const toggle = (v: string) =>
    setLocal((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      <View style={[mssStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[mssStyles.handle, { backgroundColor: colors.border }]} />
        <Text style={[mssStyles.title, { color: colors.foreground }]}>{title}</Text>
        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
          {options.map((o) => {
            const isOn = local.includes(o.value);
            return (
              <TouchableOpacity key={o.value} onPress={() => toggle(o.value)}
                style={[mssStyles.item, { borderBottomColor: colors.border }]}>
                <Text style={[mssStyles.itemLabel, { color: colors.foreground }]}>{o.label}</Text>
                <View style={[mssStyles.checkbox, {
                  borderColor: isOn ? "#EC4899" : colors.mutedForeground,
                  backgroundColor: isOn ? "#EC4899" : "transparent",
                }]}>
                  {isOn && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={[mssStyles.footer, { borderTopColor: colors.border }]}>
          {local.length > 0 && (
            <Text style={[mssStyles.count, { color: colors.mutedForeground }]}>{local.length} selected</Text>
          )}
          <TouchableOpacity style={mssStyles.saveBtn}
            onPress={() => { onSave(local.length > 0 ? local : null); onClose(); }}>
            <Text style={mssStyles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const mssStyles = StyleSheet.create({
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: StyleSheet.hairlineWidth },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title:       { fontSize: 17, fontFamily: "Poppins_700Bold", marginBottom: 16 },
  item:        { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  itemLabel:   { flex: 1, fontSize: 15, fontFamily: "Poppins_400Regular" },
  checkbox:    { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  footer:      { paddingTop: 16, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  count:       { fontSize: 12, textAlign: "center", fontFamily: "Poppins_400Regular" },
  saveBtn:     { backgroundColor: "#EC4899", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

// ── AgeRangeModal ─────────────────────────────────────────────────────────────

function AgeRangeModal({
  visible, minAge, maxAge, onSave, onClose,
}: {
  visible: boolean; minAge: number; maxAge: number;
  onSave: (min: number, max: number) => void; onClose: () => void;
}) {
  const colors = useColors();
  const [mn, setMn] = useState(String(minAge));
  const [mx, setMx] = useState(String(maxAge));
  useEffect(() => { if (visible) { setMn(String(minAge)); setMx(String(maxAge)); } }, [visible, minAge, maxAge]);
  const save = () => {
    const a = Math.max(18, Math.min(99, parseInt(mn, 10) || 18));
    const b = Math.max(18, Math.min(99, parseInt(mx, 10) || 60));
    onSave(Math.min(a, b), Math.max(a, b));
    onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      <View style={[armStyles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[armStyles.handle, { backgroundColor: colors.border }]} />
        <Text style={[armStyles.title, { color: colors.foreground }]}>Age Range</Text>
        <Text style={[armStyles.hint, { color: colors.mutedForeground }]}>Only see people in this age range</Text>
        <View style={armStyles.row}>
          <View style={armStyles.half}>
            <Text style={[armStyles.label, { color: colors.mutedForeground }]}>Min age</Text>
            <TextInput keyboardType="numeric" value={mn} onChangeText={setMn}
              style={[armStyles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
          </View>
          <Text style={[armStyles.dash, { color: colors.mutedForeground }]}>–</Text>
          <View style={armStyles.half}>
            <Text style={[armStyles.label, { color: colors.mutedForeground }]}>Max age</Text>
            <TextInput keyboardType="numeric" value={mx} onChangeText={setMx}
              style={[armStyles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
          </View>
        </View>
        <TouchableOpacity style={[armStyles.saveBtn, { backgroundColor: "#EC4899" }]} onPress={save}>
          <Text style={armStyles.saveTxt}>Save range</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const armStyles = StyleSheet.create({
  container: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: StyleSheet.hairlineWidth },
  handle:    { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title:     { fontSize: 17, fontFamily: "Poppins_700Bold", marginBottom: 4 },
  hint:      { fontSize: 13, fontFamily: "Poppins_400Regular", marginBottom: 20 },
  row:       { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  half:      { flex: 1 },
  label:     { fontSize: 12, fontFamily: "Poppins_500Medium", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  input:     { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 14, fontSize: 24, fontFamily: "Poppins_700Bold", borderWidth: 1, textAlign: "center" },
  dash:      { fontSize: 26, fontFamily: "Poppins_700Bold" },
  saveBtn:   { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  saveTxt:   { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
});

// ── GoalFilterSheet ───────────────────────────────────────────────────────────

function GoalFilterSheet({
  visible, selected, onSave, onClose,
}: {
  visible: boolean;
  selected: string[] | null;
  onSave: (goals: string[] | null) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const ALL_VALUES = RELATIONSHIP_GOALS.map((g) => g.value);
  const toLocal = (sel: string[] | null): string[] =>
    sel && sel.length > 0 ? [...sel] : [...ALL_VALUES];
  const [local, setLocal] = React.useState<string[]>(() => toLocal(selected));
  React.useEffect(() => { if (visible) setLocal(toLocal(selected)); }, [visible]);
  const toggle = (value: string) =>
    setLocal((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
  const allSelected = local.length === ALL_VALUES.length;
  const handleSave = () => {
    onSave(local.length === 0 || local.length === ALL_VALUES.length ? null : local);
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={gfsStyles.overlay}>
        <View style={[gfsStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[gfsStyles.header, { borderBottomColor: colors.border }]}>
            <Text style={[gfsStyles.title, { color: colors.foreground }]}>I'm open to meeting people looking for…</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[gfsStyles.selectAll, { borderBottomColor: colors.border }]}
            onPress={() => setLocal(allSelected ? [] : [...ALL_VALUES])}>
            <Text style={[gfsStyles.selectAllText, { color: "#EC4899" }]}>
              {allSelected ? "Deselect all" : "Select all (default)"}
            </Text>
          </TouchableOpacity>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {RELATIONSHIP_GOALS.map((g, idx) => {
              const checked = local.includes(g.value);
              return (
                <TouchableOpacity key={g.value}
                  style={[gfsStyles.row, { borderBottomColor: colors.border }, idx === RELATIONSHIP_GOALS.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => toggle(g.value)} activeOpacity={0.7}>
                  <View style={[gfsStyles.dot, { backgroundColor: g.color }]}>
                    <Text style={gfsStyles.emoji}>{g.emoji}</Text>
                  </View>
                  <Text style={[gfsStyles.label, { color: colors.foreground }]}>{g.label}</Text>
                  <View style={[gfsStyles.checkbox, { borderColor: checked ? "#EC4899" : colors.border, backgroundColor: checked ? "#EC4899" : "transparent" }]}>
                    {checked && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={[gfsStyles.footer, { borderTopColor: colors.border }]}>
            {!allSelected && local.length > 0 && (
              <Text style={[gfsStyles.warning, { color: colors.mutedForeground }]}>
                Showing {local.length} of {ALL_VALUES.length} goals
              </Text>
            )}
            <TouchableOpacity style={gfsStyles.saveBtn} onPress={handleSave}>
              <Text style={gfsStyles.saveBtnText}>Save preferences</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const gfsStyles = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet:       { maxHeight: "85%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  header:      { flexDirection: "row", alignItems: "center", padding: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  title:       { flex: 1, fontSize: 16, fontFamily: "Poppins_700Bold" },
  selectAll:   { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  selectAllText: { fontSize: 14, fontFamily: "Poppins_500Medium" },
  row:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  dot:         { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center", marginRight: 12 },
  emoji:       { fontSize: 16 },
  label:       { flex: 1, fontSize: 15 },
  checkbox:    { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  footer:      { padding: 18, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  warning:     { fontSize: 12, textAlign: "center" },
  saveBtn:     { backgroundColor: "#EC4899", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

// ── PhotoPickerModal ──────────────────────────────────────────────────────────

function PhotoPickerModal({
  visible, userId, selected, onSave, onClose,
}: {
  visible: boolean;
  userId: string;
  selected: string[] | null;
  onSave: (photos: string[] | null) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [local, setLocal] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setLocal(selected ?? []);
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    fetch(`${API_BASE}/users/photos?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((j: any) => setPhotos(j.photos ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, userId]);

  const PHOTO_SIZE = (SW - 48) / 3;

  const toggle = (url: string) => {
    setLocal((prev) =>
      prev.includes(url)
        ? prev.filter((u) => u !== url)
        : prev.length < 6
          ? [...prev, url]
          : (Alert.alert("Max 6 photos", "Remove a photo first to add another."), prev),
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
        <View style={[ppStyles.sheet, { backgroundColor: colors.card }]}>
          <View style={[ppStyles.handle, { backgroundColor: colors.border }]} />
          <View style={ppStyles.header}>
            <Text style={[ppStyles.title, { color: colors.foreground }]}>Vibe Photos</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <Text style={[ppStyles.sub, { color: colors.mutedForeground }]}>
            Pick up to 6 photos to show on your match card. They appear in the order selected.
          </Text>

          {loading ? (
            <ActivityIndicator color="#EC4899" size="large" style={{ marginVertical: 40 }} />
          ) : photos.length === 0 ? (
            <View style={ppStyles.emptyBox}>
              <Ionicons name="images-outline" size={48} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
              <Text style={[ppStyles.emptyText, { color: colors.mutedForeground }]}>
                No photos yet. Post some photos to your profile first, then come back here to select them.
              </Text>
            </View>
          ) : (
            <FlatList
              data={photos}
              numColumns={3}
              keyExtractor={(item) => item}
              style={{ maxHeight: SW * 0.85 }}
              renderItem={({ item }) => {
                const isSelected = local.includes(item);
                const idx = local.indexOf(item);
                return (
                  <TouchableOpacity onPress={() => toggle(item)}
                    style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, padding: 2 }}>
                    <View style={{ flex: 1, borderRadius: 8, overflow: "hidden" }}>
                      <Image source={{ uri: item }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                      {isSelected && (
                        <View style={ppStyles.checkOverlay}>
                          <View style={ppStyles.checkCircle}>
                            <Text style={ppStyles.checkNum}>{idx + 1}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <View style={[ppStyles.footer, { borderTopColor: colors.border }]}>
            <Text style={[ppStyles.count, { color: colors.mutedForeground }]}>{local.length}/6 selected</Text>
            <TouchableOpacity style={ppStyles.saveBtn}
              onPress={() => { onSave(local.length > 0 ? local : null); onClose(); }}>
              <Text style={ppStyles.saveTxt}>Save photos</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const ppStyles = StyleSheet.create({
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "90%" },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  title:        { fontSize: 17, fontFamily: "Poppins_700Bold" },
  sub:          { fontSize: 13, fontFamily: "Poppins_400Regular", marginBottom: 14, lineHeight: 18 },
  emptyBox:     { paddingVertical: 40, alignItems: "center", paddingHorizontal: 24 },
  emptyText:    { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 20 },
  checkOverlay: { ...StyleSheet.absoluteFillObject as any, backgroundColor: "rgba(236,72,153,0.3)", borderRadius: 8, justifyContent: "flex-end", alignItems: "flex-end", padding: 4 },
  checkCircle:  { width: 22, height: 22, borderRadius: 11, backgroundColor: "#EC4899", justifyContent: "center", alignItems: "center" },
  checkNum:     { color: "#fff", fontSize: 12, fontFamily: "Poppins_700Bold" },
  footer:       { paddingTop: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12 },
  count:        { fontSize: 13, textAlign: "center", fontFamily: "Poppins_400Regular" },
  saveBtn:      { backgroundColor: "#EC4899", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveTxt:      { color: "#fff", fontWeight: "700", fontSize: 15 },
});

// ── Module-scope sub-components ───────────────────────────────────────────────
// Defined at module scope (not inside the screen function) to keep type
// references stable across renders — avoids Ionicons glyph remount issues.

function SecLabel({ label }: { label: string }) {
  const colors = useColors();
  return <Text style={[fvsStyles.secLabel, { color: colors.mutedForeground }]}>{label}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[fvsStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

function Row({
  icon, iconBg, label, sub, isLast = false, onPress, rightEl,
}: {
  icon: string; iconBg: string; label: string; sub?: string;
  isLast?: boolean; onPress?: () => void; rightEl?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={[fvsStyles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
    >
      <View style={[fvsStyles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={16} color="#fff" />
      </View>
      <View style={fvsStyles.rowContent}>
        <Text style={[fvsStyles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {sub ? <Text style={[fvsStyles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {rightEl !== undefined
        ? rightEl
        : onPress
          ? <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          : null}
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FindVibeSettings() {
  const { session } = useAuth();
  const userId: string | null = (session as Session | null)?.user?.id ?? null;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { msg: toastMsg, showToast } = useToast();

  // Discovery settings
  const [showInMatching,       setShowInMatching]       = useState(true);
  const [findGundrukMode,      setFindGundrukMode]      = useState("dating");
  const [vibeRequestPrivacy,   setVibeRequestPrivacy]   = useState("everyone");
  const vibeInteracted = useRef(false);
  const [vibeAgeMin,           setVibeAgeMin]           = useState(18);
  const [vibeAgeMax,           setVibeAgeMax]           = useState(60);
  const [vibeMaxDistanceKm,    setVibeMaxDistanceKm]    = useState(50);
  const [vibeShowDistance,     setVibeShowDistance]     = useState(true);
  const [vibeExcludeConns,     setVibeExcludeConns]     = useState(false);
  const [vibeGoalFilter,       setVibeGoalFilter]       = useState<string[] | null>(null);
  const [filterMinPhotos,      setFilterMinPhotos]      = useState(0);
  const [filterRequiresBio,    setFilterRequiresBio]    = useState(false);

  // Vibe profile
  const [vibeBio,    setVibeBio]    = useState("");
  const [vibePhotos, setVibePhotos] = useState<string[] | null>(null);

  // About Me
  const [vibeZodiac,        setVibeZodiac]        = useState<string | null>(null);
  const [vibeEducation,     setVibeEducation]     = useState<string | null>(null);
  const [vibeFamilyPlans,   setVibeFamilyPlans]   = useState<string | null>(null);
  const [vibeCommunication, setVibeCommunication] = useState<string | null>(null);
  const [vibeLoveStyle,     setVibeLoveStyle]     = useState<string | null>(null);
  const [vibePets,          setVibePets]          = useState<string | null>(null);
  const [vibeDrinking,      setVibeDrinking]      = useState<string | null>(null);
  const [vibeSmoking,       setVibeSmoking]       = useState<string | null>(null);
  const [vibeCannabis,      setVibeCannabis]      = useState<string | null>(null);
  const [vibeWorkout,       setVibeWorkout]       = useState<string | null>(null);
  const [vibeSocialMedia,   setVibeSocialMedia]   = useState<string | null>(null);
  const [vibeOpenTo,        setVibeOpenTo]        = useState<string[] | null>(null);
  const [vibeLanguages,     setVibeLanguages]     = useState<string[] | null>(null);

  // Modal visibility
  const [showModePicker,       setShowModePicker]       = useState(false);
  const [showPrivacyPicker,    setShowPrivacyPicker]    = useState(false);
  const [showAgeRangePicker,   setShowAgeRangePicker]   = useState(false);
  const [showDistancePicker,   setShowDistancePicker]   = useState(false);
  const [showGoalFilterSheet,  setShowGoalFilterSheet]  = useState(false);
  const [showOpenToSheet,      setShowOpenToSheet]      = useState(false);
  const [showLanguagesSheet,   setShowLanguagesSheet]   = useState(false);
  const [showPhotoPicker,      setShowPhotoPicker]      = useState(false);
  const [editingBio,           setEditingBio]           = useState(false);
  const [bioText,              setBioText]              = useState("");

  // Generic single-select picker state (reuses <OptionPicker>)
  const [activePicker, setActivePicker] = useState<{
    title: string;
    options: { label: string; value: string }[];
    selected: string;
    onSelect: (v: string) => void;
  } | null>(null);

  // Load settings
  useEffect(() => {
    if (!userId) return;
    fetchUserSettings(userId).then((s) => {
      setVibeAgeMin(s.vibe_age_min);
      setVibeAgeMax(s.vibe_age_max);
      setVibeMaxDistanceKm(s.vibe_max_distance_km);
      setVibeShowDistance(s.vibe_show_distance);
      setVibeExcludeConns(s.vibe_exclude_connections);
    }).catch(() => {});

    getGundrukProfile(userId).then((p) => {
      setShowInMatching(p.show_in_matching);
      setFindGundrukMode(p.find_gundruk_mode);
      setVibeRequestPrivacy(p.vibe_request_privacy);
      setVibeGoalFilter(p.vibe_goal_filter);
      setFilterMinPhotos(p.vibe_filter_min_photos);
      setFilterRequiresBio(p.vibe_filter_requires_bio);
      setVibeBio(p.vibe_bio ?? "");
      setVibePhotos(p.vibe_photos);
      setVibeZodiac(p.vibe_zodiac);
      setVibeEducation(p.vibe_education);
      setVibeFamilyPlans(p.vibe_family_plans);
      setVibeCommunication(p.vibe_communication);
      setVibeLoveStyle(p.vibe_love_style);
      setVibePets(p.vibe_pets);
      setVibeDrinking(p.vibe_drinking);
      setVibeSmoking(p.vibe_smoking);
      setVibeCannabis(p.vibe_cannabis);
      setVibeWorkout(p.vibe_workout);
      setVibeSocialMedia(p.vibe_social_media);
      setVibeOpenTo(p.vibe_open_to);
      setVibeLanguages(p.vibe_languages);
    }).catch(() => {});
  }, [userId]);

  const persistSetting = useCallback((patch: Record<string, unknown>) => {
    if (!userId) return;
    saveUserSettings(userId, patch as any);
  }, [userId]);

  const saveProfile = useCallback((patch: Record<string, unknown>) => {
    if (!userId) return;
    saveGundrukProfile(userId, patch as any);
  }, [userId]);

  const labelFor = (opts: { label: string; value: string }[], val: string | null) =>
    opts.find((o) => o.value === val)?.label ?? "Not set";

  const labelsFor = (opts: { label: string; value: string }[], vals: string[] | null) => {
    if (!vals || vals.length === 0) return "Not set";
    const labels = vals.map((v) => opts.find((o) => o.value === v)?.label ?? v);
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2} more`;
  };

  const goalFilterLabel = () => {
    if (!vibeGoalFilter || vibeGoalFilter.length === 0) return "All goals (default)";
    const ls = vibeGoalFilter.map((v) => RELATIONSHIP_GOALS.find((g) => g.value === v)?.shortLabel ?? v);
    if (ls.length <= 2) return ls.join(", ");
    return `${ls.slice(0, 2).join(", ")} +${ls.length - 2} more`;
  };

  return (
    <View style={[fvsStyles.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[fvsStyles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={fvsStyles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[fvsStyles.headerTitle, { color: colors.foreground }]}>Find Vibe Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[fvsStyles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>

        {/* ══════════════════════════════════════
            VIBE PROFILE
        ══════════════════════════════════════ */}
        <View style={fvsStyles.section}>
          <SecLabel label="Vibe Profile" />
          <Card>
            <Row
              icon="images-outline"
              iconBg="#7C3AED"
              label="Vibe Photos"
              sub={vibePhotos && vibePhotos.length > 0
                ? `${vibePhotos.length} photo${vibePhotos.length === 1 ? "" : "s"} selected`
                : "Tap to select photos from your profile"}
              onPress={() => setShowPhotoPicker(true)}
            />
            <Row
              icon="create-outline"
              iconBg="#EC4899"
              label="Vibe Bio"
              sub={vibeBio ? (vibeBio.length > 60 ? vibeBio.slice(0, 60) + "…" : vibeBio) : "Shown only on your match card"}
              onPress={() => { setBioText(vibeBio); setEditingBio(true); }}
              isLast
            />
          </Card>
        </View>

        {/* ══════════════════════════════════════
            DISCOVERY SETTINGS
        ══════════════════════════════════════ */}
        <View style={fvsStyles.section}>
          <SecLabel label="Discovery Settings" />
          <Card>
            <Row
              icon="heart-circle-outline"
              iconBg="#EC4899"
              label="Show me in Find Vibe"
              sub={showInMatching ? "Visible in matching & nearby" : "Hidden from all discovery"}
              rightEl={
                <Switch
                  value={showInMatching}
                  onValueChange={(v) => {
                    vibeInteracted.current = true;
                    setShowInMatching(v);
                    AsyncStorage.setItem(`find_vibe_locked_${userId}`, v ? "false" : "true").catch(() => {});
                    saveProfile({ show_in_matching: v });
                    DeviceEventEmitter.emit("findVibeLockChanged", { locked: !v });
                    showToast(v ? "You're visible in Find Vibe ✅" : "Hidden from Find Vibe 🔒");
                  }}
                  trackColor={{ false: colors.border, true: "#EC4899" }}
                  thumbColor="#fff"
                />
              }
            />
            <Row icon="compass-outline" iconBg="#7C3AED"
              label="What am I looking for?"
              sub={FIND_GUNDRUK_MODE_OPTIONS.find((o) => o.value === findGundrukMode)?.label ?? "❤️  Dating"}
              onPress={() => setShowModePicker(true)} />
            <Row icon="flash-outline" iconBg="#F97316"
              label="Who can send Vibe Requests?"
              sub={VIBE_REQUEST_OPTIONS.find((o) => o.value === vibeRequestPrivacy)?.label ?? "Everyone"}
              onPress={() => setShowPrivacyPicker(true)} />
            <Row icon="people-circle-outline" iconBg="#EC4899"
              label="Age Range"
              sub={`Show ages ${vibeAgeMin} – ${vibeAgeMax}`}
              onPress={() => setShowAgeRangePicker(true)} />
            <Row icon="location-outline" iconBg="#3B82F6"
              label="Distance Range"
              sub={vibeMaxDistanceKm >= 999 ? "Any distance" : `Within ${vibeMaxDistanceKm} km`}
              onPress={() => setShowDistancePicker(true)} />
            <Row icon="eye-off-outline" iconBg="#6366F1"
              label="Show my distance to others"
              sub={vibeShowDistance ? "Your distance is visible to others" : "Distance hidden from your profile"}
              rightEl={
                <Switch value={vibeShowDistance}
                  onValueChange={(v) => {
                    setVibeShowDistance(v);
                    persistSetting({ vibe_show_distance: v });
                    showToast(v ? "Distance shown ✅" : "Distance hidden 🔒");
                  }}
                  trackColor={{ false: colors.border, true: "#6366F1" }}
                  thumbColor="#fff" />
              } />
            <Row icon="person-remove-outline" iconBg="#F59E0B"
              label="Exclude people I follow"
              sub={vibeExcludeConns ? "Connections excluded from your deck" : "Connections may appear in your deck"}
              rightEl={
                <Switch value={vibeExcludeConns}
                  onValueChange={(v) => {
                    setVibeExcludeConns(v);
                    persistSetting({ vibe_exclude_connections: v });
                    showToast(v ? "Connections excluded ✅" : "All users may appear ✅");
                  }}
                  trackColor={{ false: colors.border, true: "#F59E0B" }}
                  thumbColor="#fff" />
              } />
            <Row icon="filter-outline" iconBg="#8B5CF6"
              label="I'm open to meeting people looking for…"
              sub={goalFilterLabel()}
              onPress={() => setShowGoalFilterSheet(true)} />
            <Row icon="images-outline" iconBg="#6366F1"
              label="Minimum photos in deck"
              sub={filterMinPhotos === 0 ? "Any (including no photos)" : `At least ${filterMinPhotos} photo${filterMinPhotos === 1 ? "" : "s"}`}
              rightEl={
                <View style={fvsStyles.stepper}>
                  <TouchableOpacity style={fvsStyles.stepperBtn} onPress={() => {
                    const v = Math.max(0, filterMinPhotos - 1);
                    setFilterMinPhotos(v);
                    saveProfile({ vibe_filter_min_photos: v });
                    showToast(v === 0 ? "No minimum ✅" : `Min ${v} photo${v === 1 ? "" : "s"} ✅`);
                  }}>
                    <Text style={fvsStyles.stepperTxt}>–</Text>
                  </TouchableOpacity>
                  <Text style={[fvsStyles.stepperVal, { color: colors.foreground }]}>{filterMinPhotos}</Text>
                  <TouchableOpacity style={fvsStyles.stepperBtn} onPress={() => {
                    const v = Math.min(6, filterMinPhotos + 1);
                    setFilterMinPhotos(v);
                    saveProfile({ vibe_filter_min_photos: v });
                    showToast(`Min ${v} photo${v === 1 ? "" : "s"} ✅`);
                  }}>
                    <Text style={fvsStyles.stepperTxt}>+</Text>
                  </TouchableOpacity>
                </View>
              } />
            <Row icon="document-text-outline" iconBg="#059669"
              label="Only show profiles with a bio"
              sub={filterRequiresBio ? "Profiles without a bio are hidden" : "Show all profiles"}
              isLast
              rightEl={
                <Switch value={filterRequiresBio}
                  onValueChange={(v) => {
                    setFilterRequiresBio(v);
                    saveProfile({ vibe_filter_requires_bio: v });
                    showToast(v ? "Bio required ✅" : "Showing all profiles ✅");
                  }}
                  trackColor={{ false: colors.border, true: "#059669" }}
                  thumbColor="#fff" />
              } />
          </Card>
        </View>

        {/* ══════════════════════════════════════
            ABOUT ME
        ══════════════════════════════════════ */}
        <View style={fvsStyles.section}>
          <SecLabel label="About Me" />
          <Text style={[fvsStyles.sectionHint, { color: colors.mutedForeground }]}>
            These appear on your Find Vibe match card.
          </Text>
          <Card>
            <Row icon="people-outline"        iconBg="#7C3AED" label="Open to…"
              sub={labelsFor(OPEN_TO_OPTIONS, vibeOpenTo)}
              onPress={() => setShowOpenToSheet(true)} />
            <Row icon="language-outline"      iconBg="#059669" label="Languages"
              sub={labelsFor(LANGUAGES_OPTIONS, vibeLanguages)}
              onPress={() => setShowLanguagesSheet(true)} />
            <Row icon="planet-outline"        iconBg="#6366F1" label="Zodiac Sign"
              sub={labelFor(ZODIAC_OPTIONS, vibeZodiac)}
              onPress={() => setActivePicker({ title: "Zodiac Sign", options: ZODIAC_OPTIONS, selected: vibeZodiac ?? "", onSelect: (v) => { setVibeZodiac(v); saveProfile({ vibe_zodiac: v }); showToast("Saved ✅"); } })} />
            <Row icon="school-outline"        iconBg="#0284C7" label="Education"
              sub={labelFor(EDUCATION_OPTIONS, vibeEducation)}
              onPress={() => setActivePicker({ title: "Education", options: EDUCATION_OPTIONS, selected: vibeEducation ?? "", onSelect: (v) => { setVibeEducation(v); saveProfile({ vibe_education: v }); showToast("Saved ✅"); } })} />
            <Row icon="heart-outline"         iconBg="#EC4899" label="Family Plans"
              sub={labelFor(FAMILY_PLANS_OPTIONS, vibeFamilyPlans)}
              onPress={() => setActivePicker({ title: "Family Plans", options: FAMILY_PLANS_OPTIONS, selected: vibeFamilyPlans ?? "", onSelect: (v) => { setVibeFamilyPlans(v); saveProfile({ vibe_family_plans: v }); showToast("Saved ✅"); } })} />
            <Row icon="chatbubbles-outline"   iconBg="#0891B2" label="Communication Style"
              sub={labelFor(COMMUNICATION_OPTIONS, vibeCommunication)}
              onPress={() => setActivePicker({ title: "Communication Style", options: COMMUNICATION_OPTIONS, selected: vibeCommunication ?? "", onSelect: (v) => { setVibeCommunication(v); saveProfile({ vibe_communication: v }); showToast("Saved ✅"); } })} />
            <Row icon="ribbon-outline"        iconBg="#D97706" label="Love Language"
              sub={labelFor(LOVE_STYLE_OPTIONS, vibeLoveStyle)}
              onPress={() => setActivePicker({ title: "Love Language", options: LOVE_STYLE_OPTIONS, selected: vibeLoveStyle ?? "", onSelect: (v) => { setVibeLoveStyle(v); saveProfile({ vibe_love_style: v }); showToast("Saved ✅"); } })} />
            <Row icon="paw-outline"           iconBg="#78716C" label="Pets"
              sub={labelFor(PETS_OPTIONS, vibePets)}
              onPress={() => setActivePicker({ title: "Pets", options: PETS_OPTIONS, selected: vibePets ?? "", onSelect: (v) => { setVibePets(v); saveProfile({ vibe_pets: v }); showToast("Saved ✅"); } })} />
            <Row icon="wine-outline"          iconBg="#7F1D1D" label="Drinking"
              sub={labelFor(DRINKING_OPTIONS, vibeDrinking)}
              onPress={() => setActivePicker({ title: "Drinking", options: DRINKING_OPTIONS, selected: vibeDrinking ?? "", onSelect: (v) => { setVibeDrinking(v); saveProfile({ vibe_drinking: v }); showToast("Saved ✅"); } })} />
            <Row icon="flame-outline"         iconBg="#6B7280" label="Smoking"
              sub={labelFor(SMOKING_OPTIONS, vibeSmoking)}
              onPress={() => setActivePicker({ title: "Smoking", options: SMOKING_OPTIONS, selected: vibeSmoking ?? "", onSelect: (v) => { setVibeSmoking(v); saveProfile({ vibe_smoking: v }); showToast("Saved ✅"); } })} />
            <Row icon="leaf-outline"          iconBg="#166534" label="Cannabis"
              sub={labelFor(CANNABIS_OPTIONS, vibeCannabis)}
              onPress={() => setActivePicker({ title: "Cannabis", options: CANNABIS_OPTIONS, selected: vibeCannabis ?? "", onSelect: (v) => { setVibeCannabis(v); saveProfile({ vibe_cannabis: v }); showToast("Saved ✅"); } })} />
            <Row icon="barbell-outline"       iconBg="#EA580C" label="Workout"
              sub={labelFor(WORKOUT_OPTIONS, vibeWorkout)}
              onPress={() => setActivePicker({ title: "Workout", options: WORKOUT_OPTIONS, selected: vibeWorkout ?? "", onSelect: (v) => { setVibeWorkout(v); saveProfile({ vibe_workout: v }); showToast("Saved ✅"); } })} />
            <Row icon="phone-portrait-outline" iconBg="#0369A1" label="Social Media"
              sub={labelFor(SOCIAL_MEDIA_OPTIONS, vibeSocialMedia)}
              isLast
              onPress={() => setActivePicker({ title: "Social Media", options: SOCIAL_MEDIA_OPTIONS, selected: vibeSocialMedia ?? "", onSelect: (v) => { setVibeSocialMedia(v); saveProfile({ vibe_social_media: v }); showToast("Saved ✅"); } })} />
          </Card>
        </View>

      </ScrollView>

      {/* ── Toast ── */}
      {toastMsg ? (
        <View style={fvsStyles.toast} pointerEvents="none">
          <Text style={fvsStyles.toastText}>{toastMsg}</Text>
        </View>
      ) : null}

      {/* ══════════════════════════════════════
          MODALS
      ══════════════════════════════════════ */}

      <OptionPicker visible={showModePicker} title="What are you looking for?"
        options={FIND_GUNDRUK_MODE_OPTIONS} selected={findGundrukMode}
        onSelect={(v) => { setFindGundrukMode(v); saveProfile({ find_gundruk_mode: v }); showToast("Saved ✅"); }}
        onClose={() => setShowModePicker(false)} />

      <OptionPicker visible={showPrivacyPicker} title="Who can send Vibe Requests?"
        options={VIBE_REQUEST_OPTIONS} selected={vibeRequestPrivacy}
        onSelect={(v) => { setVibeRequestPrivacy(v); saveProfile({ vibe_request_privacy: v }); showToast(v === "nobody" ? "Vibe Requests paused ⏸" : "Saved ✅"); }}
        onClose={() => setShowPrivacyPicker(false)} />

      <AgeRangeModal visible={showAgeRangePicker} minAge={vibeAgeMin} maxAge={vibeAgeMax}
        onSave={(mn, mx) => { setVibeAgeMin(mn); setVibeAgeMax(mx); persistSetting({ vibe_age_min: mn, vibe_age_max: mx }); showToast("Age range saved ✅"); }}
        onClose={() => setShowAgeRangePicker(false)} />

      <OptionPicker visible={showDistancePicker} title="Distance Range"
        options={DISTANCE_OPTIONS} selected={String(vibeMaxDistanceKm)}
        onSelect={(v) => { const km = parseInt(v, 10); setVibeMaxDistanceKm(km); persistSetting({ vibe_max_distance_km: km }); showToast("Distance saved ✅"); }}
        onClose={() => setShowDistancePicker(false)} />

      <GoalFilterSheet visible={showGoalFilterSheet} selected={vibeGoalFilter}
        onSave={(goals) => { setVibeGoalFilter(goals); saveProfile({ vibe_goal_filter: goals }); showToast(goals ? `${goals.length} goal${goals.length === 1 ? "" : "s"} selected ✅` : "Open to all goals ✅"); }}
        onClose={() => setShowGoalFilterSheet(false)} />

      <MultiSelectSheet visible={showOpenToSheet} title="Open to…"
        options={OPEN_TO_OPTIONS} selected={vibeOpenTo}
        onSave={(v) => { setVibeOpenTo(v); saveProfile({ vibe_open_to: v }); showToast("Saved ✅"); }}
        onClose={() => setShowOpenToSheet(false)} />

      <MultiSelectSheet visible={showLanguagesSheet} title="Languages"
        options={LANGUAGES_OPTIONS} selected={vibeLanguages}
        onSave={(v) => { setVibeLanguages(v); saveProfile({ vibe_languages: v }); showToast("Saved ✅"); }}
        onClose={() => setShowLanguagesSheet(false)} />

      {activePicker && (
        <OptionPicker visible={!!activePicker} title={activePicker.title}
          options={activePicker.options} selected={activePicker.selected}
          onSelect={activePicker.onSelect}
          onClose={() => setActivePicker(null)} />
      )}

      {userId ? (
        <PhotoPickerModal visible={showPhotoPicker} userId={userId} selected={vibePhotos}
          onSave={(photos) => { setVibePhotos(photos); saveProfile({ vibe_photos: photos }); showToast(photos ? `${photos.length} photo${photos.length === 1 ? "" : "s"} saved ✅` : "Photos cleared ✅"); }}
          onClose={() => setShowPhotoPicker(false)} />
      ) : null}

      {/* Vibe Bio edit */}
      <Modal visible={editingBio} animationType="slide" transparent onRequestClose={() => setEditingBio(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEditingBio(false)} />
        <View style={[bioStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[bioStyles.handle, { backgroundColor: colors.border }]} />
          <Text style={[bioStyles.title, { color: colors.foreground }]}>Vibe Bio</Text>
          <Text style={[bioStyles.hint, { color: colors.mutedForeground }]}>
            Shown only on your Find Vibe match card — not your main profile.
          </Text>
          <TextInput
            value={bioText}
            onChangeText={setBioText}
            placeholder="Tell people what makes you you…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={300}
            style={[bioStyles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
          />
          <Text style={[bioStyles.charCount, { color: colors.mutedForeground }]}>{bioText.length}/300</Text>
          <TouchableOpacity style={bioStyles.saveBtn}
            onPress={() => {
              const trimmed = bioText.trim();
              setVibeBio(trimmed);
              saveProfile({ vibe_bio: trimmed || null });
              setEditingBio(false);
              showToast("Vibe bio saved ✅");
            }}>
            <Text style={bioStyles.saveTxt}>Save Bio</Text>
          </TouchableOpacity>
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const bioStyles = StyleSheet.create({
  sheet:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: StyleSheet.hairlineWidth },
  handle:    { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title:     { fontSize: 17, fontFamily: "Poppins_700Bold", marginBottom: 4 },
  hint:      { fontSize: 13, fontFamily: "Poppins_400Regular", marginBottom: 14, lineHeight: 18 },
  input:     { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Poppins_400Regular", borderWidth: 1, minHeight: 100, textAlignVertical: "top" },
  charCount: { fontSize: 12, fontFamily: "Poppins_400Regular", textAlign: "right", marginTop: 6, marginBottom: 14 },
  saveBtn:   { backgroundColor: "#EC4899", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  saveTxt:   { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
});

const fvsStyles = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:     { width: 36, height: 36, justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  scroll:      { paddingHorizontal: 16 },
  section:     { marginTop: 28 },
  secLabel:    { fontSize: 12, fontFamily: "Poppins_700Bold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },
  sectionHint: { fontSize: 12, fontFamily: "Poppins_400Regular", marginBottom: 8, marginTop: -4 },
  card:        { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  iconWrap:    { width: 32, height: 32, borderRadius: 8, justifyContent: "center", alignItems: "center", marginRight: 12 },
  rowContent:  { flex: 1, marginRight: 8 },
  rowLabel:    { fontSize: 15, fontFamily: "Poppins_500Medium" },
  rowSub:      { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 2 },
  stepper:     { flexDirection: "row", alignItems: "center", gap: 8 },
  stepperBtn:  { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(139,92,246,0.2)", justifyContent: "center", alignItems: "center" },
  stepperTxt:  { color: "#8B5CF6", fontSize: 18, fontFamily: "Poppins_700Bold", lineHeight: 22 },
  stepperVal:  { fontSize: 15, fontFamily: "Poppins_700Bold", minWidth: 20, textAlign: "center" },
  toast:       { position: "absolute", bottom: 100, alignSelf: "center", backgroundColor: "rgba(20,20,20,0.9)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  toastText:   { color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 14 },
});
