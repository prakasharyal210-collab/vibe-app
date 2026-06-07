import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { router, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  DeviceEventEmitter,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnboardingInterestPicker } from "@/components/OnboardingInterestPicker";
import { useAuth } from "@/context/AuthContext";
import { claimDailyReward, getGundrukProfile, needsOnboarding, saveOnboardingInterests } from "@/lib/db";
import { useTheme } from "@/context/ThemeContext";

const INACTIVE = "#6B7280";

// Fired by settings.tsx when "Show me in Find Vibe" toggle changes.
export const FIND_VIBE_LOCK_EVENT = "findVibeLockChanged";

// ── RewardToast ───────────────────────────────────────────────────────────────
function RewardToast({ coins, visible }: { coins: number; visible: boolean }) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bottomPad = Platform.OS === "web" ? 100 : insets.bottom + 92;

  useEffect(() => {
    if (!visible || coins <= 0) return;
    translateY.setValue(80);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, { toValue: 80, duration: 280, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start();
      }, 3000);
    });
  }, [visible, coins]);

  if (!visible || coins <= 0) return null;

  return (
    <Animated.View
      style={[toastStyles.wrap, { bottom: bottomPad, opacity, transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <View style={toastStyles.pill}>
        <Text style={toastStyles.text}>🎁 +{coins} coins daily reward claimed!</Text>
      </View>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 9999 },
  pill: {
    backgroundColor: "rgba(8,8,16,0.96)",
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.4)",
    shadowColor: "#8B5CF6",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  text: { color: "#fff", fontSize: 14, fontFamily: "Poppins_600SemiBold" },
});

// ── FindVibeLockedSheet ───────────────────────────────────────────────────────
function FindVibeLockedSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={sheetStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[sheetStyles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <View style={sheetStyles.handle} />
        <Text style={sheetStyles.emoji}>🔒</Text>
        <Text style={sheetStyles.title}>Find Vibe is locked</Text>
        <Text style={sheetStyles.body}>
          Turn on "Show me in Find Vibe" in Settings to access this feature.
        </Text>
        <TouchableOpacity
          onPress={() => { onClose(); setTimeout(() => router.push("/settings" as any), 300); }}
          activeOpacity={0.9}
          style={sheetStyles.primaryBtn}
        >
          <LinearGradient
            colors={["#7C3AED", "#EC4899"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={sheetStyles.primaryGrad}
          >
            <Text style={sheetStyles.primaryText}>Go to Settings</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={sheetStyles.dismissBtn}>
          <Text style={sheetStyles.dismissText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  sheet: {
    backgroundColor: "#0F0F1A",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 14,
    alignItems: "center",
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", marginBottom: 24 },
  emoji: { fontSize: 52, marginBottom: 14 },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 22, textAlign: "center", marginBottom: 10 },
  body: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  primaryBtn: { width: "100%", borderRadius: 18, overflow: "hidden", marginBottom: 12 },
  primaryGrad: { paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  dismissBtn: { paddingVertical: 12 },
  dismissText: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_500Medium", fontSize: 14 },
});

// ── NativeTabLayout ───────────────────────────────────────────────────────────
function NativeTabLayout() {
  return (
    <NativeTabs initialTab="feed">
      <NativeTabs.Trigger name="feed">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Feed</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "play.rectangle", selected: "play.rectangle.fill" }} />
        <Label>Reels</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="create">
        <Icon sf={{ default: "plus.app", selected: "plus.app.fill" }} />
        <Label>Create</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="find">
        <Icon sf={{ default: "heart.circle", selected: "heart.circle.fill" }} />
        <Label>Find Vibe</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// ── TabIcon ───────────────────────────────────────────────────────────────────
interface TabIconProps {
  iconName: string;
  label: string;
  focused: boolean;
  color: string;
  isIOS: boolean;
  sfActive: string;
  sfDefault: string;
  locked?: boolean;
}

function TabIcon({ iconName, label, focused, color, isIOS, sfActive, sfDefault, locked }: TabIconProps) {
  if (locked) {
    return (
      <View style={tabIconStyles.wrap}>
        <Ionicons name="lock-closed" size={21} color={INACTIVE} />
        <Text style={[tabIconStyles.label, { color: INACTIVE }]}>Locked</Text>
      </View>
    );
  }
  return (
    <View style={tabIconStyles.wrap}>
      {isIOS ? (
        <SymbolView name={focused ? sfActive : sfDefault} tintColor={color} size={22} />
      ) : (
        <Ionicons name={iconName as any} size={22} color={color} />
      )}
      <Text style={[tabIconStyles.label, { color }]}>{label}</Text>
      {focused && <View style={[tabIconStyles.dot, { backgroundColor: color }]} />}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", gap: 2, paddingTop: 2 },
  label: { fontSize: 10, fontFamily: "Poppins_500Medium" },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
});

// ── CreateIcon ────────────────────────────────────────────────────────────────
function CreateIcon() {
  const { theme } = useTheme();
  return (
    <View style={styles.createShadow}>
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.createIcon}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </LinearGradient>
    </View>
  );
}

// ── ClassicTabLayout ──────────────────────────────────────────────────────────
function ClassicTabLayout({
  findVibeLocked,
  onLockedTabPress,
}: {
  findVibeLocked: boolean;
  onLockedTabPress: () => void;
}) {
  const isIOS = Platform.OS === "ios";
  const { theme } = useTheme();

  // Use a ref so the listeners function always reads the latest value without
  // relying on React Navigation to re-subscribe on every prop change.
  const lockedRef = useRef(findVibeLocked);
  lockedRef.current = findVibeLocked;

  const onLockedRef = useRef(onLockedTabPress);
  onLockedRef.current = onLockedTabPress;

  return (
    <Tabs
      initialRouteName="feed"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: INACTIVE,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: Platform.OS === "web" ? 10 : 10,
          borderRadius: 28,
          height: Platform.OS === "web" ? 68 : 68,
          backgroundColor: isIOS ? "transparent" : "rgba(8,8,16,0.96)",
          borderTopWidth: 0,
          elevation: 0,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          shadowColor: theme.primary,
          shadowOpacity: 0.18,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 8 },
        },
        tabBarBackground: () =>
          isIOS ? <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} /> : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon iconName={focused ? "play-circle" : "play-circle-outline"} label="Reels" focused={focused} color={color} isIOS={isIOS} sfActive="play.rectangle.fill" sfDefault="play.rectangle" />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon iconName={focused ? "home" : "home-outline"} label="Feed" focused={focused} color={color} isIOS={isIOS} sfActive="house.fill" sfDefault="house" />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "",
          tabBarIcon: () => <CreateIcon />,
        }}
      />
      <Tabs.Screen
        name="find"
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // Always reads the latest value via ref — no stale closure
            console.log('[FindVibe Tab] tabPress fired, lockedRef.current =', lockedRef.current);
            if (lockedRef.current) {
              e.preventDefault();
              onLockedRef.current();
            }
          },
        })}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              iconName={focused ? "heart" : "heart-outline"}
              label="Find Vibe"
              focused={focused && !findVibeLocked}
              color={findVibeLocked ? INACTIVE : color}
              isIOS={isIOS}
              sfActive="heart.fill"
              sfDefault="heart"
              locked={findVibeLocked}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon iconName={focused ? "person" : "person-outline"} label="Profile" focused={focused} color={color} isIOS={isIOS} sfActive="person.fill" sfDefault="person" />
          ),
        }}
      />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="post" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
    </Tabs>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
async function readLockState(userId: string): Promise<boolean> {
  // 1. Try AsyncStorage first — settings writes here instantly on toggle
  try {
    const cached = await AsyncStorage.getItem(`find_vibe_locked_${userId}`);
    if (cached !== null) {
      console.log('[FindVibe Tab] AsyncStorage cache =', cached, '→ locked =', cached === "true");
      return cached === "true";
    }
  } catch {}

  // 2. Fallback: ask Supabase (may return false-negative if migration not run)
  try {
    const profile = await getGundrukProfile(userId);
    console.log('[FindVibe Tab] Supabase show_in_matching =', profile.show_in_matching, '→ locked =', !profile.show_in_matching);
    return !profile.show_in_matching;
  } catch {}

  // 3. Safe default: locked
  console.log('[FindVibe Tab] No source available, defaulting to locked');
  return true;
}

// ── TabLayout (root) ──────────────────────────────────────────────────────────
export default function TabLayout() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [rewardCoins, setRewardCoins] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Default to locked until we read the stored preference
  const [findVibeLocked, setFindVibeLocked] = useState(true);
  const [showLockedSheet, setShowLockedSheet] = useState(false);
  const claimedRef = useRef(false);
  const onboardingRef = useRef(false);

  // Load lock state: AsyncStorage first (instant, written by settings on toggle),
  // then Supabase as authoritative override.
  useEffect(() => {
    if (!userId) return;
    readLockState(userId).then(setFindVibeLocked).catch(() => {});
  }, [userId]);

  // Re-read lock state whenever app comes back to foreground (e.g. after settings).
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        console.log('[FindVibe Tab] AppState active → re-reading lock state');
        readLockState(userId).then(setFindVibeLocked).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [userId]);

  // Listen for real-time lock changes fired by settings.tsx (same JS thread)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      FIND_VIBE_LOCK_EVENT,
      ({ locked }: { locked: boolean }) => {
        console.log('[FindVibe Tab] DeviceEventEmitter received → locked =', locked);
        setFindVibeLocked(locked);
      },
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!userId || claimedRef.current) return;
    claimedRef.current = true;
    claimDailyReward(userId).then((result) => {
      if (result.claimed && result.coins_awarded > 0) {
        AsyncStorage.setItem(
          `dailyReward:${userId}`,
          JSON.stringify({ coins: result.coins_awarded, streak: result.streak, ts: Date.now() }),
        ).catch(() => {});
        setTimeout(() => {
          setRewardCoins(result.coins_awarded);
          setShowToast(true);
        }, 1400);
      }
    }).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId || onboardingRef.current) return;
    onboardingRef.current = true;
    (async () => {
      try {
        const localDone = await AsyncStorage.getItem("onboarding_done");
        if (localDone === "true") return;
        const required = await needsOnboarding(userId).catch(() => false);
        if (!required) {
          await AsyncStorage.setItem("onboarding_done", "true").catch(() => {});
          return;
        }
        setTimeout(() => setShowOnboarding(true), 600);
      } catch {}
    })();
  }, [userId]);

  const handleOnboardingComplete = async (interests: string[]) => {
    setShowOnboarding(false);
    await AsyncStorage.setItem("onboarding_done", "true").catch(() => {});
    if (userId) {
      saveOnboardingInterests(userId, interests).catch(() => {});
    }
  };

  const isNativeGlass =
    Platform.OS === "ios" &&
    (() => { try { return isLiquidGlassAvailable(); } catch { return false; } })();

  return (
    <>
      {isNativeGlass ? (
        <NativeTabLayout />
      ) : (
        <ClassicTabLayout
          findVibeLocked={findVibeLocked}
          onLockedTabPress={() => setShowLockedSheet(true)}
        />
      )}
      <RewardToast coins={rewardCoins} visible={showToast} />
      <OnboardingInterestPicker visible={showOnboarding} onComplete={handleOnboardingComplete} />
      <FindVibeLockedSheet
        visible={showLockedSheet}
        onClose={() => setShowLockedSheet(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  createShadow: {
    shadowColor: "#8B5CF6",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  createIcon: {
    width: 52,
    height: 38,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
