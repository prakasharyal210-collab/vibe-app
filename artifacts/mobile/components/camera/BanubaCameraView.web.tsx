import React, { forwardRef, useImperativeHandle } from "react";
import { View } from "react-native";

export interface BanubaHandle {
  loadEffect: (effectName: string | null) => void;
  takeScreenshot: (outputPath: string) => void;
  startVideoRecording: (outputPath: string) => void;
  stopVideoRecording: () => void;
}

interface Props {
  style?: object;
  onScreenshotReady?: (filePath: string) => void;
  onVideoRecordingFinished?: (filePath: string) => void;
  facing?: "front" | "back";
}

export const BanubaCameraView = forwardRef<BanubaHandle, Props>(
  ({ style }, ref) => {
    useImperativeHandle(ref, () => ({
      loadEffect: () => {},
      takeScreenshot: () => {},
      startVideoRecording: () => {},
      stopVideoRecording: () => {},
    }));
    return <View style={style} />;
  },
);
BanubaCameraView.displayName = "BanubaCameraViewWeb";
