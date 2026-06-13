/**
 * LensOverlay — AR lens layer rendered on top of the camera.
 *
 * When a lens is selected:
 *   • In a dev/prod build → mounts BanubaCameraView (Banuba takes the camera)
 *   • In Expo Go           → shows the "requires dev build" fallback from
 *                            BanubaCameraView automatically
 * When no lens is selected → renders nothing (expo-camera owns the camera).
 */

import React from "react";
import { StyleSheet } from "react-native";
import { BanubaCameraView, BanubaHandle } from "./BanubaCameraView";

interface Props {
  lensId: string | null;
  facing?: "front" | "back";
  banubaRef?: React.RefObject<BanubaHandle | null>;
  onCameraExclusive?: (exclusive: boolean) => void;
  onScreenshotReady?: (path: string) => void;
  onVideoRecordingFinished?: (path: string) => void;
}

export default function LensOverlay({
  lensId,
  facing = "front",
  banubaRef,
  onCameraExclusive,
  onScreenshotReady,
  onVideoRecordingFinished,
}: Props) {
  const prevLensId = React.useRef<string | null>(null);
  const internalRef = React.useRef<BanubaHandle | null>(null);
  const ref = (banubaRef ?? internalRef) as React.RefObject<BanubaHandle | null>;

  // Notify parent when Banuba camera exclusivity changes
  React.useEffect(() => {
    const wasActive = prevLensId.current !== null;
    const isActive = lensId !== null;
    if (!wasActive && isActive) onCameraExclusive?.(true);
    else if (wasActive && !isActive) onCameraExclusive?.(false);
    prevLensId.current = lensId;
  }, [lensId, onCameraExclusive]);

  // Load / unload effect when lensId changes
  React.useEffect(() => {
    if (!ref.current) return;
    ref.current.loadEffect(lensId);
  }, [lensId]);

  if (!lensId) return null;

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
