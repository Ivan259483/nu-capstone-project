/**
 * AuthPasswordRequirements — compact live checklist shown while composing a
 * new password on the auth flow. Deliberately a new sibling of
 * `PasswordRequirementsCard` rather than a restyle in place: that component
 * is also used by the (non-auth, orange-branded) change-password screen, so
 * changing its colors there would leak the restrained auth palette into the
 * rest of the app. Same `getPasswordRequirements()` utility underneath —
 * this resolves signup.tsx's previously-separate, duplicated inline
 * password-strength logic without touching the other screen's component.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AuthColors, AuthRadius, AuthTypography } from '@/constants/authTheme';
import { getPasswordRequirements, type PasswordRequirement } from '@/utils/validation';

function RequirementRow({ requirement }: { requirement: PasswordRequirement }) {
  const progress = useSharedValue(requirement.met ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(requirement.met ? 1 : 0, { duration: 220 });
  }, [requirement.met, progress]);

  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.7 + progress.value * 0.3 }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: progress.value > 0.5 ? AuthColors.success : AuthColors.textSecondary,
  }));

  return (
    <View style={styles.row}>
      <View style={styles.iconSlot}>
        <Animated.View style={[styles.iconLayer, outlineStyle]}>
          <View style={styles.outlineDot} />
        </Animated.View>
        <Animated.View style={[styles.iconLayer, checkStyle]}>
          <Ionicons name="checkmark-circle" size={16} color={AuthColors.success} />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.reqLabel, labelStyle]}>{requirement.label}</Animated.Text>
    </View>
  );
}

interface AuthPasswordRequirementsProps {
  password: string;
}

export default function AuthPasswordRequirements({ password }: AuthPasswordRequirementsProps) {
  const requirements = getPasswordRequirements(password);

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutUp.duration(160)}
      style={styles.card}
    >
      <Text style={styles.title}>Password requirements</Text>
      {requirements.map((requirement) => (
        <RequirementRow key={requirement.key} requirement={requirement} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AuthColors.card,
    borderWidth: 1,
    borderColor: AuthColors.borderHairline,
    borderRadius: AuthRadius.input,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 2,
    marginBottom: 20,
    gap: 10,
  },
  title: {
    fontFamily: AuthTypography.label.fontFamily,
    fontSize: AuthTypography.label.fontSize,
    color: AuthColors.textSecondary,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconSlot: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: AuthColors.borderHairline,
  },
  reqLabel: {
    fontFamily: AuthTypography.bodySecondary.fontFamily,
    fontSize: 13,
  },
});
