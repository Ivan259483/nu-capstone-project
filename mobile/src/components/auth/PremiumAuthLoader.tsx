import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

type PremiumAuthLoaderProps = {
  size?: number;
  accessibilityLabel?: string;
};

/**
 * A restrained orbital loader for authentication actions. The indicator is
 * intentionally static when Reduce Motion is enabled; the adjacent status
 * text remains the primary accessible loading cue.
 */
export default function PremiumAuthLoader({
  size = 20,
  accessibilityLabel = 'Authentication in progress',
}: PremiumAuthLoaderProps) {
  const rotation = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const strokeWidth = Math.max(1.5, size * 0.085);
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    cancelAnimation(rotation);
    rotation.value = 0;

    if (!reduceMotion) {
      rotation.value = withRepeat(
        withTiming(360, {
          duration: 920,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    }

    return () => cancelAnimation(rotation);
  }, [reduceMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[styles.frame, { width: size, height: size }]}
    >
      <Animated.View style={[styles.frame, animatedStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,122,26,0.16)"
            strokeWidth={strokeWidth}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#FF7A1A"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.68} ${circumference * 0.32}`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
