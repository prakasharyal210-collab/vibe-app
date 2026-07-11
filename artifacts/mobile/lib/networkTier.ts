/**
 * Network-tier utility for adaptive prefetch sizing.
 *
 * Uses @react-native-community/netinfo (natively bundled in Expo SDK 54,
 * no rebuild required) to classify the current connection into one of four
 * tiers and expose matching buffer-size configs.
 *
 * The tier is cached at module level and updated via a persistent listener so
 * callers (viewability handlers, scroll callbacks) pay near-zero cost per call.
 * A 30-second staleness guard provides belt-and-suspenders protection for
 * environments where the listener might miss an event.
 */

import NetInfo from "@react-native-community/netinfo";

export type NetworkTier = "wifi" | "cellular-good" | "cellular-poor" | "offline";

export interface NetworkPrefetchConfig {
  /**
   * How many data items ahead to proactively fetch (posts, reels, vibe cards).
   * 0 = skip data prefetch entirely (offline mode — rely on existing cache).
   */
  dataBuf: number;
  /**
   * How many image URLs ahead to prefetch via ExpoImage.prefetch().
   * 0 = skip image prefetch entirely.
   */
  imgBuf: number;
}

/**
 * Per-tier buffer sizes.
 *
 * Rationale:
 * - wifi: full buffers. No bandwidth concern; maximise scroll smoothness.
 * - cellular-good (4G/5G): modest reduction. Fast enough for comfortable
 *   scrolling but conserves data for users on metered plans.
 * - cellular-poor (3G/2G/unknown): minimal. Aggressive prefetch on a slow
 *   link competes with the content that's actually on screen — so we pull back
 *   sharply and let the on-render load path handle the rest.
 * - offline: zero. Cache-only; prefetch calls would fail silently and waste
 *   battery on retry loops.
 */
export const NETWORK_CONFIGS: Record<NetworkTier, NetworkPrefetchConfig> = {
  wifi:             { dataBuf: 10, imgBuf: 7 },
  "cellular-good":  { dataBuf: 7,  imgBuf: 5 },
  "cellular-poor":  { dataBuf: 3,  imgBuf: 2 },
  offline:          { dataBuf: 0,  imgBuf: 0 },
};

// ── Internal state ────────────────────────────────────────────────────────────

// Default to "cellular-good" until the first real check arrives — conservative
// enough to avoid wasting bandwidth, permissive enough to not feel sluggish.
let _tier: NetworkTier = "cellular-good";
let _lastFetchMs = 0;
const STALE_THRESHOLD_MS = 30_000;

function classifyState(state: Awaited<ReturnType<typeof NetInfo.fetch>>): NetworkTier {
  if (!state.isConnected || state.type === "none" || state.type === "unknown") {
    return "offline";
  }
  if (state.type === "wifi" || state.type === "ethernet") {
    return "wifi";
  }
  if (state.type === "cellular") {
    // cellularGeneration is typed on the cellular details object.
    const gen = (state.details as { cellularGeneration?: string | null } | null)?.cellularGeneration;
    return gen === "4g" || gen === "5g" ? "cellular-good" : "cellular-poor";
  }
  // vpn, bluetooth, wimax, other — assume reasonable connectivity
  return "cellular-good";
}

// Persistent listener: keeps _tier current without polling.
NetInfo.addEventListener((state) => {
  _tier = classifyState(state);
  _lastFetchMs = Date.now();
});

// Kick off an immediate fetch so we have a real value ASAP (the listener fires
// on the first subscription but may lag by one event loop tick).
NetInfo.fetch()
  .then((state) => {
    _tier = classifyState(state);
    _lastFetchMs = Date.now();
  })
  .catch(() => {});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the cached network tier. Synchronous — safe to call on every
 * scroll/viewability event. If the cached value is stale (> 30s) and the
 * NetInfo listener hasn't fired, it kicks off a background re-fetch.
 */
export function getNetworkTier(): NetworkTier {
  if (Date.now() - _lastFetchMs > STALE_THRESHOLD_MS) {
    // Background refresh — does not block the caller.
    NetInfo.fetch()
      .then((state) => {
        _tier = classifyState(state);
        _lastFetchMs = Date.now();
      })
      .catch(() => {});
    // Return the (possibly stale) cached tier immediately.
  }
  return _tier;
}

/**
 * Returns the NetworkPrefetchConfig for the current tier.
 * Convenience wrapper around getNetworkTier() + NETWORK_CONFIGS lookup.
 */
export function getNetworkConfig(): NetworkPrefetchConfig {
  return NETWORK_CONFIGS[getNetworkTier()];
}
