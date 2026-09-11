/**
 * AuthInput — flat, restrained text field for the auth flow only.
 *
 * Deliberately not a variant of `PremiumInput` (kept as-is for
 * address/change-password/edit-profile). No leading icon slot — the label
 * carries meaning. Border-only focus/error treatment, no background tint,
 * no shake. The caller (screen) decides when `error` is populated —
 * typically only after the field has been blurred once or the form has
 * been submitted — this component itself has no "never show on mount"
 * logic of its own, it just renders what it's given.
 */

import React, { forwardRef, useState } from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewProps,
} from 'react-native';
import Animated, {
  Keyframe,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AuthColors, AuthRadius, AuthSpacing, AuthTypography } from '@/constants/authTheme';

const ERROR_ENTERING = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -4 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(120);

interface AuthInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  leftAccessory?: React.ReactNode;
  error?: string;
  isPassword?: boolean;
  /** Field surface color — defaults to the flat card token. Sign In passes
   *  `AuthColors.cardOnPhoto` since its fields sit above a cinematic photo. */
  surfaceColor?: string;
  containerStyle?: ViewProps['style'];
  style?: StyleProp<TextStyle>;
}

function AuthInput(
  {
    label,
    leftAccessory,
    error,
    isPassword,
    surfaceColor = AuthColors.card,
    containerStyle,
    style,
    ...props
  }: AuthInputProps,
  ref: React.Ref<TextInput>,
) {
  const reduceMotion = useReducedMotion();
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(!isPassword);
  const borderProgress = useSharedValue(0); // 0 = hairline, 1 = focus, 2 = error

  const applyBorderState = (focused: boolean, hasError: boolean) => {
    const next = hasError ? 2 : focused ? 1 : 0;
    borderProgress.value = withTiming(next, {
      duration: reduceMotion ? 0 : 150,
    });
  };

  React.useEffect(() => {
    applyBorderState(isFocused, Boolean(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, error]);

  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      borderProgress.value,
      [0, 1, 2],
      [AuthColors.borderHairline, AuthColors.borderFocus, AuthColors.error],
    ),
  }));

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Text style={styles.label}>{label}</Text>

      <Animated.View style={[styles.inputContainer, { backgroundColor: surfaceColor }, animatedBorderStyle]}>
        {leftAccessory}

        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={AuthColors.textTertiary}
          secureTextEntry={isPassword && !showPassword}
          {...props}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
        />

        {isPassword && (
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            style={styles.eyeButton}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={19}
              color={AuthColors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </Animated.View>

      {error ? (
        <Animated.Text
          entering={reduceMotion ? undefined : ERROR_ENTERING}
          style={styles.errorText}
          accessibilityRole="alert"
        >
          {error}
        </Animated.Text>
      ) : null}
    </View>
  );
}

export default forwardRef(AuthInput);

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginBottom: AuthSpacing.fieldGap,
  },
  label: {
    fontFamily: AuthTypography.label.fontFamily,
    fontSize: AuthTypography.label.fontSize,
    letterSpacing: AuthTypography.label.letterSpacing,
    color: AuthColors.textSecondary,
    marginBottom: AuthSpacing.labelToInput,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: AuthRadius.input,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  input: {
    flex: 1,
    fontFamily: AuthTypography.body.fontFamily,
    fontSize: 15,
    height: '100%',
    color: AuthColors.textPrimary,
    paddingVertical: Platform.OS === 'android' ? 0 : undefined,
  },
  eyeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -12,
  },
  errorText: {
    fontFamily: AuthTypography.error.fontFamily,
    fontSize: AuthTypography.error.fontSize,
    color: AuthColors.error,
    marginTop: 8,
    marginLeft: 2,
  },
});
