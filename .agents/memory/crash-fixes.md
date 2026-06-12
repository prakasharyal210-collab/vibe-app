---
name: Crash fixes — expo-glass-effect, React Compiler, Reanimated mixed imports
description: Root causes of persistent crashes on Android/iOS in this app.
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

## Fix 2 — React Compiler disabled (root cause: `app.json`)

The React Compiler was enabled via `"experiments": { "reactCompiler": true }` in `app.json`. This caused "Invalid hook call" / "Something went wrong" on Android/iOS (web preview masks the bug completely).

**The real on/off switch is `app.json`, NOT `babel.config.js`.**

- `babel-preset-expo` auto-enables the compiler when `app.json` has `"reactCompiler": true` — regardless of what babel.config.js says.
- Setting `reactCompiler: false` in babel.config.js or `babel-plugin-react-compiler` options does NOT override it.
- Removing `babel-plugin-react-compiler` from package.json also does NOT stop it if `app.json` still has `"reactCompiler": true`.
- Confirmation: the log line "React Compiler enabled" only disappears when `app.json` experiments.reactCompiler is `false`.

Current state: `app.json` has `"reactCompiler": false` and `babel-plugin-react-compiler` has been removed from devDependencies. The compiler is fully off.

**Why:** The beta React Compiler mis-transforms complex components with many hooks, causing native-only crashes. Web preview uses a different code path and does not reproduce the crash.

**How to apply:** If "Something went wrong" appears on Android/iOS but web looks fine — first check `app.json` experiments.reactCompiler. Set it to `false`. Do NOT try to fix it with `"use no memo"` per component — that approach is incomplete and misses components.

---

## Fix 3 — Reanimated 4 mixed imports (`rafCallback` / "Object is not a function")

**Symptom:** "Object is not a function" crash originating from `rafCallback`/`onAnimationFrame` in the Reanimated worklet runtime. Appears on Android/iOS, not on web.

**Root cause:** Any file that imports `Animated` from BOTH `react-native` (old API) AND `react-native-reanimated` (new API) causes the Reanimated frame scheduler to conflict with the legacy Animated frame callback. Reanimated 4 (Expo SDK 54) has zero tolerance for this — even `useNativeDriver: false` on the old API is not safe if BOTH libraries are imported in the same file.

**Files that had this bug:**
- `components/camera/LensOverlay.tsx` — imported `{ Animated }` from `react-native` (for FallingEmoji/RisingBubble) AND `RAnimated` from `react-native-reanimated`
- `app/(tabs)/find.tsx` — imported `Animated as RNAnimated` from `react-native` (for toast animations) AND `Animated` from `react-native-reanimated`

**Fix:** Remove ALL old-API Animated imports from `react-native` in any file that also uses `react-native-reanimated`. Convert every `Animated.Value`/`Animated.timing`/`Animated.spring`/`Animated.sequence`/`Animated.parallel`/`Animated.loop` in that file to Reanimated equivalents (`useSharedValue`, `withTiming`, `withSpring`, `withSequence`, `withRepeat`, `withDelay`). Replace `<Animated.View>` → `<RAnimated.View style={useAnimatedStyle(...)}>`.

**How to detect:** `grep -rln "react-native-reanimated" app/ components/ | xargs grep -l "{ Animated\|Animated as RN"` — any hit is a mixed-import crash.

**How to apply:** Before adding any animation to a file already using Reanimated — check imports. Never mix. If the file uses `react-native-reanimated`, ALL animations must use Reanimated.
