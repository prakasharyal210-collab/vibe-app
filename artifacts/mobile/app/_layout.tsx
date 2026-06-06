import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import * as Linking from "expo-linking";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastOverlay } from "@/components/ToastNotification";
import {
  ForceUpdateScreen,
  MaintenanceScreen,
  UpdateBanner,
  UpdateBottomSheet,
} from "@/components/UpdateNotification";
import { AuthProvider } from "@/context/AuthContext";
import { RealtimeProvider } from "@/context/RealtimeContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { supabase } from "@/lib/supabase";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
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

  // ── Update state ──────────────────────────────────────────────────────────
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [whatsNew, setWhatsNew] = useState<string[]>([]);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState<string | undefined>();
  const [maintenanceTime, setMaintenanceTime] = useState<string | undefined>();
  const bannerDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerReshowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Splash ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // ── OTA Update check ──────────────────────────────────────────────────────
  const checkForUpdates = useCallback(async () => {
    if (__DEV__) return;
    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) return;

      setUpdateAvailable(true);
      setBannerVisible(true);

      // Auto-download in background
      setDownloading(true);
      setDownloadProgress(0);

      // Simulate progress feedback while downloading
      const progressInterval = setInterval(() => {
        setDownloadProgress((prev) => Math.min(prev + 0.08, 0.92));
      }, 400);

      await Updates.fetchUpdateAsync();

      clearInterval(progressInterval);
      setDownloadProgress(1);
      setDownloading(false);
      setUpdateDownloaded(true);

      // After 3s auto-hide banner and show full sheet
      bannerDismissTimer.current = setTimeout(() => {
        setBannerVisible(false);
        setSheetVisible(true);
      }, 3000);
    } catch (err) {
      console.log("Update check failed:", err);
      setDownloading(false);
    }
  }, []);

  // ── Server config check (force update / maintenance / whats new) ──────────
  const checkServerConfig = useCallback(async () => {
    try {
      const { data } = await supabase.from("app_config").select("key, value");
      if (!data) return;

      const config: Record<string, string> = {};
      data.forEach((r: any) => { config[r.key] = r.value; });

      if (config.force_update === "true") {
        setForceUpdate(true);
      }

      if (config.whats_new) {
        try {
          const parsed = JSON.parse(config.whats_new);
          if (Array.isArray(parsed)) setWhatsNew(parsed);
        } catch {}
      }

      if (config.maintenance_mode === "true") {
        setMaintenance(true);
        setMaintenanceMsg(config.maintenance_message ?? undefined);
        setMaintenanceTime(config.maintenance_check_back ?? undefined);
      }
    } catch (err) {
      console.log("Server config check failed:", err);
    }
  }, []);

  useEffect(() => {
    checkForUpdates();
    checkServerConfig();

    // Auto-retry maintenance check every 60 seconds
    const maintenanceInterval = setInterval(checkServerConfig, 60_000);
    return () => {
      clearInterval(maintenanceInterval);
      if (bannerDismissTimer.current) clearTimeout(bannerDismissTimer.current);
      if (bannerReshowTimer.current) clearTimeout(bannerReshowTimer.current);
    };
  }, []);

  // ── Reshow banner every 30 min if user dismissed but hasn't updated ───────
  const handleBannerDismiss = () => {
    setBannerVisible(false);
    if (bannerDismissTimer.current) clearTimeout(bannerDismissTimer.current);
    if (updateAvailable && !updateDownloaded) {
      bannerReshowTimer.current = setTimeout(() => {
        setBannerVisible(true);
      }, 30 * 60 * 1000);
    } else if (updateDownloaded) {
      // If already downloaded, re-show after 30 min
      bannerReshowTimer.current = setTimeout(() => {
        setBannerVisible(true);
      }, 30 * 60 * 1000);
    }
  };

  // ── Apply update handler ──────────────────────────────────────────────────
  const handleUpdate = useCallback(async () => {
    try {
      if (updateDownloaded) {
        await Updates.reloadAsync();
        return;
      }
      setDownloading(true);
      setDownloadProgress(0);
      const progressInterval = setInterval(() => {
        setDownloadProgress((prev) => Math.min(prev + 0.1, 0.92));
      }, 350);
      await Updates.fetchUpdateAsync();
      clearInterval(progressInterval);
      setDownloadProgress(1);
      setDownloading(false);
      await Updates.reloadAsync();
    } catch (err) {
      console.log("Apply update failed:", err);
      setDownloading(false);
      // Fall back to store
      const storeUrl =
        typeof Updates.updateId === "string"
          ? "market://details?id=com.vibeapp.vibe"
          : "https://play.google.com/store/apps/details?id=com.vibeapp.vibe";
      Linking.openURL(storeUrl).catch(() => {});
    }
  }, [updateDownloaded]);

  // ── Tap banner → show full sheet ─────────────────────────────────────────
  const handleBannerPress = () => {
    if (updateDownloaded) {
      handleUpdate();
    } else {
      setBannerVisible(false);
      setSheetVisible(true);
    }
  };

  if (!fontsLoaded && !fontError) return null;

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

                    {/* ── Subtle banner at top of every screen ── */}
                    <UpdateBanner
                      visible={bannerVisible && !sheetVisible && !forceUpdate && !maintenance}
                      downloaded={updateDownloaded}
                      downloading={downloading}
                      progress={downloadProgress}
                      onPress={handleBannerPress}
                      onDismiss={handleBannerDismiss}
                    />

                    {/* ── Full update bottom sheet ── */}
                    <UpdateBottomSheet
                      visible={sheetVisible && !forceUpdate && !maintenance}
                      downloaded={updateDownloaded}
                      downloading={downloading}
                      progress={downloadProgress}
                      whatsNew={whatsNew}
                      onUpdate={() => { setSheetVisible(false); handleUpdate(); }}
                      onDismiss={() => {
                        setSheetVisible(false);
                        // Re-show banner after 30 min
                        bannerReshowTimer.current = setTimeout(() => {
                          if (updateAvailable) setBannerVisible(true);
                        }, 30 * 60 * 1000);
                      }}
                    />

                    {/* ── Force update — blocking, cannot dismiss ── */}
                    <ForceUpdateScreen
                      visible={forceUpdate}
                      onUpdate={handleUpdate}
                    />

                    {/* ── Maintenance mode ── */}
                    <MaintenanceScreen
                      visible={maintenance && !forceUpdate}
                      message={maintenanceMsg}
                      checkBackTime={maintenanceTime}
                      onRetry={() => { checkServerConfig(); }}
                    />
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
