// DeepAR removed — placeholder kept so any stale imports don't break the build.
// Will be replaced with Banuba SDK integration.

import React, { forwardRef, useImperativeHandle } from "react";
import { View } from "react-native";

export interface DeepARHandle {
  switchEffect: (effectPath: string | null) => void;
}

export const DeepARView = forwardRef<DeepARHandle, { style?: object }>(
  (props, ref) => {
    useImperativeHandle(ref, () => ({ switchEffect: () => {} }));
    return <View style={props.style} />;
  }
);
DeepARView.displayName = "DeepARView";
