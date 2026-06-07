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

## Fix 2 — React Compiler opt-out for FeedScreen (`(tabs)/feed.tsx`)

The beta React Compiler (`babel-plugin-react-compiler ^19.0.0-beta-e993439-20250117`) is auto-enabled by `babel-preset-expo` when the package is installed. It was mis-transforming `FeedScreen`, causing intermittent "Invalid hook call" on initial render (confirmed: crash in web preview, consistent crash on Android/iOS).

Fix: add `"use no memo"` directive as the first statement inside `FeedScreen`.

**Why:** Old React Compiler beta has known bugs with complex components. "use no memo" is the official opt-out directive.

**How to apply:** If a new screen with many hooks/callbacks starts crashing with "Invalid hook call", add `"use no memo"` to that component as a first step.
