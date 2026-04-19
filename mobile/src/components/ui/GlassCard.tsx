/**
 * GlassCard — Premium card with optional blur background
 * Used throughout AutoSPF+ for Bento Grid items.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useThemeContext';
import { BorderRadius, Shadows } from '@/constants/theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  animated?: boolean;
  gradient?: boolean;
  noBorder?: boolean;
  noPadding?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function GlassCard({
  children,
  style,
  onPress,
  animated = true,
  noBorder = false,
  noPadding = false,
}: GlassCardProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (animated && onPress) {
      scale.value = withTiming(0.97, { duration: 220 });
    }
  };

  const handlePressOut = () => {
    if (animated && onPress) {
      scale.value = withTiming(1, { duration: 220 });
    }
  };

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const cardStyle: ViewStyle = {
    backgroundColor: colors.card,
    borderRadius: BorderRadius.xxl,
    borderWidth: noBorder ? 0 : 1,
    borderColor: colors.border,
    padding: noPadding ? 0 : 16,
    ...Shadows.sm,
  };

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[cardStyle, animStyle, style]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return (
    <View style={[cardStyle, style]}>{children}</View>
  );
}
