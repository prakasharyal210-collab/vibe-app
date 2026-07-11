---
name: cardUrl resize=contain rule
description: Why the card image preset must use resize=contain, not resize=cover, and how cover silently breaks aspect ratio detection in PostCard.
---

## The rule

`imageUrl.ts` PRESETS.card must always use `resize: "contain"`. Never change it back to `"cover"`.

**Why:** Supabase's `resize=cover` with equal width and height (800×800) crops every image to a perfect square server-side. expo-image's `onLoad` event then reports `e.source.width = 800, e.source.height = 800` → ratio = 1.0 — regardless of the original image shape. This overwrites the correct `knownAspectRatio` in the module-level `_ratioCache` and triggers a spurious `LayoutAnimation` resize inside the FlatList — the exact same black-frame glitch that `image_width`/`image_height` storage was meant to eliminate.

**How to apply:** The visual appearance is unchanged. Client-side `contentFit="cover"` on the ExpoImage component handles cropping to fill the container. Only the *file* downloaded from Supabase changes: with `resize=contain` it preserves the natural aspect ratio (a 4:3 landscape comes back as 800×600, not 800×800). This makes `onLoad` dimensions accurate.

`thumbnail` preset intentionally stays `resize=cover` — thumbnails are always displayed as fixed squares so the server-side square crop is correct and saves bandwidth.

## Companion guard in PostCard.tsx

Even with `resize=contain`, the `onLoad` handler in the carousel FlatList renderItem must include `&& !knownAspectRatio`:

```jsx
onLoad={index === 0 && !knownAspectRatio ? (e) => handleMediaLoad(item, e.source?.width, e.source?.height) : undefined}
```

This ensures posts with stored `image_width`/`image_height` never trigger the onLoad resize path at all — the stored dimensions are always authoritative.
