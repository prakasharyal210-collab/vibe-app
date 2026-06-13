/**
 * LensOverlay — AR lens layer rendered on top of the camera.
 *
 * Runtime behaviour:
 *   BANUBA_ENABLED=true  + dev/prod build → BanubaCameraView takes the camera
 *   BANUBA_ENABLED=true  + Expo Go        → "requires dev build" fallback (from BanubaCameraView)
 *   BANUBA_ENABLED=false (default)        → "AR Lenses coming soon" placeholder, no Banuba code touched
 */

import Constants from "expo-constants";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

// Resolve the build-time flag set in app.config.js extra
const banubaEnabled =
  (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
    ?.banubaEnabled === true;

// Only import Banuba components when the SDK is included in the build.
// Using inline require() keeps Metro from bundling BanubaCameraView (and its
// native require of @banuba/react-native) in Banuba-disabled builds.
let BanubaCameraView: React.ComponentType<any> | null = null;
let BanubaHandleType: any = null;

if (banubaEnabled) {
  try {
    const mod = require("./BanubaCameraView");
    BanubaCameraView = mod.BanubaCameraView;
  } catch {}
}

export type { BanubaHandle } from "./BanubaCameraView";

interface Props {
  lensId: string | null;
  facing?: "front" | "back";
  banubaRef?: React.RefObject<any>;
  onCameraExclusive?: (exclusive: boolean) => void;
  onScreenshotReady?: (path: string) => void;
  onVideoRecordingFinished?: (path: string) => void;
}

// ── Placeholder shown when Banuba is disabled at build time ──────────────────
function ComingSoonPlaceholder({ style }: { style?: object }) {
  return (
    <View style={[placeholderStyles.container, style]}>
      <Text style={placeholderStyles.emoji}>✨</Text>
      <Text style={placeholderStyles.title}>AR Lenses</Text>
      <Text style={placeholderStyles.sub}>Coming soon</Text>
    </View>
  );
}

const placeholderStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emoji: { fontSize: 32 },
  title: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  sub: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
});

// ── Main component ────────────────────────────────────────────────────────────
export default function LensOverlay({
  lensId,
  facing = "front",
  banubaRef,
  onCameraExclusive,
  onScreenshotReady,
  onVideoRecordingFinished,
}: Props) {
  const prevLensId = React.useRef<string | null>(null);
  const internalRef = React.useRef<any>(null);
  const ref = banubaRef ?? internalRef;

  // Notify parent when Banuba camera exclusivity changes
  React.useEffect(() => {
    const wasActive = prevLensId.current !== null;
    const isActive = lensId !== null;
    if (!wasActive && isActive) onCameraExclusive?.(true);
    else if (wasActive && !isActive) onCameraExclusive?.(false);
    prevLensId.current = lensId;
  }, [lensId, onCameraExclusive]);

  // Load / unload effect when lensId changes (Banuba-enabled builds only)
  React.useEffect(() => {
    if (!banubaEnabled || !ref.current) return;
    ref.current.loadEffect(lensId);
  }, [lensId]);

  // Nothing to show when no lens is selected
  if (!lensId) return null;

  // Banuba disabled at build time → show placeholder instead
  if (!banubaEnabled || !BanubaCameraView) {
    return <ComingSoonPlaceholder style={StyleSheet.absoluteFill} />;
  }

  return (
    <BanubaCameraView
      ref={ref}
      style={StyleSheet.absoluteFill}
      facing={facing}
      onScreenshotReady={onScreenshotReady}
      onVideoRecordingFinished={onVideoRecordingFinished}
    />
  );
}
