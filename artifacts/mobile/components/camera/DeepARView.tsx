import Constants from "expo-constants";
import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { IDeepARHandle, IDeepARProps } from "react-native-deepar";

export interface DeepARHandle {
  switchEffect: (effectPath: string | null) => void;
}

type Props = Omit<IDeepARProps, "apiKey"> & {
  style?: IDeepARProps["style"];
};

const isExpoGo = Constants.executionEnvironment === "storeClient";

let NativeDeepAR: React.ForwardRefExoticComponent<
  IDeepARProps & React.RefAttributes<IDeepARHandle>
> | null = null;

if (!isExpoGo) {
  try {
    NativeDeepAR = require("react-native-deepar").default;
  } catch {
    // native module not linked (e.g. Expo Go)
  }
}

const DeepARFallback = forwardRef<DeepARHandle, Props>((props, ref) => {
  useImperativeHandle(ref, () => ({ switchEffect: () => {} }));
  return (
    <View style={[styles.fallback, props.style]}>
      <Text style={styles.fallbackText}>📸 AR Lenses{"\n"}require a dev build</Text>
    </View>
  );
});
DeepARFallback.displayName = "DeepARFallback";

const DeepARNativeView = forwardRef<DeepARHandle, Props>((props, ref) => {
  const deepARRef = useRef<IDeepARHandle>(null);

  const licenseKey =
    Platform.select({
      android: (Constants.expoConfig?.extra as Record<string, string> | undefined)
        ?.deeparLicenseAndroid,
      ios: (Constants.expoConfig?.extra as Record<string, string> | undefined)
        ?.deeparLicenseIOS,
    }) ?? "";

  useImperativeHandle(ref, () => ({
    switchEffect: (effectPath: string | null) => {
      if (!deepARRef.current) return;
      if (!effectPath) return;
      deepARRef.current.switchEffectWithPath({ path: effectPath, slot: "effect" });
    },
  }));

  if (!NativeDeepAR) return null;

  return (
    <NativeDeepAR
      {...props}
      ref={deepARRef}
      apiKey={licenseKey}
      style={[StyleSheet.absoluteFill, props.style]}
    />
  );
});
DeepARNativeView.displayName = "DeepARNativeView";

export const DeepARView = isExpoGo || !NativeDeepAR
  ? DeepARFallback
  : DeepARNativeView;

const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  fallbackText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 22,
  },
});
