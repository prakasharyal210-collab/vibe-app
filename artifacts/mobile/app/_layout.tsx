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

// Key used to signal a downloaded update is ready to apply
const OTA_READY_KEY = "ota_ready";

function RootLayoutNav() {
  const { session, loading } = useAuth();

  // Auth guard: only redirect to login on explicit sign-out (session goes
  // from non-null → null after having been set). Guests can browse freely.
  const prevSessionRef = React.useRef<typeof session | undefined>(undefined);
  useEffect(() => {
    if (loading) return;
    const hadSession = prevSessionRef.current !== undefined && prevSessionRef.current !== null;
    prevSessionRef.current = session;
    if (hadSession && !session) {
      // Signed out — kick back to login
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
