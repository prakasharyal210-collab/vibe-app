import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { Feather, Ionicons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Feed</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} />
        <Label>Explore</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="post">
        <Icon sf={{ default: "plus.app", selected: "plus.app.fill" }} />
        <Label>Post</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages">
        <Icon sf={{ default: "bubble.left", selected: "bubble.left.fill" }} />
        <Label>Inbox</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const safeAreaInsets = useSafeAreaInsets();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  const tabIcon = (
    name: string,
    sfDefault: string,
    sfSelected: string,
    featherName: string,
    color: string,
    focused: boolean
  ) => {
    if (isIOS) {
      return (
        <SymbolView name={focused ? sfSelected : sfDefault} tintColor={color} size={24} />
      );
    }
    return <Feather name={featherName as any} size={22} color={color} />;
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
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Feed",
          tabBarIcon: ({ color, focused }) =>
            tabIcon("index", "house", "house.fill", "home", color, focused),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, focused }) =>
            tabIcon("explore", "magnifyingglass", "magnifyingglass", "search", color, focused),
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          title: "Post",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? "plus.app.fill" : "plus.app"}
                tintColor={color}
                size={26}
              />
            ) : (
              <Ionicons name={focused ? "add-circle" : "add-circle-outline"} size={28} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color, focused }) =>
            tabIcon(
              "messages",
              "bubble.left",
              "bubble.left.fill",
              "message-circle",
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
            tabIcon("profile", "person", "person.fill", "user", color, focused),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({});
