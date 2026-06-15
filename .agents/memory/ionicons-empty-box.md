---
name: Ionicons empty-box fix
description: Why Ionicons renders empty glyphs (□) in settings-style screens and how to fix it permanently.
---

## The Rule
Never define `Row`, `Card`, `SecLabel`, or any icon-rendering sub-component **inside** a React function component.

## Why
React reconciles components by their **function reference**. When a sub-component is defined inside a parent (e.g. `const Row = (...) => ...` inside `SettingsScreen`), every time the parent re-renders it creates a new function reference. React sees a new component type, unmounts the old tree, and mounts fresh instances — `@expo/vector-icons` loses its initialized glyph during that teardown and shows `□` until it re-inits (sometimes it never does if another re-render interrupts it).

**How to apply:** Move all sub-components that render `<Ionicons>` (or any native-font icon) to **module scope**, outside the default export function. Have them call `useColors()` internally so they don't need `colors` passed as a prop. This gives React a stable type reference — the component is reconciled (updated), never remounted.

## Example fix (settings.tsx pattern)
```tsx
// ✅ Module scope — stable reference
function Row({ icon, iconBg, label, sub, isLast = false, onPress, rightEl }: RowProps) {
  const colors = useColors();          // hook called inside the component, not passed as prop
  return (
    <TouchableOpacity ...>
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={17} color="#fff" />
      </View>
      ...
    </TouchableOpacity>
  );
}

// ❌ Inside parent — new type on every render → remounts → empty glyphs
export default function SettingsScreen() {
  const colors = useColors();
  const Row = (...) => <Ionicons ... />;  // DO NOT DO THIS
}
```

## Files fixed
- `app/settings.tsx` — `SecLabel`, `Card`, `Row` moved to module scope
- `app/notification-settings.tsx` — `NSec`, `NCard`, `NRow` defined at module scope from the start
