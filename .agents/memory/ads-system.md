---
name: Vibe ads system
description: How ads are injected into feed/reels, where house ads live, and how Supabase RPCs connect.
---

## Core files
- `artifacts/mobile/lib/ads.ts` — all ad types, house ads, `insertAdsInFeed`, `insertAdsInReels`, `loadFeedAds`, tracking helpers, `handleAdCta`, `hideAd`
- `artifacts/mobile/components/AdCard.tsx` — Facebook-style feed ad card (advertiser header, media/gradient, CTA button, three-dot menu)
- `artifacts/mobile/components/ReelAdCard.tsx` — Full-screen TikTok-style reel ad (gradient bg, 5s skip countdown, animated CTA slide-up)
- `artifacts/mobile/app/advertise.tsx` — "Advertise on Vibe" form screen (format, content, targeting, budget, duration, submit)
- `artifacts/mobile/supabase_ads_migration.sql` — Complete SQL to run in Supabase dashboard

## Insertion logic
- Feed: `insertAdsInFeed(filteredPosts, feedAds)` — ad after every 4th post
- Reels: `insertAdsInReels(reels, reelAds)` — ad after every 3rd reel; `displayReels` useMemo in index.tsx; `getItemLayout` still works because ReelAdCard is SCREEN_H tall

## House ads fallback
- `HOUSE_ADS` (5 items) used for feed when Supabase RPC `get_feed_ads` is unavailable or user is logged out
- `HOUSE_REEL_ADS` (3 items) used for reels
- Fallback is always set — there is never a case with zero ads

## Why: feed/reels tabs both use stable data → FlatList re-renders only when state changes. insertAds is called inline inside the TABS.map render; no extra useMemo needed for feed (but useMemo IS used for displayReels in index.tsx since it's outside a map).

## EAS / eas-cli note
- Install eas-cli with `npx eas-cli@latest` from Shell, NOT as a workspace dep (breaks metro-config via expo/virtual/env)
