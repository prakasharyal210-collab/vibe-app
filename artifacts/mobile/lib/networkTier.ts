/**
 * Network-tier utility for adaptive prefetch sizing.
 *
 * NOTE: The original implementation used @react-native-community/netinfo for
 * live network detection, but that package requires a native rebuild and is
 * not bundled in Expo Go (SDK 54). Using it caused a "NativeModule.RNCNetInfo
 * is null" crash on first viewability event.
 *
 * This version is a pure-JS module — no native imports — and therefore fully
 * OTA-deployable. It returns the wifi-tier config (most generous prefetch
 * sizes) as a safe default for all conditions. Adaptive tier detection can be
 * re-enabled in a custom dev client / EAS production build by restoring the
 * @react-native-community/netinfo listener and the classifyState() logic.
 */

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
 * Per-tier buffer sizes (kept for reference and future re-activation).
 *
 * - wifi: full buffers. No bandwidth concern; maximise scroll smoothness.
 * - cellular-good (4G/5G): modest reduction. Fast enough for comfortable
 *   scrolling but conserves data for users on metered plans.
 * - cellular-poor (3G/2G/unknown): minimal. Aggressive prefetch on a slow
 *   link competes with the content that's actually on screen.
 * - offline: zero images. Data pagination stays alive via lookBuf fallback.
 */
export const NETWORK_CONFIGS: Record<NetworkTier, NetworkPrefetchConfig> = {
  wifi:             { dataBuf: 10, imgBuf: 7 },
  "cellular-good":  { dataBuf: 7,  imgBuf: 5 },
  "cellular-poor":  { dataBuf: 3,  imgBuf: 2 },
  offline:          { dataBuf: 0,  imgBuf: 0 },
};

/**
 * Returns the current network tier. Always "wifi" in this pure-JS fallback
 * build — no native detection available in Expo Go.
 */
export function getNetworkTier(): NetworkTier {
  return "wifi";
}

/**
 * Returns the NetworkPrefetchConfig for the current tier.
 * Synchronous — safe to call on every scroll/viewability event.
 */
export function getNetworkConfig(): NetworkPrefetchConfig {
  return NETWORK_CONFIGS[getNetworkTier()];
}
