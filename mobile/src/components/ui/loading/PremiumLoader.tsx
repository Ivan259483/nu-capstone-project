import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { LoadingColor, LoadingMotion } from './motion';

export type PremiumLoaderTone = 'accent' | 'light' | 'muted' | 'success' | 'danger';

type PremiumLoaderProps = {
  size?: 'small' | 'large' | number;
  tone?: PremiumLoaderTone;
  color?: string;
  trackColor?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const toneColors: Record<PremiumLoaderTone, { stroke: string; track: string }> = {
  accent: { stroke: LoadingColor.accent, track: LoadingColor.accentSoft },
  light: { stroke: LoadingColor.light, track: LoadingColor.lightSoft },
  muted: { stroke: LoadingColor.muted, track: LoadingColor.mutedSoft },
  success: { stroke: LoadingColor.success, track: LoadingColor.successSoft },
  danger: { stroke: LoadingColor.danger, track: LoadingColor.dangerSoft },
};

/** Calm, brand-controlled replacement for ActivityIndicator. */
export default function PremiumLoader({
  size = 'small',
  tone = 'accent',
  color,
  trackColor,
  accessibilityLabel = 'Loading',
  style,
}: PremiumLoaderProps) {
  const dimension = typeof size === 'number' ? size : size === 'large' ? 30 : 18;
  const strokeWidth = Math.max(1.5, dimension * 0.075);
  const radius = (dimension - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const rotation = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const palette = toneColors[tone];

  useEffect(() => {
    cancelAnimation(rotation);
    rotation.value = 0;
    if (!reduceMotion) {
      rotation.value = withRepeat(
        withTiming(360, { duration: LoadingMotion.orbit, easing: LoadingMotion.linear }),
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
      style={[styles.frame, { width: dimension, height: dimension }, style]}
    >
      <Animated.View style={[styles.frame, animatedStyle]}>
        <Svg width={dimension} height={dimension} viewBox={`0 0 ${dimension} ${dimension}`}>
          <Circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke={trackColor ?? palette.track}
            strokeWidth={strokeWidth}
          />
          <Circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke={color ?? palette.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.62} ${circumference * 0.38}`}
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
