import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import React, { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastOverlay } from "@/components/ToastNotification";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { RealtimeProvider } from "@/context/RealtimeContext";
import { ThemeProvider } from "@/context/ThemeContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// ─── Web landing ─────────────────────────────────────────────────────────────
// react-native-worklets@0.5.1 JSWorklets mode (web) throws
// "createSerializableObject should never be called" whenever any
// useAnimatedStyle / Gesture worklet is initialised.  Short-circuit the
// entire native app tree on web and show a polished redirect page instead.
function WebLanding() {
  return (
    <View style={wStyles.root}>
      <View style={wStyles.card}>
        <Text style={wStyles.logo}>⚡</Text>
        <Text style={wStyles.appName}>Gundruk</Text>
        <Text style={wStyles.tagline}>The dark social experience</Text>
        <Text style={wStyles.body}>
          Gundruk is a mobile-first app. Scan the QR code in Expo Go or download
          from the app stores to get the full experience.
        </Text>
        <TouchableOpacity
          style={wStyles.btn}
          onPress={() => Linking.openURL("https://expo.dev/go")}
        >
          <Text style={wStyles.btnText}>Open in Expo Go →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const wStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#09090B", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#18181B", borderRadius: 24, padding: 36, alignItems: "center", maxWidth: 380, width: "100%", borderWidth: 1, borderColor: "#27272A" },
  logo: { fontSize: 56, marginBottom: 12 },
  appName: { color: "#FAFAFA", fontSize: 32, fontWeight: "700", marginBottom: 4 },
  tagline: { color: "#7C3AED", fontSize: 15, fontWeight: "600", marginBottom: 20 },
  body: { color: "#A1A1AA", fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 28 },
  btn: { backgroundColor: "#7C3AED", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 50 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

// Key used to signal a downloaded update is ready to apply
const OTA_READY_KEY = "ota_ready";

function RootLayoutNav() {
  const { session, loading } = useAuth();

  // Auth guard: whenever session disappears (logout or token expiry),
  // replace the entire navigation stack with the login screen so the
  // back button cannot return to the authenticated app.
  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/(auth)/login");
    }
  }, [session, loading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="chat/[userId]"
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="inbox"
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="search"
        options={{ animation: "slide_from_bottom", presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="notifications"
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="live"
        options={{ animation: "slide_from_bottom", presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="wallet"
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="settings"
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="theme"
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="post/[id]"
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="reel/[id]"
        options={{ animation: "slide_from_bottom", presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="highlight/[id]"
        options={{ animation: "fade", presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="find-friends"
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="advertise"
        options={{ animation: "slide_from_right" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  // Reanimated v4 + react-native-worklets@0.5.1 crashes on web (JSWorklets
  // mode throws "createSerializableObject should never be called").
  // Render a clean mobile-redirect page for web instead.
  if (Platform.OS === "web") return <WebLanding />;

  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // Tracks whether the "apply pending update?" check has completed.
  // Splash stays up until this is true so the reload (if needed) is invisible.
  const [updateCheckDone, setUpdateCheckDone] = useState(false);

  // ── Step 1: on every cold start, check if a downloaded update is waiting ──
  // This runs synchronously before the splash screen hides.  If an update is
  // ready we clear the flag and call reloadAsync() — the user only ever sees
  // the splash screen and wakes up in the new version.  If no update is ready
  // we set updateCheckDone so the rest of the app can proceed normally.
  useEffect(() => {
    if (__DEV__) {
      setUpdateCheckDone(true);
      return;
    }

    AsyncStorage.getItem(OTA_READY_KEY).then(async (val) => {
      if (val === "1") {
        try {
          await AsyncStorage.removeItem(OTA_READY_KEY);
          await Updates.reloadAsync(); // loads the new bundle; does not return
        } catch {
          // If reload fails for any reason just continue normally
          setUpdateCheckDone(true);
        }
      } else {
        setUpdateCheckDone(true);
      }
    }).catch(() => {
      setUpdateCheckDone(true);
    });
  }, []);

  // ── Step 2: hide splash once fonts + update-check are both done ───────────
  useEffect(() => {
    if (updateCheckDone && (fontsLoaded || fontError)) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, updateCheckDone]);

  // ── Step 3: background check 4 s after the app is running ─────────────────
  // Silently fetches the update bundle if available, then sets the flag so it
  // is applied on the next cold start.  Nothing is shown to the user.
  useEffect(() => {
    if (__DEV__) return;

    const t = setTimeout(async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        await AsyncStorage.setItem(OTA_READY_KEY, "1");
      } catch {
        // Network issues, no update channel configured, etc. — ignore silently
      }
    }, 4000);

    return () => clearTimeout(t);
  }, []);

  if (!updateCheckDone || (!fontsLoaded && !fontError)) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AuthProvider>
                  <RealtimeProvider>
                    <RootLayoutNav />
                    <ToastOverlay />
                  </RealtimeProvider>
                </AuthProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
