import React, { forwardRef } from "react";
import PagerView from "react-native-pager-view";
import { StyleProp, ViewStyle } from "react-native";

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
  ({ style, initialPage = 0, children, onPageScroll, onPageSelected }, ref) => {
    const pagerRef = React.useRef<PagerView>(null);

    React.useImperativeHandle(ref, () => ({
      setPage: (page: number) => pagerRef.current?.setPage(page),
    }));

    return (
      <PagerView
        ref={pagerRef}
        style={style as any}
        initialPage={initialPage}
        onPageScroll={onPageScroll as any}
        onPageSelected={onPageSelected as any}
      >
        {children}
      </PagerView>
    );
  }
);

export default SwipeablePager;
