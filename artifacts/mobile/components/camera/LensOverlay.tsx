import React, { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { DeepARView, DeepARHandle } from "./DeepARView";
import { LENSES } from "./LensData";

interface Props {
  lensId: string | null;
  onCameraExclusive?: (exclusive: boolean) => void;
}

export default function LensOverlay({ lensId, onCameraExclusive }: Props) {
  const deepARRef = useRef<DeepARHandle>(null);
  const prevLensId = useRef<string | null>(null);

  useEffect(() => {
    const wasActive = prevLensId.current !== null;
    const isActive = lensId !== null;

    if (!wasActive && isActive) {
      onCameraExclusive?.(true);
    } else if (wasActive && !isActive) {
      onCameraExclusive?.(false);
    }

    prevLensId.current = lensId;
  }, [lensId, onCameraExclusive]);

  useEffect(() => {
    if (!lensId) return;
    const lens = LENSES.find((l) => l.id === lensId);
    deepARRef.current?.switchEffect(lens?.effectPath ?? null);
  }, [lensId]);

  if (!lensId) return null;

  return (
    <DeepARView
      ref={deepARRef}
      style={StyleSheet.absoluteFill}
    />
  );
}
