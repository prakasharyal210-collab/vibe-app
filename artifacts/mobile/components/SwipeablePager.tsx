import React, { forwardRef, useState } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

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
    const pages = React.Children.toArray(children);

    React.useImperativeHandle(ref, () => ({
      setPage: (p: number) => {
        setPage(p);
        onPageSelected?.({ nativeEvent: { position: p } });
      },
    }));

    return (
      <View style={[{ flex: 1 }, style as any]}>
        {pages[page] ?? null}
      </View>
    );
  }
);

export default SwipeablePager;
