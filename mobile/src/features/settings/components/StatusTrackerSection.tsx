import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { bookingService } from '@/services/api/bookingService';
import SectionHeader from './SectionHeader';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';

const ACCENT = '#FF6B35';

const STEPS = [
  { key: 'pending',     label: 'Booked',      icon: 'receipt-outline'          as const },
  { key: 'confirmed',   label: 'Confirmed',   icon: 'checkmark-circle-outline' as const },
  { key: 'assigned',    label: 'Assigned',    icon: 'person-outline'           as const },
  { key: 'received',    label: 'Checked-In',  icon: 'car-outline'              as const },
  { key: 'in_progress', label: 'In Service',  icon: 'construct-outline'        as const },
  { key: 'completed',   label: 'QC',          icon: 'shield-checkmark-outline' as const },
  { key: 'paid',        label: 'Payment',     icon: 'card-outline'             as const },
  { key: 'released',    label: 'Released',    icon: 'checkmark-done-outline'   as const },
];

const STATUS_TO_STEP: Record<string, number> = {
  pending:        0,
  confirmed:      1,
  assigned:       2,
  received:       3,
  queued:         1,
  'in-progress':  4,
  in_progress:    4,
  'quality-check':5,
  quality_check:  5,
  completed:      5,
  paid:           6,
  ready:          6,
  released:       7,
};

function PulsingDot({ active }: { active: boolean }) {
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 700 }),
          withTiming(1, { duration: 700 })
        ),
        -1,
        true
      );
    }
  }, [active]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: active ? pulseScale.value : 1 }],
  }));

  return <Animated.View style={[s.pulseOuter, active && s.pulseActive, animStyle]} />;
}

export default function StatusTrackerSection() {
  const { profile } = useAuth();
  
  const { data: latest } = useQuery({
    queryKey: ['bookings', 'latest'],
    queryFn: () => bookingService.getLatestActiveBooking(),
    enabled: !!profile?.id,
  });

  const currentStep = latest ? STATUS_TO_STEP[latest.status.toLowerCase()] ?? -1 : -1;
  const serviceName = latest ? latest.serviceName : null;

  return (
    <Animated.View entering={FadeInUp.delay(350).duration(200)}>
      <SectionHeader title="Service Progress" icon="analytics-outline" />

      <View style={s.card}>
        <LinearGradient
          colors={['rgba(255,255,255,0.025)', 'rgba(255,255,255,0.01)']}
          style={s.cardInner}
        >
          {serviceName && (
            <Text style={s.serviceLabel} numberOfLines={1}>
              {serviceName}
            </Text>
          )}

          {currentStep < 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="analytics-outline" size={22} color="#3A3A48" />
              <Text style={s.emptyText}>No active service in progress</Text>
            </View>
          ) : (
            <View style={s.stepsRow}>
              {STEPS.map((step, idx) => {
                const isDone = idx < currentStep;
                const isActive = idx === currentStep;
                const isPending = idx > currentStep;

                const dotColor = isDone
                  ? '#10B981'
                  : isActive
                    ? ACCENT
                    : 'rgba(255,255,255,0.08)';

                return (
                  <View key={step.key} style={s.stepItem}>
                    {/* Connecting line (left) */}
                    {idx > 0 && (
                      <View
                        style={[
                          s.lineLeft,
                          { backgroundColor: isDone ? '#10B981' : 'rgba(255,255,255,0.06)' },
                        ]}
                      />
                    )}

                    {/* Step dot */}
                    <View style={[s.stepDot, { backgroundColor: dotColor, borderColor: isActive ? ACCENT + '60' : 'transparent' }]}>
                      {isDone ? (
                        <Ionicons name="checkmark" size={10} color="#FFF" />
                      ) : isActive ? (
                        <PulsingDot active />
                      ) : (
                        <View style={s.stepDotInner} />
                      )}
                    </View>

                    {/* Label */}
                    <Text
                      style={[
                        s.stepLabel,
                        isDone && { color: '#10B981' },
                        isActive && { color: ACCENT, fontWeight: '700' },
                        isPending && { color: '#4A4A58' },
                      ]}
                    >
                      {step.label}
                    </Text>

                    {/* Connecting line (right) */}
                    {idx < STEPS.length - 1 && (
                      <View
                        style={[
                          s.lineRight,
                          { backgroundColor: isDone ? '#10B981' : 'rgba(255,255,255,0.06)' },
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  cardInner: {
    padding: 18,
  },
  serviceLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A0A0AB',
    letterSpacing: 0.5,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginBottom: 5,
    zIndex: 2,
  },
  stepDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  stepLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: '#6B6B78',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  lineLeft: {
    position: 'absolute',
    top: 9,
    right: '50%',
    left: 0,
    height: 2,
    zIndex: 1,
  },
  lineRight: {
    position: 'absolute',
    top: 9,
    left: '50%',
    right: 0,
    height: 2,
    zIndex: 1,
  },
  pulseOuter: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,107,53,0.4)',
  },
  pulseActive: {
    backgroundColor: '#FFF',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  emptyText: {
    fontSize: 11,
    color: '#5A5A68',
    fontWeight: '500',
  },
});
