import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import MotionPressable from '@/components/ui/MotionPressable';
import SkeletonPulse from '@/components/ui/SkeletonPulse';
import { PremiumLoader } from '@/components/ui/loading';
import { Palette } from '@/constants/theme';
import { useCustomerBookingDetail } from '@/hooks/useCustomerBookings';
import { getApiErrorMessage } from '@/services/api/client';
import type { BookingRecord } from '@/services/api/types';
import { bookingShowsCustomerLiveTracker } from '@/utils/customer-live-tracker-pick';
import { resolveCustomerPaymentState } from '@/utils/customer-payment-state';

const C = {
  bg: '#050505',
  surface: '#0D0D10',
  surfaceHigh: '#151519',
  border: 'rgba(255,255,255,0.09)',
  text: '#FBF8F4',
  secondary: 'rgba(255,255,255,0.66)',
  muted: 'rgba(255,255,255,0.40)',
  accent: '#FF7C1E',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
} as const;

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function formatDate(value?: string) {
  if (!value) return 'To be confirmed';
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(value?: string) {
  if (!value) return 'To be confirmed';
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatCurrency(value: number) {
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

function statusPresentation(booking: BookingRecord) {
  const status = String(booking.status || '').toLowerCase().replace(/-/g, '_');
  if (['completed', 'released', 'paid', 'ready'].includes(status)) {
    return { label: status === 'ready' ? 'Ready for Pickup' : status.replace(/_/g, ' '), color: C.success };
  }
  if (['cancelled', 'rejected', 'failed'].includes(status)) {
    return { label: status.replace(/_/g, ' '), color: C.danger };
  }
  if (['pending', 'pending_confirmation'].includes(status)) {
    return { label: status === 'pending_confirmation' ? 'Pending Confirmation' : 'Pending', color: C.warning };
  }
  return { label: status.replace(/_/g, ' ') || 'Booking', color: Palette.info };
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={17} color={C.accent} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function BookingDetailsSkeleton() {
  return (
    <View style={styles.skeletonWrap} accessibilityLabel="Loading latest booking details">
      <SkeletonPulse style={styles.skeletonHero} />
      <SkeletonPulse style={styles.skeletonSection} />
      <SkeletonPulse style={styles.skeletonSection} />
    </View>
  );
}

export default function BookingDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const bookingId = firstParam(params.id);
  const { data: booking, isLoading, isFetching, isError, error, refetch } =
    useCustomerBookingDetail(bookingId);

  const status = booking ? statusPresentation(booking) : null;
  const payment = booking ? resolveCustomerPaymentState(booking) : null;
  const vehicle = booking
    ? [booking.vehicleYear, booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(' ')
      || booking.vehicleInfo
      || 'Vehicle details pending'
    : '';
  const reference = booking
    ? String(booking.bookingReference || booking.orderNumber || booking.id || '').slice(-12).toUpperCase()
    : '';

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          haptic="light"
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Ionicons name="chevron-back" size={21} color={C.text} />
        </MotionPressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>APPOINTMENT</Text>
          <Text style={styles.headerTitle}>Booking Details</Text>
        </View>
        <View style={styles.refreshSlot}>
          {isFetching && booking ? (
            <PremiumLoader size="small" accessibilityLabel="Refreshing booking details" />
          ) : null}
        </View>
      </View>

      {!booking && isLoading ? (
        <BookingDetailsSkeleton />
      ) : !booking ? (
        <View style={styles.errorState}>
          <View style={styles.errorIcon}>
            <Ionicons name="cloud-offline-outline" size={30} color={C.accent} />
          </View>
          <Text style={styles.errorTitle}>Booking details unavailable</Text>
          <Text style={styles.errorBody}>
            {isError ? getApiErrorMessage(error, 'Check your connection and try again.') : 'This booking could not be found.'}
          </Text>
          <MotionPressable haptic="light" onPress={() => void refetch()} style={styles.retryButton}>
            <Ionicons name="refresh" size={16} color="#17100B" />
            <Text style={styles.retryText}>Try Again</Text>
          </MotionPressable>
        </View>
      ) : (
        <Animated.View entering={FadeIn.duration(180)} style={styles.contentWrap}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          >
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View style={[styles.statusPill, { borderColor: `${status?.color}55`, backgroundColor: `${status?.color}16` }]}>
                  <View style={[styles.statusDot, { backgroundColor: status?.color }]} />
                  <Text style={[styles.statusText, { color: status?.color }]}>{status?.label.toUpperCase()}</Text>
                </View>
                <Text style={styles.reference}>#{reference}</Text>
              </View>
              <Text style={styles.serviceName}>{booking.serviceName || booking.serviceType || 'Service booking'}</Text>
              <Text style={styles.vehicleName}>{vehicle}</Text>
              {booking.vehiclePlate ? (
                <View style={styles.platePill}>
                  <Ionicons name="car-outline" size={12} color={C.secondary} />
                  <Text style={styles.plateText}>{String(booking.vehiclePlate).toUpperCase()}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SCHEDULE</Text>
              <DetailRow icon="calendar-clear-outline" label="Appointment date" value={formatDate(booking.bookingDate || booking.date)} />
              <View style={styles.divider} />
              <DetailRow icon="time-outline" label="Appointment time" value={formatTime(booking.bookingTime || booking.time)} />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeadingRow}>
                <Text style={styles.sectionTitle}>PAYMENT</Text>
                {payment ? (
                  <Text style={styles.paymentTotal}>
                    {payment.totalAmount > 0 ? formatCurrency(payment.totalAmount) : 'Review total'}
                  </Text>
                ) : null}
              </View>
              <DetailRow
                icon="lock-closed-outline"
                label="Reservation"
                value={payment?.reservation === 'paid'
                  ? 'Verified'
                  : payment?.reservation === 'verifying'
                    ? 'Under review'
                    : payment?.reservation === 'action_required'
                      ? 'Action required'
                      : 'Payment required'}
              />
              <View style={styles.divider} />
              <DetailRow
                icon="wallet-outline"
                label="Remaining balance"
                value={payment && payment.remainingAmount > 0
                  ? formatCurrency(payment.remainingAmount)
                  : payment?.fullPayment === 'paid' ? 'Paid' : 'Not due yet'}
              />
            </View>

            {booking.notes ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>BOOKING NOTES</Text>
                <Text style={styles.notes}>{booking.notes}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              {bookingShowsCustomerLiveTracker(booking) ? (
                <MotionPressable
                  haptic="light"
                  onPress={() => router.push({ pathname: '/(customer)/track', params: { id: booking.id } })}
                  style={styles.primaryAction}
                >
                  <Ionicons name="navigate-outline" size={18} color="#17100B" />
                  <Text style={styles.primaryActionText}>Track Booking</Text>
                </MotionPressable>
              ) : null}
              <MotionPressable
                haptic="light"
                onPress={() => router.push({ pathname: '/(screens)/payments', params: { orderId: booking.id } })}
                style={styles.secondaryAction}
              >
                <Ionicons name="wallet-outline" size={18} color={C.accent} />
                <Text style={styles.secondaryActionText}>View Payment Details</Text>
              </MotionPressable>
            </View>
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: C.border,
  },
  headerCopy: { flex: 1 },
  headerEyebrow: { color: C.accent, fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 1.25 },
  headerTitle: { color: C.text, fontSize: 19, lineHeight: 25, fontWeight: '700' },
  refreshSlot: { width: 40, alignItems: 'center' },
  contentWrap: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 18, gap: 14 },
  heroCard: {
    padding: 19,
    borderRadius: 22,
    backgroundColor: '#110D0B',
    borderWidth: 1,
    borderColor: 'rgba(255,124,30,0.24)',
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statusPill: { minHeight: 27, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 9.5, lineHeight: 13, fontWeight: '800', letterSpacing: 0.65 },
  reference: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.7 },
  serviceName: { marginTop: 18, color: C.text, fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.45 },
  vehicleName: { marginTop: 5, color: C.secondary, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  platePill: { alignSelf: 'flex-start', marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.05)' },
  plateText: { color: C.secondary, fontSize: 10.5, lineHeight: 14, fontWeight: '800', letterSpacing: 1 },
  section: { padding: 17, borderRadius: 19, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: C.muted, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 1.25, marginBottom: 13 },
  paymentTotal: { color: C.text, fontSize: 15, lineHeight: 20, fontWeight: '800', marginBottom: 13 },
  detailRow: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,124,30,0.09)' },
  detailCopy: { flex: 1, gap: 2 },
  detailLabel: { color: C.muted, fontSize: 10.5, lineHeight: 14, fontWeight: '600' },
  detailValue: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '700', textTransform: 'capitalize' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 9, marginLeft: 48 },
  notes: { color: C.secondary, fontSize: 13.5, lineHeight: 21 },
  actions: { gap: 10, paddingTop: 2 },
  primaryAction: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 15, backgroundColor: C.accent },
  primaryActionText: { color: '#17100B', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  secondaryAction: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,124,30,0.38)', backgroundColor: 'rgba(255,124,30,0.07)' },
  secondaryActionText: { color: C.accent, fontSize: 14.5, lineHeight: 20, fontWeight: '700' },
  skeletonWrap: { flex: 1, paddingHorizontal: 18, paddingTop: 18, gap: 14 },
  skeletonHero: { height: 178, borderRadius: 22, backgroundColor: C.surfaceHigh },
  skeletonSection: { height: 150, borderRadius: 19, backgroundColor: C.surfaceHigh },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 64 },
  errorIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,124,30,0.09)', borderWidth: 1, borderColor: 'rgba(255,124,30,0.20)' },
  errorTitle: { marginTop: 18, color: C.text, fontSize: 19, lineHeight: 25, fontWeight: '800', textAlign: 'center' },
  errorBody: { marginTop: 7, color: C.secondary, fontSize: 13.5, lineHeight: 21, textAlign: 'center' },
  retryButton: { marginTop: 20, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, borderRadius: 14, backgroundColor: C.accent },
  retryText: { color: '#17100B', fontSize: 14, lineHeight: 19, fontWeight: '800' },
});
