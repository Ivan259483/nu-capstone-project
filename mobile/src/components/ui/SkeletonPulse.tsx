import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LoadingColor, LoadingMotion } from '@/components/ui/loading/motion';

export default function SkeletonPulse({ style, children }: { style?: StyleProp<ViewStyle>, children?: React.ReactNode }) {
  const [width, setWidth] = useState(0);
  const translate = useSharedValue(-1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    cancelAnimation(translate);
    translate.value = -1;
    if (!reduceMotion && width > 0) {
      translate.value = withRepeat(
        withTiming(1, { duration: LoadingMotion.shimmer, easing: LoadingMotion.easing }),
        -1,
        false,
      );
    }
    return () => cancelAnimation(translate);
  }, [reduceMotion, translate, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value * Math.max(width, 1) }],
  }));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <Animated.View onLayout={onLayout} style={[styles.container, style]}>
      {children}
      {!reduceMotion && width > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.shimmer, { width: Math.max(80, width * 0.62) }, animatedStyle]}>
          <LinearGradient
            colors={['transparent', LoadingColor.skeletonHighlight, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: LoadingColor.skeletonBase,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
});
