import React, { forwardRef, useRef, useState } from "react";
import { Dimensions, PanResponder, StyleProp, View, ViewStyle } from "react-native";

const { width: W } = Dimensions.get("window");
const SWIPE_THRESHOLD = 50;

export type SwipeablePagerRef = {
  setPage: (page: number) => void;
};

type Props = {
  style?: StyleProp<ViewStyle>;
  initialPage?: number;
  children: React.ReactNode;
  onPageScroll?: (e: { nativeEvent: { position: number; offset: number } }) => void;
  onPageSelected?: (e: { nativeEvent: { position: number } }) => void;
};

const SwipeablePager = forwardRef<SwipeablePagerRef, Props>(
  ({ style, initialPage = 0, children, onPageSelected }, ref) => {
    const [page, setPage] = useState(initialPage);
    const pageRef = useRef(page);
    const pages = React.Children.toArray(children);
    const count = pages.length;

    const goTo = (p: number) => {
      const clamped = Math.max(0, Math.min(count - 1, p));
      pageRef.current = clamped;
      setPage(clamped);
      onPageSelected?.({ nativeEvent: { position: clamped } });
    };

    React.useImperativeHandle(ref, () => ({
      setPage: (p: number) => goTo(p),
    }));

    const panResponder = useRef(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 12 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.8,
        onPanResponderRelease: (_, gs) => {
          if (gs.dx < -SWIPE_THRESHOLD) {
            goTo(pageRef.current + 1);
          } else if (gs.dx > SWIPE_THRESHOLD) {
            goTo(pageRef.current - 1);
          }
        },
      })
    ).current;

    return (
      <View style={[{ flex: 1 }, style as any]} {...panResponder.panHandlers}>
        {pages[page] ?? null}
      </View>
    );
  }
);

export default SwipeablePager;
