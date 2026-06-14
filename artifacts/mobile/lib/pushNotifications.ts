import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

/** True when running inside Expo Go — remote push is unavailable there (SDK 53+). */
const isExpoGo = Constants.appOwnership === "expo";

/** Register the foreground notification handler. No-op in Expo Go. */
export function setupNotificationHandler(): void {
  if (isExpoGo) return;
  // Lazy require prevents expo-notifications from loading in Expo Go
  const Notifications = require("expo-notifications") as typeof import("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/** Request permission and register the device's Expo push token with the API. */
export async function registerForPushNotificationsAsync(userId: string): Promise<void> {
  if (isExpoGo) return;
  if (!Device.isDevice) return;

  // Lazy require keeps expo-notifications from loading (and crashing) in Expo Go
  const Notifications = require("expo-notifications") as typeof import("expo-notifications");

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Gundruk",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#7C3AED",
      showBadge: true,
    });
  }

  const existing = await Notifications.getPermissionsAsync() as any;
  let granted: boolean = existing.granted ?? false;
  if (!granted) {
    const result = await Notifications.requestPermissionsAsync() as any;
    granted = result.granted ?? false;
  }
  if (!granted) return;

  const projectId =
    (Constants.expoConfig?.extra as any)?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    "c60fdd9d-6ced-4370-86de-24d16864e642";

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
  } catch {
    return;
  }

  const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  await fetch(`${apiBase}/users/push-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, token }),
  }).catch(() => {});
}

/** Add a listener for when the user taps a notification. No-op in Expo Go. */
export function addNotificationResponseListener(
  handler: (response: import("expo-notifications").NotificationResponse) => void,
): { remove(): void } {
  if (isExpoGo) return { remove() {} };
  const Notifications = require("expo-notifications") as typeof import("expo-notifications");
  return Notifications.addNotificationResponseReceivedListener(handler);
}
