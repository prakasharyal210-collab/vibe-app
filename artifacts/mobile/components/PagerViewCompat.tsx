import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { Dimensions, ScrollView, View } from "react-native";

const W = Dimensions.get("window").width;

export interface PagerViewHandle {
  setPage: (page: number) => void;
}

interface Props {
  style?: any;
  initialPage?: number;
  children: React.ReactNode;
  onPageScroll?: (e: { nativeEvent: { position: number; offset: number } }) => void;
  onPageSelected?: (e: { nativeEvent: { position: number } }) => void;
}

const PagerViewCompat = forwardRef<PagerViewHandle, Props>(
  ({ style, initialPage = 0, children, onPageScroll, onPageSelected }, ref) => {
    const scrollRef = useRef<ScrollView>(null);
    const currentPage = useRef(initialPage);
    const count = React.Children.count(children);

    useImperativeHandle(ref, () => ({
      setPage: (page: number) => {
        const clamped = Math.max(0, Math.min(page, count - 1));
        scrollRef.current?.scrollTo({ x: clamped * W, animated: true });
        onPageScroll?.({ nativeEvent: { position: clamped, offset: 0 } });
        onPageSelected?.({ nativeEvent: { position: clamped } });
        currentPage.current = clamped;
      },
    }));

    return (
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={style}
        contentOffset={{ x: initialPage * W, y: 0 }}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          const position = Math.floor(x / W);
          const offset = x / W - position;
          onPageScroll?.({ nativeEvent: { position, offset } });
        }}
        onMomentumScrollEnd={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          const page = Math.round(x / W);
          if (page !== currentPage.current) {
            currentPage.current = page;
            onPageSelected?.({ nativeEvent: { position: page } });
          }
        }}
      >
        {React.Children.map(children, (child, i) => (
          <View key={i} style={{ width: W, overflow: "hidden" }}>
            {child}
          </View>
        ))}
      </ScrollView>
    );
  }
);

export default PagerViewCompat;
