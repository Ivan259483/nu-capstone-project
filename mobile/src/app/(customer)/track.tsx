/**
 * Service Tracker — 5-Step Vertical Timeline
 * Source of truth: CustomerDashboard.tsx web tracker (5-step flow + serviceTrackingStage logic)
 *
 * Steps:
 *   1. Appointment Confirmed  → status: confirmed / approved / assigned
 *   2. Vehicle Arrive         → status: received / serviceTrackingStage: received
 *   3. Service In Progress    → status: in_progress / customerStatus: washing|detailing|finishing
 *   4. Quality Check          → serviceTrackingStage: quality_check
 *   5. Ready for Pickup       → status: ready_for_payment / completed / paid / released / serviceTrackingStage: ready_pickup
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
  Image,
  Alert,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PageSkeleton as LoadingPageSkeleton, PremiumLoader } from '@/components/ui/loading';
import { MotionModal } from '@/components/ui/MotionOverlay';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useReducedMotion,
  cancelAnimation,
  withDelay,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { bookingService } from '@/services/api/bookingService';
import { getApiErrorMessage } from '@/services/api/client';
import AnimatedHeader from '@/components/ui/AnimatedHeader';
import type { BookingRecord } from '@/services/api/types';
import { useQuery } from '@tanstack/react-query';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useCustomerBookings } from '@/hooks/useCustomerBookings';
import { isDefaultTrackBookingRow } from '@/utils/customerBookingLifecycle';
import {
  bookingIsReadyForPickup,
  bookingIsTerminalForLiveTracker,
  bookingShowsCustomerLiveTracker,
  pickCustomerLiveTrackerBooking,
} from '@/utils/customer-live-tracker-pick';
import {
  getCustomerStageSlotPhotos,
  resolveTrackerStageDescription,
  type TrackerMediaStage,
} from '@/utils/customer-tracker-stage-media';
import { CUSTOMER_TRACKER_STEPS, resolveCustomerTrackerStage } from '@/utils/customer-tracker-stage';
import { resolveCustomerPaymentState } from '@/utils/customer-payment-state';
import {
  PAYMENT_PROOF_PICKER_OPTIONS,
  paymentProofDataUrlFromAsset,
} from '@/utils/payment-proof-image';
import { getCustomerTrackerTimestamps, getCustomerTrackerTeam } from '@/utils/customer-tracker-details';
import { Haptics } from '@/utils/haptics';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg:        '#0A0A0A',
  surface:   '#111111',
  surfaceAlt:'#161616',
  elevated:  '#1C1C1C',
  border:    '#222222',
  text:      '#FFFFFF',
  textSec:   '#A1A1AA',
  textMut:   '#71717A',
  textDim:   '#3F3F46',
  orange:    '#F97316',
  orangeDim: 'rgba(249,115,22,0.10)',
  orangeBrd: 'rgba(249,115,22,0.25)',
  green:     '#22C55E',
  greenDim:  'rgba(34,197,94,0.10)',
  greenBrd:  'rgba(34,197,94,0.25)',
} as const;

const TRACKER_STEPS = CUSTOMER_TRACKER_STEPS;

// ── Canonical stage → 5-step index ───────────────────────────────────────────
// The customer pipeline is five steps; the QC gate pipeline is four. An operational gate
// index is never reused as a customer step index — `resolveCustomerTrackerStage` owns that
// translation, and web + mobile both read it, so a job in Quality Check is customer step 4
// of 5 at 75% on every surface.

function trackerKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
}

function resolveStep(booking: any): number {
  const s = trackerKey(booking?.status);
  if (['cancelled', 'failed'].includes(s)) return -1;
  if (bookingIsReadyForPickup(booking)) return 4;
  return resolveCustomerTrackerStage(booking).stageIndex;
}

function isPostPaymentCompleteDisplay(booking: BookingRecord | null | undefined): boolean {
  if (!booking) return false;
  const status = trackerKey(booking.status);
  const stage = trackerKey(booking.serviceTrackingStage);
  const paymentPaid = String(booking.paymentStatus || '').toLowerCase() === 'paid';
  return paymentPaid && (status === 'completed' || status === 'released' || stage === 'released');
}

function isAppointmentSecuredDisplay(booking: BookingRecord | null | undefined): boolean {
  if (!booking) return false;
  const status = trackerKey(booking.status);
  const stage = trackerKey(booking.serviceTrackingStage);
  if (['pending', 'pending_confirmation', 'rejected', 'cancelled', 'failed'].includes(status)) {
    return false;
  }
  return (
    ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'ready_for_payment', 'completed', 'paid', 'released', 'done'].includes(status) ||
    ['confirmed', 'received', 'in_progress', 'quality_check', 'ready_pickup', 'completed', 'released'].includes(stage)
  );
}

function looksLikeOpaqueTechnicalId(value: string): boolean {
  const v = value.trim();
  return /^[a-f0-9]{24}$/i.test(v) || (v.length >= 24 && /^[a-z0-9_-]+$/i.test(v));
}

function getBookingReferenceLabel(booking: BookingRecord | null | undefined): string {
  if (!booking) return 'Confirmed job';
  const raw = booking.bookingReference || booking.orderNumber || booking._id || booking.id || '';
  const ref = String(raw).trim();
  if (!ref || looksLikeOpaqueTechnicalId(ref)) return 'Confirmed job';
  return ref;
}

function hasTrackerStageMediaField(booking: unknown): boolean {
  return Boolean(
    booking &&
    typeof booking === 'object' &&
    Object.prototype.hasOwnProperty.call(booking, 'trackerStageMedia')
  );
}

function mergeTrackerMediaPayload(
  booking: BookingRecord | null,
  payload: BookingRecord | null | undefined
): BookingRecord | null {
  if (!booking || !payload) return booking;
  return {
    ...booking,
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.paymentStatus !== undefined ? { paymentStatus: payload.paymentStatus } : {}),
    ...(payload.serviceTrackingStage !== undefined ? { serviceTrackingStage: payload.serviceTrackingStage } : {}),
    ...(payload.serviceStaffAssignments !== undefined ? { serviceStaffAssignments: payload.serviceStaffAssignments || [] } : {}),
    ...(hasTrackerStageMediaField(payload)
      ? { trackerStageMedia: Array.isArray(payload.trackerStageMedia) ? payload.trackerStageMedia : [] }
      : {}),
    ...(payload.updatedAt ? { updatedAt: payload.updatedAt } : {}),
  };
}

// ─── Time Helpers (mirrors web getStepTimestamps + formatEtaLabel) ─────────────
function formatTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hr = d.getHours();
  const min = d.getMinutes().toString().padStart(2, '0');
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const time = `${(hr % 12) || 12}:${min} ${ampm}`;
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return time;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${time}`;
}

function getEtaLabel(booking: any): string {
  const eta = booking?.estimatedCompletion || booking?.jobOrder?.targetReleaseDate;
  if (eta) {
    const d = new Date(eta);
    if (!isNaN(d.getTime())) {
      const hr = d.getHours();
      const min = d.getMinutes().toString().padStart(2, '0');
      return `${(hr % 12) || 12}:${min} ${hr >= 12 ? 'PM' : 'AM'}`;
    }
  }
  return '—';
}

// ─── Circular Progress Ring (react-native-svg + Reanimated) ──────────────────
const RING_SIZE   = 180;
const RING_STROKE = 14;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function CircularRing({ pct, accent = C.orange }: { pct: number; accent?: string }) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const pulse = useSharedValue(0);
  const orbit = useSharedValue(0);
  const sweep = useSharedValue(0);
  const normalizedPct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;

  const isGreenAccent = accent === C.green;
  const accentSoft = isGreenAccent ? 'rgba(34,197,94,0.18)' : 'rgba(249,115,22,0.18)';
  const accentAura = isGreenAccent ? 'rgba(34,197,94,0.08)' : 'rgba(249,115,22,0.08)';
  const sweepColors: [string, string, string] = isGreenAccent
    ? ['rgba(34,197,94,0)', 'rgba(187,247,208,0.22)', 'rgba(34,197,94,0)']
    : ['rgba(249,115,22,0)', 'rgba(253,186,116,0.24)', 'rgba(249,115,22,0)'];

  useEffect(() => {
    if (reducedMotion) {
      progress.value = normalizedPct / 100;
      return;
    }
    progress.value = withTiming(normalizedPct / 100, { duration: 1400, easing: Easing.out(Easing.cubic) });
  }, [normalizedPct, progress, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(pulse);
      cancelAnimation(orbit);
      cancelAnimation(sweep);
      pulse.value = 0;
      orbit.value = 0;
      sweep.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      false,
    );
    orbit.value = withRepeat(
      withTiming(1, { duration: 5800, easing: Easing.linear }),
      -1,
      false,
    );
    sweep.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(orbit);
      cancelAnimation(sweep);
    };
  }, [orbit, pulse, reducedMotion, sweep]);

  const animatedProps = useAnimatedProps(() => {
    const normalizedProgress = Math.min(1, Math.max(0, progress.value));
    return {
      strokeDashoffset: CIRCUMFERENCE * (1 - normalizedProgress),
      opacity: normalizedProgress <= 0 ? 0 : 1,
    };
  });
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.48 + pulse.value * 0.22,
    transform: [
      { rotate: `${orbit.value * 360}deg` },
      { scale: 1 + pulse.value * 0.018 },
    ],
  }));
  const auraStyle = useAnimatedStyle(() => ({
    opacity: 0.68 + pulse.value * 0.28,
    transform: [{ scale: 1 + pulse.value * 0.035 }],
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + pulse.value * 0.18,
    transform: [
      { translateX: -RING_SIZE * 0.72 + sweep.value * RING_SIZE * 1.44 },
      { rotate: '-18deg' },
    ],
  }));

  return (
    <View style={rg.shell}>
      <Animated.View style={[rg.outerHalo, { borderColor: accentSoft }, haloStyle]} />
      <Animated.View style={[rg.aura, { backgroundColor: accentAura }, auraStyle]} />
      <View style={rg.innerBackdrop}>
        <Animated.View style={[rg.shimmer, shimmerStyle]}>
          <LinearGradient
            colors={sweepColors}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        style={[rg.svg, { transform: [{ rotate: '-90deg' }] }]}
      >
        {/* Track */}
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="#1C1C1C"
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={accentSoft}
          strokeWidth={RING_STROKE + 8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={animatedProps}
        />
        {/* Progress arc */}
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={accent}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeLinecap="round"
          animatedProps={animatedProps}
        />
      </Svg>

      {/* Center text */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[rg.pct, { color: accent }]}>{normalizedPct}%</Text>
          <Text style={rg.done}>COMPLETE</Text>
        </View>
      </View>
    </View>
  );
}

const rg = StyleSheet.create({
  shell: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerHalo: {
    position: 'absolute',
    width: RING_SIZE + 26,
    height: RING_SIZE + 26,
    borderRadius: (RING_SIZE + 26) / 2,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  aura: {
    position: 'absolute',
    width: RING_SIZE + 6,
    height: RING_SIZE + 6,
    borderRadius: (RING_SIZE + 6) / 2,
  },
  innerBackdrop: {
    position: 'absolute',
    width: RING_SIZE - 20,
    height: RING_SIZE - 20,
    borderRadius: (RING_SIZE - 20) / 2,
    backgroundColor: 'rgba(255,255,255,0.018)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  shimmer: {
    position: 'absolute',
    top: -24,
    bottom: -24,
    width: 58,
  },
  svg: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  pct:  { fontSize: 34, fontWeight: '800', color: C.orange, letterSpacing: -1.5 },
  done: { fontSize: 11, fontWeight: '700', color: C.textMut, letterSpacing: 2.5, marginTop: 2 },
});

// ─── Live Badge ───────────────────────────────────────────────────────────────
function LiveBadge() {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(pulse);
      cancelAnimation(sweep);
      pulse.value = 0;
      sweep.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      false,
    );
    sweep.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(sweep);
    };
  }, [pulse, reducedMotion, sweep]);
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.75 }],
  }));
  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.92 + pulse.value * 0.18 }],
  }));
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + pulse.value * 0.1,
    transform: [
      { translateX: -72 + sweep.value * 144 },
      { rotate: '-18deg' },
    ],
  }));

  return (
    <View style={lb.badge}>
      <Animated.View pointerEvents="none" style={[lb.sweep, sweepStyle]}>
        <LinearGradient
          colors={['rgba(34,197,94,0)', 'rgba(187,247,208,0.34)', 'rgba(34,197,94,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={lb.signal}>
        <Animated.View style={[lb.signalHalo, haloStyle]} />
        <Animated.View style={[lb.signalDot, dotStyle]} />
      </View>
      <Text style={lb.text}>
        LIVE TRACKING
      </Text>
      <Ionicons name="radio-outline" size={13} color={C.green} />
    </View>
  );
}

const lb = StyleSheet.create({
  badge: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.22)',
    backgroundColor: 'rgba(34,197,94,0.075)',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  sweep: {
    position: 'absolute',
    top: -16,
    bottom: -16,
    width: 46,
  },
  signal: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalHalo: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(34,197,94,0.28)',
  },
  signalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.green,
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    color: C.green,
    letterSpacing: 1.1,
  },
});

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function PageSkeleton() {
  return <LoadingPageSkeleton preset="list" rows={4} style={{ paddingHorizontal: 0, paddingTop: 12 }} />;
}

// ─── Timeline Step Card ───────────────────────────────────────────────────────
function TimelineStep({
  step,
  index,
  currentIdx,
  timestamp,
  isLast,
  booking,
  mediaStage,
  finalStepComplete,
  appointmentSecuredComplete,
}: {
  step: typeof TRACKER_STEPS[number];
  index: number;
  currentIdx: number;
  timestamp: string;
  isLast: boolean;
  booking: any | null;
  mediaStage: TrackerMediaStage | null;
  finalStepComplete: boolean;
  appointmentSecuredComplete: boolean;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [galleryStartIndex, setGalleryStartIndex] = useState<number | null>(null);
  const [galleryPage, setGalleryPage] = useState(0);
  const galleryScrollRef = useRef<ScrollView>(null);
  const insetsModal = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const isFinalStep = index === TRACKER_STEPS.length - 1;
  const isSecuredSlotStep = index === 0 && appointmentSecuredComplete;
  const isDone    = currentIdx > index || (isFinalStep && finalStepComplete) || isSecuredSlotStep;
  const isActive  = currentIdx === index && !isDone;
  const isPending = currentIdx < index;

  const shots = useMemo(() => {
    if (!booking || !mediaStage) return [];
    return getCustomerStageSlotPhotos(booking, mediaStage);
  }, [booking, mediaStage]);

  const galleryOpen = galleryStartIndex !== null && shots.length > 0;

  useEffect(() => {
    if (shots.length === 0) setGalleryStartIndex(null);
  }, [shots.length]);

  useEffect(() => {
    if (!galleryOpen || galleryStartIndex === null) return;
    setGalleryPage(galleryStartIndex);
    const id = requestAnimationFrame(() => {
      galleryScrollRef.current?.scrollTo({
        x: galleryStartIndex * windowWidth,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [galleryOpen, galleryStartIndex, windowWidth]);

  const closeGallery = () => {
    setGalleryStartIndex(null);
  };

  const hasPremiumMotion = !reducedMotion && (isActive || isSecuredSlotStep);
  const premiumSweepColors: [string, string, string] = isSecuredSlotStep
    ? ['rgba(34,197,94,0)', 'rgba(187,247,208,0.18)', 'rgba(34,197,94,0)']
    : ['rgba(249,115,22,0)', 'rgba(253,186,116,0.16)', 'rgba(249,115,22,0)'];
  const cardPulse = useSharedValue(0);
  const cardSweep = useSharedValue(0);
  const glowOp = useSharedValue(0);

  useEffect(() => {
    if (isActive && !reducedMotion) {
      glowOp.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 900 }),
          withTiming(0,   { duration: 900 }),
        ),
        -1,
        false,
      );
    } else {
      glowOp.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reanimated shared value ref
  }, [isActive, reducedMotion]);

  useEffect(() => {
    if (hasPremiumMotion) {
      cardPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1450, easing: Easing.inOut(Easing.cubic) }),
          withTiming(0, { duration: 1450, easing: Easing.inOut(Easing.cubic) }),
        ),
        -1,
        false,
      );
      cardSweep.value = withRepeat(
        withTiming(1, { duration: 3100, easing: Easing.inOut(Easing.cubic) }),
        -1,
        false,
      );
    } else {
      cardPulse.value = withTiming(0, { duration: 240 });
      cardSweep.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reanimated shared value refs
  }, [hasPremiumMotion]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOp.value }));
  const cardMotionStyle = useAnimatedStyle(() => ({
    transform: hasPremiumMotion
      ? [
        { translateY: -1 - cardPulse.value * 1.2 },
        { scale: 1 + cardPulse.value * 0.004 },
      ]
      : [{ translateY: 0 }, { scale: 1 }],
  }));
  const cardSweepStyle = useAnimatedStyle(() => ({
    opacity: hasPremiumMotion ? 0.12 + cardPulse.value * 0.1 : 0,
    transform: [
      { translateX: -96 + cardSweep.value * Math.max(windowWidth - 54, 180) },
      { rotate: '-16deg' },
    ],
  }));
  const iconMotionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: hasPremiumMotion ? 1 + cardPulse.value * 0.08 : 1 }],
  }));

  return (
    <View style={[tl.row, isLast && { paddingBottom: 0 }]}>

      {/* Left column: icon + connector */}
      <View style={tl.leftCol}>
        <Animated.View style={[
          tl.iconWrap,
          isDone    && tl.iconDone,
          isActive  && tl.iconActive,
          isPending && tl.iconPending,
          isSecuredSlotStep && tl.iconSecured,
          iconMotionStyle,
        ]}>
          {isDone ? (
            <Ionicons name="checkmark" size={16} color="#FFF" />
          ) : (
            <Ionicons
              name={step.icon as any}
              size={15}
              color={isActive ? C.orange : C.textDim}
            />
          )}
          {isActive && (
            <Animated.View style={[tl.glow, glowStyle]} />
          )}
        </Animated.View>
        {!isLast && (
          <View style={[tl.connector, isDone && tl.connectorDone]} />
        )}
      </View>

      {/* Right: card */}
      <Animated.View style={[
        tl.card,
        isDone    && tl.cardDone,
        isActive  && tl.cardActive,
        isPending && tl.cardPending,
        isSecuredSlotStep && tl.cardSecured,
        isLast    && { marginBottom: 0 },
        cardMotionStyle,
      ]}>
        {hasPremiumMotion ? (
          <Animated.View pointerEvents="none" style={[tl.cardSweep, cardSweepStyle]}>
            <LinearGradient
              colors={premiumSweepColors}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : null}
        <View style={tl.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[
              tl.label,
              isDone    && tl.labelDone,
              isActive  && tl.labelActive,
              isPending && tl.labelPending,
            ]}>
              {step.label}
            </Text>
            <Text style={[tl.sub, isPending && { color: C.textDim }]}>
              {step.sub}
            </Text>
          </View>

          {isPending && (
            <Ionicons name="chevron-forward" size={13} color={C.textDim} />
          )}
          {(isDone || isActive) && !!timestamp && (
            <Text style={[tl.timestamp, isDone && { color: C.textMut }]}>
              {formatTime(timestamp)}
            </Text>
          )}
        </View>

        {isActive && (
          <View style={tl.activeRow}>
            <View style={tl.activeDot} />
            <Text style={tl.activeText}>In progress</Text>
          </View>
        )}
        {isDone && (isSecuredSlotStep || isFinalStep) && (
          <View style={tl.completeRow}>
            <Ionicons name="checkmark-circle" size={13} color={C.green} />
            <Text style={tl.completeText}>
              {isSecuredSlotStep ? 'Complete - slot secured' : 'Complete'}
            </Text>
          </View>
        )}

        {mediaStage ? (
          <>
            {shots.length > 0 ? (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={tl.mediaScroll}
                  contentContainerStyle={tl.mediaScrollContent}
                >
                  {shots.map((shot, si) => (
                    <TouchableOpacity
                      key={`${shot.url}-${si}`}
                      activeOpacity={0.85}
                      onPress={() => setGalleryStartIndex(si)}
                      style={tl.mediaItem}
                    >
                      <Image source={{ uri: shot.url }} style={tl.mediaThumb} resizeMode="cover" />
                      <Text style={tl.mediaCaption} numberOfLines={1}>
                        {shot.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={tl.mediaCountHint}>
                  {shots.length === 1
                    ? '1 photo'
                    : `${shots.length} photos · swipe left/right in viewer`}
                </Text>
              </>
            ) : isActive && mediaStage === 'quality_check' ? (
              <Text style={tl.mediaPending}>
                Upload pending — awaiting QC form photo from the shop.
              </Text>
            ) : null}

            <MotionModal
              visible={galleryOpen}
              onClose={closeGallery}
              dismissOnBackdrop={false}
              fullScreen
              contentStyle={[
                tl.modalRoot,
                { paddingTop: insetsModal.top + 8, paddingBottom: insetsModal.bottom + 8 },
              ]}
              accessibilityLabel={`${step.label} photo viewer`}
            >
                <View style={tl.modalHeader}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={tl.modalStage}>{step.label}</Text>
                    <Text style={tl.modalCounter}>
                      Photo {Math.min(galleryPage + 1, shots.length)} of {shots.length}
                    </Text>
                    {shots.length > 1 ? (
                      <Text style={tl.modalSwipeHint}>Swipe sideways to view each photo</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={closeGallery}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close photo viewer"
                  >
                    <Text style={tl.modalClose}>Close</Text>
                  </TouchableOpacity>
                </View>

                {shots.length > 1 ? (
                  <View style={tl.modalDots}>
                    {shots.map((_, di) => (
                      <View
                        key={`dot-${di}`}
                        style={[
                          tl.modalDot,
                          di === galleryPage ? tl.modalDotActive : tl.modalDotInactive,
                        ]}
                      />
                    ))}
                  </View>
                ) : null}

                <ScrollView
                  ref={galleryScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={tl.modalGalleryScroll}
                  onMomentumScrollEnd={(e) => {
                    const w = e.nativeEvent.layoutMeasurement.width;
                    const x = e.nativeEvent.contentOffset.x;
                    const page = Math.round(x / Math.max(w, 1));
                    setGalleryPage(Math.max(0, Math.min(page, shots.length - 1)));
                  }}
                >
                  {shots.map((shot, si) => (
                    <View
                      key={`gallery-${shot.url}-${si}`}
                      style={[tl.modalGalleryPage, { width: windowWidth }]}
                    >
                      <Image
                        source={{ uri: shot.url }}
                        style={tl.modalGalleryImage}
                        resizeMode="contain"
                      />
                      <Text style={tl.modalGalleryLabel} numberOfLines={2}>
                        {shot.label}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
            </MotionModal>
          </>
        ) : null}
      </Animated.View>
    </View>
  );
}

const tl = StyleSheet.create({
  row:     { flexDirection: 'row', gap: 12, paddingBottom: 4 },
  leftCol: { alignItems: 'center', width: 38 },

  iconWrap: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#252525',
    backgroundColor: '#141414', zIndex: 1,
  },
  iconDone:    { backgroundColor: C.green,                 borderColor: C.green },
  iconActive:  { backgroundColor: 'rgba(249,115,22,0.10)', borderColor: C.orange },
  iconPending: { backgroundColor: '#111',                  borderColor: '#1E1E1E' },
  iconSecured: {
    backgroundColor: '#16A34A',
    borderColor: 'rgba(187,247,208,0.86)',
    ...Platform.select({
      ios: { shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 12 },
      android: { elevation: 5 },
    }),
  },

  glow: {
    position: 'absolute', width: 38, height: 38, borderRadius: 19,
    borderWidth: 2, borderColor: C.orange, opacity: 0,
  },

  connector:     { width: 2, flex: 1, minHeight: 20, backgroundColor: '#252525', marginVertical: 3 },
  connectorDone: { backgroundColor: C.green },

  card: {
    flex: 1, borderRadius: 14, borderWidth: 1,
    backgroundColor: '#131313', borderColor: '#1E1E1E',
    padding: 14, marginBottom: 8,
    overflow: 'hidden',
  },
  cardDone: {
    backgroundColor: '#0D1810',
    borderColor: 'rgba(34,197,94,0.18)',
  },
  cardSecured: {
    backgroundColor: '#0B1A10',
    borderColor: 'rgba(134,239,172,0.34)',
  },
  cardActive: {
    backgroundColor: 'rgba(249,115,22,0.06)',
    borderColor: 'rgba(249,115,22,0.35)',
    ...Platform.select({
      ios: { shadowColor: C.orange, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14 },
      android: { elevation: 5 },
    }),
  },
  cardPending: { opacity: 0.55 },
  cardSweep: {
    position: 'absolute',
    top: -34,
    bottom: -34,
    width: 82,
  },

  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },

  label:        { fontSize: 14, fontWeight: '600', color: C.textSec,  marginBottom: 3 },
  labelDone:    { color: C.green,   fontWeight: '700' },
  labelActive:  { color: C.orange,  fontWeight: '700' },
  labelPending: { color: C.textDim },

  sub:       { fontSize: 12, color: C.textMut },
  timestamp: { fontSize: 10, fontWeight: '700', color: C.orange, flexShrink: 0, marginTop: 2 },

  activeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(249,115,22,0.15)',
  },
  activeDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: C.orange },
  activeText: { fontSize: 11, fontWeight: '600', color: C.orange },
  completeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(34,197,94,0.16)',
  },
  completeText: { fontSize: 11, fontWeight: '700', color: C.green },

  mediaScroll: { marginTop: 10, maxHeight: 102 },
  mediaScrollContent: { gap: 10, paddingRight: 4 },
  mediaItem: { width: 84 },
  mediaThumb: {
    width: 76,
    height: 76,
    borderRadius: 10,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  mediaCaption: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    color: C.textMut,
    maxWidth: 84,
  },
  mediaPending: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
    color: C.textDim,
    fontStyle: 'italic',
  },
  mediaCountHint: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '600',
    color: C.textDim,
    letterSpacing: 0.2,
  },

  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  modalStage: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textMut,
    marginBottom: 2,
  },
  modalCounter: {
    fontSize: 17,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.3,
  },
  modalSwipeHint: {
    marginTop: 4,
    fontSize: 11,
    color: C.textDim,
  },
  modalClose: { fontSize: 15, fontWeight: '700', color: C.orange, paddingTop: 2 },
  modalDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
  },
  modalDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  modalDotActive: {
    backgroundColor: C.orange,
    transform: [{ scale: 1.15 }],
  },
  modalDotInactive: {
    backgroundColor: C.textDim,
    opacity: 0.45,
  },
  modalGalleryScroll: {
    flex: 1,
    width: '100%',
  },
  modalGalleryPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: 320,
  },
  modalGalleryImage: {
    width: '100%',
    flex: 1,
    minHeight: 260,
    maxHeight: 520,
  },
  modalGalleryLabel: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: C.textSec,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});

// ─── History Card ─────────────────────────────────────────────────────────────
function HistoryCard({ booking, index }: { booking: BookingRecord; index: number }) {
  const service = booking.serviceName || booking.serviceType || 'Service';
  const date    = booking.bookingDate || (booking as any).date || '';
  const isDone  = ['completed', 'paid', 'released'].includes(booking.status);

  return (
    <Animated.View entering={FadeInDown.delay(150 + index * 50).duration(200)}>
      <View style={hc.card}>
        <View style={hc.row}>
          <View style={[hc.icon, { backgroundColor: isDone ? C.greenDim : 'rgba(239,68,68,0.08)' }]}>
            <Ionicons
              name={isDone ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={isDone ? C.green : '#EF4444'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={hc.service}>{service}</Text>
            <Text style={hc.date}>{date}</Text>
          </View>
          <View style={[hc.pill, { backgroundColor: isDone ? C.greenDim : 'rgba(239,68,68,0.08)' }]}>
            <Text style={[hc.pillText, { color: isDone ? C.green : '#EF4444' }]}>
              {isDone ? 'Done' : 'Cancelled'}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const hc = StyleSheet.create({
  card:     { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  service:  { fontSize: 13, fontWeight: '600', color: C.text },
  date:     { fontSize: 11, color: C.textMut, marginTop: 2 },
  pill:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '700' },
});

// ─── Service Complete Screen ──────────────────────────────────────────────────
function ServiceCompleteCard({
  booking,
  countdown,
  onViewSummary,
}: {
  booking: any;
  countdown: number;
  onViewSummary: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const checkScale = useSharedValue(0.4);
  const ringScale  = useSharedValue(0.6);
  const pulse      = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      checkScale.value = 1;
      ringScale.value = 1;
      pulse.value = 1;
      return;
    }
    checkScale.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.8)) });
    ringScale.value  = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
    pulse.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(1.07, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
          withTiming(1,    { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );
    return () => {
      cancelAnimation(checkScale);
      cancelAnimation(ringScale);
      cancelAnimation(pulse);
    };
  }, [checkScale, pulse, reducedMotion, ringScale]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value * pulse.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringScale.value,
  }));

  const orderNum = (() => {
    if (booking?.orderNumber) return `ORD-${booking.orderNumber}`;
    const raw = booking?._id || booking?.id || '';
    return raw ? `ORD-${String(raw).slice(-8).toUpperCase()}` : '';
  })();

  return (
    <View style={sc.container}>
      <Animated.View entering={FadeIn.duration(350)} style={sc.card}>

        {/* Animated green checkmark */}
        <Animated.View style={ringStyle}>
          <View style={sc.ringOuter}>
            <Animated.View style={checkStyle}>
              <Ionicons name="checkmark-circle" size={84} color={C.green} />
            </Animated.View>
          </View>
        </Animated.View>

        {/* Text block */}
        <View style={sc.textBlock}>
          <Text style={sc.title}>Service Complete</Text>
          <Text style={sc.sub}>Your vehicle is ready for pickup.</Text>
          {!!orderNum && <Text style={sc.order}>{orderNum}</Text>}
        </View>

        {/* Orange CTA */}
        <TouchableOpacity style={sc.cta} onPress={onViewSummary} activeOpacity={0.85}>
          <Text style={sc.ctaText}>View Booking Summary</Text>
          <Ionicons name="arrow-forward" size={16} color="#000" />
        </TouchableOpacity>

        {/* Countdown hint */}
        <Text style={sc.hint}>Redirecting in {countdown}s…</Text>
      </Animated.View>
    </View>
  );
}

const sc = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.greenBrd,
    padding: 36,
    alignItems: 'center',
    gap: 22,
    ...Platform.select({
      ios:     { shadowColor: C.green, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 28 },
      android: { elevation: 8 },
    }),
  },
  ringOuter: {
    width: 112, height: 112, borderRadius: 56,
    backgroundColor: C.greenDim,
    alignItems: 'center', justifyContent: 'center',
  },
  textBlock: { alignItems: 'center', gap: 8 },
  title: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  sub:   { fontSize: 14, color: C.textMut, textAlign: 'center', lineHeight: 20 },
  order: { fontSize: 12, fontWeight: '700', color: C.textDim, letterSpacing: 1.2, marginTop: 2 },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.orange, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 28,
    width: '100%', justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: C.orange, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 14 },
      android: { elevation: 5 },
    }),
  },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#000' },
  hint: { fontSize: 12, color: C.textDim, marginTop: -10 },
});

/** Stable fallback so `useMemo` never returns a fresh [] each render when the query has no data yet. */
const EMPTY_BOOKINGS: BookingRecord[] = [];

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TrackScreen() {
  const reducedMotion = useReducedMotion();
  const { profile } = useAuth();
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { id: routeBookingId } = useLocalSearchParams<{ id?: string }>();

  const [uploading,      setUploading]      = useState(false);
  /** Local payment proof preview after upload (merged into derived `booking`). */
  const [paymentProofLocal, setPaymentProofLocal] = useState<string | null>(null);
  // Release completion state
  const [showComplete,   setShowComplete]   = useState(false);
  const [completeBooking,setCompleteBooking]= useState<any>(null);
  const [countdown,      setCountdown]      = useState(3);
  // forceStepIdx: override step display when release fires before customer saw Step 5
  const [forceStepIdx,   setForceStepIdx]   = useState<number | null>(null);
  const prevStatusRef  = useRef<string | null>(null); // tracks previous status to detect transition
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const step5Timer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const premiumPulse = useSharedValue(0);
  const premiumSweep = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(premiumPulse);
      cancelAnimation(premiumSweep);
      premiumPulse.value = 0;
      premiumSweep.value = 0;
      return;
    }
    premiumPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      false,
    );
    premiumSweep.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(premiumPulse);
      cancelAnimation(premiumSweep);
    };
  }, [premiumPulse, premiumSweep, reducedMotion]);

  const stageSweepStyle = useAnimatedStyle(() => ({
    opacity: 0.09 + premiumPulse.value * 0.06,
    transform: [
      { translateX: -screenWidth * 0.55 + premiumSweep.value * screenWidth * 1.25 },
      { rotate: '-16deg' },
    ],
  }));

  // ── Data fetching ──
  const {
    data: bookingsQueryData,
    isLoading: isBookingsQueryLoading,
    isError: isBookingsQueryError,
    error: bookingsQueryError,
    refreshBookings,
  } = useCustomerBookings(!!profile);

  // ── Real-time socket invalidation (mirrors useLiveJobs.ts) ──
  useRealtimeSync(['orders']);

  const allBookings = useMemo(
    () => (bookingsQueryData === undefined ? EMPTY_BOOKINGS : bookingsQueryData),
    [bookingsQueryData]
  );

  const defaultTrackBooking = useMemo(() => {
    const trackerBooking = pickCustomerLiveTrackerBooking(allBookings);
    if (trackerBooking) return trackerBooking;

    // `isDefaultTrackBookingRow` only reads `status`, so it would still admit an order
    // whose terminal state lives on `serviceTrackingStage`. Apply the canonical terminal
    // guard as well, or a settled pickup order reappears here after the picker drops it.
    const active = [...allBookings]
      .filter((b: any) => isDefaultTrackBookingRow(b.status) && !bookingIsTerminalForLiveTracker(b))
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    return active[0] || null;
  }, [allBookings]);

  const routeBookingFromList = useMemo(
    () => routeBookingId
      ? allBookings.find((entry) => String(entry.id || entry._id) === String(routeBookingId)) ?? null
      : null,
    [allBookings, routeBookingId]
  );

  const trackerMediaBookingId = routeBookingId
    || routeBookingFromList?.id
    || routeBookingFromList?._id
    || defaultTrackBooking?.id
    || defaultTrackBooking?._id
    || '';
  const {
    data: trackerMediaData,
    isLoading: isTrackerMediaLoading,
    isError: isTrackerMediaError,
    error: trackerMediaError,
    refetch: refetchTrackerMedia,
  } = useQuery({
    queryKey: ['booking', trackerMediaBookingId, 'tracker-media'],
    queryFn: () => bookingService.getBookingTrackerMedia(trackerMediaBookingId),
    enabled: !!trackerMediaBookingId && !!profile,
    refetchInterval: 60_000,
  });

  const bookingFromQuery = useMemo(() => {
    if (routeBookingId) return routeBookingFromList ?? trackerMediaData ?? null;
    return defaultTrackBooking;
  }, [routeBookingId, routeBookingFromList, trackerMediaData, defaultTrackBooking]);

  useEffect(() => {
    setPaymentProofLocal(null);
  }, [bookingFromQuery?.id]);

  const booking = useMemo((): BookingRecord | null => {
    if (!bookingFromQuery) return null;
    const bookingWithTrackerMedia = mergeTrackerMediaPayload(bookingFromQuery, trackerMediaData) || bookingFromQuery;
    if (paymentProofLocal) {
      return {
        ...bookingWithTrackerMedia,
        paymentProofUrl: paymentProofLocal,
        hasPaymentProof: true,
        reservationPayment: {
          ...(bookingWithTrackerMedia.reservationPayment || {}),
          status: 'pending',
          amountSubmitted: 500,
          submittedAt: new Date().toISOString(),
          method: 'gcash',
        },
      };
    }
    return bookingWithTrackerMedia;
  }, [bookingFromQuery, trackerMediaData, paymentProofLocal]);

  const paymentState = useMemo(
    () => (booking ? resolveCustomerPaymentState(booking) : null),
    [booking]
  );

  useFocusEffect(useCallback(() => {
    // `refetch()` bypasses the query's `enabled` gate, so this must not fire
    // until auth has finished restoring — otherwise a focus event during
    // hydration (or a session invalidation in-flight) sends this protected
    // request with no/stale token.
    if (!profile) return undefined;
    if (trackerMediaBookingId) void refetchTrackerMedia();
    return undefined;
  }, [profile, refetchTrackerMedia, trackerMediaBookingId]));

  const isLoading =
    isBookingsQueryLoading || (!!routeBookingId && !routeBookingFromList && isTrackerMediaLoading);

  const showLoadError =
    !isLoading &&
    ((!routeBookingId && isBookingsQueryError) ||
      (!!routeBookingId && !routeBookingFromList && isTrackerMediaError));

  const loadErrorMessage = useMemo(() => {
    if (!showLoadError) return '';
    if (routeBookingId && isTrackerMediaError) {
      return getApiErrorMessage(trackerMediaError, 'Could not load this booking.');
    }
    return getApiErrorMessage(bookingsQueryError, 'Could not load your bookings. Check your connection and API URL.');
  }, [
    showLoadError,
    routeBookingId,
    isTrackerMediaError,
    trackerMediaError,
    bookingsQueryError,
  ]);

  // ── Detect "Released" transition in real-time ─────────────────────────────
  // Only fires when status CHANGES to released (not on initial load).
  // prevStatusRef starts null → first assignment sets baseline without triggering.
  //
  // Step 5 buffer: if release fires while customer is still on Step ≤4 (e.g. staff
  // pressed Release directly from Quality Check without Advancing to Ready for Pickup),
  // we force-display Step 5 for 1.5s so the customer always sees the final step
  // before the ServiceCompleteCard appears. This mirrors the web enforcement that
  // Release is only valid after ready_pickup — but guards against timing gaps.
  useEffect(() => {
    if (!booking) return;
    const bookingSnapshot = booking;
    const newStatus = trackerKey(bookingSnapshot.status);
    // Also detect via serviceTrackingStage for faster response (socket may deliver
    // serviceTrackingStage = 'released' before order.status updates)
    const newStage = trackerKey(bookingSnapshot.serviceTrackingStage);
    const isReleased = newStatus === 'released' || newStage === 'released';

    if (
      isReleased &&
      prevStatusRef.current !== null &&
      prevStatusRef.current !== 'released' &&
      !showComplete
    ) {
      const currentStep = resolveStep({ ...bookingSnapshot, status: prevStatusRef.current });

      if (currentStep < 4) {
        // Customer hasn't seen Step 5 yet — show it briefly first
        setForceStepIdx(4);
        step5Timer.current = setTimeout(() => {
          setForceStepIdx(null);
          if (bookingSnapshot) {
            setCompleteBooking({ ...bookingSnapshot });
            setShowComplete(true);

          }
        }, 1500);
      } else if (bookingSnapshot) {
        // Already at Ready for Pickup (Step 5) — show completion immediately
        setCompleteBooking({ ...bookingSnapshot });
        setShowComplete(true);

      }
    }

    prevStatusRef.current = newStatus;
  }, [booking?.status, booking?.serviceTrackingStage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Countdown timer — only decrements the number, never navigates ──────────
  useEffect(() => {
    if (!showComplete) return;
    // Cancel the Step 5 buffer timer if it's still pending (shouldn't happen, but safe)
    if (step5Timer.current) clearTimeout(step5Timer.current);
    setCountdown(3);
    countdownTimer.current = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [showComplete]);

  // ── Navigation — fires after render once countdown reaches 0 ────────────────
  // Kept separate so router.replace() is never called inside a state updater
  // (which would trigger "Cannot update a component while rendering another").
  useEffect(() => {
    if (!showComplete || countdown !== 0) return;
    clearInterval(countdownTimer.current!);
    router.replace('/(screens)/appointments');
  }, [showComplete, countdown]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived state ──
  // forceStepIdx takes priority: used during the 1.5s Step 5 buffer before ServiceCompleteCard
  const resolvedStepRaw = booking ? resolveStep(booking) : -1;
  const stepIdx = forceStepIdx !== null ? forceStepIdx : resolvedStepRaw;
  const readyForPickupComplete = bookingIsReadyForPickup(booking);
  const postPayComplete = isPostPaymentCompleteDisplay(booking);
  const appointmentSecuredComplete = isAppointmentSecuredDisplay(booking);
  const atSecuredSlotStage =
    appointmentSecuredComplete &&
    stepIdx <= 0 &&
    !readyForPickupComplete &&
    !postPayComplete;
  // Percentage comes from the same canonical stage as the highlighted step, never from a
  // separate calculation, so Quality Check always reads 75% here and on web.
  const pct = useMemo(() => {
    if (!booking) return 0;
    if (postPayComplete || readyForPickupComplete) return 100;
    return resolveCustomerTrackerStage(booking).progress;
  }, [booking, postPayComplete, readyForPickupComplete]);
  const hasActive =
    !!booking &&
    !bookingIsTerminalForLiveTracker(booking) &&
    (bookingShowsCustomerLiveTracker(booking) || isDefaultTrackBookingRow(booking?.status || ''));

  const stepTimestamps = booking ? getCustomerTrackerTimestamps(booking) : ['', '', '', '', ''];
  const etaLabel       = booking ? getEtaLabel(booking) : '—';
  const activeStepIdx = Math.min(Math.max(stepIdx, 0), TRACKER_STEPS.length - 1);
  const activeStep = TRACKER_STEPS[activeStepIdx] || TRACKER_STEPS[0];
  const activeMediaStage = activeStep.id;
  const trackerAccent = atSecuredSlotStage || readyForPickupComplete || postPayComplete
    ? C.green
    : C.orange;
  const stageSweepColors: [string, string, string] = trackerAccent === C.green
    ? ['rgba(34,197,94,0)', 'rgba(187,247,208,0.16)', 'rgba(34,197,94,0)']
    : ['rgba(249,115,22,0)', 'rgba(253,186,116,0.15)', 'rgba(249,115,22,0)'];
  const stageTitle = postPayComplete
    ? 'Service Complete'
    : readyForPickupComplete
      ? 'Ready for Pickup'
      : atSecuredSlotStage
        ? 'Appointment Confirmed'
      : activeStep.label;
  const stageDescription = booking
    ? readyForPickupComplete
      ? TRACKER_STEPS[TRACKER_STEPS.length - 1].detail
      : atSecuredSlotStage
        ? `Your reservation payment has been verified. Your vehicle is scheduled for ${booking.bookingDate || booking.date || 'your selected date'} at ${booking.bookingTime || booking.time || 'your selected time'}.`
      : resolveTrackerStageDescription(booking, activeMediaStage) || activeStep.detail
    : '';
  const referenceLabel = getBookingReferenceLabel(booking);

  // Vehicle info card
  const vehiclePlate = booking?.vehiclePlate || booking?.vehicleModel || 'Vehicle';
  const vehicleColor = booking?.vehicleColor || '';
  const vehicleInfo  = vehicleColor ? `${vehiclePlate} · ${vehicleColor}` : vehiclePlate;
  const vehicleTitle = [
    booking?.vehicleYear,
    booking?.vehicleMake,
    booking?.vehicleModel,
  ].filter(Boolean).join(' ') || String(booking?.vehicleInfo || vehicleInfo);
  const vehicleMeta = [
    booking?.vehiclePlate ? String(booking.vehiclePlate).toUpperCase() : '',
    vehicleColor,
  ].filter(Boolean).join(' / ') || 'Vehicle profile syncing';

  const teamLabel = getCustomerTrackerTeam(booking, activeStep.id);
  const teamSummaryLabel = teamLabel;
  const trackingComplete = readyForPickupComplete || postPayComplete || activeStep.id === 'ready_pickup';
  const pickupTimeLabel = formatTime(stepTimestamps[TRACKER_STEPS.length - 1]);

  const pastBookings = allBookings.filter(
    (b) => (!booking || b.id !== booking.id) &&
    ['completed', 'paid', 'released', 'cancelled', 'rejected'].includes(b.status)
  );

  const onRefresh = async () => {

    if (!profile) return;
    await Promise.all([
      refreshBookings(),
      trackerMediaBookingId ? refetchTrackerMedia() : Promise.resolve(),
    ]);
  };

  const pickImage = async () => {
    if (!booking?.id) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'We need access to your camera roll to upload payment proof.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync(PAYMENT_PROOF_PICKER_OPTIONS);
      if (!result.canceled && result.assets?.[0]) {
        setUploading(true);
        const img = paymentProofDataUrlFromAsset(result.assets[0]);
        await bookingService.uploadPaymentProof(booking.id, img);

        setPaymentProofLocal(img);
        await Promise.all([
          refreshBookings(),
          trackerMediaBookingId ? refetchTrackerMedia() : Promise.resolve(),
        ]);
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', getApiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <AnimatedHeader />

      {/* ── Service Complete (released) — full-content takeover ── */}
      {showComplete ? (
        <ServiceCompleteCard
          booking={completeBooking}
          countdown={countdown}
          onViewSummary={() => {
            if (countdownTimer.current) clearInterval(countdownTimer.current);

            router.replace('/(screens)/appointments');
          }}
        />
      ) : (
      <>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          s.content,
          { paddingBottom: 62 + insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={C.orange} />
        }
      >
        {/* ───────────────── Loading ───────────────── */}
        {isLoading ? (
          <PageSkeleton />

        /* ───────────────── Load error (e.g. wrong API port / offline) ──────────────── */
        ) : showLoadError ? (
          <Animated.View entering={FadeInDown.delay(80).duration(220)} style={s.emptyCard}>
            <View style={s.emptyIcon}>
              <Ionicons name="cloud-offline-outline" size={36} color={C.orange} />
            </View>
            <Text style={s.emptyTitle}>Could not load tracker</Text>
            <Text style={[s.emptySub, { marginBottom: 4 }]}>{loadErrorMessage}</Text>
            <Text style={[s.emptySub, { fontSize: 12, opacity: 0.85 }]}>
              Confirm the backend is running and EXPO_PUBLIC_API_URL matches your machine (e.g. same port as Express).
            </Text>
            <TouchableOpacity
              style={s.emptyBtn}
              activeOpacity={0.85}
              onPress={() => {
                Haptics.primaryPress();
                void onRefresh();
              }}
            >
              <Text style={s.emptyBtnText}>Try again</Text>
              <Ionicons name="refresh" size={15} color="#000" />
            </TouchableOpacity>
          </Animated.View>

        /* ───────────────── Empty State ──────────────── */
        ) : !hasActive ? (
          <>
            <Animated.View entering={FadeInDown.delay(80).duration(220)} style={s.emptyCard}>
              <View style={s.emptyIcon}>
                <Ionicons name="car-outline" size={36} color={C.textDim} />
              </View>
              <Text style={s.emptyTitle}>No Active Service</Text>
              <Text style={s.emptySub}>
                {'When you book a service, your real-time\nprogress will appear here.'}
              </Text>
              <TouchableOpacity
                style={s.emptyBtn}
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.primaryPress();
                  router.push('/(customer)/book');
                }}
              >
                <Text style={s.emptyBtnText}>Book a Service</Text>
                <Ionicons name="arrow-forward" size={15} color="#000" />
              </TouchableOpacity>
            </Animated.View>

            {pastBookings.length > 0 && (
              <Animated.View entering={FadeInDown.delay(200).duration(220)}>
                <Text style={s.sectionLabel}>PAST SERVICES</Text>
                <View style={{ gap: 8 }}>
                  {pastBookings.slice(0, 5).map((b, i) => (
                    <HistoryCard key={b.id} booking={b} index={i} />
                  ))}
                </View>
              </Animated.View>
            )}
          </>

        /* ───────────── Submitted GCash receipt — Sales review ──────────── */
        ) : paymentState?.reservation === 'verifying' ? (
          <Animated.View
            entering={FadeInDown.delay(120).duration(220)}
            style={[s.stateCard, { borderColor: 'rgba(245,158,11,0.38)' }]}
          >
            <Ionicons name="shield-checkmark-outline" size={48} color="#F59E0B" />
            <Text style={s.stateTitle}>Payment Verification</Text>
            <Text style={[s.stateTitle, { fontSize: 15, color: '#FBBF24' }]}>Payment verification in progress</Text>
            <Text style={s.stateSub}>
              Your GCash receipt has been submitted and is being reviewed. We’ll update this status once your reservation payment is verified.
            </Text>
            <TouchableOpacity
              style={[s.uploadBtn, { backgroundColor: C.elevated, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)' }]}
              onPress={() => router.push({ pathname: '/(screens)/payments', params: { orderId: booking.id } })}
              activeOpacity={0.85}
            >
              <Ionicons name="receipt-outline" size={18} color="#FBBF24" />
              <Text style={[s.uploadBtnText, { color: '#FBBF24' }]}>View Payment Details</Text>
            </TouchableOpacity>
          </Animated.View>

        /* ───────────────── Rejected receipt ─────────────────── */
        ) : paymentState?.reservation === 'action_required' ? (
          <Animated.View
            entering={FadeInDown.delay(120).duration(220)}
            style={[s.stateCard, { borderColor: 'rgba(239,68,68,0.4)' }]}
          >
            <Ionicons name="close-circle-outline" size={48} color="#EF4444" />
            <Text style={[s.stateTitle, { color: '#EF4444' }]}>Payment Action Required</Text>
            <Text style={s.stateSub}>
              Your GCash payment could not be verified. {paymentState.reservationReviewReason ? `${paymentState.reservationReviewReason} ` : ''}Please review your payment details and submit a valid receipt.
            </Text>
            <TouchableOpacity
              style={[s.uploadBtn, { backgroundColor: '#EF4444' }]}
              onPress={pickImage}
              disabled={uploading}
              activeOpacity={0.85}
            >
              {uploading ? (
                <PremiumLoader size="small" tone="light" accessibilityLabel="Uploading replacement receipt" />
              ) : (
                <>
                  <Ionicons name="reload-outline" size={18} color="#FFF" />
                  <Text style={s.uploadBtnText}>Upload New Receipt</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

        /* ───────────────── Receipt actually missing ─────────────────── */
        ) : paymentState?.reservation === 'required' ? (
          <Animated.View
            entering={FadeInDown.delay(120).duration(220)}
            style={[s.stateCard, { borderColor: C.orangeBrd }]}
          >
            <Ionicons name="card-outline" size={48} color={C.orange} />
            <Text style={s.stateTitle}>Reservation Payment Required</Text>
            <Text style={s.stateSub}>
              Secure your appointment by submitting your ₱500 GCash reservation payment.
            </Text>
            <TouchableOpacity
              style={s.uploadBtn}
              onPress={pickImage}
              disabled={uploading}
              activeOpacity={0.85}
            >
              {uploading ? (
                <PremiumLoader size="small" tone="light" accessibilityLabel="Uploading GCash receipt" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#FFF" />
                  <Text style={s.uploadBtnText}>Upload GCash Receipt</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

        /* ───────────────── Active Tracking ──────────── */
        ) : (
          <>
            {/* ── Service status and pickup readiness / completion estimate ── */}
            <Animated.View entering={FadeInDown.delay(60).duration(200)} style={s.headerRow}>
              {trackingComplete ? (
                <Text style={[s.etaText, { color: C.green }]}>READY FOR PICKUP</Text>
              ) : <LiveBadge />}
              {trackingComplete ? (
                <View style={[s.etaPill, { borderColor: C.greenBrd, backgroundColor: C.greenDim }]}>
                  <Ionicons name="checkmark-circle-outline" size={11} color={C.green} />
                  <Text style={[s.etaText, { color: C.green }]}>
                    {pickupTimeLabel ? `Pickup ready · ${pickupTimeLabel}` : 'Pickup time pending'}
                  </Text>
                </View>
              ) : etaLabel !== '—' ? (
                <View style={s.etaPill}>
                  <Ionicons name="time-outline" size={11} color={C.orange} />
                  <Text style={s.etaText}>Est. {etaLabel}</Text>
                </View>
              ) : null}
            </Animated.View>

            {/* ── Circular progress ring ── */}
            <Animated.View entering={FadeInDown.delay(100).duration(200)} style={s.ringWrap}>
              <CircularRing pct={pct} accent={trackerAccent} />
            </Animated.View>

            {/* ── Current stage summary (web parity, mobile-native treatment) ── */}
            <Animated.View
              entering={FadeInDown.delay(120).duration(200)}
              style={[
                s.stageCard,
                (readyForPickupComplete || atSecuredSlotStage) && s.stageCardComplete,
              ]}
            >
              <Animated.View pointerEvents="none" style={[s.stageCardSweep, stageSweepStyle]}>
                <LinearGradient
                  colors={stageSweepColors}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
              <View style={s.stageTopRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={s.stageEyebrow}>CURRENT STAGE</Text>
                  <Text
                    style={[
                      s.stageTitle,
                      (readyForPickupComplete || atSecuredSlotStage) && s.stageTitleComplete,
                    ]}
                  >
                    {stageTitle}
                  </Text>
                </View>
                <View
                  style={[
                    s.stageStepBadge,
                    (readyForPickupComplete || atSecuredSlotStage) && s.stageStepBadgeComplete,
                  ]}
                >
                  <Text
                    style={[
                      s.stageStepText,
                      (readyForPickupComplete || atSecuredSlotStage) && s.stageStepTextComplete,
                    ]}
                  >
                    Step {activeStepIdx + 1} of {TRACKER_STEPS.length}
                  </Text>
                </View>
              </View>
              {!!stageDescription && (
                <Text style={s.stageDescription}>{stageDescription}</Text>
              )}
              <View style={s.stageMetaRow}>
                {[
                  { label: 'Vehicle', value: vehicleTitle },
                  { label: 'Team', value: teamSummaryLabel },
                  { label: 'Reference', value: referenceLabel },
                ].map((item) => (
                  <View key={item.label} style={s.stageMetaItem}>
                    <Text style={s.stageMetaLabel}>{item.label}</Text>
                    <Text style={s.stageMetaValue} numberOfLines={2}>
                      {item.value}
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* ── Vehicle info card ── */}
            <Animated.View entering={FadeInDown.delay(150).duration(200)} style={s.vehicleCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={s.vehicleIcon}>
                  <Ionicons name="car-sport-outline" size={18} color={C.orange} />
                </View>
                <Text style={s.vehicleText} numberOfLines={1}>{vehicleMeta}</Text>
              </View>
              {!!teamLabel && (
                <View style={s.teamBadge}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green }} />
                  <Text style={s.teamText}>{teamLabel}</Text>
                </View>
              )}
            </Animated.View>

            {/* ── Vertical Timeline ── */}
            <Animated.View entering={FadeInDown.delay(180).duration(200)}>
              <Text style={s.sectionLabel}>PROGRESS TIMELINE</Text>
              <View style={s.timeline}>
                {TRACKER_STEPS.map((step, i) => (
                  <TimelineStep
                    key={step.id}
                    step={step}
                    index={i}
                    currentIdx={stepIdx}
                    timestamp={stepTimestamps[i]}
                    isLast={i === TRACKER_STEPS.length - 1}
                    booking={booking}
                    mediaStage={step.id}
                    finalStepComplete={readyForPickupComplete || postPayComplete}
                    appointmentSecuredComplete={appointmentSecuredComplete}
                  />
                ))}
              </View>
            </Animated.View>

            {/* ── Quick actions ── */}
            <Animated.View entering={FadeInDown.delay(300).duration(200)} style={s.actionsRow}>
              <TouchableOpacity
                style={s.actionBtn}
                activeOpacity={0.85}
                onPress={() => {

                  router.push('/(screens)/appointments');
                }}
              >
                <Ionicons name="list-outline" size={15} color={C.text} />
                <Text style={s.actionText}>All Bookings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.actionBtn}
                activeOpacity={0.85}
                onPress={() => {

                  router.push('/(screens)/waiver');
                }}
              >
                <Ionicons name="document-text-outline" size={15} color={C.text} />
                <Text style={s.actionText}>Sign Waiver</Text>
              </TouchableOpacity>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {/* closes showComplete false branch */}
      </>
      )}
    </View>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 32,
    gap: 20,
  },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5,
    color: C.textDim, marginBottom: 10,
  },

  // Empty state
  emptyCard: {
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 1, borderColor: C.border,
    padding: 32, alignItems: 'center', gap: 10,
  },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: C.elevated,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textSec },
  emptySub:   { fontSize: 13, color: C.textMut, textAlign: 'center', lineHeight: 19 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: C.orange, borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 22, marginTop: 6,
    ...Platform.select({
      ios:     { shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },

  // State cards
  stateCard: {
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 1, padding: 28,
    alignItems: 'center', gap: 14,
  },
  stateTitle:    { fontSize: 18, fontWeight: '700', color: C.text },
  stateSub:      { fontSize: 13, color: C.textMut, textAlign: 'center', lineHeight: 20 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.orange, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 20,
    width: '100%', justifyContent: 'center',
  },
  uploadBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // Active tracking header
  headerRow: {
    flexWrap: 'wrap', gap: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  etaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orangeBrd,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  etaText: { fontSize: 11, fontWeight: '700', color: C.orange },

  // Ring
  ringWrap: { alignItems: 'center' },

  // Current stage summary
  stageCard: {
    position: 'relative',
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
    overflow: 'hidden',
  },
  stageCardComplete: {
    backgroundColor: '#0D1810',
    borderColor: C.greenBrd,
  },
  stageCardSweep: {
    position: 'absolute',
    top: -42,
    bottom: -42,
    width: 96,
  },
  stageTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  stageEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.textDim,
    marginBottom: 4,
  },
  stageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.3,
  },
  stageTitleComplete: { color: C.green },
  stageStepBadge: {
    borderRadius: 999,
    backgroundColor: C.orangeDim,
    borderWidth: 1,
    borderColor: C.orangeBrd,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  stageStepBadgeComplete: {
    backgroundColor: C.greenDim,
    borderColor: C.greenBrd,
  },
  stageStepText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.orange,
  },
  stageStepTextComplete: { color: C.green },
  stageDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: C.textSec,
  },
  stageMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stageMetaItem: {
    flex: 1,
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  stageMetaLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: C.textDim,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  stageMetaValue: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: C.textSec,
  },

  // Vehicle card
  vehicleCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, padding: 14,
  },
  vehicleIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.orangeDim,
    alignItems: 'center', justifyContent: 'center',
  },
  vehicleText: { fontSize: 14, fontWeight: '600', color: C.text, flex: 1, marginLeft: 0 },
  teamBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.greenDim, borderWidth: 1, borderColor: C.greenBrd,
    borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4,
  },
  teamText: { fontSize: 11, fontWeight: '700', color: C.green },

  // Timeline
  timeline: { gap: 0 },

  // Quick actions
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'transparent', borderRadius: 12, borderWidth: 1,
    borderColor: C.textSec, paddingVertical: 12,
  },
  actionText: { fontSize: 12, fontWeight: '600', color: C.text },

});
