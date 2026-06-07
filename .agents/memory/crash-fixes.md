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
