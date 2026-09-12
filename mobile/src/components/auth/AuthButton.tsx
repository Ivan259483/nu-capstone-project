/**
 * AuthButton — flat, restrained button for the auth flow only.
 *
 * Deliberately not a variant of `PremiumButton` (which keeps its gradient +
 * glow look for non-auth screens like change-password/documents/edit-profile/
 * notifications). Reuses `PremiumLoader`/`SuccessMark` for its loading/success
 * sub-states and `utils/haptics.ts` for feedback, but owns its own flat
 * container styling and press animation.
 */

import React, { useEffect, useRef } from 'react';
import { Pressable, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AuthColors, AuthFontFamily, AuthRadius, AuthTypography, AuthMotion } from '@/constants/authTheme';
import { PremiumLoader, SuccessMark, LoadingMotion } from '@/components/ui/loading';
import { reducedMotionDuration } from '@/constants/motion';
import { Haptics } from '@/utils/haptics';

type AuthButtonVariant = 'primary' | 'secondary' | 'plain';

const DISABLED_FADE_DURATION = 180;

interface AuthButtonProps {
  title: string;
  onPress: () => void;
  variant?: AuthButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  success?: boolean;
  successTitle?: string;
  onSuccessAnimationComplete?: () => void;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  appearance?: 'default' | 'loginBrand';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AuthButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  success = false,
  successTitle = 'Done',
  onSuccessAnimationComplete,
  fullWidth = true,
  style,
  appearance = 'default',
}: AuthButtonProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const successProgress = useSharedValue(0);
  const successCompletionSent = useRef(false);
  const isDisabled = disabled || loading || success;
  const isSecondary = variant === 'secondary';
  const isPlain = variant === 'plain';
  const isLoginBrand = appearance === 'loginBrand' && !isSecondary && !isPlain;
  const disabledProgress = useSharedValue(isDisabled ? 1 : 0);

  useEffect(() => {
    disabledProgress.value = withTiming(isDisabled ? 1 : 0, {
      duration: reducedMotionDuration(reduceMotion, DISABLED_FADE_DURATION),
    });
  }, [isDisabled, reduceMotion, disabledProgress]);

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

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    if (isDisabled || reduceMotion) return;
    // Reanimated SharedValue.value is intentionally mutable inside handlers.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withTiming(AuthMotion.scale.authPress, {
      duration: reducedMotionDuration(reduceMotion, AuthMotion.duration.standard),
      easing: AuthMotion.easing.authStandard,
    });
    // eslint-disable-next-line react-hooks/immutability
    opacity.value = withTiming(0.9, {
      duration: reducedMotionDuration(reduceMotion, AuthMotion.duration.standard),
      easing: AuthMotion.easing.authStandard,
    });
  };

  const handlePressOut = () => {
    // Reanimated SharedValue.value is intentionally mutable inside handlers.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withTiming(1, {
      duration: reducedMotionDuration(reduceMotion, AuthMotion.duration.standard),
      easing: AuthMotion.easing.authStandard,
    });
    // eslint-disable-next-line react-hooks/immutability
    opacity.value = withTiming(1, {
      duration: reducedMotionDuration(reduceMotion, AuthMotion.duration.standard),
      easing: AuthMotion.easing.authStandard,
    });
  };

  const handlePress = () => {
    if (isDisabled) return;
    if (variant === 'primary') Haptics.primaryPress();
    onPress();
  };

  const containerStyle: ViewStyle = {
    width: fullWidth ? '100%' : undefined,
    height: 52,
    borderRadius: AuthRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderWidth: isSecondary ? 1 : 0,
    borderColor: AuthColors.borderHairline,
  };

  const enabledBg = isSecondary
    ? 'rgba(0,0,0,0)'
    : isLoginBrand
      ? AuthColors.brandAccent
      : AuthColors.buttonPrimaryBg;
  const enabledTextColor = isPlain
    ? AuthColors.textSecondary
    : isSecondary
      ? AuthColors.textPrimary
      : isLoginBrand
        ? '#FFFFFF'
        : AuthColors.buttonPrimaryText;

  // Cross-fades bg/text between enabled and disabled colors over
  // DISABLED_FADE_DURATION instead of snapping instantly — e.g. the PPF
  // terms sheet's "I accept" enabling once scroll progress hits 100%.
  const bgAnimatedStyle = useAnimatedStyle(() =>
    isPlain
      ? { backgroundColor: 'transparent' }
      : { backgroundColor: interpolateColor(disabledProgress.value, [0, 1], [enabledBg, AuthColors.buttonDisabledBg]) }
  );

  const textColorAnimatedStyle = useAnimatedStyle(() =>
    isPlain
      ? { color: AuthColors.textSecondary }
      : { color: interpolateColor(disabledProgress.value, [0, 1], [enabledTextColor, AuthColors.buttonDisabledText]) }
  );

  const textStyle: TextStyle = {
    fontFamily: isLoginBrand ? AuthFontFamily.bold : AuthTypography.button.fontFamily,
    fontSize: AuthTypography.button.fontSize,
  };

  // PremiumLoader's `tone` presets default to an accent-orange track ring —
  // always override both `color` and `trackColor` explicitly here so no
  // orange can leak into an auth screen's loading state.
  const isLightOnDark = isSecondary || isPlain || isDisabled || isLoginBrand;
  const loaderColor = isLightOnDark ? AuthColors.textPrimary : AuthColors.buttonPrimaryText;
  const loaderTrackColor = isLoginBrand
    ? 'rgba(255,255,255,0.22)'
    : isLightOnDark
      ? 'rgba(245,245,244,0.14)'
      : 'rgba(11,11,12,0.16)';

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
      style={[containerStyle, bgAnimatedStyle, animatedStyle, style]}
    >
      {loading ? (
        <Animated.View
          key="loading"
          entering={reduceMotion ? undefined : FadeIn.duration(LoadingMotion.contentEnter)}
          exiting={reduceMotion ? undefined : FadeOut.duration(LoadingMotion.contentExit)}
          style={styles.contentRow}
        >
          <PremiumLoader size={18} color={loaderColor} trackColor={loaderTrackColor} accessibilityLabel={title} />
          <Animated.Text style={[textStyle, textColorAnimatedStyle]}>{title}</Animated.Text>
        </Animated.View>
      ) : success ? (
        <Animated.View
          key="success"
          entering={reduceMotion ? undefined : FadeIn.duration(LoadingMotion.contentEnter)}
          style={styles.contentRow}
        >
          {isLoginBrand ? (
            <Ionicons name="checkmark-circle" size={19} color="#FFFFFF" />
          ) : (
            <SuccessMark size={19} label={successTitle} />
          )}
          <Animated.Text style={[textStyle, textColorAnimatedStyle]}>{successTitle}</Animated.Text>
        </Animated.View>
      ) : (
        <Animated.View
          key="idle"
          entering={reduceMotion ? undefined : FadeIn.duration(LoadingMotion.contentEnter)}
          exiting={reduceMotion ? undefined : FadeOut.duration(LoadingMotion.contentExit)}
          style={styles.contentRow}
        >
          <Animated.Text style={[textStyle, textColorAnimatedStyle]}>{title}</Animated.Text>
        </Animated.View>
      )}
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
