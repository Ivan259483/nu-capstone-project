/**
 * PremiumButton — Animated button with haptic feedback and optional gradient
 */

import React, { useState } from 'react';
import { ActivityIndicator, Text, ViewStyle, TextStyle, Pressable, StyleProp } from 'react-native';
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
  loading?: boolean;
  premiumAuth?: boolean;
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
  loading = false,
  premiumAuth = false,
  style,
  fullWidth = true,
}: PremiumButtonProps) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const scale = useSharedValue(1);
  const isDisabled = disabled || loading;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(premiumAuth ? 0.975 : 0.96, { duration: 180 });
  };
  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 220 });
  };
  const handlePress = () => {
    if (isDisabled) return;
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
    opacity: isDisabled && variant !== 'primary' ? 0.5 : 1,
    width: fullWidth ? '100%' : undefined,
  };

  const premiumShadowStyle = premiumAuth && !isDisabled
    ? ({
        boxShadow: hovered
          ? '0 14px 30px rgba(255,122,26,0.30)'
          : '0 10px 24px rgba(255,122,26,0.24)',
      } as ViewStyle)
    : null;

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
      {loading ? (
        <ActivityIndicator size="small" color={isOutline || isDanger || isGhost ? btnColor : '#fff'} />
      ) : icon && (
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
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        disabled={isDisabled}
        style={[[containerStyle, { opacity: 1 }, premiumShadowStyle], animStyle, style]}
      >
        <LinearGradient
          colors={isDisabled ? ['#1A1A1A', '#161616'] : premiumAuth ? ['#FFB347', '#FF7A1A'] : ['#F97316', '#EA580C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            innerStyle,
            {
              borderWidth: premiumAuth ? 1 : 0,
              borderColor: premiumAuth ? 'rgba(255,179,71,0.30)' : 'transparent',
              minHeight: premiumAuth ? 52 : undefined,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : icon && (
            <Ionicons
              name={icon}
              size={18}
              color={isDisabled ? 'rgba(255,255,255,0.28)' : '#fff'}
            />
          )}
          <Text style={[textStyle, isDisabled && { color: 'rgba(255,255,255,0.28)' }]}>{title}</Text>
        </LinearGradient>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={[containerStyle, animStyle, style]}
    >
      <Animated.View style={innerStyle}>
        {content}
      </Animated.View>
    </AnimatedPressable>
  );
}
