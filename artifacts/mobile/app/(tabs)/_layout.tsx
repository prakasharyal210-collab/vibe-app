import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnboardingInterestPicker } from "@/components/OnboardingInterestPicker";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { claimDailyReward, needsOnboarding, saveOnboardingInterests } from "@/lib/db";

function RewardToast({ coins, visible }: { coins: number; visible: boolean }) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bottomPad = Platform.OS === "web" ? 96 : insets.bottom + 84;

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
      style={[
        toastStyles.wrap,
        { bottom: bottomPad, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <View style={toastStyles.pill}>
        <Text style={toastStyles.text}>🎁 +{coins} coins daily reward claimed!</Text>
      </View>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },
  pill: {
    backgroundColor: "rgba(30,14,52,0.96)",
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.45)",
    shadowColor: "#7C3AED",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  text: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
});

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
  const [showToast, setShowToast] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const claimedRef = useRef(false);
  const onboardingRef = useRef(false);

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
      } catch {
      }
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
      {isLiquidGlassAvailable() && Platform.OS === "ios" ? <NativeTabLayout /> : <ClassicTabLayout />}
      <RewardToast coins={rewardCoins} visible={showToast} />
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
