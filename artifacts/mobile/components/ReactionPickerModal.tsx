import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];

interface Props {
  visible: boolean;
  msgId: string | null;
  myReaction?: string;
  myId: string;
  otherUsername?: string;
  reactions?: Array<{ userId: string; emoji: string }>;
  onSelect: (msgId: string, emoji: string) => void;
  onClose: () => void;
}

export function ReactionPickerModal({
  visible,
  msgId,
  myReaction,
  myId,
  otherUsername,
  reactions,
  onSelect,
  onClose,
}: Props) {
  if (!visible || !msgId) return null;

  const resolveName = (userId: string) =>
    userId === myId ? "You" : (otherUsername ?? "Them");

  const grouped = (reactions ?? []).reduce(
    (acc, r) => {
      if (!acc[r.emoji]) acc[r.emoji] = [];
      acc[r.emoji].push(resolveName(r.userId));
      return acc;
    },
    {} as Record<string, string[]>,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Quick emoji row */}
        <View style={styles.picker}>
          {QUICK_REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={[
                styles.emojiBtn,
                myReaction === emoji && styles.emojiBtnActive,
              ]}
              onPress={() => onSelect(msgId, emoji)}
              activeOpacity={0.7}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Who reacted (simple list, resolved from 1:1 context) */}
        {Object.keys(grouped).length > 0 && (
          <View style={styles.reactorsBox}>
            {Object.entries(grouped).map(([emoji, names]) => (
              <View key={emoji} style={styles.reactorRow}>
                <Text style={styles.reactorEmoji}>{emoji}</Text>
                <Text style={styles.reactorNames}>{names.join(", ")}</Text>
              </View>
            ))}
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
  },
  picker: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#1E1B2E",
    borderRadius: 32,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  emojiBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  emojiBtnActive: {
    backgroundColor: "rgba(124,58,237,0.35)",
    borderWidth: 1.5,
    borderColor: "#7C3AED",
  },
  emoji: { fontSize: 26 },
  reactorsBox: {
    backgroundColor: "#1E1B2E",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 8,
    minWidth: 180,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  reactorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reactorEmoji: { fontSize: 18 },
  reactorNames: {
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    flex: 1,
  },
});
