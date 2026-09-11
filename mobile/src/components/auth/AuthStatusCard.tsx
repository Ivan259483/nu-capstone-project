/**
 * AuthStatusCard — flat, restrained inline status banner for the auth flow
 * only. Deliberately NOT a restyle of `AuthFeedback` in place: `AuthFeedback`
 * is also the app's global toast primitive (rendered by `PremiumToast` at
 * the root layout, used app-wide via `Toast.show(...)`), so changing its
 * colors/surface there would leak this restrained palette into every other
 * screen's toasts. Same reasoning as `AuthButton`/`AuthInput` being new
 * siblings of `PremiumButton`/`PremiumInput` rather than in-place edits.
 *
 * Same prop surface as `AuthFeedback` (type/title/message/style/testID) so
 * screens swap the import with no other logic changes.
 */

import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { Keyframe, useReducedMotion } from 'react-native-reanimated';
import { AuthColors, AuthFontFamily } from '@/constants/authTheme';

export type AuthStatusType = 'success' | 'warning' | 'error' | 'info';

export type AuthStatusData = {
  type: AuthStatusType;
  title: string;
  message?: string;
};

type AuthStatusCardProps = AuthStatusData & {
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const ENTERING = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -8 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(210);

const EXITING = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: -4 }] },
}).duration(170);

const STATUS: Record<AuthStatusType, { color: string; borderColor: string }> = {
  error: { color: AuthColors.error, borderColor: AuthColors.error },
  success: { color: AuthColors.success, borderColor: AuthColors.success },
  warning: { color: AuthColors.textPrimary, borderColor: AuthColors.borderFocus },
  info: { color: AuthColors.textSecondary, borderColor: AuthColors.borderHairline },
};

export default function AuthStatusCard({ type, title, message, style, testID }: AuthStatusCardProps) {
  const reduceMotion = useReducedMotion();
  const status = STATUS[type];

  return (
    <Animated.View
      entering={reduceMotion ? undefined : ENTERING}
      exiting={reduceMotion ? undefined : EXITING}
      accessible
      accessibilityLabel={[title, message].filter(Boolean).join('. ')}
      accessibilityLiveRegion={type === 'error' ? 'assertive' : 'polite'}
      accessibilityRole={type === 'error' || type === 'warning' ? 'alert' : 'text'}
      testID={testID}
      style={[styles.outer, { borderColor: status.borderColor }, style]}
    >
      <View style={styles.copy}>
        <Text style={[styles.title, { color: status.color }]}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: AuthColors.card,
  },
  copy: { flex: 1 },
  title: {
    fontFamily: AuthFontFamily.medium,
    fontSize: 13.5,
    lineHeight: 18,
  },
  message: {
    fontFamily: AuthFontFamily.regular,
    color: AuthColors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
});
