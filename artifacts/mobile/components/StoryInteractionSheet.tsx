import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

const { height: H } = Dimensions.get("window");

export type InteractionType = "poll" | "question" | "slider" | "quiz" | "countdown";

export interface InteractionConfig {
  type: InteractionType;
  question: string;
  options?: string[];
  correctIndex?: number;
  emoji?: string;
  countdownDate?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (config: InteractionConfig) => void;
}

const INTERACTION_TYPES = [
  { type: "poll" as InteractionType, emoji: "📊", label: "Poll", sub: "2-option vote" },
  { type: "question" as InteractionType, emoji: "❓", label: "Question Box", sub: "Viewers answer" },
  { type: "slider" as InteractionType, emoji: "❤️", label: "Emoji Slider", sub: "Rate 0–100%" },
  { type: "quiz" as InteractionType, emoji: "🧠", label: "Quiz", sub: "Multiple choice" },
  { type: "countdown" as InteractionType, emoji: "⏰", label: "Countdown", sub: "Set a date" },
];

export function StoryInteractionSheet({ visible, onClose, onSelect }: Props) {
  const colors = useColors();
  const [step, setStep] = useState<"pick" | "configure">("pick");
  const [selectedType, setSelectedType] = useState<InteractionType | null>(null);
  const [question, setQuestion] = useState("");
  const [option1, setOption1] = useState("Yes");
  const [option2, setOption2] = useState("No");
  const [quizOptions, setQuizOptions] = useState(["", "", "", ""]);
  const [correctIdx, setCorrectIdx] = useState(0);
  const [sliderEmoji, setSliderEmoji] = useState("❤️");
  const [countdownDate, setCountdownDate] = useState("");

  const EMOJIS = ["❤️", "🔥", "😍", "✨", "👏", "💜", "😂", "🎉"];

  const reset = () => {
    setStep("pick");
    setSelectedType(null);
    setQuestion("");
    setOption1("Yes");
    setOption2("No");
    setQuizOptions(["", "", "", ""]);
    setCorrectIdx(0);
    setSliderEmoji("❤️");
    setCountdownDate("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handlePick = (type: InteractionType) => {
    setSelectedType(type);
    setStep("configure");
  };

  const handleAdd = () => {
    if (!question.trim() && selectedType !== "countdown") {
      Alert.alert("Add a question", "Please enter a question first.");
      return;
    }
    let config: InteractionConfig = { type: selectedType!, question: question.trim() };
    if (selectedType === "poll") config.options = [option1 || "Yes", option2 || "No"];
    if (selectedType === "quiz") {
      const filled = quizOptions.filter((o) => o.trim());
      if (filled.length < 2) { Alert.alert("Add options", "Add at least 2 quiz options."); return; }
      config.options = quizOptions.filter((o) => o.trim());
      config.correctIndex = correctIdx;
    }
    if (selectedType === "slider") config.emoji = sliderEmoji;
    if (selectedType === "countdown") config.countdownDate = countdownDate;
    onSelect(config);
    reset();
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.headerRow}>
            {step === "configure" && (
              <TouchableOpacity onPress={() => setStep("pick")} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={20} color={colors.foreground} />
              </TouchableOpacity>
            )}
            <Text style={[styles.title, { color: colors.foreground }]}>
              {step === "pick" ? "Add Interaction" : INTERACTION_TYPES.find((t) => t.type === selectedType)?.label}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {step === "pick" ? (
            <View style={styles.typeGrid}>
              {INTERACTION_TYPES.map((it) => (
                <TouchableOpacity
                  key={it.type}
                  style={[styles.typeCard, { backgroundColor: colors.muted, borderColor: colors.border }]}
                  onPress={() => handlePick(it.type)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.typeEmoji}>{it.emoji}</Text>
                  <Text style={[styles.typeLabel, { color: colors.foreground }]}>{it.label}</Text>
                  <Text style={[styles.typeSub, { color: colors.mutedForeground }]}>{it.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.configWrap}>
              {selectedType !== "countdown" && (
                <TextInput
                  value={question}
                  onChangeText={setQuestion}
                  placeholder={
                    selectedType === "poll" ? "Ask a question…" :
                    selectedType === "question" ? "Ask anything…" :
                    selectedType === "slider" ? "What should they rate?" :
                    "Quiz question…"
                  }
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.questionInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                  multiline
                  maxLength={120}
                />
              )}

              {selectedType === "poll" && (
                <View style={styles.pollOptions}>
                  <TextInput
                    value={option1}
                    onChangeText={setOption1}
                    placeholder="Option 1"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.pollInput, { backgroundColor: "rgba(139,92,246,0.12)", color: colors.foreground, borderColor: "#8B5CF6" }]}
                    maxLength={40}
                  />
                  <View style={styles.vsLabel}><Text style={{ color: colors.mutedForeground, fontFamily: "Poppins_600SemiBold" }}>vs</Text></View>
                  <TextInput
                    value={option2}
                    onChangeText={setOption2}
                    placeholder="Option 2"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.pollInput, { backgroundColor: "rgba(236,72,153,0.1)", color: colors.foreground, borderColor: "#EC4899" }]}
                    maxLength={40}
                  />
                </View>
              )}

              {selectedType === "quiz" && (
                <View style={styles.quizOptions}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Options (tap to mark correct)</Text>
                  {quizOptions.map((opt, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.quizRow, { borderColor: i === correctIdx ? "#22C55E" : colors.border, backgroundColor: i === correctIdx ? "rgba(34,197,94,0.08)" : colors.muted }]}
                      onPress={() => setCorrectIdx(i)}
                    >
                      <TextInput
                        value={opt}
                        onChangeText={(t) => { const a = [...quizOptions]; a[i] = t; setQuizOptions(a); }}
                        placeholder={`Option ${i + 1}`}
                        placeholderTextColor={colors.mutedForeground}
                        style={[styles.quizInput, { color: colors.foreground }]}
                        maxLength={60}
                      />
                      {i === correctIdx && <Ionicons name="checkmark-circle" size={18} color="#22C55E" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {selectedType === "slider" && (
                <View style={styles.sliderSection}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Choose emoji</Text>
                  <View style={styles.emojiRow}>
                    {EMOJIS.map((e) => (
                      <TouchableOpacity
                        key={e}
                        onPress={() => setSliderEmoji(e)}
                        style={[styles.emojiBtn, sliderEmoji === e && styles.emojiBtnActive]}
                      >
                        <Text style={styles.emojiText}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.sliderPreview}>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Poppins_400Regular" }}>0%</Text>
                    <View style={[styles.sliderTrack, { backgroundColor: colors.muted }]}>
                      <LinearGradient colors={["#8B5CF6", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sliderFill} />
                      <View style={styles.sliderThumb}><Text style={{ fontSize: 16 }}>{sliderEmoji}</Text></View>
                    </View>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Poppins_400Regular" }}>100%</Text>
                  </View>
                </View>
              )}

              {selectedType === "countdown" && (
                <View>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Event name</Text>
                  <TextInput
                    value={question}
                    onChangeText={setQuestion}
                    placeholder="e.g. Album Drop 🎵"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.questionInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                    maxLength={60}
                  />
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    value={countdownDate}
                    onChangeText={setCountdownDate}
                    placeholder="2025-12-31"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.questionInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                    maxLength={10}
                  />
                </View>
              )}

              <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.85}>
                <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.addGrad}>
                  <Text style={styles.addBtnText}>Add to Story</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 18, gap: 10 },
  backBtn: { padding: 4 },
  title: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 18 },
  closeBtn: { padding: 4 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  typeCard: { width: "47%", padding: 14, borderRadius: 16, borderWidth: 0.5, alignItems: "center", gap: 5, marginBottom: 4 },
  typeEmoji: { fontSize: 28 },
  typeLabel: { fontFamily: "Poppins_700Bold", fontSize: 13 },
  typeSub: { fontFamily: "Poppins_400Regular", fontSize: 11, textAlign: "center" },
  configWrap: { gap: 14 },
  questionInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Poppins_400Regular", fontSize: 15, minHeight: 48 },
  pollOptions: { gap: 8 },
  pollInput: { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Poppins_600SemiBold", fontSize: 14, textAlign: "center" },
  vsLabel: { alignItems: "center" },
  quizOptions: { gap: 8 },
  sectionLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, marginBottom: 4 },
  quizRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 2 },
  quizInput: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, paddingVertical: 10 },
  sliderSection: { gap: 10 },
  emojiRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  emojiBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  emojiBtnActive: { backgroundColor: "rgba(139,92,246,0.25)", borderWidth: 2, borderColor: "#8B5CF6" },
  emojiText: { fontSize: 22 },
  sliderPreview: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  sliderTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "visible", position: "relative" },
  sliderFill: { width: "60%", height: 8, borderRadius: 4 },
  sliderThumb: { position: "absolute", left: "55%", top: -10 },
  addBtn: { borderRadius: 14, overflow: "hidden", marginTop: 6 },
  addGrad: { paddingVertical: 15, alignItems: "center" },
  addBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
});
