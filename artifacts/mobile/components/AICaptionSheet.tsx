import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height: H } = Dimensions.get("window");

interface Props {
  visible: boolean;
  loading: boolean;
  captions: string[];
  hashtags: string[];
  onSelectCaption: (caption: string) => void;
  onToggleHashtag: (tag: string) => void;
  selectedHashtags: string[];
  onClose: () => void;
}

function SparkleIcon({ size = 18, color = "#fff" }: { size?: number; color?: string }) {
  return <Text style={{ fontSize: size, lineHeight: size + 4 }}>✨</Text>;
}

function SpinningSparkle() {
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.85, duration: 700, useNativeDriver: true }),
      ])
    );
    spin.start();
    pulse.start();
    return () => {
      spin.stop();
      pulse.stop();
    };
  }, []);

  const rotateInterp = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.Text style={{ fontSize: 36, transform: [{ rotate: rotateInterp }, { scale }] }}>
      ✨
    </Animated.Text>
  );
}

function FloatingSparkles() {
  const sparks = useRef(
    Array.from({ length: 6 }, (_, i) => ({
      y: new Animated.Value(0),
      x: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.5),
    }))
  ).current;

  useEffect(() => {
    const anims = sparks.map((s, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(i * 300),
          Animated.parallel([
            Animated.timing(s.opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(s.scale, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(s.y, { toValue: -40 - i * 10, duration: 1200, useNativeDriver: true }),
            Animated.timing(s.x, { toValue: (i % 2 === 0 ? 1 : -1) * (10 + i * 8), duration: 1200, useNativeDriver: true }),
          ]),
          Animated.timing(s.opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(s.y, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.timing(s.x, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.timing(s.scale, { toValue: 0.5, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
      loop.start();
      return loop;
    });
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View style={{ position: "absolute", width: 80, height: 80, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
      {sparks.map((s, i) => (
        <Animated.Text
          key={i}
          style={{
            position: "absolute",
            fontSize: 12 + (i % 3) * 4,
            opacity: s.opacity,
            transform: [{ translateY: s.y }, { translateX: s.x }, { scale: s.scale }],
          }}
        >
          {["✨", "⭐", "💫", "✦", "★", "✧"][i]}
        </Animated.Text>
      ))}
    </View>
  );
}

export function AICaptionSheet({
  visible,
  loading,
  captions,
  hashtags,
  onSelectCaption,
  onToggleHashtag,
  selectedHashtags,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 68,
          friction: 12,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: H,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={styles.handle} />

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={["#7C3AED", "#EC4899"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerIconBg}
            >
              <Text style={{ fontSize: 16 }}>✨</Text>
            </LinearGradient>
            <View>
              <Text style={styles.headerTitle}>AI Captions</Text>
              <Text style={styles.headerSub}>Pick one to auto-fill</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <View style={{ alignItems: "center", justifyContent: "center", width: 80, height: 80 }}>
              <SpinningSparkle />
              <FloatingSparkles />
            </View>
            <Text style={styles.loadingTitle}>Generating Captions…</Text>
            <Text style={styles.loadingSubtitle}>Claude is crafting the perfect vibe for you</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <Text style={styles.sectionLabel}>Choose a Caption</Text>
            {captions.map((cap, i) => (
              <TouchableOpacity
                key={i}
                style={styles.captionOption}
                onPress={() => { onSelectCaption(cap); onClose(); }}
                activeOpacity={0.75}
              >
                <LinearGradient
                  colors={["rgba(124,58,237,0.12)", "rgba(236,72,153,0.06)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.captionOptionGrad}
                >
                  <View style={styles.captionBadge}>
                    <Text style={styles.captionBadgeText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.captionText}>{cap}</Text>
                  <Ionicons name="chevron-forward" size={16} color="rgba(124,58,237,0.7)" />
                </LinearGradient>
              </TouchableOpacity>
            ))}

            {hashtags.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
                  Hashtags{" "}
                  <Text style={styles.sectionLabelSub}>tap to add</Text>
                </Text>
                <View style={styles.hashtagGrid}>
                  {hashtags.map((tag) => {
                    const selected = selectedHashtags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        onPress={() => onToggleHashtag(tag)}
                        style={[styles.hashtagPill, selected && styles.hashtagPillActive]}
                        activeOpacity={0.75}
                      >
                        {selected && (
                          <LinearGradient
                            colors={["#7C3AED", "#EC4899"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={StyleSheet.absoluteFill}
                          />
                        )}
                        <Text style={[styles.hashtagText, selected && styles.hashtagTextActive]}>
                          {tag}
                        </Text>
                        {selected && (
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedHashtags.length > 0 && (
                  <TouchableOpacity
                    style={styles.addHashtagsBtn}
                    onPress={() => {
                      onSelectCaption("__hashtags_only__");
                      onClose();
                    }}
                  >
                    <LinearGradient
                      colors={["#7C3AED", "#EA580C"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.addHashtagsGrad}
                    >
                      <Ionicons name="add-circle-outline" size={18} color="#fff" />
                      <Text style={styles.addHashtagsText}>
                        Add {selectedHashtags.length} Hashtag{selectedHashtags.length !== 1 ? "s" : ""} to Caption
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0F0F1A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: H * 0.82,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(124,58,237,0.2)",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIconBg: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontFamily: "Poppins_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Poppins_400Regular" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 56,
    gap: 16,
  },
  loadingTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    marginTop: 8,
  },
  loadingSubtitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  sectionLabelSub: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 10,
    fontFamily: "Poppins_400Regular",
    textTransform: "none",
    letterSpacing: 0,
  },
  captionOption: {
    marginBottom: 10,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.25)",
  },
  captionOptionGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  captionBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(124,58,237,0.35)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  captionBadgeText: {
    color: "#A78BFA",
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
  },
  captionText: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    lineHeight: 20,
  },
  hashtagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  hashtagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  hashtagPillActive: {
    borderColor: "#7C3AED",
  },
  hashtagText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
  },
  hashtagTextActive: {
    color: "#fff",
    fontFamily: "Poppins_700Bold",
  },
  addHashtagsBtn: {
    marginTop: 16,
    borderRadius: 14,
    overflow: "hidden",
  },
  addHashtagsGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  addHashtagsText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Poppins_700Bold",
  },
});
