---
name: Crash fixes — expo-glass-effect + React Compiler
description: Two root causes of the persistent "Invalid hook call" / "Something went wrong" crash on all platforms.
---

## Fix 1 — expo-glass-effect native module guard (`(tabs)/_layout.tsx`)

`isLiquidGlassAvailable()` from `expo-glass-effect` throws when the native module is missing (Expo Go, Android, older iOS, web). Calling it bare in JSX crashed the entire tab layout before any screen rendered.

Fix: wrap in an inline try-catch IIFE in the JSX:
```jsx
{(Platform.OS === "ios" && (() => { try { return isLiquidGlassAvailable(); } catch { return false; } })())
  ? <NativeTabLayout /> : <ClassicTabLayout />}
```

**Why:** expo-glass-effect requires iOS 26+ liquid glass APIs; native module is absent in Expo Go and on non-iOS. Any bare call throws.

**How to apply:** Any future call to `isLiquidGlassAvailable()` must be wrapped in try-catch.

---

## Fix 2 — React Compiler opt-out for screen components

The beta React Compiler (`babel-plugin-react-compiler ^19.0.0-beta-e993439-20250117`) is auto-enabled by `babel-preset-expo` when the package is installed. It mis-transforms any screen component with many hooks, causing "Invalid hook call" / "Something went wrong" on Android/iOS (the web preview masks this bug and may appear fine while native crashes).

Confirmed affected: `FeedScreen` (`feed.tsx`), `ReelsScreen` (`index.tsx`).

Fix: add `"use no memo"` as the **first statement inside the function body** of every screen component:
```ts
export default function ReelsScreen() {
  "use no memo";
  // ... hooks follow
}
```

**Why:** Old React Compiler beta has known bugs with complex components. "use no memo" is the official opt-out directive. The web preview uses a different code path and does NOT reproduce native crashes — always test on Android/iOS Expo Go.

**How to apply:** Any time a new screen (especially one with many hooks/callbacks/useMemo) shows "Something went wrong" on Android/iOS but looks fine on web, add `"use no memo"` as the fix. Also add it proactively to any new screen component at creation time.
