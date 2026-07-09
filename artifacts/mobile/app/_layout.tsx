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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastOverlay } from "@/components/ToastNotification";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CoupleProvider } from "@/context/CoupleContext";
import { RealtimeProvider } from "@/context/RealtimeContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { initSentry } from "@/lib/sentry";

SplashScreen.preventAutoHideAsync();

// No-ops if EXPO_PUBLIC_SENTRY_DSN is not set, or if running in an
// environment (e.g. Expo Go) where the native module is unavailable.
initSentry();

const queryClient = new QueryClient();

// Key used to signal a downloaded update is ready to apply
const OTA_READY_KEY = "ota_ready";

function RootLayoutNav() {
  const { session, loading, needsOnboarding, needsPasswordReset } = useAuth();

  // Auth guard: track session transitions and redirect accordingly.
  // undefined = initial state (loading); null = confirmed no session; Session = logged in.
  const prevSessionRef = React.useRef<typeof session | undefined>(undefined);
  useEffect(() => {
    if (loading) return;

    const prev = prevSessionRef.current;
    prevSessionRef.current = session;

    // First resolution: prev is still undefined. Let index.tsx handle initial routing.
    if (prev === undefined) return;

    if (prev !== null && session === null) {
      // Signed out — go to login
      router.replace("/(auth)/login");
    } else if (prev === null && session !== null) {
      // Just signed in — but if the user is mid-password-reset, stay on that screen
      if (needsPasswordReset) {
        return;
      }
      if (needsOnboarding) {
        router.replace("/(auth)/setup-profile");
      } else {
        router.replace("/(tabs)/feed");
      }
    }
  }, [session, loading, needsOnboarding, needsPasswordReset]);

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
        name="notification-settings"
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="privacy-settings"
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
      <Stack.Screen
        name="profile/[username]"
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="snap-camera"
        options={{ animation: "slide_from_bottom", presentation: "fullScreenModal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // Explicit require instead of ...Ionicons.font spread — ensures the key
    // 'ionicons' (lowercase, matching createIconSet's fontName) is always
    // registered in expo-font's registry before any <Ionicons> mounts.
    // With @expo/vector-icons v15 the spread can silently return an empty
    // object which causes Font.isLoaded('ionicons') to stay false and render
    // a blank <Text /> (tofu box) until componentDidMount loads it async.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ionicons: require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"),
    // Feather is used in components/ErrorFallback.tsx — same explicit-require pattern
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Feather: require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf"),
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // Tracks whether the "apply pending update?" check has completed.
  // Splash stays up until this is true so the reload (if needed) is invisible.
  const [updateCheckDone, setUpdateCheckDone] = useState(false);

  // ── Step 1: on every cold start, check if a downloaded update is waiting ──
  // Hard 2-second safety timeout guarantees the app ALWAYS proceeds even if
  // AsyncStorage or Updates.reloadAsync() hangs (prevents permanent black screen).
  useEffect(() => {
    if (__DEV__) {
      setUpdateCheckDone(true);
      return;
    }

    const done = () => setUpdateCheckDone(true);

    // Safety net: force proceed after 2s no matter what
    const safetyTimer = setTimeout(done, 2000);

    AsyncStorage.getItem(OTA_READY_KEY)
      .then(async (val) => {
        if (val === "1") {
          // Remove the flag first so a failed reload doesn't loop
          await AsyncStorage.removeItem(OTA_READY_KEY).catch(() => {});
          try {
            await Updates.reloadAsync(); // loads the new bundle; does not return
          } catch {
            clearTimeout(safetyTimer);
            done();
          }
        } else {
          clearTimeout(safetyTimer);
          done();
        }
      })
      .catch(() => {
        clearTimeout(safetyTimer);
        done();
      });

    return () => clearTimeout(safetyTimer);
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

  if (!updateCheckDone || (!fontsLoaded && !fontError)) {
    return <View style={{ flex: 1, backgroundColor: "#0A0A0F" }} />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <AuthProvider>
                <CoupleProvider>
                  <RealtimeProvider>
                    <RootLayoutNav />
                    <ToastOverlay />
                  </RealtimeProvider>
                </CoupleProvider>
              </AuthProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
