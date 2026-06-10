import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Animated, Dimensions, View } from "react-native";

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
    const count = React.Children.count(children);
    const translateX = useRef(new Animated.Value(-initialPage * W)).current;
    const [_page, setPageState] = useState(initialPage);

    useImperativeHandle(ref, () => ({
      setPage: (p: number) => {
        const clamped = Math.max(0, Math.min(p, count - 1));
        Animated.spring(translateX, {
          toValue: -clamped * W,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }).start();
        onPageScroll?.({ nativeEvent: { position: clamped, offset: 0 } });
        onPageSelected?.({ nativeEvent: { position: clamped } });
        setPageState(clamped);
      },
    }));

    return (
      <View style={[style, { overflow: "hidden" }]}>
        <Animated.View
          style={{
            flexDirection: "row",
            width: W * count,
            flex: 1,
            transform: [{ translateX }],
          }}
        >
          {React.Children.map(children, (child, i) => (
            <View key={i} style={{ width: W, overflow: "hidden" }}>
              {child}
            </View>
          ))}
        </Animated.View>
      </View>
    );
  }
);

export default PagerViewCompat;
