import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import * as Updates from "expo-updates";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: W, height: H } = Dimensions.get("window");

// ─── Update Banner ────────────────────────────────────────────────────────────

export function UpdateBanner({
  visible,
  downloaded,
  downloading,
  progress,
  onPress,
  onDismiss,
}: {
  visible: boolean;
  downloaded: boolean;
  downloading: boolean;
  progress: number;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const slideY = useRef(new Animated.Value(-80)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      Animated.spring(slideY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 90,
        friction: 14,
      }).start();
    } else {
      Animated.timing(slideY, {
        toValue: -80,
        duration: 260,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const label = downloading
    ? `Downloading… ${Math.round(progress * 100)}%`
    : downloaded
    ? "Ready to install!"
    : "Update Available!";

  const sub = downloading
    ? "Please wait while we download the update"
    : downloaded
    ? "Tap to install and restart"
    : "Tap to install the latest version";

  return (
    <Animated.View
      style={[
        bannerStyles.container,
        { paddingTop: insets.top + 6, transform: [{ translateY: slideY }] },
      ]}
      pointerEvents={visible ? "box-none" : "none"}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.92}
        style={bannerStyles.inner}
      >
        <LinearGradient
          colors={["#7C3AED", "#A855F7"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={bannerStyles.gradient}
        >
          <View style={bannerStyles.left}>
            <Text style={bannerStyles.emoji}>
              {downloading ? "⬇️" : downloaded ? "🎉" : "✨"}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={bannerStyles.title}>{label}</Text>
              <Text style={bannerStyles.sub}>{sub}</Text>
              {downloading && (
                <View style={bannerStyles.progressTrack}>
                  <Animated.View
                    style={[
                      bannerStyles.progressFill,
                      { width: `${Math.round(progress * 100)}%` as any },
                    ]}
                  />
                </View>
              )}
            </View>
          </View>
          {!downloading && (
            <View style={bannerStyles.pill}>
              <Text style={bannerStyles.pillText}>
                {downloaded ? "Install →" : "Update →"}
              </Text>
            </View>
          )}
          {downloading && (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
          )}
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={bannerStyles.dismiss}
      >
        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 16 }}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  inner: { marginHorizontal: 12, marginBottom: 8, borderRadius: 16, overflow: "hidden", elevation: 8, shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 },
  gradient: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  left: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  emoji: { fontSize: 20 },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
  sub: { color: "rgba(255,255,255,0.78)", fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 1 },
  progressTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 2, marginTop: 5, overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: "#fff", borderRadius: 2 },
  pill: { backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pillText: { color: "#7C3AED", fontFamily: "Poppins_700Bold", fontSize: 12 },
  dismiss: { position: "absolute", top: 6, right: 18 },
});

// ─── Update Bottom Sheet ──────────────────────────────────────────────────────

export function UpdateBottomSheet({
  visible,
  downloaded,
  downloading,
  progress,
  whatsNew,
  isForce,
  onUpdate,
  onDismiss,
  onSkipVersion,
}: {
  visible: boolean;
  downloaded: boolean;
  downloading: boolean;
  progress: number;
  whatsNew: string[];
  isForce?: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
  onSkipVersion?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(H)).current;
  const sparkleScale = useRef(new Animated.Value(1)).current;
  const sparkleRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 13,
      }).start();

      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(sparkleScale, { toValue: 1.2, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(sparkleScale, { toValue: 1.0, duration: 900, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
        ])
      );
      const spin = Animated.loop(
        Animated.timing(sparkleRotate, { toValue: 1, duration: 6000, useNativeDriver: true, easing: Easing.linear })
      );
      pulse.start();
      spin.start();
      return () => { pulse.stop(); spin.stop(); };
    } else {
      Animated.timing(slideY, {
        toValue: H,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const rotation = sparkleRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const items = whatsNew.length > 0
    ? whatsNew
    : ["Bug fixes & stability", "Performance improvements", "New features"];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={sheetStyles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onDismiss} activeOpacity={1} />
        <Animated.View
          style={[
            sheetStyles.sheet,
            { paddingBottom: insets.bottom + 24, transform: [{ translateY: slideY }] },
          ]}
        >
          {/* Handle */}
          <View style={sheetStyles.handle} />

          {/* Logo + sparkle */}
          <View style={sheetStyles.logoRow}>
            <Animated.View style={{ transform: [{ scale: sparkleScale }, { rotate: rotation }] }}>
              <LinearGradient
                colors={["#7C3AED", "#EC4899", "#F97316"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={sheetStyles.logoBg}
              >
                <Text style={{ fontSize: 32 }}>✨</Text>
              </LinearGradient>
            </Animated.View>
          </View>

          <Text style={sheetStyles.title}>New Update Available! 🎉</Text>

          {/* What's new */}
          <View style={sheetStyles.card}>
            <Text style={sheetStyles.cardTitle}>What's new</Text>
            {items.map((item, i) => (
              <View key={i} style={sheetStyles.newRow}>
                <Text style={sheetStyles.check}>✅</Text>
                <Text style={sheetStyles.newText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* Progress bar */}
          {downloading && (
            <View style={sheetStyles.progressWrap}>
              <View style={sheetStyles.progressRow}>
                <Text style={sheetStyles.progressLabel}>Downloading…</Text>
                <Text style={sheetStyles.progressPct}>{Math.round(progress * 100)}%</Text>
              </View>
              <View style={sheetStyles.progressTrack}>
                <Animated.View
                  style={[
                    sheetStyles.progressFill,
                    { width: `${Math.round(progress * 100)}%` as any },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Update button */}
          <TouchableOpacity
            onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onUpdate(); }}
            activeOpacity={0.88}
            disabled={downloading}
            style={{ borderRadius: 24, overflow: "hidden", marginTop: 20 }}
          >
            <LinearGradient
              colors={downloading ? ["#374151", "#374151"] : ["#7C3AED", "#EC4899"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={sheetStyles.updateBtn}
            >
              {downloading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={sheetStyles.updateBtnText}>
                  {downloaded ? "Install Now 🚀" : "Update Now →"}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {!isForce && (
            <>
              <TouchableOpacity onPress={onDismiss} style={{ marginTop: 14, alignItems: "center" }}>
                <Text style={sheetStyles.laterText}>Remind me later</Text>
              </TouchableOpacity>
              {onSkipVersion && (
                <TouchableOpacity onPress={onSkipVersion} style={{ marginTop: 10, alignItems: "center" }}>
                  <Text style={sheetStyles.skipText}>Skip this version</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0F0F1A", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 20 },
  logoRow: { alignItems: "center", marginBottom: 16 },
  logoBg: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 22, textAlign: "center", marginBottom: 20 },
  card: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 18, padding: 18, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", gap: 12 },
  cardTitle: { color: "#A78BFA", fontFamily: "Poppins_700Bold", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  newRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  check: { fontSize: 16 },
  newText: { color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_500Medium", fontSize: 14, flex: 1 },
  progressWrap: { marginTop: 16, gap: 6 },
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_500Medium", fontSize: 13 },
  progressPct: { color: "#A78BFA", fontFamily: "Poppins_700Bold", fontSize: 13 },
  progressTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: "#8B5CF6" },
  updateBtn: { paddingVertical: 16, borderRadius: 24, alignItems: "center", justifyContent: "center", minHeight: 54 },
  updateBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  laterText: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_500Medium", fontSize: 14 },
  skipText: { color: "rgba(255,255,255,0.2)", fontFamily: "Poppins_400Regular", fontSize: 12 },
});

// ─── Force Update Screen ──────────────────────────────────────────────────────

export function ForceUpdateScreen({
  visible,
  onUpdate,
}: {
  visible: boolean;
  onUpdate: () => void;
}) {
  const dotAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    const anims = dotAnims.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: -8, duration: 350, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(dot, { toValue: 0, duration: 350, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
          Animated.delay(640 - i * 160),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={forceStyles.bg}>
        <LinearGradient
          colors={["#080810", "#0F0F1A", "#1A0A2E"]}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View style={[forceStyles.logoWrap, { transform: [{ scale: logoScale }] }]}>
          <LinearGradient
            colors={["#7C3AED", "#EC4899", "#F97316"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={forceStyles.logoBg}
          >
            <Text style={{ fontSize: 48 }}>💜</Text>
          </LinearGradient>
          <Text style={forceStyles.appName}>Vibe</Text>
        </Animated.View>

        <Text style={forceStyles.title}>Update Required</Text>
        <Text style={forceStyles.sub}>
          A critical update is available.{"\n"}Please update to continue using Vibe.
        </Text>

        <View style={forceStyles.card}>
          {["New features & improvements", "Important security fixes", "Better performance"].map((item, i) => (
            <View key={i} style={forceStyles.itemRow}>
              <Text style={{ fontSize: 16 }}>✅</Text>
              <Text style={forceStyles.itemText}>{item}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); onUpdate(); }}
          activeOpacity={0.88}
          style={{ borderRadius: 28, overflow: "hidden", width: "100%" }}
        >
          <LinearGradient
            colors={["#7C3AED", "#EC4899"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={forceStyles.updateBtn}
          >
            <Text style={forceStyles.updateBtnText}>Update Now 🚀</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={forceStyles.note}>You cannot skip this update</Text>
      </View>
    </Modal>
  );
}

const forceStyles = StyleSheet.create({
  bg: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 16 },
  logoWrap: { alignItems: "center", gap: 12, marginBottom: 8 },
  logoBg: { width: 96, height: 96, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  appName: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 28, letterSpacing: 1 },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 26, textAlign: "center" },
  sub: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_400Regular", fontSize: 15, textAlign: "center", lineHeight: 24 },
  card: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20, padding: 20, width: "100%", gap: 14, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", marginVertical: 8 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  itemText: { color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_500Medium", fontSize: 14 },
  updateBtn: { paddingVertical: 18, alignItems: "center", borderRadius: 28 },
  updateBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 17 },
  note: { color: "rgba(255,255,255,0.25)", fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: "center" },
});

// ─── Maintenance Screen ───────────────────────────────────────────────────────

export function MaintenanceScreen({
  visible,
  message,
  checkBackTime,
  onRetry,
}: {
  visible: boolean;
  message?: string;
  checkBackTime?: string;
  onRetry: () => void;
}) {
  const dotAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const wrenchBob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(wrenchBob, { toValue: -10, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(wrenchBob, { toValue: 0, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    const dots = dotAnims.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.2, duration: 400, useNativeDriver: true }),
          Animated.delay(400 - i * 200),
        ])
      )
    );
    bob.start();
    dots.forEach((d) => d.start());
    return () => { bob.stop(); dots.forEach((d) => d.stop()); };
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={maintStyles.bg}>
        <LinearGradient
          colors={["#080810", "#0F0F1A", "#0A1628"]}
          style={StyleSheet.absoluteFill}
        />

        <Animated.Text
          style={[maintStyles.wrench, { transform: [{ translateY: wrenchBob }] }]}
        >
          🔧
        </Animated.Text>

        <Text style={maintStyles.title}>We'll be right back!</Text>
        <Text style={maintStyles.sub}>
          {message ?? "Vibe is getting better for you.\nWe're making some improvements."}
        </Text>

        {checkBackTime ? (
          <View style={maintStyles.timeBadge}>
            <Text style={maintStyles.timeBadgeText}>⏰ Check back at {checkBackTime}</Text>
          </View>
        ) : null}

        <View style={maintStyles.dotsRow}>
          {dotAnims.map((dot, i) => (
            <Animated.View key={i} style={[maintStyles.dot, { opacity: dot }]} />
          ))}
        </View>

        <TouchableOpacity
          onPress={onRetry}
          activeOpacity={0.8}
          style={maintStyles.retryBtn}
        >
          <Text style={maintStyles.retryText}>Check again</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const maintStyles = StyleSheet.create({
  bg: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 },
  wrench: { fontSize: 72, marginBottom: 8 },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 28, textAlign: "center" },
  sub: { color: "rgba(255,255,255,0.55)", fontFamily: "Poppins_400Regular", fontSize: 15, textAlign: "center", lineHeight: 26, marginBottom: 8 },
  timeBadge: { backgroundColor: "rgba(124,58,237,0.2)", borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, borderWidth: 0.5, borderColor: "rgba(124,58,237,0.4)" },
  timeBadgeText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  dotsRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#7C3AED" },
  retryBtn: { marginTop: 24, backgroundColor: "rgba(255,255,255,0.07)", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.12)" },
  retryText: { color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
});
