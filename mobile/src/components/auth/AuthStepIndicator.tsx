/**
 * AuthStepIndicator — minimal 2-segment hairline progress track, replacing
 * the old uppercase "STEP 1 OF 2" label + gradient progress bar.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthColors, AuthRadius, AuthTypography } from '@/constants/authTheme';

interface AuthStepIndicatorProps {
  currentStep: 1 | 2;
  totalSteps?: 2;
  label: string;
}

export default function AuthStepIndicator({ currentStep, totalSteps = 2, label }: AuthStepIndicatorProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              i < currentStep ? styles.segmentFilled : styles.segmentEmpty,
              i === 0 && styles.segmentFirst,
              i === totalSteps - 1 && styles.segmentLast,
            ]}
          />
        ))}
      </View>
      <Text style={styles.label}>
        Step {currentStep} of {totalSteps} · {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 24,
    gap: 10,
  },
  track: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 2,
  },
  segmentEmpty: {
    backgroundColor: AuthColors.borderHairline,
  },
  segmentFilled: {
    backgroundColor: AuthColors.textPrimary,
  },
  segmentFirst: {
    borderTopLeftRadius: AuthRadius.full,
    borderBottomLeftRadius: AuthRadius.full,
  },
  segmentLast: {
    borderTopRightRadius: AuthRadius.full,
    borderBottomRightRadius: AuthRadius.full,
  },
  label: {
    fontFamily: AuthTypography.label.fontFamily,
    fontSize: AuthTypography.label.fontSize,
    color: AuthColors.textSecondary,
  },
});
