import AsyncStorage from "@react-native-async-storage/async-storage";

// Per-device flag: has this user already seen the post-signup
// "follow some accounts" onboarding screen? Stored client-side (no DB
// migration needed) so the feature stays JS-only / OTA-deployable.
function key(userId: string) {
  return `follow_onboarding_seen:${userId}`;
}

export async function hasSeenFollowOnboarding(userId: string): Promise<boolean> {
  if (!userId) return true;
  try {
    const v = await AsyncStorage.getItem(key(userId));
    return v === "1";
  } catch {
    return true; // fail open — never block navigation on storage errors
  }
}

export async function markFollowOnboardingSeen(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(key(userId), "1");
  } catch {}
}
