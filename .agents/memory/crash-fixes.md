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

---

## Fix 4 — babel-preset-expo version mismatch + missing Reanimated babel plugin

**Symptom:** Same "Object is not a function" / rafCallback crash persists on Android even after fixing all mixed imports. Metro logs show NO crash — app loads fine — but crash happens when interacting with animated components (swipe gestures, etc.).

**Root cause 1:** `babel-preset-expo@56.x` installed in an Expo SDK 54 project. Expo SDK 54 requires `babel-preset-expo@~54.0.x`. The mismatch means the Reanimated plugin bundled inside babel-preset-expo may not correctly identify and serialize gesture callbacks (`.onUpdate`, `.onEnd`) and `useAnimatedStyle` callbacks as worklets. Result: worklet functions are NOT serialized → "Object is not a function" when Reanimated tries to call them on the UI thread.

**Root cause 2:** `react-native-reanimated/plugin` was not explicitly added to `babel.config.js`. Without it (relying solely on babel-preset-expo auto-inclusion), the plugin can run at the wrong point in the transform chain — before `classTransformPreset` arrow-function transforms — or be silently skipped by a mismatched babel-preset-expo version.

**Fix:**
1. Downgrade `babel-preset-expo` to `~54.0.10` in package.json and reinstall.
2. In `babel.config.js`: add `'react-native-reanimated/plugin'` as the **last plugin** inside `classTransformPreset` (which runs after babel-preset-expo), and pass `reanimated: false` to babel-preset-expo to disable its auto-inclusion and prevent double-processing.
3. Clear Metro cache: delete `.expo/` and `node_modules/.cache/`, then restart the Expo workflow.
4. On-device: force-close Expo Go, go to Android Settings → Apps → Expo Go → Clear Cache, then rescan the QR code.

**Why the plugin order matters:** Babel presets run in REVERSE array order, so babel-preset-expo runs FIRST and classTransformPreset runs SECOND. The Reanimated plugin must run LAST (after all other transforms including arrow-function transforms) so its worklet serialization is the final operation. Placing it as the last entry in classTransformPreset's plugins array guarantees this.

**Always check:** If `babel-preset-expo` version ≠ Expo SDK major version, it will print a warning like `babel-preset-expo@56.0.14 - expected version: ~54.0.10`. Treat this warning as a critical error — downgrade immediately.

---

## Fix 5 — Wrong worklets babel plugin (react-native-reanimated/plugin vs react-native-worklets/plugin)

**Symptom:** "Object is not a function" / rafCallback crash on Android when interacting with swipe cards or any animated component. Metro logs show clean load. The `withSpring(..., callback)` or `withTiming(..., callback)` callback is the crash site — it runs on the UI thread and must be a worklet, but it isn't.

**Root cause:** Reanimated 4.x uses `react-native-worklets` as a standalone worklet engine. The correct babel plugin is `react-native-worklets/plugin`, NOT `react-native-reanimated/plugin`. When `react-native-worklets` is installed:
- `babel-preset-expo` v54 auto-detects it and uses `react-native-worklets/plugin`
- Using `react-native-reanimated/plugin` instead fails to compile animation callbacks as worklets
- Result: callbacks passed to `withSpring`, `withTiming`, `withRepeat` etc. are plain JS functions — they crash when Reanimated tries to invoke them on the UI thread

**Fix:** In `babel.config.js`, use `'react-native-worklets/plugin'` (NOT `'react-native-reanimated/plugin'`) as the last plugin in classTransformPreset. Set `reanimated: false` in babel-preset-expo options to prevent double-inclusion.

**How to detect which plugin to use:** Check `package.json` for `react-native-worklets`. If present → use `react-native-worklets/plugin`. If absent → use `react-native-reanimated/plugin`. babel-preset-expo v54's auto-selection logic mirrors this.

**Why the crash shows as rafCallback:** Reanimated's animation loop (rafCallback) processes each animation frame and invokes the callback passed to `withSpring/withTiming/etc`. When that callback is an uncompiled plain function (not a worklet), calling it on the UI thread produces "Object is not a function".

---

## Fix 6 — Calling JS globals (setTimeout, setInterval) inside withSpring/withTiming callbacks

**Symptom:** "Object is not a function" / rafCallback crash on Android immediately after the Find Vibe tab mounts. No error in Metro logs. Crash happens ~1 second after mount (animation start delay).

**Root cause:** The `withSpring(value, config, callback)` third argument runs on the **UI thread** (it is a worklet). Any JS-only global — `setTimeout`, `setInterval`, `console.log`, `Alert`, `fetch`, etc. — does not exist in the worklet runtime. Calling `setTimeout(fn, ms)` from inside that callback crashes with "Object is not a function" because `setTimeout` is `undefined` in the worklet context.

**Example crash pattern (find.tsx `DailyVibeSection`):**
```js
// WRONG — setTimeout called from UI thread (worklet) context
pulse.value = withSpring(1.03, {}, () => {
  pulse.value = withSpring(1, {});
  setTimeout(doPulse, 2500); // ← CRASH: setTimeout is undefined in worklet
});
```

**Fix:** Never call JS globals inside `withSpring/withTiming/withSequence` callbacks. Either:
1. Use `runOnJS(myJsFunction)()` for any JS-thread call inside the callback
2. Better: avoid completion callbacks entirely — use `withSequence` + JS-thread `setInterval` to schedule repeating animations:
```js
// CORRECT — animation driven by JS-thread setInterval, no callback needed
const doPulse = () => {
  pulse.value = withSequence(withSpring(1.03, {}), withSpring(1, {}));
};
doPulse();
const timer = setInterval(doPulse, 2500);
return () => { clearInterval(timer); cancelAnimation(pulse); };
```

**How to find all occurrences:**
```bash
grep -rn "withSpring\|withTiming" --include="*.tsx" | grep -E "setTimeout|setInterval|console\." | grep -v "runOnJS" | grep -v "onPress"
```

**Rule:** Everything inside a `withSpring/withTiming/withRepeat` callback is a worklet. Treat it like a `'worklet'` function — no JS globals, no closure variables from the JS thread (unless they were also passed through the worklet serializer).

**How to detect mixed files:**
```bash
grep -rln "react-native-reanimated" app/ components/ | while read f; do
  n=$(grep -c "new Animated\.Value\|Animated\.timing\|Animated\.spring\|Animated\.sequence\|Animated\.parallel" "$f")
  echo "$n $f"
done | grep -v "^0 "
```
Any output = MIXED file that will crash on Android.

**How to apply:** Before adding any animation to a file already using Reanimated — check imports. Never mix. If the file uses `react-native-reanimated`, ALL animations must use Reanimated. `PanResponder` (gesture tracking only, no Animated.Value) is safe to keep alongside Reanimated.
