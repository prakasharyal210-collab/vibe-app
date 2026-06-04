import { useRef } from "react";
import { Dimensions, PanResponder } from "react-native";
import { router } from "expo-router";

const { width: W } = Dimensions.get("window");
const EDGE_PX = 38;
const MIN_DX = 55;

export type MainTab = "index" | "feed" | "find" | "profile";
const ORDER: MainTab[] = ["index", "feed", "find", "profile"];

export function useMainTabSwipe(current: MainTab) {
  const idx = ORDER.indexOf(current);
  const prevTab = idx > 0 ? ORDER[idx - 1] : null;
  const nextTab = idx < ORDER.length - 1 ? ORDER[idx + 1] : null;

  return useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gs) => {
        const approxStartX = evt.nativeEvent.pageX - gs.dx;
        const nearEdge = approxStartX < EDGE_PX || approxStartX > W - EDGE_PX;
        return (
          nearEdge &&
          Math.abs(gs.dx) > 18 &&
          Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5
        );
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -MIN_DX && nextTab) {
          router.navigate(`/(tabs)/${nextTab}` as any);
        } else if (gs.dx > MIN_DX && prevTab) {
          router.navigate(`/(tabs)/${prevTab}` as any);
        }
      },
    })
  ).current;
}
