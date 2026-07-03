import React from "react";
import { View } from "react-native";

export type BanubaHandle = {
  loadEffect: (effectName: string | null) => void;
  takeScreenshot: (outputPath: string) => void;
  startVideoRecording: (outputPath: string) => void;
  stopVideoRecording: () => void;
};

interface Props {
  lensId: string | null;
  facing?: "front" | "back";
  banubaRef?: React.RefObject<any>;
  onCameraExclusive?: (exclusive: boolean) => void;
  onScreenshotReady?: (path: string) => void;
  onVideoRecordingFinished?: (path: string) => void;
}

export default function LensOverlay({ }: Props) {
  return <View />;
}
