---
name: Android black screen — iOS-only top-level imports
description: Top-level imports of iOS-only modules crash entire tab layout on Android, causing black screen on every tab
---

## Rule

Never have top-level `import` statements for iOS-only native modules anywhere in the shared tab layout (or any file loaded by every screen).

**Why:** On Android, when Metro evaluates a module that imports an iOS-only package with missing native bindings (`expo-glass-effect`, `expo-router/unstable-native-tabs`), the entire module throws at evaluation time — before any component renders. `Platform.OS === "ios"` guards on usage do NOT protect against import-time crashes.

**How to apply:**
- `expo-glass-effect` — removed entirely; the `NativeTabLayout` (Liquid Glass tabs, iOS 26+ only) was dropped from `(tabs)/_layout.tsx`. All platforms now use `ClassicTabLayout`.
- `expo-router/unstable-native-tabs` (NativeTabs, Icon, Label) — removed; was only used in `NativeTabLayout`.
- `expo-symbols` (SymbolView) — kept; it's a real Expo SDK package with Android stubs; safe to import top-level. Still used in `TabIcon` guarded by `isIOS ? <SymbolView> : <Ionicons>`.
- If ever re-introducing iOS-only modules, use platform-split files (`.ios.tsx` / `.android.tsx`) or inline `require()` inside `if (Platform.OS === 'ios')` blocks so Metro tree-shakes the native dependency.
