import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface PollDraft {
  question?: string;
  options: string[];
  duration_hours: 24 | 72 | 168 | 336 | 720;
}

interface Props {
  poll: PollDraft;
  onChange: (poll: PollDraft | null) => void;
  showQuestionInput?: boolean;
}

const DURATION_OPTS: { label: string; value: 24 | 72 | 168 | 336 | 720 }[] = [
  { label: "1 day", value: 24 },
  { label: "3 days", value: 72 },
  { label: "7 days", value: 168 },
  { label: "2 weeks", value: 336 },
  { label: "1 month", value: 720 },
];

export default function PollComposer({ poll, onChange, showQuestionInput = true }: Props) {
  const update = (patch: Partial<PollDraft>) =>
    onChange({ ...poll, ...patch });

  const setOption = (i: number, text: string) => {
    const opts = [...poll.options];
    opts[i] = text;
    update({ options: opts });
  };

  const addOption = () => {
    if (poll.options.length >= 4) return;
    update({ options: [...poll.options, ""] });
  };

  const removeOption = (i: number) => {
    if (poll.options.length <= 2) return;
    update({ options: poll.options.filter((_, idx) => idx !== i) });
  };

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.header}>
        <Ionicons name="bar-chart-outline" size={15} color="#A78BFA" />
        <Text style={s.title}>Poll</Text>
        <TouchableOpacity
          onPress={() => onChange(null)}
          hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
        >
          <Ionicons
            name="close-circle"
            size={18}
            color="rgba(255,255,255,0.35)"
          />
        </TouchableOpacity>
      </View>

      {/* Question input — hidden in poll-first flow (caption IS the question) */}
      {showQuestionInput && (
        <TextInput
          style={s.questionInput}
          value={poll.question ?? ""}
          onChangeText={(t) => update({ question: t })}
          placeholder="Ask a question... (optional)"
          placeholderTextColor="rgba(255,255,255,0.25)"
          maxLength={100}
        />
      )}

      {/* Option inputs */}
      {poll.options.map((opt, i) => (
        <View key={i} style={s.optRow}>
          <TextInput
            style={s.optInput}
            value={opt}
            onChangeText={(t) => setOption(i, t)}
            placeholder={i < 2 ? `Option ${i + 1} (required)` : `Option ${i + 1}`}
            placeholderTextColor="rgba(255,255,255,0.2)"
            maxLength={60}
          />
          {poll.options.length > 2 && (
            <TouchableOpacity
              onPress={() => removeOption(i)}
              hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
            >
              <Ionicons
                name="remove-circle-outline"
                size={18}
                color="rgba(255,255,255,0.35)"
              />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {poll.options.length < 4 && (
        <TouchableOpacity
          style={s.addOptBtn}
          onPress={addOption}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={16} color="#A78BFA" />
          <Text style={s.addOptText}>Add option</Text>
        </TouchableOpacity>
      )}

      {/* Duration selector — horizontal scroll so all 5 chips fit on small screens */}
      <Text style={s.durLabel}>Poll length</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.durRow}
      >
        {DURATION_OPTS.map(({ label, value }) => (
          <TouchableOpacity
            key={value}
            style={[
              s.durChip,
              poll.duration_hours === value && s.durChipActive,
            ]}
            onPress={() => update({ duration_hours: value })}
            activeOpacity={0.75}
          >
            <Text
              style={[
                s.durText,
                poll.duration_hours === value && s.durTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "rgba(124,58,237,0.07)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.18)",
    padding: 16,
    marginTop: 12,
    gap: 8,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: {
    flex: 1,
    color: "#A78BFA",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  questionInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.2)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: "#fff",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  optRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  optInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: "#fff",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  addOptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  addOptText: {
    color: "#A78BFA",
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  durLabel: {
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    marginTop: 2,
  },
  durRow: { flexDirection: "row", gap: 8 },
  durChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  durChipActive: {
    backgroundColor: "rgba(124,58,237,0.25)",
    borderColor: "#7C3AED",
  },
  durText: {
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  durTextActive: { color: "#A78BFA" },
});
