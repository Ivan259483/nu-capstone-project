/**
 * AuthOtpInput — shared OTP box input, generalized from verify.tsx's
 * original technique: a single invisible native `TextInput` overlaid on
 * styled boxes. This is more reliable for SMS/clipboard autofill
 * (`textContentType="oneTimeCode"`) than manually wiring N separate
 * `TextInput`s and jumping focus between them (forgot-password.tsx's old
 * approach, now replaced by this component).
 */

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { AuthColors, AuthRadius, AuthSpacing, AuthTypography } from '@/constants/authTheme';

const OTP_GAP = 8;

export interface AuthOtpInputHandle {
  focus: () => void;
}

interface AuthOtpInputProps {
  length?: number;
  value: string;
  onChangeText: (digits: string) => void;
  onComplete?: (digits: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

function AuthOtpInput(
  {
    length = 6,
    value,
    onChangeText,
    onComplete,
    error = false,
    disabled = false,
    autoFocus = true,
  }: AuthOtpInputProps,
  ref: React.Ref<AuthOtpInputHandle>,
) {
  const { width: windowWidth } = useWindowDimensions();
  const inputRef = useRef<TextInput | null>(null);
  const [focused, setFocused] = React.useState(false);
  // The last full code handed to onComplete. Comparing against the code itself
  // (rather than its length) also fires for a code corrected in place or
  // pasted over an already-full set, which a length transition would miss.
  const lastCompletedRef = useRef('');

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const boxSize = Math.min(
    48,
    Math.floor((windowWidth - AuthSpacing.screenPaddingHorizontal * 2 - OTP_GAP * (length - 1)) / length),
  );

  const handleChangeText = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, length);
    onChangeText(digits);
    if (digits.length < length) {
      lastCompletedRef.current = '';
      return;
    }
    if (lastCompletedRef.current === digits) return;
    lastCompletedRef.current = digits;
    onComplete?.(digits);
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.row}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length }, (_, index) => {
          const digit = value[index] ?? '';
          const isActiveCursor = focused && index === Math.min(value.length, length - 1);
          return (
            <View
              key={index}
              style={[
                styles.box,
                {
                  width: boxSize,
                  height: boxSize + 8,
                  borderColor: error
                    ? AuthColors.error
                    : digit || isActiveCursor
                      ? AuthColors.borderFocus
                      : AuthColors.borderHairline,
                },
              ]}
            >
              <Text style={styles.digit}>{digit}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        autoFocus={autoFocus}
        selection={{ start: value.length, end: value.length }}
        selectionColor="transparent"
        caretHidden
        editable={!disabled}
        accessibilityLabel={`${length}-digit verification code`}
        accessibilityHint="Enter or paste the code sent to you"
      />
    </View>
  );
}

export default forwardRef(AuthOtpInput);

const styles = StyleSheet.create({
  container: { position: 'relative', alignSelf: 'center' },
  row: { flexDirection: 'row', justifyContent: 'center', gap: OTP_GAP },
  box: {
    borderRadius: AuthRadius.input,
    borderWidth: 1,
    backgroundColor: AuthColors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontFamily: AuthTypography.h1.fontFamily,
    fontSize: 20,
    color: AuthColors.textPrimary,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
  },
});
