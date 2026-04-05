import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

/* ═══════════════════════════════════════════════════════════════════════════
 * PREMIUM WORKFLOW STEPPER — v2
 *
 * Compact 6-step horizontal stepper:
 * Upload → Detect → 3D → Estimate → Review → Confirm
 *
 * Small circles · orange pulse · green check · thin line · compact height
 * Tesla / Porsche service dashboard aesthetic
 * ═══════════════════════════════════════════════════════════════════════════ */

const ACCENT = '#FF6B35';
const SUCCESS = '#10B981';

interface StepDef {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const STEPS: StepDef[] = [
  { key: 'uploading',              label: 'Upload',   icon: 'cloud-upload-outline' },
  { key: 'analyzing',              label: 'Detect',   icon: 'scan-outline' },
  { key: 'generating_3d',          label: '3D',       icon: 'cube-outline' },
  { key: 'estimating_cost',        label: 'Estimate', icon: 'calculator-outline' },
  { key: 'awaiting_confirmation',  label: 'Review',   icon: 'eye-outline' },
  { key: 'confirmed',              label: 'Confirm',  icon: 'checkmark-done-outline' },
];

const STATUS_ORDER: Record<string, number> = {
  idle: 0,
  uploading: 1,
  analyzing: 2,
  generating_3d: 3,
  rendering_ar: 3.5,
  estimating_cost: 4,
  awaiting_confirmation: 5,
  confirmed: 6,
  timeout: -1,
  failed: -1,
};

/* ── Pulse Ring — active step glow ──────────────────────────────── */
function PulseRing() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + pulse.value * 0.5,
    transform: [{ scale: 1 + pulse.value * 0.55 }],
  }));

  return <Animated.View style={[styles.pulseRing, ringStyle]} />;
}

/* ── Step Circle ────────────────────────────────────────────────── */
function StepCircle({
  step,
  isCompleted,
  isActive,
}: {
  step: StepDef;
  isCompleted: boolean;
  isActive: boolean;
}) {
  const circleScale = useSharedValue(0.8);

  useEffect(() => {
    circleScale.value = withSpring(1, { damping: 14, stiffness: 200 });
  }, [isCompleted, isActive]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: circleScale.value }],
  }));

  return (
    <View style={styles.circleContainer}>
      {isActive && <PulseRing />}
      <Animated.View
        style={[
          styles.circle,
          isCompleted && styles.circleCompleted,
          isActive && styles.circleActive,
          animStyle,
        ]}
      >
        {isCompleted ? (
          <Ionicons name="checkmark" size={10} color="#fff" />
        ) : (
          <Ionicons
            name={step.icon}
            size={9}
            color={isActive ? '#fff' : '#3a3a48'}
          />
        )}
      </Animated.View>
    </View>
  );
}

/* ── Connecting Line ────────────────────────────────────────────── */
function ConnectingLine({ isCompleted, isActive }: { isCompleted: boolean; isActive: boolean }) {
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    const target = isCompleted ? 100 : isActive ? 50 : 0;
    fillWidth.value = withTiming(target, { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [isCompleted, isActive]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%` as any,
  }));

  return (
    <View style={styles.lineTrack}>
      <Animated.View
        style={[
          styles.lineFill,
          isCompleted ? styles.lineFillCompleted : styles.lineFillActive,
          fillStyle,
        ]}
      />
    </View>
  );
}

/* ── Main Component ─────────────────────────────────────────────── */
interface WorkflowStepperProps {
  currentStatus: string;
  isUploadComplete?: boolean;
}

export default function WorkflowStepper({ currentStatus, isUploadComplete }: WorkflowStepperProps) {
  const currentRank = STATUS_ORDER[currentStatus] ?? 0;

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      {STEPS.map((step, index) => {
        const stepRank = STATUS_ORDER[step.key] ?? index + 1;
        let isCompleted = currentRank > stepRank;
        let isActive =
          currentStatus === step.key ||
          (step.key === 'awaiting_confirmation' && currentStatus === 'rendering_ar');

        // Mark upload as completed once at least 1 image is uploaded
        if (step.key === 'uploading' && isUploadComplete && currentRank < stepRank) {
          isCompleted = true;
          isActive = false;
        }

        const isLast = index === STEPS.length - 1;

        return (
          <View key={step.key} style={styles.stepGroup}>
            <View style={styles.stepVisual}>
              <StepCircle step={step} isCompleted={isCompleted} isActive={isActive} />
              {!isLast && (
                <ConnectingLine
                  isCompleted={isCompleted}
                  isActive={isActive}
                />
              )}
            </View>
            <Text
              style={[
                styles.label,
                isActive && styles.labelActive,
                isCompleted && styles.labelCompleted,
              ]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </Animated.View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * STYLES — Compact, premium, thin line design
 * ═══════════════════════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  stepGroup: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  stepVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    height: 18,
  },
  circleContainer: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ACCENT,
    zIndex: 0,
  },
  circle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0c0c14',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  circleCompleted: {
    backgroundColor: SUCCESS,
    borderColor: 'rgba(16,185,129,0.5)',
    shadowColor: SUCCESS,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  circleActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  lineTrack: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 0.5,
    marginHorizontal: -1,
    overflow: 'hidden',
    zIndex: 1,
  },
  lineFill: {
    height: '100%',
    borderRadius: 0.5,
  },
  lineFillCompleted: {
    backgroundColor: 'rgba(16,185,129,0.6)',
  },
  lineFillActive: {
    backgroundColor: 'rgba(255,107,53,0.5)',
  },
  label: {
    color: '#2a2a35',
    fontSize: 7,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  labelActive: {
    color: ACCENT,
  },
  labelCompleted: {
    color: '#5a5a68',
  },
});
