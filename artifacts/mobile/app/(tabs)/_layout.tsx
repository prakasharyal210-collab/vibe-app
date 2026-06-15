import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router, Tabs } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  DeviceEventEmitter,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import RAnimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LoginPrompt } from "@/components/LoginPrompt";
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
  const translateY = useSharedValue(80);
  const opacity = useSharedValue(0);
  const bottomPad = Platform.OS === "web" ? 100 : insets.bottom + 92;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible || coins <= 0) return;
    translateY.value = 80;
    opacity.value = 0;
    translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
    opacity.value = withTiming(1, { duration: 220 });
    timerRef.current = setTimeout(() => {
      translateY.value = withTiming(80, { duration: 280 });
      opacity.value = withTiming(0, { duration: 250 });
    }, 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible, coins]);

  const toastAnim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible || coins <= 0) return null;

  return (
    <RAnimated.View
      style={[toastStyles.wrap, { bottom: bottomPad }, toastAnim]}
      pointerEvents="none"
    >
      <View style={toastStyles.pill}>
        <Text style={toastStyles.text}>🎁 +{coins} coins daily reward claimed!</Text>
      </View>
    </RAnimated.View>
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

// ── TabIcon ───────────────────────────────────────────────────────────────────
interface TabIconProps {
  iconName: string;
  label: string;
  focused: boolean;
  color: string;
  locked?: boolean;
}

const TAB_EMOJI: Record<string, string> = {
  "play-circle": "▶",
  "play-circle-outline": "▶",
  "home": "⌂",
  "home-outline": "⌂",
  "heart": "♥",
  "heart-outline": "♥",
  "person": "◉",
  "person-outline": "○",
};

function TabIcon({ iconName, label, focused, color, locked }: TabIconProps) {
  if (locked) {
    return (
      <View style={tabIconStyles.wrap}>
        <Text style={{ fontSize: 19, lineHeight: 24, color: INACTIVE }}>🔒</Text>
        <Text style={[tabIconStyles.label, { color: INACTIVE }]} numberOfLines={1}>Locked</Text>
      </View>
    );
  }
  const icon = TAB_EMOJI[iconName] ?? "•";
  return (
    <View style={tabIconStyles.wrap}>
      <Text style={{ fontSize: 22, lineHeight: 26, color, textAlign: "center" }}>{icon}</Text>
      <Text style={[tabIconStyles.label, { color }]} numberOfLines={1}>{label}</Text>
      {focused && <View style={[tabIconStyles.dot, { backgroundColor: color }]} />}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", gap: 2, paddingTop: 2 },
  label: { fontSize: 9, fontFamily: "Poppins_500Medium" },
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
        <Text style={{ fontSize: 30, color: "#fff", lineHeight: 32, textAlign: "center", includeFontPadding: false }}>+</Text>
      </LinearGradient>
    </View>
  );
}

// ── ClassicTabLayout ──────────────────────────────────────────────────────────
function ClassicTabLayout({
  findVibeLocked,
  onLockedTabPress,
  isLoggedIn,
  onGuestTabPress,
}: {
  findVibeLocked: boolean;
  onLockedTabPress: () => void;
  isLoggedIn: boolean;
  onGuestTabPress: () => void;
}) {
  const isIOS = Platform.OS === "ios";
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  // Account for Android system nav bar (back/home/recent buttons).
  // Without this, the pill tab bar sits at bottom:10 which is INSIDE the
  // system nav bar area, making those buttons appear as a "second row" below it.
  const tabBarBottom = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 0) + 10;

  // Use refs so listeners always read the latest values without stale closures
  const lockedRef = useRef(findVibeLocked);
  lockedRef.current = findVibeLocked;

  const onLockedRef = useRef(onLockedTabPress);
  onLockedRef.current = onLockedTabPress;

  const isLoggedInRef = useRef(isLoggedIn);
  isLoggedInRef.current = isLoggedIn;

  const onGuestRef = useRef(onGuestTabPress);
  onGuestRef.current = onGuestTabPress;

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
          bottom: tabBarBottom,
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
            <TabIcon iconName={focused ? "play-circle" : "play-circle-outline"} label="Reels" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon iconName={focused ? "home" : "home-outline"} label="Feed" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        listeners={() => ({
          tabPress: (e) => {
            if (!isLoggedInRef.current) {
              e.preventDefault();
              onGuestRef.current();
            }
          },
        })}
        options={{
          title: "",
          tabBarIcon: () => <CreateIcon />,
        }}
      />
      <Tabs.Screen
        name="find"
        listeners={() => ({
          tabPress: (e) => {
            if (!isLoggedInRef.current) {
              e.preventDefault();
              onGuestRef.current();
              return;
            }
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
              locked={findVibeLocked}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        listeners={() => ({
          tabPress: (e) => {
            if (!isLoggedInRef.current) {
              e.preventDefault();
              onGuestRef.current();
            }
          },
        })}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon iconName={focused ? "person" : "person-outline"} label="Profile" focused={focused} color={color} />
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
  const isLoggedIn = !!userId;
  const [rewardCoins, setRewardCoins] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Default to locked until we read the stored preference
  const [findVibeLocked, setFindVibeLocked] = useState(true);
  const [showLockedSheet, setShowLockedSheet] = useState(false);
  const [showGuestSheet, setShowGuestSheet] = useState(false);
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

  return (
    <>
      <ClassicTabLayout
        findVibeLocked={findVibeLocked}
        onLockedTabPress={() => setShowLockedSheet(true)}
        isLoggedIn={isLoggedIn}
        onGuestTabPress={() => setShowGuestSheet(true)}
      />
      <RewardToast coins={rewardCoins} visible={showToast} />
      <OnboardingInterestPicker visible={showOnboarding} onComplete={handleOnboardingComplete} />
      <FindVibeLockedSheet
        visible={showLockedSheet}
        onClose={() => setShowLockedSheet(false)}
      />
      <LoginPrompt
        visible={showGuestSheet}
        onClose={() => setShowGuestSheet(false)}
        message="Sign up to like, comment and more"
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
