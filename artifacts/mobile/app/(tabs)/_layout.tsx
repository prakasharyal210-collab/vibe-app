import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { DailyRewardModal } from "@/components/DailyRewardModal";
import { OnboardingInterestPicker } from "@/components/OnboardingInterestPicker";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { claimDailyReward, needsOnboarding, saveOnboardingInterests } from "@/lib/db";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "play.rectangle", selected: "play.rectangle.fill" }} />
        <Label>Reels</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="feed">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Feed</Label>
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

function CreateIcon() {
  return (
    <LinearGradient
      colors={["#7C3AED", "#EA580C"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.createIcon}
    >
      <Ionicons name="add" size={26} color="#fff" />
    </LinearGradient>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";

  const sfIcon = (
    def: string,
    sel: string,
    fallback: string,
    color: string,
    focused: boolean,
    size = 24
  ) => {
    if (isIOS) {
      return (
        <SymbolView name={focused ? sel : def} tintColor={color} size={size} />
      );
    }
    return <Ionicons name={fallback as any} size={size} color={color} />;
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#7C3AED",
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: {
          fontFamily: "Poppins_500Medium",
          fontSize: 10,
          marginTop: -2,
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: 0.5,
          borderTopColor: colors.border,
          elevation: 0,
          height: Platform.OS === "web" ? 84 : undefined,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Reels",
          tabBarIcon: ({ color, focused }) =>
            isIOS
              ? <SymbolView name={focused ? "play.rectangle.fill" : "play.rectangle"} tintColor={color} size={24} />
              : <Ionicons name={focused ? "play-circle" : "play-circle-outline"} size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: "Feed",
          tabBarIcon: ({ color, focused }) =>
            isIOS
              ? <SymbolView name={focused ? "house.fill" : "house"} tintColor={color} size={24} />
              : <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />,
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
        options={{
          title: "Find Vibe",
          tabBarIcon: ({ color, focused }) =>
            isIOS
              ? <SymbolView name={focused ? "heart.fill" : "heart"} tintColor={color} size={24} />
              : <Ionicons name={focused ? "heart" : "heart-outline"} size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) =>
            isIOS
              ? <SymbolView name={focused ? "person.fill" : "person"} tintColor={color} size={24} />
              : <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />,
        }}
      />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="post" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [rewardCoins, setRewardCoins] = useState(0);
  const [showReward, setShowReward] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const claimedRef = useRef(false);
  const onboardingRef = useRef(false);

  useEffect(() => {
    if (!userId || claimedRef.current) return;
    claimedRef.current = true;
    claimDailyReward(userId).then((result) => {
      const coins = result.claimed ? result.coins_awarded : 0;
      if (coins > 0) {
        setTimeout(() => {
          setRewardCoins(coins);
          setShowReward(true);
        }, 1200);
      }
    });
  }, [userId]);

  useEffect(() => {
    if (!userId || onboardingRef.current) return;
    onboardingRef.current = true;

    (async () => {
      try {
        // ── 1. AsyncStorage check — instant, no network ────────────────
        const localDone = await AsyncStorage.getItem("onboarding_done");
        if (localDone === "true") return; // already completed, never show again

        // ── 2. Supabase as backup source-of-truth ──────────────────────
        const required = await needsOnboarding(userId).catch(() => false);
        if (!required) {
          // Already done in DB — persist locally so future checks are instant
          await AsyncStorage.setItem("onboarding_done", "true").catch(() => {});
          return;
        }

        // ── 3. First time: show the picker ────────────────────────────
        setTimeout(() => setShowOnboarding(true), 600);
      } catch {
        // Silently skip on any error — never block the user
      }
    })();
  }, [userId]);

  const handleOnboardingComplete = async (interests: string[]) => {
    setShowOnboarding(false);
    // Persist locally first — survives logout, instant on next open
    await AsyncStorage.setItem("onboarding_done", "true").catch(() => {});
    if (userId) {
      saveOnboardingInterests(userId, interests).catch(() => {});
    }
  };

  return (
    <>
      {isLiquidGlassAvailable() && Platform.OS === "ios" ? <NativeTabLayout /> : <ClassicTabLayout />}
      <DailyRewardModal
        visible={showReward}
        coins={rewardCoins}
        onClose={() => setShowReward(false)}
      />
      <OnboardingInterestPicker
        visible={showOnboarding}
        onComplete={handleOnboardingComplete}
      />
    </>
  );
}

const styles = StyleSheet.create({
  createIcon: {
    width: 48,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
});
