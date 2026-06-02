import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { useColors } from "@/hooks/useColors";

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
            sfIcon(
              "play.rectangle",
              "play.rectangle.fill",
              focused ? "play-circle" : "play-circle-outline",
              color,
              focused
            ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: "Feed",
          tabBarIcon: ({ color, focused }) =>
            sfIcon("house", "house.fill", focused ? "home" : "home-outline", color, focused),
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
            sfIcon(
              "heart.circle",
              "heart.circle.fill",
              focused ? "heart-circle" : "heart-circle-outline",
              color,
              focused
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) =>
            sfIcon("person", "person.fill", focused ? "person" : "person-outline", color, focused),
        }}
      />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="post" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
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
