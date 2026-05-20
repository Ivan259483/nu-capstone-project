/**
 * Service Tracker — 5-Step Vertical Timeline
 * Source of truth: CustomerDashboard.tsx web tracker (5-step flow + serviceTrackingStage logic)
 *
 * Steps:
 *   1. Appointment Confirmed  → status: confirmed / approved / assigned
 *   2. Vehicle Arrive         → status: received / serviceTrackingStage: received
 *   3. Service In Progress    → status: in_progress / customerStatus: washing|detailing|finishing
 *   4. Quality Check          → status: completed / serviceTrackingStage: quality_check
 *   5. Ready for Pickup       → status: paid / released / serviceTrackingStage: ready_pickup
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Image,
  Alert,
  Modal,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle } from 'react-native-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { bookingService } from '@/services/api/bookingService';
import { getApiErrorMessage } from '@/services/api/client';
import AnimatedHeader from '@/components/ui/AnimatedHeader';
import type { BookingRecord } from '@/services/api/types';
import { useQuery } from '@tanstack/react-query';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { TabBarHeight } from '@/constants/theme';
import { isDefaultTrackBookingRow } from '@/utils/customerBookingLifecycle';
import {
  bumpCustomerTrackerIndexForInProgressGateComplete,
  bumpCustomerTrackerIndexForReceivedGateComplete,
  getCustomerStageSlotPhotos,
  MOBILE_TRACKER_STEP_MEDIA_STAGE,
  type TrackerMediaStage,
} from '@/utils/customer-tracker-stage-media';
import { getTrackerPipelineProgressPct } from '@/utils/tracker-pipeline-progress';

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

// ─── 5-Step Pipeline (mirrors CustomerDashboard.tsx TRACKER_STEPS) ────────────
const TRACKER_STEPS = [
  { id: 'confirmed',   label: 'Appointment Confirmed', sub: 'Waiting for your vehicle', icon: 'calendar-outline'         },
  { id: 'received',    label: 'Vehicle Arrive',        sub: 'In shop',                  icon: 'car-outline'              },
  { id: 'in_progress', label: 'Service In Progress',   sub: 'Working on vehicle',       icon: 'construct-outline'        },
  { id: 'completed',   label: 'Quality Check',         sub: 'Final inspection',         icon: 'shield-checkmark-outline' },
  { id: 'paid',        label: 'Ready for Pickup',      sub: 'Service complete',         icon: 'checkmark-done-outline'   },
] as const;

// ── serviceTrackingStage → 5-step index ──────────────────────────────────────
// Source: QCServiceControlPanel STAGE_ORDER + QCLiveTrackerView STAGES
// Backend stageToStatus: quality_check → 'in_progress', ready_pickup → 'in_progress'
// So order.status alone CANNOT distinguish Step 4 from Step 5 — must use serviceTrackingStage.
const STAGE_TO_STEP: Record<string, number> = {
  // Step 1 – Appointment Confirmed
  confirmed: 0,
  // Step 2 – Vehicle Arrive
  received: 1,
  // Step 3 – Service In Progress
  in_progress: 2,
  // Step 4 – Quality Check (order.status stays 'in_progress' here!)
  quality_check: 3,
  // Step 5 – Ready for Pickup (order.status stays 'in_progress' here too!)
  ready_pickup: 4,
  // 'released' maps to 4 so that an already-released booking on open shows all steps complete
  released: 4, completed: 4,
};

// ── order.status → 5-step index (fallback only — cannot distinguish QC from Ready) ──
const STATUS_TO_STEP: Record<string, number> = {
  // Step 1
  pending: 0, approved: 0, confirmed: 0, assigned: 0,
  // Step 2
  received: 1,
  // Step 3 (quality_check and ready_pickup both produce 'in_progress' on backend)
  in_progress: 2, 'in-progress': 2,
  // Step 4
  completed: 3,
  // Step 5
  paid: 4, done: 4,
  // released → 4 for static display (live transition is handled by forceStepIdx)
  released: 4,
};

function resolveStep(booking: any): number {
  const s = String(booking?.status || '').toLowerCase();
  if (['cancelled', 'failed'].includes(s)) return -1;

  // 1. serviceTrackingStage is the ONLY reliable field that separates:
  //    Step 4 (quality_check) from Step 5 (ready_pickup) because the backend
  //    maps both to order.status = 'in_progress'.
  const ts = String(booking?.serviceTrackingStage || '').toLowerCase();
  if (ts && STAGE_TO_STEP[ts] !== undefined) return STAGE_TO_STEP[ts];

  // 2. customerStatus — fine-grained live status during active service
  //    (web: LIVE_STATUS_CUSTOMER_STATES)
  const cs = String(booking?.customerStatus || '').toLowerCase();
  if (['washing', 'detailing', 'finishing', 'in-progress'].includes(cs)) return 2;
  if (cs === 'ready') return 4; // "ready" customerStatus = Ready for Pickup (Step 5)

  // 3. order.status — last resort; cannot distinguish quality_check from ready_pickup
  return STATUS_TO_STEP[s] ?? 0;
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

function getStepTimestamps(booking: any): string[] {
  const base      = booking?.approvedAt || booking?.createdAt || '';
  const ingress   = booking?.jobOrder?.ingressDateTime || booking?.updatedAt || base;
  const workStart = booking?.customerStatusUpdatedAt || booking?.updatedAt || ingress;
  const qcAt      = booking?.qcCompletedAt || booking?.updatedAt || workStart;
  const readyAt   = booking?.paidAt || booking?.updatedAt || qcAt;
  return [base, ingress, workStart, qcAt, readyAt];
}

function getEtaLabel(booking: any): string {
  if (booking?.bookingTime) return booking.bookingTime;
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

function CircularRing({ pct }: { pct: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(pct / 100, { duration: 1400, easing: Easing.out(Easing.cubic) });
  }, [pct]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }}>
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        style={{ transform: [{ rotate: '-90deg' }] }}
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
        {/* Progress arc */}
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={C.orange}
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
          <Text style={rg.pct}>{pct}%</Text>
          <Text style={rg.done}>DONE</Text>
        </View>
      </View>
    </View>
  );
}

const rg = StyleSheet.create({
  pct:  { fontSize: 34, fontWeight: '800', color: C.orange, letterSpacing: -1.5 },
  done: { fontSize: 11, fontWeight: '700', color: C.textMut, letterSpacing: 2.5, marginTop: 2 },
});

// ─── Live Badge ───────────────────────────────────────────────────────────────
function LiveBadge() {
  const op = useSharedValue(1);
  useEffect(() => {
    op.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1,    { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: op.value }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <Animated.View style={[
        { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
        dotStyle,
      ]} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.green, letterSpacing: 1.2 }}>
        LIVE TRACKING
      </Text>
    </View>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function PageSkeleton() {
  const op = useSharedValue(0.12);
  useEffect(() => {
    op.value = withRepeat(
      withSequence(
        withTiming(0.38, { duration: 850 }),
        withTiming(0.12, { duration: 850 }),
      ),
      -1,
      true,
    );
  }, []);
  const aStyle = useAnimatedStyle(() => ({ opacity: op.value }));

  return (
    <View style={{ gap: 16, paddingTop: 12 }}>
      <Animated.View style={[aStyle, { height: 48, backgroundColor: C.surface, borderRadius: 12 }]} />
      <Animated.View style={[aStyle, { height: RING_SIZE, backgroundColor: C.surface, borderRadius: RING_SIZE / 2, alignSelf: 'center', width: RING_SIZE }]} />
      <Animated.View style={[aStyle, { height: 52, backgroundColor: C.surface, borderRadius: 14 }]} />
      {[0, 1, 2].map(i => (
        <Animated.View key={i} style={[aStyle, { height: 76, backgroundColor: C.surface, borderRadius: 14 }]} />
      ))}
    </View>
  );
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
}: {
  step: typeof TRACKER_STEPS[number];
  index: number;
  currentIdx: number;
  timestamp: string;
  isLast: boolean;
  booking: any | null;
  mediaStage: TrackerMediaStage | null;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [galleryStartIndex, setGalleryStartIndex] = useState<number | null>(null);
  const [galleryPage, setGalleryPage] = useState(0);
  const galleryScrollRef = useRef<ScrollView>(null);
  const insetsModal = useSafeAreaInsets();

  const isDone    = currentIdx > index;
  const isActive  = currentIdx === index;
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

  const glowOp = useSharedValue(0);
  useEffect(() => {
    if (isActive) {
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
  }, [isActive]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOp.value }));

  return (
    <View style={[tl.row, isLast && { paddingBottom: 0 }]}>

      {/* Left column: icon + connector */}
      <View style={tl.leftCol}>
        <View style={[
          tl.iconWrap,
          isDone    && tl.iconDone,
          isActive  && tl.iconActive,
          isPending && tl.iconPending,
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
        </View>
        {!isLast && (
          <View style={[tl.connector, isDone && tl.connectorDone]} />
        )}
      </View>

      {/* Right: card */}
      <View style={[
        tl.card,
        isDone    && tl.cardDone,
        isActive  && tl.cardActive,
        isPending && tl.cardPending,
        isLast    && { marginBottom: 0 },
      ]}>
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

            <Modal
              visible={galleryOpen}
              transparent
              animationType="fade"
              onRequestClose={closeGallery}
            >
              <View style={[tl.modalRoot, { paddingTop: insetsModal.top + 8, paddingBottom: insetsModal.bottom + 8 }]}>
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
              </View>
            </Modal>
          </>
        ) : null}
      </View>
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
  },
  cardDone: {
    backgroundColor: '#0D1810',
    borderColor: 'rgba(34,197,94,0.18)',
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
  const checkScale = useSharedValue(0.4);
  const ringScale  = useSharedValue(0.6);
  const pulse      = useSharedValue(1);

  useEffect(() => {
    checkScale.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.8)) });
    ringScale.value  = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
    // Subtle pulse starts after entrance
    setTimeout(() => {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.07, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
          withTiming(1,    { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    }, 600);
  }, []);

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
  const { profile } = useAuth();
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
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

  // ── Data fetching ──
  const {
    data: bookingsQueryData,
    isLoading: isBookingsQueryLoading,
    isError: isBookingsQueryError,
    error: bookingsQueryError,
    refetch: refetchBookings,
  } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => {
      return bookingService.getMyBookings({
        limit: 20,
        status: 'pending,pending_confirmation,confirmed,approved,assigned,received,in_progress,ready_for_payment,paid',
      });
    },
    enabled: !!profile,
    refetchInterval: 60_000,
  });

  const {
    data: specificBookingData,
    isLoading: isSpecificBookingLoading,
    isError: isSpecificBookingQueryError,
    error: specificBookingQueryError,
    refetch: refetchSpecificBooking,
  } = useQuery({
    queryKey: ['booking', routeBookingId],
    queryFn: () => {
      return bookingService.getBookingById(routeBookingId!);
    },
    enabled: !!routeBookingId && !!profile,
    refetchInterval: 60_000,
  });

  // ── Real-time socket invalidation (mirrors useLiveJobs.ts) ──
  useRealtimeSync(['orders']);

  const allBookings = useMemo(
    () => (bookingsQueryData === undefined ? EMPTY_BOOKINGS : bookingsQueryData),
    [bookingsQueryData]
  );

  const defaultTrackBooking = useMemo(() => {
    const active = [...allBookings]
      .filter((b: any) => isDefaultTrackBookingRow(b.status))
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    return active[0] || null;
  }, [allBookings]);

  const bookingFromQuery = useMemo(() => {
    if (routeBookingId) return specificBookingData ?? null;
    return defaultTrackBooking;
  }, [routeBookingId, specificBookingData, defaultTrackBooking]);

  useEffect(() => {
    setPaymentProofLocal(null);
  }, [bookingFromQuery?.id]);

  const booking = useMemo((): BookingRecord | null => {
    if (!bookingFromQuery) return null;
    if (paymentProofLocal) {
      return { ...bookingFromQuery, paymentProofUrl: paymentProofLocal };
    }
    return bookingFromQuery;
  }, [bookingFromQuery, paymentProofLocal]);

  const isLoading =
    isBookingsQueryLoading || (!!routeBookingId && isSpecificBookingLoading);

  const showLoadError =
    !isLoading &&
    ((!routeBookingId && isBookingsQueryError) ||
      (!!routeBookingId && isSpecificBookingQueryError));

  const loadErrorMessage = useMemo(() => {
    if (!showLoadError) return '';
    if (routeBookingId && isSpecificBookingQueryError) {
      return getApiErrorMessage(specificBookingQueryError, 'Could not load this booking.');
    }
    return getApiErrorMessage(bookingsQueryError, 'Could not load your bookings. Check your connection and API URL.');
  }, [
    showLoadError,
    routeBookingId,
    isSpecificBookingQueryError,
    specificBookingQueryError,
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
    const newStatus = String(bookingSnapshot.status || '').toLowerCase();
    // Also detect via serviceTrackingStage for faster response (socket may deliver
    // serviceTrackingStage = 'released' before order.status updates)
    const newStage = String(bookingSnapshot.serviceTrackingStage || '').toLowerCase();
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }, 1500);
      } else if (bookingSnapshot) {
        // Already at Ready for Pickup (Step 5) — show completion immediately
        setCompleteBooking({ ...bookingSnapshot });
        setShowComplete(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
  }, [showComplete]); // eslint-disable-line react-hooks/exhaustive-deps

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
  let resolvedStepBumped = resolvedStepRaw;
  if (booking && resolvedStepRaw >= 0) {
    resolvedStepBumped = bumpCustomerTrackerIndexForReceivedGateComplete(booking, resolvedStepRaw, 'dashboard5');
    resolvedStepBumped = bumpCustomerTrackerIndexForInProgressGateComplete(booking, resolvedStepBumped, 'dashboard5');
  }
  const stepIdx = forceStepIdx !== null ? forceStepIdx : resolvedStepBumped;
  const pct = useMemo(() => {
    if (!booking) return 0;
    const status = String(booking.status || '').toLowerCase();
    const tsKey = String(booking.serviceTrackingStage ?? '')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_');
    const paymentPaid = String(booking.paymentStatus || '').toLowerCase() === 'paid';
    const postPayComplete =
      paymentPaid && (status === 'completed' || status === 'released' || tsKey === 'released');
    if (postPayComplete) return 100;
    return getTrackerPipelineProgressPct({
      serviceTrackingStage: booking.serviceTrackingStage,
      status: booking.status,
    });
  }, [booking]);
  const hasActive = !!booking && isDefaultTrackBookingRow(booking?.status || '');

  const stepTimestamps = booking ? getStepTimestamps(booking) : ['', '', '', '', ''];
  const etaLabel       = booking ? getEtaLabel(booking) : '—';

  // Vehicle info card
  const vehiclePlate = booking?.vehiclePlate || booking?.vehicleModel || 'Vehicle';
  const vehicleColor = booking?.vehicleColor || '';
  const vehicleInfo  = vehicleColor ? `${vehiclePlate} · ${vehicleColor}` : vehiclePlate;

  // Team badge: prefer serviceStaffAssignments[] then assignedDetailer
  const staffAssignments: any[] = booking?.serviceStaffAssignments || [];
  const teamLabel = (() => {
    if (staffAssignments.length > 0) {
      return staffAssignments
        .map((a: any) => (a.name || '').split(' ')[0])
        .filter(Boolean)
        .join(' & ');
    }
    if (booking?.assignedDetailer?.name) {
      return booking.assignedDetailer.name.split(' ')[0];
    }
    return '';
  })();

  const pastBookings = allBookings.filter(
    (b) => (!booking || b.id !== booking.id) &&
    ['completed', 'paid', 'released', 'cancelled', 'rejected'].includes(b.status)
  );

  const onRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([
      refetchBookings(),
      routeBookingId ? refetchSpecificBooking() : Promise.resolve(),
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
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        setUploading(true);
        const img = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await bookingService.uploadPaymentProof(booking.id, img);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPaymentProofLocal(img);
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', getApiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const showBottomBar =
    hasActive &&
    !['pending_confirmation', 'rejected', 'pending'].includes(booking?.status || '');

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
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.replace('/(screens)/appointments');
          }}
        />
      ) : (
      <>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          s.content,
          { paddingBottom: TabBarHeight + (showBottomBar ? 72 : 24) + (insets.bottom || 0) },
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
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

        /* ───────────── Pending Confirmation (upload GCash) ──────────── */
        ) : booking?.status === 'pending_confirmation' ? (
          <Animated.View
            entering={FadeInDown.delay(120).duration(220)}
            style={[s.stateCard, { borderColor: C.orangeBrd }]}
          >
            <Ionicons name="time-outline" size={48} color={C.orange} />
            <Text style={s.stateTitle}>Waiting for Confirmation</Text>
            <Text style={s.stateSub}>
              Allow 1–3 minutes for verification. Upload your GCash receipt below.
            </Text>
            {booking.paymentProofUrl ? (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Image
                  source={{ uri: booking.paymentProofUrl }}
                  style={{ width: 100, height: 140, borderRadius: 10 }}
                  resizeMode="cover"
                />
                <Text style={{ color: C.green, fontWeight: '700', fontSize: 14 }}>
                  Receipt Uploaded ✓
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={s.uploadBtn}
                onPress={pickImage}
                disabled={uploading}
                activeOpacity={0.85}
              >
                {uploading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={18} color="#FFF" />
                    <Text style={s.uploadBtnText}>Upload GCash Screenshot</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </Animated.View>

        /* ───────────────── Rejected ─────────────────── */
        ) : booking?.status === 'rejected' ? (
          <Animated.View
            entering={FadeInDown.delay(120).duration(220)}
            style={[s.stateCard, { borderColor: 'rgba(239,68,68,0.4)' }]}
          >
            <Ionicons name="close-circle-outline" size={48} color="#EF4444" />
            <Text style={[s.stateTitle, { color: '#EF4444' }]}>Payment Rejected</Text>
            <Text style={s.stateSub}>
              {booking.rejectionReason || 'Upload a clearer GCash screenshot to resubmit.'}
            </Text>
            <TouchableOpacity
              style={[s.uploadBtn, { backgroundColor: '#EF4444' }]}
              onPress={pickImage}
              disabled={uploading}
              activeOpacity={0.85}
            >
              {uploading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="reload-outline" size={18} color="#FFF" />
                  <Text style={s.uploadBtnText}>Re-upload Proof</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

        /* ───────────────── Active Tracking ──────────── */
        ) : (
          <>
            {/* ── Top row: LIVE TRACKING + Est. Time pill ── */}
            <Animated.View entering={FadeInDown.delay(60).duration(200)} style={s.headerRow}>
              <LiveBadge />
              <View style={s.etaPill}>
                <Ionicons name="time-outline" size={11} color={C.orange} />
                <Text style={s.etaText}>Est. {etaLabel}</Text>
              </View>
            </Animated.View>

            {/* ── Step counter ── */}
            <Animated.View entering={FadeInDown.delay(80).duration(200)}>
              <Text style={s.stepCounter}>
                Step {Math.min(Math.max(stepIdx + 1, 1), 5)} of 5
              </Text>
            </Animated.View>

            {/* ── Circular progress ring ── */}
            <Animated.View entering={FadeInDown.delay(100).duration(200)} style={s.ringWrap}>
              <CircularRing pct={pct} />
            </Animated.View>

            {/* ── Vehicle info card ── */}
            <Animated.View entering={FadeInDown.delay(140).duration(200)} style={s.vehicleCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={s.vehicleIcon}>
                  <Ionicons name="car-sport-outline" size={18} color={C.orange} />
                </View>
                <Text style={s.vehicleText} numberOfLines={1}>{vehicleInfo}</Text>
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
                    mediaStage={MOBILE_TRACKER_STEP_MEDIA_STAGE[step.id] ?? null}
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
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/(screens)/appointments');
                }}
              >
                <Ionicons name="list-outline" size={15} color={C.textMut} />
                <Text style={s.actionText}>All Bookings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.actionBtn}
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/(screens)/waiver');
                }}
              >
                <Ionicons name="document-text-outline" size={15} color={C.textMut} />
                <Text style={s.actionText}>Sign Waiver</Text>
              </TouchableOpacity>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {/* ── Fixed Bottom Completion Bar ── */}
      {showBottomBar && (
        <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View>
            <Text style={s.bottomTitle}>AutoSPF+</Text>
            <Text style={s.bottomSub}>Premium Service</Text>
          </View>
          <View style={s.bottomPill}>
            <Text style={s.bottomPillText}>{pct}% COMPLETE</Text>
          </View>
        </View>
      )}
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
    paddingTop: 16,
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  etaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orangeBrd,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  etaText: { fontSize: 11, fontWeight: '700', color: C.orange },

  stepCounter: {
    fontSize: 12, fontWeight: '600', color: C.textDim, letterSpacing: 0.5,
    marginTop: -8,
  },

  // Ring
  ringWrap: { alignItems: 'center' },

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
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, paddingVertical: 12,
  },
  actionText: { fontSize: 12, fontWeight: '600', color: C.textMut },

  // Fixed bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: TabBarHeight,
    left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface,
    borderTopWidth: 1, borderTopColor: C.border,
    paddingHorizontal: 22, paddingTop: 13,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.18, shadowRadius: 14 },
      android: { elevation: 8 },
    }),
  },
  bottomTitle: { fontSize: 13, fontWeight: '800', color: C.text },
  bottomSub:   { fontSize: 11, color: C.textMut, marginTop: 1 },
  bottomPill: {
    backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orangeBrd,
    borderRadius: 20, paddingHorizontal: 13, paddingVertical: 6,
  },
  bottomPillText: { fontSize: 12, fontWeight: '700', color: C.orange },
});
