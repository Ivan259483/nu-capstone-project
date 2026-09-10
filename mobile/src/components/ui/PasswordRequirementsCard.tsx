/**
 * PasswordRequirementsCard — compact live checklist shown while a user is
 * composing a new password. Each rule cross-fades between a muted outline
 * dot and a refined success checkmark as it becomes satisfied.
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
import { Palette } from '@/constants/theme';
import { getPasswordRequirements, type PasswordRequirement } from '@/utils/validation';

const SURFACE = '#111114';
const BORDER = '#2A2A30';
const MUTED = 'rgba(255,255,255,0.42)';
const MUTED_DOT = 'rgba(255,255,255,0.20)';

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
    color: progress.value > 0.5 ? Palette.success : MUTED,
  }));

  return (
    <View style={styles.row}>
      <View style={styles.iconSlot}>
        <Animated.View style={[styles.iconLayer, outlineStyle]}>
          <View style={styles.outlineDot} />
        </Animated.View>
        <Animated.View style={[styles.iconLayer, checkStyle]}>
          <Ionicons name="checkmark-circle" size={16} color={Palette.success} />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.reqLabel, labelStyle]}>{requirement.label}</Animated.Text>
    </View>
  );
}

interface PasswordRequirementsCardProps {
  password: string;
}

export default function PasswordRequirementsCard({ password }: PasswordRequirementsCardProps) {
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
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 2,
    marginBottom: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.40)',
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
    borderColor: MUTED_DOT,
  },
  reqLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
});
