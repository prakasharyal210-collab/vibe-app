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

**All files fixed (complete list — all 10):**
- `components/camera/LensOverlay.tsx` — was MIXED (FallingEmoji/RisingBubble used old Animated)
- `app/(tabs)/find.tsx` — was MIXED (toast used old Animated)
- `components/AICaptionSheet.tsx` — was MIXED (sheet slide used old Animated.timing)
- `components/MusicPickerSheet.tsx` — was MIXED (sheet slide used old Animated.timing)
- `components/StickerPickerModal.tsx` — was MIXED (sheet slide used old Animated.timing)
- `components/CuratedFeedList.tsx` — was MIXED (fadeAnim used old Animated.timing)
- `components/AchievementModal.tsx` — was OLD-ONLY but mounted inside find.tsx; converted to pure Reanimated (Sparkle component, slideAnim/opacityAnim/badgeScale/shineAnim)
- `app/(tabs)/create.tsx` — was MIXED (26 old calls: FocusRing, DraggableTextOverlay, CelebrationModal confetti, controlsOpacity, timerScaleAnim)
- `components/JyotishaTab.tsx` — dead import: `Animated` destructured from `react-native` (never used in old API, just sitting in import line) alongside `RAnimated` from reanimated; removed dead import
- `app/(tabs)/profile.tsx` — dead import: same pattern, `Animated` destructured from `react-native` alongside `RAnimated` from reanimated; removed dead import

**create.tsx conversion details:**
- FocusRing: `useRef(new Animated.Value)` → `useSharedValue` + `withSpring` + `withDelay`
- DraggableTextOverlay: `PanResponder` + `Animated.ValueXY` + `Animated.event` → `Gesture.Pan()` + `GestureDetector` + `runOnJS` (from react-native-gesture-handler)
- CelebrationModal: extracted `ConfettiParticle` sub-component (each particle owns its own shared values); `cardScale/fadeIn/checkScale` → `useSharedValue` + `withSpring/withTiming/withDelay`
- `controlsOpacity` + `timerScaleAnim`: `useRef(new Animated.Value)` → `useSharedValue` + `useAnimatedStyle`; 9 `<Animated.View/Text>` JSX usages → `<RAnimated.View/Text style={controlsStyle/timerScaleStyle}>`
- `PanResponder` (ZoomSlider) retained in react-native import — PanResponder alone without old Animated is safe; only `Animated` was removed

**Fix:** Remove ALL old-API Animated imports from `react-native` in any file that also uses `react-native-reanimated`. Convert every `Animated.Value`/`Animated.timing`/`Animated.spring`/`Animated.sequence`/`Animated.parallel`/`Animated.loop` in that file to Reanimated equivalents (`useSharedValue`, `withTiming`, `withSpring`, `withSequence`, `withRepeat`, `withDelay`). Replace `<Animated.View>` → `<RAnimated.View style={useAnimatedStyle(...)}>`.

**Easing from Reanimated:** When using `Easing` with Reanimated's `withTiming`, import `Easing` from `react-native-reanimated`, NOT from `react-native`.

**How to detect mixed files:**
```bash
grep -rln "react-native-reanimated" app/ components/ | while read f; do
  n=$(grep -c "new Animated\.Value\|Animated\.timing\|Animated\.spring\|Animated\.sequence\|Animated\.parallel" "$f")
  echo "$n $f"
done | grep -v "^0 "
```
Any output = MIXED file that will crash on Android.

**How to apply:** Before adding any animation to a file already using Reanimated — check imports. Never mix. If the file uses `react-native-reanimated`, ALL animations must use Reanimated. `PanResponder` (gesture tracking only, no Animated.Value) is safe to keep alongside Reanimated.
