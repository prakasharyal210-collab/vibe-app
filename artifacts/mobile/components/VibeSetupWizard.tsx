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
import { RELATIONSHIP_GOALS } from "@/lib/db";

const { width: W } = Dimensions.get("window");

export interface VibePreferences {
  gender: string;
  interestedIn: string[];
  lookingFor: string;
  goals: string[];
  age: number;
  ageMin: number;
  ageMax: number;
  maxDistance: number;
}

interface Props {
  visible: boolean;
  onComplete: (prefs: VibePreferences) => void;
  onSkip?: () => void;
  isReturning?: boolean;
  initialPrefs?: VibePreferences;
  lastUpdatedLabel?: string;
}

const TOTAL_STEPS = 6;

const GENDERS = [
  { value: "man",      label: "Man",        emoji: "👨" },
  { value: "woman",    label: "Woman",       emoji: "👩" },
  { value: "nonbinary",label: "Non-binary",  emoji: "🏳️" },
  { value: "other",    label: "Other",       emoji: "🌈" },
];

const INTERESTS_IN = [
  { value: "men",      label: "Men",      emoji: "👨" },
  { value: "women",    label: "Women",    emoji: "👩" },
  { value: "everyone", label: "Everyone", emoji: "💜" },
];

function Dot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <View style={[
      dotStyles.dot,
      done  && { backgroundColor: "#7C3AED" },
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

function GoalCard({ value, label, emoji, count, color, selected, onPress }: {
  value: string; label: string; emoji: string; count: string; color: string; selected: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={styles.goalCard}>
      {selected ? (
        <LinearGradient
          colors={[color + "CC", color + "88"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.goalCardGrad}
        >
          <View style={styles.goalCardCheck}>
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
          <Text style={styles.goalCardEmoji}>{emoji}</Text>
          <Text style={styles.goalCardLabelSelected} numberOfLines={2}>{label}</Text>
          <Text style={styles.goalCardCount}>{count} people</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.goalCardInner, { borderColor: color + "33" }]}>
          <Text style={styles.goalCardEmoji}>{emoji}</Text>
          <Text style={styles.goalCardLabel} numberOfLines={2}>{label}</Text>
          <Text style={[styles.goalCardCount, { color: color }]}>{count}</Text>
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

export function VibeSetupWizard({ visible, onComplete, onSkip, isReturning, initialPrefs, lastUpdatedLabel }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [gender, setGender] = useState("");
  const [interestedIn, setInterestedIn] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [age, setAge] = useState("");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(35);
  const [maxDistance, setMaxDistance] = useState(25);

  // Pre-fill from previous answers when re-opening
  React.useEffect(() => {
    if (visible && initialPrefs) {
      setGender(initialPrefs.gender ?? "");
      setInterestedIn(initialPrefs.interestedIn ?? []);
      setGoals(initialPrefs.goals ?? []);
      setAge(initialPrefs.age ? String(initialPrefs.age) : "");
      setAgeMin(initialPrefs.ageMin ?? 18);
      setAgeMax(initialPrefs.ageMax ?? 35);
      setMaxDistance(initialPrefs.maxDistance ?? 25);
    }
    if (visible) setStep(0);
  }, [visible]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const goTo = (next: number) => {
    const dir = next > step ? -1 : 1;
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: dir * 40, duration: 120, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();
    setStep(next);
  };

  const canContinue = () => {
    if (step === 0) return !!gender;
    if (step === 1) return interestedIn.length > 0;
    if (step === 2) return goals.length > 0;
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
        goals,
        lookingFor: goals[0] ?? "",
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

  const toggleGoal = (val: string) => {
    setGoals((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  };

  const STEP_META = (isReturning ? [
    { title: "Still a...", subtitle: "Update if anything changed" },
    { title: "Interested in...", subtitle: "Select all that apply" },
    { title: "What are you looking for?", subtitle: "Pick all that apply — be honest 💜" },
    { title: "Your age", subtitle: "Update if needed" },
    { title: "Show me people aged..." },
    { title: "Within distance of..." },
  ] : [
    { title: "I am a..." },
    { title: "Interested in...", subtitle: "Select all that apply" },
    { title: "What are you looking for?", subtitle: "Pick all that apply — be honest 💜" },
    { title: "Your age", subtitle: "Your age is kept private" },
    { title: "Show me people aged..." },
    { title: "Within distance of..." },
  ])[step] as { title: string; subtitle?: string };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <LinearGradient colors={["#0B0B1A", "#130D2E", "#0B0B1A"]} style={[styles.container, { paddingTop: topInset }]}>
        {/* Header row — Skip always available */}
        <View style={styles.topRow}>
          <View style={styles.progressRow}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <Dot key={i} active={i === step} done={i < step} />
            ))}
          </View>
          {onSkip && (
            <TouchableOpacity onPress={onSkip} style={styles.topSkipBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.topSkipText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>

        {isReturning && step === 0 && (
          <View style={styles.returningHeader}>
            <Text style={styles.returningTitle}>Update your preferences? 📝</Text>
            {lastUpdatedLabel ? (
              <Text style={styles.returningSubtitle}>{lastUpdatedLabel}</Text>
            ) : null}
          </View>
        )}

        <Animated.View style={[styles.content, { transform: [{ translateX: slideAnim }] }]}>
          <Text style={styles.stepTitle}>{STEP_META.title}</Text>
          {STEP_META.subtitle && <Text style={styles.stepSubtitle}>{STEP_META.subtitle}</Text>}

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
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.goalsGrid}>
              {(RELATIONSHIP_GOALS as readonly { value: string; label: string; shortLabel: string; emoji: string; count: string; color: string }[]).map((g) => (
                <GoalCard
                  key={g.value}
                  value={g.value}
                  label={g.label}
                  emoji={g.emoji}
                  count={g.count}
                  color={g.color}
                  selected={goals.includes(g.value)}
                  onPress={() => toggleGoal(g.value)}
                />
              ))}
              {goals.length > 0 && (
                <View style={styles.goalsSelectedBanner}>
                  <LinearGradient colors={["#7C3AED22", "#EA580C22"]} style={styles.goalsSelectedGrad}>
                    <Text style={styles.goalsSelectedText}>
                      ✓ {goals.length} intention{goals.length !== 1 ? "s" : ""} selected — you can always change this later
                    </Text>
                  </LinearGradient>
                </View>
              )}
            </ScrollView>
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
                {step === TOTAL_STEPS - 1
                  ? (isReturning ? "Looks Good! 💜" : "Find My Vibe 💜")
                  : "Continue"}
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
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 20, position: "relative" },
  progressRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  topSkipBtn: { position: "absolute", right: 0 },
  topSkipText: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_500Medium", fontSize: 14 },
  returningHeader: { marginBottom: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  returningTitle: { color: "#A78BFA", fontFamily: "Poppins_700Bold", fontSize: 18, marginBottom: 2 },
  returningSubtitle: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 13 },
  content: { flex: 1, paddingTop: 20 },
  stepTitle: { color: "#fff", fontSize: 28, fontFamily: "Poppins_700Bold", marginBottom: 6 },
  stepSubtitle: { color: "rgba(255,255,255,0.55)", fontSize: 14, fontFamily: "Poppins_400Regular", marginBottom: 20 },
  optionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  optionCard: { width: (W - 60) / 2, borderRadius: 20, overflow: "hidden" },
  optionGrad: { padding: 20, alignItems: "center", gap: 8, minHeight: 110, justifyContent: "center" },
  optionInner: { padding: 20, alignItems: "center", gap: 8, minHeight: 110, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  optionEmoji: { fontSize: 32 },
  optionLabel: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  optionLabelSelected: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  checkCircle: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  goalsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 16 },
  goalCard: { width: (W - 68) / 2, borderRadius: 16, overflow: "hidden" },
  goalCardGrad: { padding: 14, alignItems: "center", gap: 4, minHeight: 100, justifyContent: "center", position: "relative" },
  goalCardInner: { padding: 14, alignItems: "center", gap: 4, minHeight: 100, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, borderWidth: 1 },
  goalCardCheck: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 9, width: 18, height: 18, alignItems: "center", justifyContent: "center" },
  goalCardEmoji: { fontSize: 26 },
  goalCardLabel: { color: "rgba(255,255,255,0.8)", fontFamily: "Poppins_500Medium", fontSize: 13, textAlign: "center" },
  goalCardLabelSelected: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13, textAlign: "center" },
  goalCardCount: { color: "rgba(255,255,255,0.5)", fontFamily: "Poppins_400Regular", fontSize: 11 },
  goalsSelectedBanner: { width: "100%", borderRadius: 14, overflow: "hidden", marginTop: 4 },
  goalsSelectedGrad: { paddingHorizontal: 14, paddingVertical: 10 },
  goalsSelectedText: { color: "#A78BFA", fontFamily: "Poppins_500Medium", fontSize: 12, textAlign: "center" },
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
