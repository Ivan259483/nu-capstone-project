import React from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Motion, reducedMotionDuration } from '@/constants/motion';
import { Haptics, type HapticImpact } from '@/utils/haptics';

type MotionPressableProps = Omit<
  PressableProps,
  'style' | 'onPressIn' | 'onPressOut'
> & {
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  haptic?: HapticImpact | 'selection' | 'none';
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function MotionPressable({
  style,
  pressedScale = Motion.scale.press,
  haptic = 'none',
  disabled,
  onPress,
  ...props
}: MotionPressableProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={() => {
        if (disabled || reducedMotion) return;
        scale.value = withTiming(pressedScale, {
          duration: reducedMotionDuration(reducedMotion, Motion.duration.instant),
          easing: Motion.easing.standard,
        });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, {
          duration: reducedMotionDuration(reducedMotion, Motion.duration.fast),
          easing: Motion.easing.enter,
        });
      }}
      onPress={(event) => {
        if (haptic === 'selection') Haptics.selection();
        else if (haptic !== 'none') Haptics.impact(haptic);
        onPress?.(event);
      }}
      style={[style, animatedStyle]}
    />
  );
}
