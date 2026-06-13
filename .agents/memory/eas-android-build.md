---
name: EAS Android build fixes
description: Why Android EAS builds fail for Gundruk (RN 0.81.5 + Expo SDK 54) and the exact babel.config.js pattern that makes them succeed.
---

## The problem

The `hermesc` binary bundled with `react-native@0.81.5` at `sdks/hermesc/linux64-bin/hermesc` is **HBC bytecode version 96** (Hermes 0.12.0 era). It is called both by:
- `expo export` locally (Metro phase)
- Gradle's `BundleHermesCTask` on EAS Linux build workers (same binary, via `%OS-BIN%` = `linux64-bin`)

This binary rejects two things that modern React Native code contains everywhere:

1. **Class declarations** — `class Foo extends Bar {}` → `error: invalid statement encountered`
2. **Async arrow functions** — `async (x) => {}` → `error: async functions are unsupported`  
   (Regular async functions `async function foo(){}` work fine.)

**Why:** `babel-preset-expo` for Hermes targets intentionally skips class/async-arrow transforms, assuming Hermes handles them natively. The Hermes *runtime* on the device does, but the linux64-bin *compiler* used during the build does not.

## The fix

`artifacts/mobile/babel.config.js` uses **preset reversal** — Babel presets execute in reverse array order, so placing the class+arrow preset first in the array makes it run LAST (after babel-preset-expo has already stripped TypeScript/Flow/JSX):

```js
const classTransformPreset = function () {
  return {
    plugins: [
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
      ['@babel/plugin-transform-classes', { loose: true }],
      ['@babel/plugin-transform-arrow-functions'],   // fixes async arrows
    ],
  };
};

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      classTransformPreset,          // runs LAST (first in array → last executed)
      ['babel-preset-expo', { unstable_transformImportMeta: true }],  // runs FIRST
    ],
  };
};
```

**Why preset reversal and not explicit plugins?** Explicit `plugins: [...]` run BEFORE presets. If class transforms run before `babel-preset-expo`, they see raw TypeScript `declare class` syntax and crash with "Missing class properties transform" or "TypeScript declare fields must first be transformed".

**How to apply:** Any time `expo export` or an EAS Android build fails with hermesc syntax errors, check whether the issue is classes or async arrows (test directly: `hermesc -emit-binary -out /tmp/t.hbc /tmp/t.js`). Both are handled by the current babel.config.js.

## Package dependencies required (all in devDependencies)
- `@babel/plugin-transform-arrow-functions`
- `@babel/plugin-transform-class-properties`
- `@babel/plugin-transform-classes`
- `@babel/plugin-transform-private-methods`
- `@babel/plugin-transform-private-property-in-object`

## newArchEnabled must stay true with Reanimated 4.x

`react-native-reanimated@4.x` (used by Expo SDK 54) has a hard Gradle `assertNewArchitectureEnabledTask` that **aborts the build** if `newArchEnabled=false`. Never set it to false.

`react-native-deepar@0.11.0` doesn't declare New Arch support, but RN 0.81's old-arch interop layer lets it run on New Arch. The workaround of `newArchEnabled=false` is counterproductive — it breaks Reanimated 4.

Two places to keep `true`: `app.config.js` (`newArchEnabled: true`) and `android/gradle.properties` (`newArchEnabled=true`).

## EAS build phase progression (diagnostic guide)
- `"Bundle JavaScript build phase"` error → Metro/Babel crash; fix babel.config.js ordering
- `"Run gradlew"` error → Gradle or hermesc crash; after JS bundling succeeds
- `FINISHED` with APK URL → success
