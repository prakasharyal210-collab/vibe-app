import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

// ─── Notification handler (shows alerts while app is foregrounded) ────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Request permission and register the device's Expo push token with the API. */
export async function registerForPushNotificationsAsync(userId: string): Promise<void> {
  if (!Device.isDevice) {
    // Push notifications are not available in the simulator / Expo Go web
    return;
  }

  // Set up the Android notification channel first
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Gundruk",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#7C3AED",
      showBadge: true,
    });
  }

  // Check / request permission
  // Cast via `any` because NotificationPermissionsStatus extends expo's PermissionResponse
  // (which carries `.granted`), but the TS declarations don't surface it directly.
  const existing = await Notifications.getPermissionsAsync() as any;
  let granted: boolean = existing.granted ?? false;
  if (!granted) {
    const result = await Notifications.requestPermissionsAsync() as any;
    granted = result.granted ?? false;
  }
  if (!granted) return;

  // Get Expo push token — requires the EAS projectId
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

  // Store the token on the server
  const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
  await fetch(`${apiBase}/users/push-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, token }),
  }).catch(() => {});
}

/** Convenience: add a listener that fires when the user taps a notification. */
export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
