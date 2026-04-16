import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import PremiumButton from '@/components/ui/PremiumButton';
import { Palette } from '@/constants/theme';

interface TimeoutCardProps {
  step: string;
  message?: string;
  onRetry: () => void;
  onContinue: () => void;
}

const STEP_LABELS: Record<string, string> = {
  uploading: 'Image Upload',
  analyzing: 'Damage Scan',
  generating_3d: '3D Model Generation',
  estimating_cost: 'Cost Estimation',
};

export default function TimeoutCard({
  step,
  message,
  onRetry,
  onContinue,
}: TimeoutCardProps) {
  const clockPulse = useSharedValue(0);

  useEffect(() => {
    clockPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const clockStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.95 + clockPulse.value * 0.1 }],
    opacity: 0.7 + clockPulse.value * 0.3,
  }));

  const stepLabel = STEP_LABELS[step] || step;

  return (
    <Animated.View entering={FadeInDown.duration(200)} style={styles.container}>
      {/* Glow border top accent */}
      <View style={styles.accentBar} />

      <View style={styles.content}>
        <View style={styles.iconRow}>
          <Animated.View style={clockStyle}>
            <Ionicons name="time-outline" size={32} color={Palette.warning} />
          </Animated.View>
        </View>

        <Text style={styles.title}>Processing Taking Longer Than Expected</Text>
        <Text style={styles.subtitle}>
          {message || `The ${stepLabel} step is still processing. You can retry or continue while it completes in the background.`}
        </Text>

        <View style={styles.stepBadge}>
          <Ionicons name="hourglass-outline" size={12} color={Palette.warning} />
          <Text style={styles.stepBadgeText}>Step: {stepLabel}</Text>
        </View>

        <View style={styles.actions}>
          <PremiumButton
            title="Retry Step"
            icon="refresh-outline"
            onPress={onRetry}
            style={styles.retryBtn}
          />
          <PremiumButton
            title="Continue Processing"
            icon="arrow-forward-outline"
            onPress={onContinue}
            variant="outline"
            style={styles.continueBtn}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    backgroundColor: '#0c0c12',
    overflow: 'hidden',
  },
  accentBar: {
    height: 3,
    backgroundColor: Palette.warning,
    opacity: 0.6,
  },
  content: {
    padding: 20,
    gap: 12,
    alignItems: 'center',
  },
  iconRow: {
    marginBottom: 4,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: '#9a9aa8',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: 'rgba(245,158,11,0.1)',
  },
  stepBadgeText: {
    color: Palette.warning,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actions: {
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
  retryBtn: {
    flex: 1,
  },
  continueBtn: {
    flex: 1,
  },
});
