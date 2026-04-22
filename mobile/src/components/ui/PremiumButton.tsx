/**
 * PremiumButton — Animated button with haptic feedback and optional gradient
 */

import React from 'react';
import { Text, StyleSheet, ViewStyle, TextStyle, Pressable, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, BorderRadius } from '@/constants/theme';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';

interface PremiumButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PremiumButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  style,
  fullWidth = true,
}: PremiumButtonProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.96, { duration: 220 });
  };
  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 220 });
  };
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const isOutline = variant === 'outline';
  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';

  const btnColor = isDanger ? Palette.danger : Palette.accent;

  const containerStyle: ViewStyle = {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : undefined,
  };

  const innerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 8,
    backgroundColor:
      isOutline || isDanger
        ? 'transparent'
        : isGhost
        ? colors.cardAlt
        : undefined,
    borderWidth: isOutline || isDanger ? 1.5 : 0,
    borderColor: btnColor,
    borderRadius: BorderRadius.lg,
  };

  const textStyle: TextStyle = {
    fontSize: 15,
    fontWeight: '700',
    color: isOutline || isDanger || isGhost
      ? btnColor
      : '#FFFFFF',
  };

  const content = (
    <>
      {icon && (
        <Ionicons
          name={icon}
          size={16}
          color={isOutline || isDanger || isGhost ? btnColor : '#fff'}
        />
      )}
      <Text style={textStyle}>{title}</Text>
    </>
  );

  if (variant === 'primary') {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[[containerStyle, { opacity: 1 }], animStyle, style]}
      >
        <LinearGradient
          colors={disabled ? ['#D1D5DB', '#E5E7EB'] : [Palette.accent, Palette.accentDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[innerStyle, { borderWidth: 0 }]}
        >
          {icon && (
            <Ionicons
              name={icon}
              size={18}
              color={disabled ? '#9CA3AF' : '#fff'}
            />
          )}
          <Text style={[textStyle, disabled && { color: '#9CA3AF' }]}>{title}</Text>
        </LinearGradient>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[containerStyle, animStyle, style]}
    >
      <Animated.View style={innerStyle}>
        {content}
      </Animated.View>
    </AnimatedPressable>
  );
}
