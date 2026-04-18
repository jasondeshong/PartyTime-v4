import { useRef } from "react";
import { View, PanResponder, Dimensions } from "react-native";

const SCREEN_W = Dimensions.get("window").width;
const EDGE_WIDTH = 30;
const THRESHOLD = SCREEN_W * 0.3;

export default function SwipeBack({ onBack, children }) {
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.pageX < EDGE_WIDTH,
      onMoveShouldSetPanResponder: (e, g) =>
        e.nativeEvent.pageX < EDGE_WIDTH && g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        if (g.dx > THRESHOLD) onBack();
      },
    })
  ).current;

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}
