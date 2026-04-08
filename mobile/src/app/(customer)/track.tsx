/**
 * Live Tracker — Production-Grade Service Progress Screen
 *
 * Architecture:
 *   1. Live Status Header — pulsing "LIVE" indicator
 *   2. Progress Card — service info + 5-stage horizontal stepper
 *   3. Assigned Technician — trust-building card
 *   4. Stage Checklist — real-time sub-step tracking
 *   5. Service Location — facility card
 *   6. Empty State — past service history fallback
 *
 * Data Sources:
 *   - GET /api/orders (customer filtered)
 *   - Fields: serviceSteps[], currentStepIndex, assignedDetailer, customerStatus
 *   - Polling: 12-second interval for near real-time
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { bookingService } from '@/services/api/bookingService';
import { getApiErrorMessage } from '@/services/api/client';
import { TabBarHeight } from '@/constants/theme';
import AnimatedHeader from '@/components/ui/AnimatedHeader';
import type { BookingRecord } from '@/services/api/types';
import { LinearGradient } from 'expo-linear-gradient';

// ─────────────────────────────────────────────────────────────────────────────
// Design System
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bg:         '#050506',
  surface:    '#0E0E12',
  surfaceAlt: '#16161C',
  elevated:   '#1C1C24',
  border:     '#222228',
  borderSub:  '#1A1A20',
  text:       '#F5F5F7',
  textSec:    '#A1A1AA',
  textMut:    '#71717A',
  textDim:    '#52525B',
  accent:     '#FF6B35',
  accentDim:  'rgba(255,107,53,0.12)',
  accentBrd:  'rgba(255,107,53,0.25)',
  success:    '#22C55E',
  successDim: 'rgba(34,197,94,0.10)',
  info:       '#3B82F6',
  infoDim:    'rgba(59,130,246,0.10)',
  warn:       '#F59E0B',
  warnDim:    'rgba(245,158,11,0.10)',
} as const;


// ─────────────────────────────────────────────────────────────────────────────
// 5-Stage Pipeline
// ─────────────────────────────────────────────────────────────────────────────

const STAGES = [
  { key: 'check_in',       label: 'Check-In',    icon: 'checkmark'             },
  { key: 'pre_inspection', label: 'Inspect',     icon: 'checkmark'             },
  { key: 'service',        label: 'Service',     icon: 'build'                 },
  { key: 'quality',        label: 'QC',          icon: 'search'                },
  { key: 'ready',          label: 'Ready',       icon: 'checkmark'             },
] as const;

// Map backend status → stage index
function resolveStageIndex(booking: any): number {
  // 1. If backend provides currentStepIndex directly, use it
  if (typeof booking.currentStepIndex === 'number' && booking.currentStepIndex >= 0) {
    return Math.min(booking.currentStepIndex, STAGES.length - 1);
  }
  // 2. Infer from status/customerStatus
  const s = booking.customerStatus || booking.status || '';
  const MAP: Record<string, number> = {
    pending: 0, confirmed: 0, received: 0, queued: 0,
    'in-progress': 2, in_progress: 2, scanning: 1, washing: 1,
    detailing: 2, processing: 2, assigned: 0,
    quality_check: 3, finishing: 3,
    ready: 4, completed: 4,
  };
  return MAP[s] ?? 0;
}

function getStageProgress(stageIdx: number): number {
  return Math.round(((stageIdx + 1) / STAGES.length) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Premium Internal Components
// ─────────────────────────────────────────────────────────────────────────────

function PageSkeleton() {
  const op = useSharedValue(0.1);
  useEffect(() => {
    op.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 1000 }),
        withTiming(0.1, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const aStyle = useAnimatedStyle(() => ({ opacity: op.value }));

  return (
    <View style={{ paddingTop: 10, gap: 16 }}>
      {/* Skeleton Header Card */}
      <Animated.View style={[aStyle, { height: 260, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border }]} />
      {/* Double Skeleton metrics */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
         <Animated.View style={[aStyle, { flex: 1, height: 80, backgroundColor: C.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: C.border }]} />
         <Animated.View style={[aStyle, { flex: 1, height: 80, backgroundColor: C.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: C.border }]} />
      </View>
      {/* Secondary Card */}
      <Animated.View style={[aStyle, { height: 120, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border }]} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE Badge with Pulse Animation
// ─────────────────────────────────────────────────────────────────────────────

function LiveBadge() {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1,    { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: opacity.value * 0.3 + 0.7 }], // Pulse scale 0.7 -> 1.0
  }));

  return (
    <View style={lb.container}>
      <Animated.View style={[lb.dot, pulseStyle]} />
      <Text style={lb.label}>LIVE</Text>
    </View>
  );
}

function ActiveGlow({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.7, { duration: 1500, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    opacity.value = withRepeat(
      withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 50,
    backgroundColor: color,
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={style} />;
}

function ProgressBar({ pct }: { pct: number }) {
  const widthVal = useSharedValue(0);

  useEffect(() => {
    widthVal.value = withTiming(pct, { duration: 1400, easing: Easing.out(Easing.cubic) });
  }, [pct]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${widthVal.value}%`,
  }));

  return (
    <View style={s.barWrap}>
      <View style={s.barTrack}>
        <Animated.View style={[s.barFill, fillStyle]} />
      </View>
      <View style={s.barRow}>
        <Text style={s.barLabel}>Progress</Text>
        <Text style={s.barPct}>{pct}%</Text>
      </View>
    </View>
  );
}

const lb = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: C.accent,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Horizontal Stepper
// ─────────────────────────────────────────────────────────────────────────────

function HorizontalStepper({ current }: { current: number }) {
  return (
    <View style={hs.container}>
      {STAGES.map((stage, i) => {
        const done   = i < current;
        const active = i === current;
        const last   = i === STAGES.length - 1;

        return (
          <View key={stage.key} style={hs.stageGroup}>
            <View style={hs.dotRow}>
              {/* Connector (before) */}
              <View style={[
                hs.connector, 
                done && hs.connectorDone,
                i === 0 && { backgroundColor: 'transparent' }
              ]} />

              {/* Dot */}
              <View style={[
                hs.dot,
                done && hs.dotDone,
                active && hs.dotActive,
              ]}>
                {active && <ActiveGlow color={C.accent} />}
                {done ? (
                  <Ionicons name={stage.icon as any} size={18} color={C.surface} />
                ) : active ? (
                  <Ionicons name={stage.icon as any} size={18} color={C.accent} />
                ) : (
                  <Ionicons name={stage.icon as any} size={18} color={C.textDim} />
                )}
              </View>

              {/* Connector (after) */}
              <View style={[
                hs.connector, 
                done && hs.connectorDone,
                last && { backgroundColor: 'transparent' }
              ]} />
            </View>
            <Text style={[
              hs.label,
              done && hs.labelDone,
              active && hs.labelActive,
            ]} numberOfLines={1} adjustsFontSizeToFit>
              {stage.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const hs = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 0 },
  stageGroup: { flex: 1, alignItems: 'center' },
  dotRow: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  connector: { flex: 1, height: 2, backgroundColor: C.border },
  connectorDone: { backgroundColor: C.accent },
  dot: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  dotDone: { backgroundColor: C.accent, borderColor: C.accent },
  dotActive: { borderColor: C.accent, borderWidth: 2 },
  label: { fontSize: 10, fontWeight: '600', color: C.textDim, textAlign: 'center', marginTop: 8, lineHeight: 12 },
  labelDone: { color: C.accent },
  labelActive: { color: C.accent, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Technician Card
// ─────────────────────────────────────────────────────────────────────────────

function TechnicianCard({ detailer }: { detailer: any }) {
  if (!detailer) return null;

  const name  = detailer?.name || 'Technician';
  const initials = name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();

  return (
    <Animated.View entering={FadeInDown.delay(300).springify().damping(20)}>
      <View style={tc.card}>
        <View style={tc.row}>
          <View style={tc.avatar}>
            <Text style={tc.avatarText}>{initials}</Text>
          </View>
          <View style={tc.info}>
            <Text style={tc.name}>{name}</Text>
            <Text style={tc.role}>Lead Detailer · PPF Specialist</Text>
            <View style={tc.statusNote}>
              <View style={tc.statusDot}>
                <ActiveGlow color="#10B981" />
              </View>
              <Text style={tc.statusText}>Active on your vehicle</Text>
            </View>
          </View>
          <TouchableOpacity style={tc.msgBtn} activeOpacity={0.7}>
            <Ionicons name="chatbubble-ellipses" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const tc = StyleSheet.create({
  card: {
    backgroundColor: '#16161C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222',
    padding: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'transparent',
    borderWidth: 2, borderColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: C.accent },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  role: { fontSize: 12, color: C.textMut, marginTop: 2, marginBottom: 6 },
  statusNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  statusText: { fontSize: 11, fontWeight: '600', color: '#10B981' },
  msgBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#333',
    alignItems: 'center', justifyContent: 'center'
  }
});

function SearchingTechnicianCard() {
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[s.pendingCard, pulseStyle, { borderColor: 'rgba(255, 107, 53, 0.4)', borderWidth: 1, backgroundColor: 'rgba(255, 107, 53, 0.05)' }]}>
      <Animated.View style={spinnerStyle}>
        <Ionicons name="scan-outline" size={20} color={C.accent} />
      </Animated.View>
      <Text style={[s.pendingText, { color: C.accent, fontWeight: '600', letterSpacing: 0.5 }]}>
        Scanning for available technician...
      </Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage Checklist
// ─────────────────────────────────────────────────────────────────────────────

function StageChecklist({ steps, currentStep }: { steps: any[]; currentStep: number }) {
  // Default steps if backend doesn't provide them
  const displaySteps = steps.length > 0 ? steps : [
    { name: 'Snow foam wash applied',      status: 'completed' },
    { name: 'Iron decontamination done',   status: 'completed' },
    { name: 'Paint prep ongoing...',       status: 'in-progress' },
  ];

  return (
    <Animated.View entering={FadeInDown.delay(400).springify().damping(20)}>
      <Text style={cl.sectionLabel}>CURRENT STAGE — SURFACE DETAILING</Text>
      <View style={cl.card}>
        {displaySteps.map((step: any, i: number) => {
          const isDone = step.status === 'completed';
          const isInProgress = step.status === 'in-progress';

          return (
            <Animated.View key={i} entering={FadeInDown.delay(450 + i * 50).springify()} style={cl.row}>
              <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                {isDone ? (
                  <Ionicons name="checkmark-circle" size={16} color={C.textDim} />
                ) : isInProgress ? (
                  <View style={[cl.dot, { backgroundColor: C.accent }]}>
                    <ActiveGlow color={C.accent} />
                  </View>
                ) : (
                  <View style={[cl.dot, { backgroundColor: C.border }]} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[
                  cl.stepName,
                  isDone && { color: C.textDim, textDecorationLine: 'line-through' },
                  isInProgress && { color: '#FFF' },
                  !isDone && !isInProgress && { color: C.textMut }
                ]}>
                  {step.name}
                </Text>
              </View>
            </Animated.View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const cl = StyleSheet.create({
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5,
    color: C.textDim, marginBottom: 8,
  },
  card: {
    backgroundColor: 'transparent',
    padding: 0,
    gap: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
  },
  stepName: { fontSize: 13, fontWeight: '500', color: C.textMut },
});

// ─────────────────────────────────────────────────────────────────────────────
// History Card (for empty state)
// ─────────────────────────────────────────────────────────────────────────────

function HistoryCard({ booking, index }: { booking: BookingRecord; index: number }) {
  const displayDate = booking.bookingDate || booking.date || '';
  const displayService = booking.serviceName || booking.serviceType || 'Service';

  return (
    <Animated.View entering={FadeInDown.delay(200 + index * 60).springify()}>
      <View style={hc.card}>
        <View style={hc.row}>
          <View style={hc.iconWrap}>
            <Ionicons
              name={booking.status === 'completed' ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={booking.status === 'completed' ? C.success : '#EF4444'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={hc.service}>{displayService}</Text>
            <Text style={hc.date}>{displayDate}</Text>
          </View>
          <View style={[
            hc.statusPill,
            booking.status === 'completed' ? hc.statusCompleted : hc.statusCancelled,
          ]}>
            <Text style={[
              hc.statusText,
              { color: booking.status === 'completed' ? C.success : '#EF4444' },
            ]}>
              {booking.status === 'completed' ? 'Completed' : 'Cancelled'}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const hc = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.elevated,
    alignItems: 'center', justifyContent: 'center',
  },
  service: { fontSize: 13, fontWeight: '600', color: C.text },
  date: { fontSize: 11, color: C.textMut, marginTop: 2 },
  statusPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusCompleted: { backgroundColor: C.successDim },
  statusCancelled: { backgroundColor: 'rgba(239,68,68,0.10)' },
  statusText: { fontSize: 9, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function TrackScreen() {
  const { profile } = useAuth();
  const router = useRouter();

  const [booking, setBooking] = useState<any>(null);
  const [allBookings, setAllBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const bookings = await bookingService.getMyBookings();
      setAllBookings(bookings);

      const active = bookings
        .filter((b) => !['completed', 'cancelled', 'failed'].includes(b.status))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      setBooking(active[0] || null);
    } catch (error) {
      console.warn('Tracker fetch failed:', getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    fetchData();
    pollRef.current = setInterval(fetchData, 12000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [profile, fetchData]);

  const onRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    fetchData();
  };

  // Derived
  const stageIdx = booking ? resolveStageIndex(booking) : 0;
  const pct      = booking ? getStageProgress(stageIdx) : 0;
  const hasActive = !!booking;
  const steps: any[] = booking?.serviceSteps || [];
  const detailer = booking?.assignedDetailer;
  const pastBookings = allBookings.filter((b) => ['completed', 'cancelled'].includes(b.status));

  const trackTitle = (booking?.vehicleType && booking?.vehicleColor)
    ? `${booking.vehicleType} • ${booking.vehicleColor}`
    : (booking?.customerName && booking?.serviceName)
    ? `${booking.customerName} - ${booking.serviceName}`
    : booking?.vehicleModel
    ? booking.vehicleModel
    : booking?.vehiclePlate || 'Vehicle Service';

  const trackSubTitle = booking?.orderNumber
    ? `Order #${booking.orderNumber}`
    : booking?.serviceName
    ? booking.serviceName
    : 'Active Order';

  return (
    <View style={s.screen}>
      <AnimatedHeader />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: TabBarHeight + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
        }
      >
        {/* ─── Header Row ─── */}
        <Animated.View entering={FadeInDown.delay(80).springify()} style={s.titleRow}>
          <View>
            <Text style={s.pageTitle}>Service Tracker</Text>
            <Text style={s.pageSub}>
              {hasActive ? 'Your vehicle is being serviced.' : 'No active service right now.'}
            </Text>
          </View>
          {hasActive && <LiveBadge />}
        </Animated.View>

        {loading ? (
          <PageSkeleton />
        ) : !hasActive ? (
          /* ─────── Empty State ─────── */
          <>
            <Animated.View entering={FadeInDown.delay(150).springify()} style={s.emptyCard}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="car-outline" size={40} color={C.textDim} />
              </View>
              <Text style={s.emptyTitle}>No Active Service</Text>
              <Text style={s.emptySub}>
                When you book a service, real-time{'\n'}progress tracking will appear here.
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
                <Ionicons name="arrow-forward" size={16} color={C.bg} />
              </TouchableOpacity>
            </Animated.View>

            {/* Past History */}
            {pastBookings.length > 0 && (
              <Animated.View entering={FadeInDown.delay(250).springify()}>
                <Text style={s.sectionLabel}>PAST SERVICES</Text>
                <View style={{ gap: 8 }}>
                  {pastBookings.slice(0, 5).map((b, i) => (
                    <HistoryCard key={b.id} booking={b} index={i} />
                  ))}
                </View>
              </Animated.View>
            )}
          </>
        ) : (
          /* ─────── Active Tracking ─────── */
          <>
            {/* Progress Card */}
            <Animated.View entering={FadeInDown.delay(120).springify().damping(20)}>
              <View style={s.progressCard}>
                <LinearGradient
                  colors={['rgba(255,107,53,0.08)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ flex: 1 }}
                >
                  {/* Header */}
                  <View style={s.pcHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.pcServiceName}>
                        {trackTitle}
                      </Text>
                      <Text style={s.pcOrderId}>
                        {trackSubTitle}
                      </Text>
                    </View>
                    <View style={s.pcEstDoneWrap}>
                      <Text style={s.pcEstDoneText}>EST. DONE {booking.bookingTime || '2:00 PM'}</Text>
                    </View>
                  </View>

                  {/* Status Pill */}
                  <View style={s.pcStatusRow}>
                    <View style={s.pcStatusPill}>
                      <View style={s.pcStatusDot}>
                        <ActiveGlow color={C.accent} />
                      </View>
                      <Text style={s.pcStatusText}>In Service</Text>
                    </View>
                  </View>

                  {/* Progress Bar */}
                  <ProgressBar pct={pct} />

                  {/* Horizontal Stepper */}
                  <View style={s.stepperWrap}>
                    <HorizontalStepper current={stageIdx} />
                  </View>
                </LinearGradient>
              </View>

              {/* Time Cards Row */}
              <View style={s.timeRow}>
                <View style={[s.timeCard, { flex: 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Ionicons name="time-outline" size={14} color={C.textMut} />
                    <Text style={s.timeLabel}>ELAPSED</Text>
                  </View>
                  <Text style={s.timeValueOrange}>2h 15m</Text>
                </View>
                <View style={[s.timeCard, { flex: 1, borderColor: 'rgba(255, 107, 53, 0.25)', backgroundColor: 'rgba(255, 107, 53, 0.05)' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent }}>
                      <ActiveGlow color={C.accent} />
                    </View>
                    <Text style={[s.timeLabel, { color: C.accent }]}>EST. REMAINING</Text>
                  </View>
                  <Text style={s.timeValueWhite}>~45 min</Text>
                </View>
              </View>
            </Animated.View>

            {/* Technician */}
            <Animated.View entering={FadeInDown.delay(200).springify()}>
              <Text style={s.sectionLabel}>ASSIGNED TECHNICIAN</Text>
              {detailer ? (
                <TechnicianCard detailer={detailer} />
              ) : (
                <SearchingTechnicianCard />
              )}
            </Animated.View>

            {/* Checklist */}
            <StageChecklist steps={steps} currentStep={stageIdx} />

            {/* Location */}
            <Animated.View entering={FadeInDown.delay(500).springify()}>
              <Text style={s.sectionLabel}>SERVICE LOCATION</Text>
              <View style={s.locationCard}>
                <View style={s.locationRow}>
                  <View style={s.locationIcon}>
                    <Ionicons name="location" size={16} color={C.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.locationName}>AutoGloss Service Center</Text>
                    <Text style={s.locationAddr}>Imus, Cavite</Text>
                  </View>
                  <Ionicons name="open-outline" size={14} color={C.textDim} />
                </View>
              </View>
            </Animated.View>

            {/* Media & Documentation */}
            <Animated.View entering={FadeInDown.delay(550).springify()}>
              <Text style={s.sectionLabel}>MEDIA & DOCUMENTATION</Text>
              <View style={s.docCard}>
                <View style={s.docEmptyContent}>
                  <Ionicons name="images-outline" size={32} color={C.textDim} style={{ marginBottom: 4 }} />
                  <Text style={s.docEmptyTitle}>No updates available yet</Text>
                  <Text style={s.docEmptySub}>
                    Before/After photos and official e-receipts will appear here as your detailing service progresses.
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* Bottom Actions */}
            <Animated.View entering={FadeInDown.delay(600).springify()} style={s.actionRow}>
              <TouchableOpacity
                style={s.actionBtn}
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/(screens)/appointments');
                }}
              >
                <Ionicons name="list-outline" size={16} color={C.textSec} />
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
                <Ionicons name="document-text-outline" size={16} color={C.textSec} />
                <Text style={s.actionText}>Sign Waiver</Text>
              </TouchableOpacity>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stylesheet
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 22, paddingTop: 14 },

  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pageTitle: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: 0.2 },
  pageSub: { fontSize: 13, color: C.textMut, marginTop: 3 },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5,
    color: C.textDim, marginBottom: 10,
  },

  loadCenter: { alignItems: 'center', paddingVertical: 80 },

  // Empty State
  emptyCard: {
    backgroundColor: C.surface,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
    padding: 36, alignItems: 'center', gap: 12,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.elevated,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textSec },
  emptySub: { fontSize: 13, color: C.textMut, textAlign: 'center', lineHeight: 19 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.accent, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 24, marginTop: 8,
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: C.bg },

  // Progress Card
  progressCard: {
    backgroundColor: C.surface,
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#2A2A35',
    borderLeftWidth: 4,
    borderLeftColor: C.accent,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24 },
      android: { elevation: 6 },
    }),
  },
  pcHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 18, paddingBottom: 0,
  },
  pcServiceName: { fontSize: 17, fontWeight: '700', color: C.text },
  pcOrderId: { fontSize: 11, fontWeight: '600', color: C.textMut, marginTop: 3, letterSpacing: 0.5 },
  
  pcEstDoneWrap: {
    borderWidth: 1, borderColor: '#333340', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  pcEstDoneText: { fontSize: 9, fontWeight: '700', color: C.textDim, letterSpacing: 0.5 },

  pcStatusRow: { paddingHorizontal: 18, paddingTop: 12 },
  pcStatusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,107,53,0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.3)',
  },
  pcStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  pcStatusText: { fontSize: 11, fontWeight: '600', color: C.accent },

  barWrap: { paddingHorizontal: 18, paddingTop: 20, gap: 6 },
  barTrack: { height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: C.accent },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  barLabel: { fontSize: 10, color: C.textMut },
  barPct: { fontSize: 10, fontWeight: '700', color: C.accent },

  stepperWrap: {
    padding: 18, paddingTop: 20,
    marginTop: 10,
  },

  timeRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  timeCard: {
    backgroundColor: '#16161C', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#222',
  },
  timeLabel: { fontSize: 10, color: C.textMut, fontWeight: '600', letterSpacing: 0.5 },
  timeValueOrange: { fontSize: 18, fontWeight: '700', color: C.accent, marginTop: 4 },
  timeValueWhite: { fontSize: 18, fontWeight: '700', color: '#FFF', marginTop: 4 },

  // Pending Technician
  pendingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, paddingVertical: 14, paddingHorizontal: 16,
  },
  pendingText: { fontSize: 12, color: C.textDim },

  // Location
  locationCard: {
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, padding: 14,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  locationName: { fontSize: 13, fontWeight: '600', color: C.text },
  locationAddr: { fontSize: 11, color: C.textMut, marginTop: 1 },

  // Media & Documentation
  docCard: {
    backgroundColor: C.surfaceAlt, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, borderStyle: 'dashed', padding: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  docEmptyContent: { alignItems: 'center', gap: 6 },
  docEmptyTitle: { fontSize: 13, fontWeight: '700', color: C.textSec },
  docEmptySub: { fontSize: 11, color: C.textMut, textAlign: 'center', lineHeight: 16, paddingHorizontal: 12 },

  // Bottom Actions
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, paddingVertical: 13,
  },
  actionText: { fontSize: 12, fontWeight: '600', color: C.textSec },
});
