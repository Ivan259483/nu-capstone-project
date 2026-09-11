/**
 * PremiumButton — Animated button with primary-only haptic feedback and optional gradient
 */

import React, { useEffect, useRef, useState } from 'react';
import { Text, View, ViewStyle, TextStyle, Pressable, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, BorderRadius } from '@/constants/theme';
import { LoadingMotion, PremiumLoader, SuccessMark } from '@/components/ui/loading';
import { Motion, reducedMotionDuration } from '@/constants/motion';
import { Haptics } from '@/utils/haptics';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';

interface PremiumButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  success?: boolean;
  successTitle?: string;
  onSuccessAnimationComplete?: () => void;
  premiumAuth?: boolean;
  premiumAuthLarge?: boolean;
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
  success = false,
  successTitle = 'Verified',
  onSuccessAnimationComplete,
  premiumAuth = false,
  premiumAuthLarge = false,
  style,
  fullWidth = true,
}: PremiumButtonProps) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const scale = useSharedValue(1);
  const successProgress = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const successCompletionSent = useRef(false);
  const isDisabled = disabled || loading || success;
  const isLargeAuthButton = premiumAuth && premiumAuthLarge;

  useEffect(() => {
    if (!success) {
      successCompletionSent.current = false;
      successProgress.value = 0;
      return;
    }

    if (!onSuccessAnimationComplete || successCompletionSent.current) return;
    successCompletionSent.current = true;

    if (reduceMotion) {
      onSuccessAnimationComplete();
      return;
    }

    successProgress.value = withTiming(1, { duration: LoadingMotion.success }, (finished) => {
      if (finished) runOnJS(onSuccessAnimationComplete)();
    });
  }, [onSuccessAnimationComplete, reduceMotion, success, successProgress]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (reduceMotion) return;
    scale.value = withTiming(premiumAuth ? 0.985 : 0.98, {
      duration: reducedMotionDuration(reduceMotion, Motion.duration.instant),
      easing: Motion.easing.standard,
    });
  };
  const handlePressOut = () => {
    if (reduceMotion) return;
    scale.value = withTiming(1, {
      duration: reducedMotionDuration(reduceMotion, Motion.duration.fast),
      easing: Motion.easing.enter,
    });
  };
  const handlePress = () => {
    if (isDisabled) return;
    if (variant === 'primary') Haptics.primaryPress();
    onPress();
  };

  const isOutline = variant === 'outline';
  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';

  const btnColor = isDanger ? Palette.danger : Palette.accent;

  const containerStyle: ViewStyle = {
    borderRadius: isLargeAuthButton ? 24 : BorderRadius.lg,
    overflow: premiumAuth ? 'visible' : 'hidden',
    opacity: isDisabled && variant !== 'primary' ? 0.5 : 1,
    width: fullWidth ? '100%' : undefined,
  };

  const premiumShadowStyle = premiumAuth
    ? ({
        boxShadow: loading || success
          ? '0 7px 20px rgba(255,122,26,0.10)'
          : isDisabled
            ? '0 4px 12px rgba(0,0,0,0.18)'
            : hovered
              ? '0 14px 30px rgba(255,122,26,0.30)'
              : '0 10px 24px rgba(255,122,26,0.24)',
      } as ViewStyle)
    : null;

  const innerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: isLargeAuthButton ? 17 : 14,
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
    borderRadius: isLargeAuthButton ? 24 : BorderRadius.lg,
  };

  const textStyle: TextStyle = {
    fontSize: isLargeAuthButton ? 18 : 15,
    fontWeight: isLargeAuthButton ? '800' : '700',
    color: isOutline || isDanger || isGhost
      ? btnColor
      : '#FFFFFF',
  };

  const loaderTone = isDanger ? 'danger' : isOutline || isGhost ? 'accent' : 'light';
  const loaderColor = isOutline || isDanger || isGhost ? btnColor : undefined;

  const content = loading ? (
    <Animated.View
      key="loading"
      entering={reduceMotion ? undefined : FadeIn.duration(LoadingMotion.contentEnter)}
      exiting={reduceMotion ? undefined : FadeOut.duration(LoadingMotion.contentExit)}
      style={styles.contentRow}
    >
      <PremiumLoader size={18} tone={loaderTone} color={loaderColor} accessibilityLabel={title} />
      <Text style={textStyle}>{title}</Text>
    </Animated.View>
  ) : success ? (
    <Animated.View
      key="success"
      entering={reduceMotion ? undefined : FadeIn.duration(LoadingMotion.contentEnter)}
      style={styles.contentRow}
    >
      <SuccessMark size={19} label={successTitle} />
      <Text style={textStyle}>{successTitle}</Text>
    </Animated.View>
  ) : (
    <Animated.View
      key="idle"
      entering={reduceMotion ? undefined : FadeIn.duration(LoadingMotion.contentEnter)}
      exiting={reduceMotion ? undefined : FadeOut.duration(LoadingMotion.contentExit)}
      style={styles.contentRow}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={isOutline || isDanger || isGhost ? btnColor : '#fff'}
        />
      ) : null}
      <Text style={textStyle}>{title}</Text>
    </Animated.View>
  );

  if (variant === 'primary') {
    const premiumBorderColor = loading || success
      ? 'rgba(255,122,26,0.36)'
      : isDisabled
        ? 'rgba(255,122,26,0.15)'
        : 'rgba(255,179,71,0.30)';

    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={success ? successTitle : title}
        accessibilityLiveRegion={loading || success ? 'polite' : 'none'}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={[[containerStyle, { opacity: 1 }, premiumShadowStyle], animStyle, style]}
      >
        <LinearGradient
          colors={
            premiumAuth && (loading || success)
              ? ['#1C1C1C', '#151515']
              : isDisabled
                ? ['#1A1A1A', '#161616']
                : premiumAuth
                  ? ['#FFB347', '#FF7A1A']
                  : ['#F97316', '#EA580C']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            innerStyle,
            {
              borderWidth: premiumAuth ? 1 : 0,
              borderColor: premiumAuth ? premiumBorderColor : 'transparent',
              minHeight: isLargeAuthButton ? 64 : premiumAuth ? 52 : undefined,
            },
          ]}
        >
          {premiumAuth ? (
            <View style={{ height: 22, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
              {loading ? (
                <Animated.View
                  key="loading"
                  entering={reduceMotion ? undefined : FadeIn.duration(160)}
                  exiting={reduceMotion ? undefined : FadeOut.duration(130)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }}
                >
                  <PremiumLoader size={19} tone="accent" accessibilityLabel={title} />
                  <Text style={[textStyle, { color: 'rgba(255,255,255,0.80)' }]}>{title}</Text>
                </Animated.View>
              ) : success ? (
                <Animated.View
                  key="success"
                  entering={reduceMotion ? undefined : FadeIn.duration(150)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <SuccessMark size={19} label={successTitle} />
                  <Text style={[textStyle, { color: '#F4F4F5' }]}>{successTitle}</Text>
                </Animated.View>
              ) : (
                <Animated.View
                  key="idle"
                  entering={reduceMotion ? undefined : FadeIn.duration(150)}
                  exiting={reduceMotion ? undefined : FadeOut.duration(120)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {icon ? (
                    <Ionicons
                      name={icon}
                      size={isLargeAuthButton ? 22 : 18}
                      color={isDisabled ? 'rgba(255,255,255,0.28)' : '#fff'}
                    />
                  ) : null}
                  <Text style={[textStyle, isDisabled && { color: 'rgba(255,255,255,0.34)' }]}>{title}</Text>
                </Animated.View>
              )}
            </View>
          ) : (
            <View style={{ height: 22, alignItems: 'center', justifyContent: 'center' }}>
              {loading ? (
                <Animated.View
                  key="loading"
                  entering={reduceMotion ? undefined : FadeIn.duration(LoadingMotion.contentEnter)}
                  exiting={reduceMotion ? undefined : FadeOut.duration(LoadingMotion.contentExit)}
                  style={styles.contentRow}
                >
                  <PremiumLoader size={18} tone="light" accessibilityLabel={title} />
                  <Text style={[textStyle, { color: 'rgba(255,255,255,0.78)' }]}>{title}</Text>
                </Animated.View>
              ) : success ? (
                <Animated.View
                  key="success"
                  entering={reduceMotion ? undefined : FadeIn.duration(LoadingMotion.contentEnter)}
                  style={styles.contentRow}
                >
                  <SuccessMark size={19} label={successTitle} />
                  <Text style={textStyle}>{successTitle}</Text>
                </Animated.View>
              ) : (
                <Animated.View
                  key="idle"
                  entering={reduceMotion ? undefined : FadeIn.duration(LoadingMotion.contentEnter)}
                  exiting={reduceMotion ? undefined : FadeOut.duration(LoadingMotion.contentExit)}
                  style={styles.contentRow}
                >
                  {icon ? (
                    <Ionicons name={icon} size={18} color={isDisabled ? 'rgba(255,255,255,0.28)' : '#fff'} />
                  ) : null}
                  <Text style={[textStyle, isDisabled && { color: 'rgba(255,255,255,0.28)' }]}>{title}</Text>
                </Animated.View>
              )}
            </View>
          )}
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
      accessibilityRole="button"
      accessibilityLabel={success ? successTitle : title}
      accessibilityLiveRegion={loading || success ? 'polite' : 'none'}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[containerStyle, animStyle, style]}
    >
      <Animated.View style={innerStyle}>
        {content}
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = {
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  } as ViewStyle,
};
