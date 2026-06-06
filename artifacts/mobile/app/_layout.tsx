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
import AsyncStorage from "@react-native-async-storage/async-storage";
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

// ── Update persistence helpers ─────────────────────────────────────────────
const BANNER_SUPPRESS_KEY = "update_banner_suppressed_until";
const SKIPPED_VERSION_KEY = "skipped_version";

async function isBannerSuppressed(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(BANNER_SUPPRESS_KEY);
    if (!val) return false;
    return Date.now() < parseInt(val, 10);
  } catch { return false; }
}

async function suppressBannerFor24h(): Promise<void> {
  const until = Date.now() + 24 * 60 * 60 * 1000;
  await AsyncStorage.setItem(BANNER_SUPPRESS_KEY, String(until)).catch(() => {});
}

async function persistSkipVersion(version: string): Promise<void> {
  await AsyncStorage.setItem(SKIPPED_VERSION_KEY, version).catch(() => {});
}

async function shouldShowUpdateVersion(version: string): Promise<boolean> {
  try {
    const skipped = await AsyncStorage.getItem(SKIPPED_VERSION_KEY);
    return skipped !== version;
  } catch { return true; }
}

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
  const [pendingUpdateId, setPendingUpdateId] = useState<string | null>(null);
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

      // Identify this update so we can check skip/suppress status
      const updateId: string = (update.manifest as any)?.id ?? String(Date.now());
      setPendingUpdateId(updateId);

      // If user skipped this specific version, silently bail
      const shouldShow = await shouldShowUpdateVersion(updateId);
      if (!shouldShow) return;

      setUpdateAvailable(true);

      // Check suppress status (24h banner dismiss)
      const suppressed = await isBannerSuppressed();

      // Show bottom sheet immediately so user sees progress while downloading
      if (!suppressed) {
        setSheetVisible(true);
      }

      // Download in background — progress shows inside the sheet
      setDownloading(true);
      setDownloadProgress(0);
      const progressInterval = setInterval(() => {
        setDownloadProgress((prev) => Math.min(prev + 0.08, 0.92));
      }, 400);

      await Updates.fetchUpdateAsync();

      clearInterval(progressInterval);
      setDownloadProgress(1);
      setDownloading(false);
      setUpdateDownloaded(true);
    } catch (err) {
      console.log("Update check failed:", err);
      setDownloading(false);
    }
  }, []);

  // ── Server config check (force update / maintenance / whats new) ──────────
  const checkServerConfig = useCallback(async () => {
    if (__DEV__) return;
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

  // ── Banner ✕ dismiss — suppresses for 24h via AsyncStorage ───────────────
  const handleBannerDismiss = () => {
    setBannerVisible(false);
    if (bannerDismissTimer.current) clearTimeout(bannerDismissTimer.current);
    if (bannerReshowTimer.current) clearTimeout(bannerReshowTimer.current);
    suppressBannerFor24h();
  };

  // ── "Remind me later" in bottom sheet — re-shows banner after 30 min ──────
  const handleRemindLater = () => {
    setSheetVisible(false);
    if (bannerReshowTimer.current) clearTimeout(bannerReshowTimer.current);
    bannerReshowTimer.current = setTimeout(() => {
      if (updateAvailable) setBannerVisible(true);
    }, 30 * 60 * 1000);
  };

  // ── "Skip this version" — persists to AsyncStorage, hides everything ──────
  const handleSkipVersion = async () => {
    if (pendingUpdateId) await persistSkipVersion(pendingUpdateId);
    setSheetVisible(false);
    setBannerVisible(false);
    setUpdateAvailable(false);
    if (bannerReshowTimer.current) clearTimeout(bannerReshowTimer.current);
    if (bannerDismissTimer.current) clearTimeout(bannerDismissTimer.current);
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
                      isForce={false}
                      onUpdate={() => { setSheetVisible(false); handleUpdate(); }}
                      onDismiss={handleRemindLater}
                      onSkipVersion={handleSkipVersion}
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
