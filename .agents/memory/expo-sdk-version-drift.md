---
name: Expo SDK version drift — AnyTypeCache crash
description: expo-device/notifications/build-properties drifted to SDK 56 while core expo is SDK 54, causing a fatal Android runtime crash. How to detect and fix.
---

## The rule
All `expo-*` plugin packages must match the SDK version of the core `expo` package. Mismatched packages cause `java.lang.NoClassDefFoundError: Failed resolution of: Lexpo/modules/kotlin/types/AnyTypeCache` at Android runtime — the app starts, shows a white screen or crashes immediately, and the Expo "Send feedback" dialog appears.

**Why:** SDK 56 modules require a newer `expo-modules-core` that introduces `AnyTypeCache`. SDK 54 ships `expo-modules-core@3.0.30`, which doesn't have that class. The crash is a native Kotlin class resolution failure, not a JS error.

## How to detect
- Open `artifacts/mobile/package.json` and check every `expo-*` package version.
- Compare against `bundledNativeModules.json` inside the installed expo package:
  ```js
  const data = require('./node_modules/.pnpm/expo@54.0.35_.../node_modules/expo/bundledNativeModules.json');
  ```
- Any package whose installed version doesn't match the manifest entry is wrong.

## What was wrong (SDK 54 project)
| Package | Wrong version | Correct version |
|---|---|---|
| expo-build-properties | ^56.0.18 | ~1.0.10 |
| expo-device | ^56.0.4 | ~8.0.10 |
| expo-notifications | ^56.0.17 | ~0.32.17 |

## Fix
1. Update `artifacts/mobile/package.json` to use the versions from `bundledNativeModules.json`.
2. Run `pnpm install --filter @workspace/mobile`.
3. Trigger a new EAS build — the `AnyTypeCache` crash will be gone.

**How to apply:** Any time an EAS build produces a native `NoClassDefFoundError` involving `expo/modules/kotlin/*`, suspect SDK version drift in one of the expo-* plugin packages. Always validate all expo-* packages against bundledNativeModules.json before investigating further.
