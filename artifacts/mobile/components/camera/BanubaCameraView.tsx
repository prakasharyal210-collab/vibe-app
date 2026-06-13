/**
 * BanubaCameraView — wraps Banuba Face AR SDK.
 *
 * Architecture:
 *   • In Expo Go / when the native module is not linked → renders a
 *     "requires a dev build" fallback; all methods are no-ops.
 *   • In a dev/production build → initialises BanubaSdkManager once,
 *     attaches the EffectPlayerView, opens the camera, starts the player,
 *     and exposes loadEffect / capture methods via an imperative ref.
 *
 * Capture:
 *   • takeScreenshot(path)        — saves JPEG; fires onScreenshotReady
 *   • startVideoRecording(path)   — starts MP4 capture
 *   • stopVideoRecording()        — stops and fires onVideoRecordingFinished
 */

import Constants from "expo-constants";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

// ── Public handle exposed via ref ─────────────────────────────────────────────
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

// ── Runtime guard ─────────────────────────────────────────────────────────────
const isExpoGo = Constants.executionEnvironment === "storeClient";

// Lazy-require so Metro doesn't bundle the native module in Expo Go
let BanubaSdkManager: any = null;
let EffectPlayerView: React.ComponentType<any> | null = null;

if (!isExpoGo) {
  try {
    const mod = require("@banuba/react-native");
    BanubaSdkManager = mod.default;
    EffectPlayerView = mod.EffectPlayerView;
  } catch {
    // Native module not linked (rare — should not happen in a dev/prod build)
  }
}

// ── Token ─────────────────────────────────────────────────────────────────────
const CLIENT_TOKEN =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.banubaClientToken ?? "";

// ── Effect path helpers ───────────────────────────────────────────────────────
// Banuba expects a bare folder name on both platforms ("effects/FolderName").
// The SDK resolves this relative to its bundled assets directory.
function resolveEffectPath(effectName: string): string {
  return `effects/${effectName}`;
}

// ── Fallback (Expo Go / unlinked module) ──────────────────────────────────────
const FallbackView = forwardRef<BanubaHandle, Props>(({ style }, ref) => {
  useImperativeHandle(ref, () => ({
    loadEffect: () => {},
    takeScreenshot: () => {},
    startVideoRecording: () => {},
    stopVideoRecording: () => {},
  }));

  return (
    <View style={[fallbackStyles.container, style]}>
      <Text style={fallbackStyles.text}>
        ✨ AR Lenses{"\n"}require a dev build
      </Text>
    </View>
  );
});

const fallbackStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" },
  text: { color: "rgba(255,255,255,0.4)", fontSize: 14, textAlign: "center", lineHeight: 22 },
});
FallbackView.displayName = "BanubaFallbackView";

// ── Native view ───────────────────────────────────────────────────────────────
const NativeView = forwardRef<BanubaHandle, Props>(
  ({ style, onScreenshotReady, onVideoRecordingFinished, facing = "front" }, ref) => {
    const initializedRef = useRef(false);

    // ── Initialise SDK once ───────────────────────────────────────────────────
    useEffect(() => {
      if (initializedRef.current || !BanubaSdkManager) return;
      initializedRef.current = true;

      BanubaSdkManager.initialize([], CLIENT_TOKEN);

      return () => {
        BanubaSdkManager?.stopPlayer?.();
      };
    }, []);

    // ── Subscribe to capture events ───────────────────────────────────────────
    useEffect(() => {
      if (!BanubaSdkManager) return;

      const subShot = BanubaSdkManager.onScreenshotReady?.((payload: any) => {
        const p =
          typeof payload === "string" ? payload : payload?.path ?? payload?.uri ?? "";
        onScreenshotReady?.(p);
      });

      const subVid = BanubaSdkManager.onVideoRecordingFinished?.((payload: any) => {
        const p =
          typeof payload === "string" ? payload : payload?.path ?? payload?.uri ?? "";
        onVideoRecordingFinished?.(p);
      });

      return () => {
        subShot?.remove?.();
        subVid?.remove?.();
      };
    }, [onScreenshotReady, onVideoRecordingFinished]);

    // ── Start player after the view mounts ────────────────────────────────────
    useEffect(() => {
      if (!BanubaSdkManager) return;
      // Small delay lets the native view register before attachView is called
      const t = setTimeout(() => {
        BanubaSdkManager.attachView();
        BanubaSdkManager.openCamera();
        BanubaSdkManager.startPlayer();
        // Mirror front camera for natural selfie feel
        BanubaSdkManager.setCameraFacing?.(facing === "front");
      }, 80);
      return () => clearTimeout(t);
    }, [facing]);

    // ── Imperative handle ─────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      loadEffect: (effectName) => {
        if (!BanubaSdkManager) return;
        if (!effectName) {
          // Unload current effect (load a blank config)
          BanubaSdkManager.loadEffect?.("");
          return;
        }
        BanubaSdkManager.loadEffect?.(resolveEffectPath(effectName));
      },

      takeScreenshot: (outputPath) => {
        BanubaSdkManager?.takeScreenshot?.(outputPath);
      },

      startVideoRecording: (outputPath) => {
        BanubaSdkManager?.startVideoRecording?.(outputPath, false);
      },

      stopVideoRecording: () => {
        BanubaSdkManager?.stopVideoRecording?.();
      },
    }));

    if (!EffectPlayerView) return null;

    return <EffectPlayerView style={[StyleSheet.absoluteFill, style]} />;
  }
);
NativeView.displayName = "BanubaNativeView";

// ── Export the right component ────────────────────────────────────────────────
export const BanubaCameraView =
  isExpoGo || !BanubaSdkManager ? FallbackView : NativeView;
