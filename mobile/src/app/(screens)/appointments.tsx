/**
 * Appointment & Scheduling Module
 * Upcoming / History tabs, booking cards with service details
 * AutoGloss Premium Automotive Aesthetic
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { bookingService } from '@/services/api/bookingService';
import { getApiErrorMessage } from '@/services/api/client';
import type { BookingRecord } from '@/services/api/types';
import { Toast } from '@/components/ui/PremiumToast';
import { useQuery } from '@tanstack/react-query';

// ─── Design Tokens ───────────────────────────────────────────────────────────
const ACCENT = '#FF6B35';
const ACCENT_DARK = '#CC5214';
const BLACK = '#0A0A0A';
const SURFACE = '#111114';
const SURFACE_ALT = '#1A1A22';
const BORDER = '#2A2A30';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Pending', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', icon: 'time-outline' },
  confirmed: { label: 'Confirmed', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', icon: 'checkmark-circle-outline' },
  received: { label: 'Vehicle Received', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', icon: 'car-outline' },
  scanning: { label: 'Scanning', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', icon: 'scan-outline' },
  in_progress: { label: 'In Progress', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', icon: 'construct-outline' },
  quality_check: { label: 'Quality Check', color: '#06B6D4', bg: 'rgba(6,182,212,0.12)', icon: 'shield-checkmark-outline' },
  ready: { label: 'Ready', color: '#10B981', bg: 'rgba(16,185,129,0.12)', icon: 'checkmark-done-outline' },
  completed: { label: 'Completed', color: '#10B981', bg: 'rgba(16,185,129,0.12)', icon: 'checkmark-circle' },
  cancelled: { label: 'Cancelled', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', icon: 'close-circle-outline' },
  failed: { label: 'Failed', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', icon: 'warning-outline' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || { label: status, color: '#888', bg: 'rgba(136,136,136,0.12)', icon: 'ellipse-outline' };
}

// ─── Cancellable Statuses ────────────────────────────────────────────────────
const CANCELLABLE_STATUSES = ['pending', 'confirmed'];
const REBOOKABLE_STATUSES = ['completed', 'cancelled'];

// ─── Booking Card ────────────────────────────────────────────────────────────

const BookingCard = React.memo(
  function BookingCard({ booking, index, onPress, onCancel, onRebook }: { booking: BookingRecord; index: number; onPress: (id: string) => void; onCancel?: (id: string) => void; onRebook?: (booking: BookingRecord) => void }) {
    const sc = getStatusConfig(booking.status);

    const displayDate = booking.bookingDate || booking.date || 'No date';
    const displayTime = booking.bookingTime || booking.time || '';
    const displayPrice = booking.totalPrice || booking.totalAmount || 0;

    return (
      <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(18)}>
        <TouchableOpacity style={c.card} activeOpacity={0.85} onPress={() => onPress(booking.id as string)}>
          {/* Left accent */}
          <View style={[c.accentBar, { backgroundColor: sc.color }]} />

          {/* Top row */}
          <View style={c.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={c.serviceName}>{booking.serviceName || 'Service'}</Text>
              <Text style={c.orderId}>
                #{(booking.id || '').substring(0, 8).toUpperCase()}
              </Text>
            </View>
            <View style={[c.statusPill, { backgroundColor: sc.bg, borderColor: sc.color + '40' }]}>
              <Ionicons name={sc.icon as any} size={12} color={sc.color} />
              <Text style={[c.statusText, { color: sc.color }]}>{sc.label}</Text>
            </View>
          </View>

          {/* Details grid */}
          <View style={c.detailsGrid}>
            <View style={c.detailItem}>
              <Ionicons name="calendar-outline" size={13} color="#666" />
              <Text style={c.detailText}>{displayDate}</Text>
            </View>
            {displayTime ? (
              <View style={c.detailItem}>
                <Ionicons name="time-outline" size={13} color="#666" />
                <Text style={c.detailText}>{displayTime}</Text>
              </View>
            ) : null}
            {booking.vehiclePlate ? (
              <View style={c.detailItem}>
                <Ionicons name="car-sport-outline" size={13} color="#666" />
                <Text style={c.detailText}>{booking.vehiclePlate}</Text>
              </View>
            ) : null}
          </View>

          {/* Bottom row */}
          <View style={c.bottomRow}>
            <Text style={c.price}>₱{Number(displayPrice).toLocaleString()}</Text>
            <View style={c.actionRow}>
              {onCancel && CANCELLABLE_STATUSES.includes(booking.status) && (
                <TouchableOpacity
                  style={c.cancelBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onCancel(booking.id);
                  }}
                >
                  <Ionicons name="close-circle-outline" size={14} color="#EF4444" />
                  <Text style={c.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              )}
              {onRebook && REBOOKABLE_STATUSES.includes(booking.status) && (
                <TouchableOpacity
                  style={c.rebookBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onRebook(booking);
                  }}
                >
                  <Ionicons name="refresh-outline" size={14} color={ACCENT} />
                  <Text style={c.rebookBtnText}>Re-Book</Text>
                </TouchableOpacity>
              )}
              <View style={c.viewBtn}>
                <Text style={c.viewBtnText}>View</Text>
                <Ionicons name="chevron-forward" size={12} color={ACCENT} />
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  },
  (prev, next) => prev.booking.id === next.booking.id && prev.booking.status === next.booking.status
);


const c = StyleSheet.create({
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  serviceName: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  orderId: { fontSize: 11, fontWeight: '600', color: '#555', letterSpacing: 0.5 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { fontSize: 12, color: '#999' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  cancelBtnText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },
  rebookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    backgroundColor: 'rgba(255,107,53,0.08)',
  },
  rebookBtnText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E1E26',
    paddingTop: 12,
  },
  price: { fontSize: 18, fontWeight: '800', color: ACCENT },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewBtnText: { fontSize: 12, fontWeight: '600', color: ACCENT },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function AppointmentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const ACTIVE_STATUSES = ['pending', 'confirmed', 'received', 'scanning', 'in_progress', 'quality_check', 'ready'];
  const HISTORY_STATUSES = ['completed', 'cancelled', 'failed'];
  const {
    data: bookings = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => bookingService.getMyBookings(),
    enabled: !!profile,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // ── Cancel Booking Handler ──
  const handleCancelBooking = useCallback((bookingId: string) => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking? This action cannot be undone.',
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(bookingId);
            try {
              await bookingService.cancelBooking(bookingId);
              Toast.show('Booking cancelled successfully.', 'success');
              // Update local state immediately
              await refetch();
            } catch (error) {
              Toast.show(getApiErrorMessage(error, 'Failed to cancel booking.'), 'error');
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]
    );
  }, [refetch]);

  // ── Re-Book Handler ──
  const handleRebook = useCallback((booking: BookingRecord) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Navigate to booking screen — the customer will pick date/time fresh
    router.push('/(customer)/book');
  }, [router]);

  const upcoming = bookings.filter((b: any) => ACTIVE_STATUSES.includes(b.status));
  const history = bookings.filter((b: any) => HISTORY_STATUSES.includes(b.status));
  const displayed = activeTab === 'upcoming' ? upcoming : history;

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Appointments</Text>
        <TouchableOpacity
          onPress={() => router.push('/(customer)/book')}
          style={s.addBtn}
        >
          <Ionicons name="add" size={18} color={ACCENT} />
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      <Animated.View entering={FadeInDown.delay(100).springify()} style={s.statsBar}>
        <View style={s.statItem}>
          <Text style={s.statVal}>{upcoming.length}</Text>
          <Text style={s.statLabel}>Upcoming</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={[s.statVal, { color: '#10B981' }]}>{history.filter((b: any) => b.status === 'completed').length}</Text>
          <Text style={s.statLabel}>Completed</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={[s.statVal, { color: '#EF4444' }]}>{history.filter((b: any) => b.status === 'cancelled').length}</Text>
          <Text style={s.statLabel}>Cancelled</Text>
        </View>
      </Animated.View>

      {/* Tab switcher */}
      <Animated.View entering={FadeInDown.delay(150).springify()} style={s.tabBar}>
        {(['upcoming', 'history'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            activeOpacity={0.8}
            onPress={() => {
              setActiveTab(tab);
              Haptics.selectionAsync();
            }}
          >
            <Ionicons
              name={tab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
              size={14}
              color={activeTab === tab ? ACCENT : '#666'}
            />
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === 'upcoming' ? 'Upcoming' : 'History'}
            </Text>
            {tab === 'upcoming' && upcoming.length > 0 && (
              <View style={s.tabBadge}>
                <Text style={s.tabBadgeText}>{upcoming.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </Animated.View>

      {/* Content */}
      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id || Math.random().toString()}
        style={s.scroll}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ACCENT}
            colors={[ACCENT]}
          />
        }
        ListEmptyComponent={() => {
          if (isLoading) {
            return (
              <View style={s.emptyCenter}>
                <ActivityIndicator size="large" color={ACCENT} />
                <Text style={s.emptyText}>Loading bookings…</Text>
              </View>
            );
          }
          return (
            <Animated.View entering={FadeInDown.springify()} style={s.emptyCenter}>
              <View style={s.emptyIcon}>
                <Ionicons
                  name={activeTab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
                  size={48}
                  color="#333"
                />
              </View>
              <Text style={s.emptyTitle}>
                {activeTab === 'upcoming' ? 'No Upcoming Appointments' : 'No Service History'}
              </Text>
              <Text style={s.emptyText}>
                {activeTab === 'upcoming'
                  ? 'Book your first service to see it here.'
                  : 'Completed bookings will appear here.'}
              </Text>
              {activeTab === 'upcoming' && (
                <TouchableOpacity
                  style={s.emptyBtn}
                  activeOpacity={0.88}
                  onPress={() => router.push('/(customer)/book')}
                >
                  <Ionicons name="add-circle" size={18} color={BLACK} />
                  <Text style={s.emptyBtnText}>Book a Service</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          );
        }}
        renderItem={({ item, index }) => (
          <BookingCard
            booking={item}
            index={index}
            onCancel={handleCancelBooking}
            onRebook={handleRebook}
            onPress={(id) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: '/(customer)/track', params: { id } });
            }}
          />
        )}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BLACK },
  scroll: { flex: 1 },
  listContent: { paddingHorizontal: 18, paddingBottom: 40, gap: 12 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    backgroundColor: 'rgba(255,107,53,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stats
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 18,
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 20, fontWeight: '800', color: ACCENT },
  statLabel: { fontSize: 10, fontWeight: '600', color: '#666', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 28, backgroundColor: BORDER },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 18,
    marginVertical: 14,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: SURFACE,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  tabActive: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(255,107,53,0.07)',
  },
  tabText: { fontSize: 13, fontWeight: '600', color: '#666' },
  tabTextActive: { color: ACCENT, fontWeight: '700' },
  tabBadge: {
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: BLACK },

  // Empty
  emptyCenter: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon: { marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#555' },
  emptyText: { fontSize: 13, color: '#444', textAlign: 'center', paddingHorizontal: 30 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: BLACK },
});
