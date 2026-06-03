import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INTERESTS = [
  { id: "music", label: "Music", emoji: "🎵" },
  { id: "travel", label: "Travel", emoji: "✈️" },
  { id: "food", label: "Food", emoji: "🍕" },
  { id: "fashion", label: "Fashion", emoji: "👗" },
  { id: "gaming", label: "Gaming", emoji: "🎮" },
  { id: "fitness", label: "Fitness", emoji: "💪" },
  { id: "art", label: "Art", emoji: "🎨" },
  { id: "comedy", label: "Comedy", emoji: "😂" },
  { id: "dance", label: "Dance", emoji: "💃" },
  { id: "sports", label: "Sports", emoji: "⚽" },
  { id: "tech", label: "Tech", emoji: "💻" },
  { id: "pets", label: "Pets", emoji: "🐾" },
  { id: "photography", label: "Photography", emoji: "📸" },
  { id: "cars", label: "Cars", emoji: "🚗" },
  { id: "books", label: "Books", emoji: "📚" },
  { id: "beauty", label: "Beauty", emoji: "💄" },
  { id: "nature", label: "Nature", emoji: "🌿" },
  { id: "business", label: "Business", emoji: "💼" },
  { id: "movies", label: "Movies", emoji: "🎬" },
  { id: "cooking", label: "Cooking", emoji: "👨‍🍳" },
];

interface Props {
  visible: boolean;
  onComplete: (interests: string[]) => void;
}

function InterestBubble({
  item,
  selected,
  onToggle,
  index,
}: {
  item: (typeof INTERESTS)[0];
  selected: boolean;
  onToggle: () => void;
  index: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: 12,
        stiffness: 180,
        delay: index * 30,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 250,
        delay: index * 30,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePress = () => {
    pressScale.setValue(1);
    Animated.sequence([
      Animated.timing(pressScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(pressScale, { toValue: 1, damping: 8, stiffness: 300, useNativeDriver: true }),
    ]).start();
    onToggle();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }, { scale: pressScale }], opacity: opacityAnim }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={1} style={styles.bubbleOuter}>
        {selected ? (
          <LinearGradient
            colors={["#7C3AED", "#F97316"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bubbleGrad}
          >
            <Text style={styles.bubbleEmoji}>{item.emoji}</Text>
            <Text style={styles.bubbleLabelSelected}>{item.label}</Text>
          </LinearGradient>
        ) : (
          <View style={styles.bubbleDefault}>
            <Text style={styles.bubbleEmoji}>{item.emoji}</Text>
            <Text style={styles.bubbleLabelDefault}>{item.label}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export function OnboardingInterestPicker({ visible, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const slideAnim = useRef(new Animated.Value(60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(60);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 20, stiffness: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    Animated.spring(btnScale, {
      toValue: selected.size >= 3 ? 1 : 0.92,
      damping: 10,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [selected.size]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContinue = () => {
    if (selected.size < 3) return;
    onComplete(Array.from(selected));
  };

  return (
    <Modal visible={visible} transparent={false} animationType="none" statusBarTranslucent>
      <View style={styles.container}>
        <LinearGradient
          colors={["rgba(124,58,237,0.3)", "rgba(10,10,15,0)", "rgba(249,115,22,0.15)"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          style={[
            styles.inner,
            {
              opacity: opacityAnim,
              transform: [{ translateY: slideAnim }],
              paddingTop: insets.top + 24,
              paddingBottom: insets.bottom + 24,
            },
          ]}
        >
          <View style={styles.headerWrap}>
            <Text style={styles.title}>What are you into? ✨</Text>
            <Text style={styles.subtitle}>Pick at least 3 to personalize your feed</Text>
            <View style={styles.progressRow}>
              {[1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.progressDot,
                    selected.size >= i && styles.progressDotActive,
                  ]}
                />
              ))}
              <Text style={styles.progressText}>
                {selected.size} / 3{selected.size > 3 ? `+${selected.size - 3}` : ""} selected
              </Text>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.grid}
          >
            {INTERESTS.map((item, index) => (
              <InterestBubble
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                onToggle={() => toggle(item.id)}
                index={index}
              />
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Animated.View style={{ transform: [{ scale: btnScale }], width: "100%" }}>
              <TouchableOpacity
                onPress={handleContinue}
                disabled={selected.size < 3}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={selected.size >= 3 ? ["#7C3AED", "#F97316"] : ["#333", "#333"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.continueBtn}
                >
                  <Text style={[styles.continueBtnText, selected.size < 3 && { opacity: 0.5 }]}>
                    {selected.size >= 3 ? "Personalise My Feed →" : `Pick ${3 - selected.size} more to continue`}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0F",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 20,
  },
  headerWrap: {
    alignItems: "center",
    marginBottom: 24,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: "Poppins_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  progressDotActive: {
    backgroundColor: "#7C3AED",
    width: 20,
  },
  progressText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.4)",
    marginLeft: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    paddingBottom: 16,
  },
  bubbleOuter: {
    borderRadius: 28,
    overflow: "hidden",
  },
  bubbleGrad: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    borderRadius: 28,
  },
  bubbleDefault: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  bubbleEmoji: { fontSize: 18 },
  bubbleLabelSelected: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: "#fff",
  },
  bubbleLabelDefault: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.75)",
  },
  footer: {
    paddingTop: 16,
    alignItems: "center",
  },
  continueBtn: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    width: "100%",
  },
  continueBtnText: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: "#fff",
  },
});
