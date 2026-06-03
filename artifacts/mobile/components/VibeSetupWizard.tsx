import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: W, height: H } = Dimensions.get("window");

export interface VibePreferences {
  gender: string;
  interestedIn: string[];
  lookingFor: string;
  age: number;
  ageMin: number;
  ageMax: number;
  maxDistance: number;
}

interface Props {
  visible: boolean;
  onComplete: (prefs: VibePreferences) => void;
}

const TOTAL_STEPS = 6;

const GENDERS = [
  { value: "man", label: "Man", emoji: "👨" },
  { value: "woman", label: "Woman", emoji: "👩" },
  { value: "nonbinary", label: "Non-binary", emoji: "🏳️" },
  { value: "other", label: "Other", emoji: "🌈" },
];

const INTERESTS_IN = [
  { value: "men", label: "Men", emoji: "👨" },
  { value: "women", label: "Women", emoji: "👩" },
  { value: "everyone", label: "Everyone", emoji: "💜" },
];

const GOALS = [
  { value: "friendship", label: "Friendship", emoji: "🤝" },
  { value: "dating", label: "Dating", emoji: "💕" },
  { value: "networking", label: "Networking", emoji: "💼" },
  { value: "vibing", label: "Just Vibing", emoji: "✨" },
  { value: "all", label: "All of the above", emoji: "💜" },
];

function Dot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <View style={[
      dotStyles.dot,
      done && { backgroundColor: "#7C3AED" },
      active && { backgroundColor: "#A78BFA", width: 20 },
      !active && !done && { backgroundColor: "rgba(255,255,255,0.2)" },
    ]} />
  );
}

const dotStyles = StyleSheet.create({
  dot: { height: 8, width: 8, borderRadius: 4 },
});

function SelectCard({
  emoji, label, selected, onPress, multi,
}: { emoji: string; label: string; selected: boolean; onPress: () => void; multi?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={styles.optionCard}>
      {selected ? (
        <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.optionGrad}>
          {multi && <View style={styles.checkCircle}><Ionicons name="checkmark" size={14} color="#fff" /></View>}
          <Text style={styles.optionEmoji}>{emoji}</Text>
          <Text style={styles.optionLabelSelected}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={styles.optionInner}>
          <Text style={styles.optionEmoji}>{emoji}</Text>
          <Text style={styles.optionLabel}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function RangeRow({
  label, value, min, max, onChange, unit, maxLabel,
}: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; unit: string; maxLabel?: string }) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const displayVal = value === max && maxLabel ? maxLabel : `${value}${unit}`;
  return (
    <View style={styles.rangeWrap}>
      <View style={styles.rangeHeader}>
        <Text style={styles.rangeLabel}>{label}</Text>
        <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rangeBadge}>
          <Text style={styles.rangeValue}>{displayVal}</Text>
        </LinearGradient>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepsRow}>
        {steps.filter((_, i) => i % Math.ceil(steps.length / 12) === 0).map((v) => (
          <TouchableOpacity key={v} onPress={() => onChange(v)} style={[styles.stepPill, value === v && { backgroundColor: "#7C3AED" }]}>
            <Text style={[styles.stepText, value === v && { color: "#fff" }]}>
              {v === max && maxLabel ? maxLabel : `${v}${unit}`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function VibeSetupWizard({ visible, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [gender, setGender] = useState("");
  const [interestedIn, setInterestedIn] = useState<string[]>([]);
  const [lookingFor, setLookingFor] = useState("");
  const [age, setAge] = useState("");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(35);
  const [maxDistance, setMaxDistance] = useState(25);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const goTo = (next: number) => {
    const dir = next > step ? -1 : 1;
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: dir * 40, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    setStep(next);
  };

  const canContinue = () => {
    if (step === 0) return !!gender;
    if (step === 1) return interestedIn.length > 0;
    if (step === 2) return !!lookingFor;
    if (step === 3) return !!age && parseInt(age, 10) >= 18;
    return true;
  };

  const handleContinue = () => {
    if (step < TOTAL_STEPS - 1) {
      goTo(step + 1);
    } else {
      const parsedAge = parseInt(age, 10);
      onComplete({
        gender,
        interestedIn,
        lookingFor,
        age: isNaN(parsedAge) ? 25 : parsedAge,
        ageMin,
        ageMax,
        maxDistance,
      });
    }
  };

  const toggleInterest = (val: string) => {
    if (val === "everyone") {
      setInterestedIn(["everyone"]);
    } else {
      setInterestedIn((prev) => {
        const without = prev.filter((v) => v !== "everyone");
        return without.includes(val) ? without.filter((v) => v !== val) : [...without, val];
      });
    }
  };

  const STEPS: { title: string; subtitle?: string; optional?: boolean } = [
    { title: "I am a..." },
    { title: "Interested in...", subtitle: "Select all that apply" },
    { title: "Looking for..." },
    { title: "Your age", subtitle: "Your age is kept private" },
    { title: "Show me people aged..." },
    { title: "Within distance of..." },
  ][step] as any;

  const stepTitles = ["I am a...", "Interested in...", "Looking for...", "Your age", "Age range", "Distance"];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <LinearGradient colors={["#0B0B1A", "#130D2E", "#0B0B1A"]} style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.progressRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <Dot key={i} active={i === step} done={i < step} />
          ))}
        </View>

        <Animated.View style={[styles.content, { transform: [{ translateX: slideAnim }] }]}>
          <Text style={styles.stepTitle}>{STEPS.title}</Text>
          {STEPS.subtitle && <Text style={styles.stepSubtitle}>{STEPS.subtitle}</Text>}

          {step === 0 && (
            <View style={styles.optionsGrid}>
              {GENDERS.map((g) => (
                <SelectCard key={g.value} emoji={g.emoji} label={g.label} selected={gender === g.value} onPress={() => setGender(g.value)} />
              ))}
            </View>
          )}

          {step === 1 && (
            <View style={styles.optionsGrid}>
              {INTERESTS_IN.map((g) => (
                <SelectCard key={g.value} emoji={g.emoji} label={g.label} selected={interestedIn.includes(g.value)} onPress={() => toggleInterest(g.value)} multi />
              ))}
            </View>
          )}

          {step === 2 && (
            <View style={styles.optionsColumn}>
              {GOALS.map((g) => (
                <TouchableOpacity key={g.value} onPress={() => setLookingFor(g.value)} activeOpacity={0.82} style={styles.goalRow}>
                  {lookingFor === g.value ? (
                    <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.goalGrad}>
                      <Text style={styles.goalEmoji}>{g.emoji}</Text>
                      <Text style={styles.goalLabelSelected}>{g.label}</Text>
                      <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginLeft: "auto" }} />
                    </LinearGradient>
                  ) : (
                    <View style={styles.goalInner}>
                      <Text style={styles.goalEmoji}>{g.emoji}</Text>
                      <Text style={styles.goalLabel}>{g.label}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {step === 3 && (
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%", alignItems: "center" }}>
              <View style={styles.ageInputWrap}>
                <TextInput
                  value={age}
                  onChangeText={(t) => { const n = t.replace(/[^0-9]/g, ""); if (parseInt(n, 10) <= 99 || !n) setAge(n); }}
                  keyboardType="number-pad"
                  placeholder="25"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  style={styles.ageInput}
                  maxLength={2}
                  autoFocus
                />
                <Text style={styles.ageUnit}>years old</Text>
              </View>
              {age && parseInt(age, 10) < 18 && (
                <Text style={styles.ageError}>Must be 18 or older</Text>
              )}
              <View style={styles.agePillsRow}>
                {[18, 20, 22, 25, 28, 30, 35, 40].map((a) => (
                  <TouchableOpacity key={a} onPress={() => setAge(String(a))} style={[styles.agePill, age === String(a) && { backgroundColor: "#7C3AED" }]}>
                    <Text style={[styles.agePillText, age === String(a) && { color: "#fff" }]}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </KeyboardAvoidingView>
          )}

          {step === 4 && (
            <View style={styles.rangeSection}>
              <RangeRow
                label="Minimum age"
                value={ageMin}
                min={18}
                max={60}
                onChange={(v) => { setAgeMin(v); if (v > ageMax) setAgeMax(v); }}
                unit=""
              />
              <RangeRow
                label="Maximum age"
                value={ageMax}
                min={18}
                max={65}
                onChange={(v) => { setAgeMax(v); if (v < ageMin) setAgeMin(v); }}
                unit=""
                maxLabel="65+"
              />
              <View style={styles.rangePreview}>
                <LinearGradient colors={["#7C3AED22", "#EA580C22"]} style={styles.rangePreviewGrad}>
                  <Text style={styles.rangePreviewText}>
                    Show me people aged {ageMin} — {ageMax === 65 ? "65+" : ageMax}
                  </Text>
                </LinearGradient>
              </View>
            </View>
          )}

          {step === 5 && (
            <View style={styles.rangeSection}>
              <RangeRow
                label="Maximum distance"
                value={maxDistance}
                min={1}
                max={101}
                onChange={setMaxDistance}
                unit="km"
                maxLabel="Anywhere"
              />
              <View style={styles.rangePreview}>
                <LinearGradient colors={["#7C3AED22", "#EA580C22"]} style={styles.rangePreviewGrad}>
                  <Text style={styles.rangePreviewText}>
                    {maxDistance >= 101 ? "Show me people from anywhere 🌍" : `Show me people within ${maxDistance}km`}
                  </Text>
                </LinearGradient>
              </View>
              <Text style={styles.privacyNote}>📍 Your exact location is never shared</Text>
            </View>
          )}
        </Animated.View>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleContinue}
            disabled={!canContinue()}
            activeOpacity={0.88}
            style={{ width: "100%", opacity: canContinue() ? 1 : 0.45 }}
          >
            <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.continueBtn}>
              <Text style={styles.continueBtnText}>
                {step === TOTAL_STEPS - 1 ? "Find My Vibe 💜" : "Continue"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.footerRow}>
            {step > 0 && (
              <TouchableOpacity onPress={() => goTo(step - 1)} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.6)" />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            {step > 0 && <View style={{ flex: 1 }} />}
            {(step === 4 || step === 5) && (
              <TouchableOpacity onPress={handleContinue} style={styles.skipBtn}>
                <Text style={styles.skipBtnText}>Skip</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: Platform.OS === "ios" ? 34 : 24 },
  progressRow: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 20 },
  content: { flex: 1, paddingTop: 24 },
  stepTitle: { color: "#fff", fontSize: 28, fontFamily: "Poppins_700Bold", marginBottom: 6 },
  stepSubtitle: { color: "rgba(255,255,255,0.55)", fontSize: 14, fontFamily: "Poppins_400Regular", marginBottom: 28 },
  optionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  optionCard: { width: (W - 60) / 2, borderRadius: 20, overflow: "hidden" },
  optionGrad: { padding: 20, alignItems: "center", gap: 8, minHeight: 110, justifyContent: "center" },
  optionInner: { padding: 20, alignItems: "center", gap: 8, minHeight: 110, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  optionEmoji: { fontSize: 32 },
  optionLabel: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  optionLabelSelected: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  checkCircle: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  optionsColumn: { gap: 10, marginTop: 8 },
  goalRow: { borderRadius: 16, overflow: "hidden" },
  goalGrad: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 16, gap: 12 },
  goalInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 16, gap: 12, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  goalEmoji: { fontSize: 22 },
  goalLabel: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  goalLabelSelected: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  ageInputWrap: { alignItems: "center", marginTop: 24, marginBottom: 32 },
  ageInput: { fontSize: 72, fontFamily: "Poppins_700Bold", color: "#fff", textAlign: "center", minWidth: 140 },
  ageUnit: { color: "rgba(255,255,255,0.45)", fontSize: 18, fontFamily: "Poppins_400Regular", marginTop: -8 },
  ageError: { color: "#EF4444", fontFamily: "Poppins_500Medium", fontSize: 13, marginTop: -24, marginBottom: 16 },
  agePillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  agePill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  agePillText: { color: "rgba(255,255,255,0.7)", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  rangeSection: { gap: 24, marginTop: 8 },
  rangeWrap: { gap: 12 },
  rangeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rangeLabel: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  rangeBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12 },
  rangeValue: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
  stepsRow: { gap: 8, paddingBottom: 4 },
  stepPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  stepText: { color: "rgba(255,255,255,0.65)", fontFamily: "Poppins_500Medium", fontSize: 13 },
  rangePreview: { borderRadius: 14, overflow: "hidden" },
  rangePreviewGrad: { paddingHorizontal: 18, paddingVertical: 14 },
  rangePreviewText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 15, textAlign: "center" },
  privacyNote: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center" },
  footer: { gap: 8, paddingTop: 16 },
  continueBtn: { borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  continueBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  footerRow: { flexDirection: "row", alignItems: "center", minHeight: 36 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8 },
  backBtnText: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_500Medium", fontSize: 14 },
  skipBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  skipBtnText: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_500Medium", fontSize: 14 },
});
