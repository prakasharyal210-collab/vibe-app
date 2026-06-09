---
name: Camera lens system
description: 33 AR lens overlays on the camera screen; architecture, constraints, and positioning constants.
---

## Architecture

- **LensData.ts** — catalog of 33 lenses (id, name, icon, category)
- **LensSelector.tsx** — bottom panel, category tabs + horizontal scroll
- **LensOverlay.tsx** — all 33 lens effects as React components
- **create.tsx** — wired via `activeLensId` + `showLensPicker` state; Lens button in side tools

## How overlays work

No native face tracking. All overlays use fixed percentage-based screen anchors tuned for front-camera portrait selfie framing. Anchors are in `LensOverlay.tsx` at the top: `FC` (face center), `EAR_L/R`, `CROWN`, `EYE_L/R`, `NOSE`, `MOUTH`, `CHEEK_L/R`.

Face-dependent lenses (dog ears, cat whiskers, etc.) use SVG via react-native-svg over the full-screen camera view. Particle lenses (snow, confetti, butterflies) use `FallingEmoji` / `RisingBubble` components with recursive Animated.timing callbacks.

## Critical React hooks rule

**Never call hooks inside `.map()`.** The `ButterfliesLens` and `ChakraLens` originally violated this and were fixed by extracting `Butterfly` and `ChakraOrb` sub-components. Apply the same pattern if adding new animated per-item lenses.

## Adding new lenses

1. Add entry to `LENSES` array in `LensData.ts`
2. Write a new lens component in `LensOverlay.tsx`  
3. Add case to the `switch` in `LensOverlay`
4. If the lens has per-item animations, extract each item as its own component (never call hooks in map)

## Particle animation pattern

Use recursive callback (NOT `Animated.loop`) for particles that need position reset:
```tsx
const run = () => {
  if (!running) return;
  y.setValue(-60);
  Animated.timing(y, { toValue: H + 80, duration, useNativeDriver: true })
    .start(() => { if (running) run(); });
};
```

**Why:** `Animated.loop` doesn't reset Animated.Value to its start; the recursive pattern does.

## Zodiac aura

Colors are in `RASHI_COLORS` map (lowercase key = rashi name, e.g. "scorpio"). Pass `rashi` prop to `LensOverlay` from the camera screen. Defaults to scorpio purple when rashi is null.
