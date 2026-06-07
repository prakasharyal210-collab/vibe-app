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
  DeviceEventEmitter,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnboardingInterestPicker } from "@/components/OnboardingInterestPicker";
import { useAuth } from "@/context/AuthContext";
import { claimDailyReward, getGundrukProfile, needsOnboarding, saveGundrukProfile, saveOnboardingInterests } from "@/lib/db";
import { useTheme } from "@/context/ThemeContext";

const INACTIVE = "#6B7280";

// ── Find Vibe lock event ──────────────────────────────────────────────────────
// Fired by settings.tsx when "Show me in Find Vibe" toggle changes.
export const FIND_VIBE_LOCK_EVENT = "findVibeLockChanged";

// ── Vibe setup mode options ───────────────────────────────────────────────────
const VIBE_MODES = [
  { value: "dating",     emoji: "❤️",  label: "Dating",        desc: "Find romantic connections and your perfect match" },
  { value: "friends",    emoji: "👫",  label: "Friends",       desc: "Meet new people and expand your social circle" },
  { value: "networking", emoji: "🤝",  label: "Networking",    desc: "Connect with professionals and grow your network" },
  { value: "browsing",   emoji: "👀",  label: "Just Browsing", desc: "Explore without any specific intention" },
  { value: "hide",       emoji: "❌",  label: "Hide Me",       desc: "Don't show me in Find Vibe at all" },
] as const;

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

// ── VibeSetupSheet — shown to brand-new users who haven't set a mode yet ──────
function VibeSetupSheet({
  visible,
  userId,
  onUnlocked,
  onClose,
}: {
  visible: boolean;
  userId: string;
  onUnlocked: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);

  const handleSelect = async (mode: string) => {
    if (saving) return;
    setSaving(true);
    const visible = mode !== "hide";
    try {
      await saveGundrukProfile(userId, {
        show_in_matching: visible,
        find_gundruk_mode: mode,
      });
      // Mark mode as selected so find.tsx doesn't re-show its own sheet
      await AsyncStorage.setItem(`gundruk_mode_selected_${userId}`, "true").catch(() => {});
      // Persist lock state
      await AsyncStorage.setItem(`find_vibe_locked_${userId}`, visible ? "false" : "true").catch(() => {});
    } catch {}
    setSaving(false);
    if (visible) {
      DeviceEventEmitter.emit(FIND_VIBE_LOCK_EVENT, { locked: false });
      onUnlocked();
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={sheetStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[sheetStyles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={sheetStyles.handle} />
        <Text style={sheetStyles.emoji}>🔒</Text>
        <Text style={sheetStyles.title}>Unlock Find Vibe</Text>
        <Text style={sheetStyles.body}>
          Set up your profile to start matching with people
        </Text>

        <ScrollView style={{ width: "100%" }} showsVerticalScrollIndicator={false}>
          {VIBE_MODES.map((m, i) => (
            <TouchableOpacity
              key={m.value}
              onPress={() => handleSelect(m.value)}
              activeOpacity={0.75}
              disabled={saving}
              style={[
                sheetStyles.modeRow,
                i < VIBE_MODES.length - 1 && sheetStyles.modeRowBorder,
                m.value === "hide" && sheetStyles.modeRowHide,
              ]}
            >
              <Text style={sheetStyles.modeEmoji}>{m.emoji}</Text>
              <View style={sheetStyles.modeText}>
                <Text style={[sheetStyles.modeLabel, m.value === "hide" && { color: "#9CA3AF" }]}>
                  {m.label}
                </Text>
                <Text style={sheetStyles.modeDesc}>{m.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={m.value === "hide" ? "#4B5563" : "rgba(255,255,255,0.25)"} />
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity onPress={onClose} style={sheetStyles.cancelBtn}>
          <Text style={sheetStyles.cancelText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── FindVibeLockedSheet — shown when user explicitly turned off in settings ────
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
        <TouchableOpacity onPress={onClose} style={sheetStyles.cancelBtn}>
          <Text style={sheetStyles.cancelText}>Dismiss</Text>
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
    maxHeight: "85%",
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", marginBottom: 22 },
  emoji: { fontSize: 50, marginBottom: 12 },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 22, textAlign: "center", marginBottom: 8 },
  body: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  // mode rows
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
  },
  modeRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  modeRowHide: {
    marginTop: 4,
  },
  modeEmoji: { fontSize: 26, width: 34, textAlign: "center" },
  modeText: { flex: 1 },
  modeLabel: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  modeDesc: { color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  // buttons
  primaryBtn: { width: "100%", borderRadius: 18, overflow: "hidden", marginTop: 8, marginBottom: 12 },
  primaryGrad: { paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 16 },
  cancelBtn: { paddingVertical: 12 },
  cancelText: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_500Medium", fontSize: 14 },
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
        listeners={{
          tabPress: (e) => {
            if (findVibeLocked) {
              e.preventDefault();
              onLockedTabPress();
            }
          },
        }}
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

// ── TabLayout (root) ──────────────────────────────────────────────────────────
export default function TabLayout() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [rewardCoins, setRewardCoins] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Default to locked (true) until we confirm from the user's profile
  const [findVibeLocked, setFindVibeLocked] = useState(true);
  // Whether the user has ever chosen a mode (false = brand-new, show setup sheet)
  const [findVibeSetupDone, setFindVibeSetupDone] = useState(false);
  const [showSetupSheet, setShowSetupSheet] = useState(false);
  const [showLockedSheet, setShowLockedSheet] = useState(false);
  const claimedRef = useRef(false);
  const onboardingRef = useRef(false);

  // Load initial state from Supabase profile + AsyncStorage
  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        // Check if user has previously completed setup
        const setupDone = await AsyncStorage.getItem(`gundruk_mode_selected_${userId}`).catch(() => null);
        const isSetupDone = setupDone === "true";
        setFindVibeSetupDone(isSetupDone);

        // Get actual lock state from DB
        const profile = await getGundrukProfile(userId);
        const locked = !profile.show_in_matching;
        setFindVibeLocked(locked);
        AsyncStorage.setItem(`find_vibe_locked_${userId}`, locked ? "true" : "false").catch(() => {});
      } catch {
        // Fallback: read from AsyncStorage cache
        const cached = await AsyncStorage.getItem(`find_vibe_locked_${userId}`).catch(() => null);
        if (cached !== null) setFindVibeLocked(cached === "true");
        // If no cache, stays locked (true) which is the safe default
      }
    })();
  }, [userId]);

  // Listen for real-time lock changes from settings screen (same session)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(FIND_VIBE_LOCK_EVENT, ({ locked }: { locked: boolean }) => {
      setFindVibeLocked(locked);
      // When settings turns it back ON, mark setup as done (user has a profile now)
      if (!locked) setFindVibeSetupDone(true);
      if (userId) {
        AsyncStorage.setItem(`find_vibe_locked_${userId}`, locked ? "true" : "false").catch(() => {});
      }
    });
    return () => sub.remove();
  }, [userId]);

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

  const handleLockedTabPress = () => {
    if (!findVibeSetupDone) {
      // Brand-new user — show setup / mode picker
      setShowSetupSheet(true);
    } else {
      // User previously set up but turned off in settings
      setShowLockedSheet(true);
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
          onLockedTabPress={handleLockedTabPress}
        />
      )}
      <RewardToast coins={rewardCoins} visible={showToast} />
      <OnboardingInterestPicker visible={showOnboarding} onComplete={handleOnboardingComplete} />

      {/* Setup sheet — brand-new users, choose their mode */}
      {userId ? (
        <VibeSetupSheet
          visible={showSetupSheet}
          userId={userId}
          onUnlocked={() => {
            setFindVibeLocked(false);
            setFindVibeSetupDone(true);
          }}
          onClose={() => setShowSetupSheet(false)}
        />
      ) : null}

      {/* Locked sheet — user explicitly turned off in settings */}
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
