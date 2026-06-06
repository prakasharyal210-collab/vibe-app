---
name: Vibe Design System
description: Dark Luxury color palette, glassmorphism patterns, and tab bar conventions for the Vibe mobile app.
---

## Color Palette (dark mode)

| Token | Value |
|-------|-------|
| background | `#080810` |
| card | `#0F0F1A` |
| input | `#13131F` |
| primary | `#8B5CF6` |
| active tint | `#A78BFA` |
| inactive | `#6B7280` |
| muted text | `#9CA3AF` |
| border | `rgba(255,255,255,0.08)` |

## Gradient

Standard 3-stop gradient: `#8B5CF6 → #EC4899 → #F97316` (purple → pink → orange)

## Tab Bar (ClassicTabLayout)

Floating glass pill: `position: absolute, left: 16, right: 16, bottom: 10, borderRadius: 28, height: 68`. iOS uses BlurView intensity:60 tint:dark. Android uses `rgba(8,8,16,0.96)` background. Center Create button uses the 3-stop gradient with purple glow shadow.

## PostCard

- `CARD_MARGIN = 12`, `CARD_W = SCREEN_WIDTH - 24`
- Container: `borderRadius: 20, overflow: hidden, marginHorizontal: 12, marginBottom: 20`
- Action bar: `backgroundColor: rgba(255,255,255,0.03), borderTopWidth: 1, borderTopColor: rgba(255,255,255,0.06)`
- Image FlatList items must use `width: CARD_W` for `pagingEnabled` to work correctly.

## Ads System (DO NOT MODIFY)

`AdCard.tsx`, `ReelAdCard.tsx`, `lib/ads.ts` use older purple `#7C3AED` colors intentionally — these files are owned by the ads system and should never be updated during design refreshes.

**Why:** The ads system was completed as a separate feature and must remain stable. Color parity with the rest of the app is a lower priority than stability.

## Glassmorphism Pattern

- Card/container: `backgroundColor: rgba(255,255,255,0.04), borderWidth: 1, borderColor: rgba(255,255,255,0.08), borderRadius: 24`
- Input focus: `borderColor: rgba(139,92,246,0.6), backgroundColor: rgba(139,92,246,0.06)`
- Action buttons on reels: `backgroundColor: rgba(255,255,255,0.1), borderRadius: 14, borderWidth: 1, borderColor: rgba(255,255,255,0.08)`
