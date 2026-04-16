import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { bookingService } from '@/services/api/bookingService';
import type { BookingRecord } from '@/services/api/types';
import SectionHeader from './SectionHeader';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';

const ACCENT = '#FF6B35';

const STATUS_MAP: Record<string, { color: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { color: '#F59E0B', label: 'Pending', icon: 'time-outline' },
  confirmed: { color: '#3B82F6', label: 'Confirmed', icon: 'checkmark-circle-outline' },
  'in-progress': { color: ACCENT, label: 'In Progress', icon: 'construct-outline' },
  completed: { color: '#10B981', label: 'Completed', icon: 'checkmark-done-outline' },
  cancelled: { color: '#EF4444', label: 'Cancelled', icon: 'close-circle-outline' },
};

const getStatusInfo = (status: string) =>
  STATUS_MAP[status.toLowerCase()] || STATUS_MAP.pending;

interface AppointmentsSectionProps {
  onViewCalendar?: () => void;
  onReschedule?: (booking: BookingRecord) => void;
}

export default function AppointmentsSection({ onViewCalendar, onReschedule }: AppointmentsSectionProps) {
  const { profile } = useAuth();
  const {
    data: bookings = [],
    isLoading: loading,
  } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const data = await bookingService.getMyBookings();
      return data.slice(0, 4); // Show last 4
    },
    enabled: !!profile?.id,
  });

  const upcoming = bookings.filter(
    (b: any) => !['completed', 'cancelled'].includes(b.status.toLowerCase())
  );
  const history = bookings.filter((b: any) =>
    ['completed', 'cancelled'].includes(b.status.toLowerCase())
  );

  const formatDate = (b: BookingRecord) => {
    const d = b.bookingDate || b.date;
    const t = b.bookingTime || b.time;
    if (!d) return 'No date set';
    return `${d}${t ? ` · ${t}` : ''}`;
  };

  return (
    <Animated.View entering={FadeInUp.delay(250).duration(200)}>
      <SectionHeader
        title="Appointments"
        icon="calendar-outline"
        action="Calendar"
        onAction={onViewCalendar}
      />

      {/* Upcoming booking preview */}
      {upcoming.length > 0 ? (
        upcoming.slice(0, 2).map((booking: any) => {
          const statusInfo = getStatusInfo(booking.status);
          return (
            <TouchableOpacity
              key={booking.id}
              activeOpacity={0.8}
              style={s.upcomingCard}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onReschedule?.(booking);
              }}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)']}
                style={s.upcomingInner}
              >
                <View style={s.upcomingLeft}>
                  <View style={[s.statusDot, { backgroundColor: statusInfo.color }]} />
                  <View style={s.upcomingInfo}>
                    <Text style={s.upcomingTitle} numberOfLines={1}>
                      {booking.serviceName}
                    </Text>
                    <Text style={s.upcomingDate}>{formatDate(booking)}</Text>
                  </View>
                </View>
                <View style={[s.statusBadge, { backgroundColor: statusInfo.color + '15', borderColor: statusInfo.color + '30' }]}>
                  <Ionicons name={statusInfo.icon} size={10} color={statusInfo.color} />
                  <Text style={[s.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={s.emptyCard}>
          <Ionicons name="calendar-outline" size={24} color="#3A3A48" />
          <Text style={s.emptyText}>No upcoming appointments</Text>
          <TouchableOpacity
            style={s.bookBtn}
            activeOpacity={0.8}
            onPress={onViewCalendar}
          >
            <Text style={s.bookBtnText}>Book Now</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recent history */}
      {history.length > 0 && (
        <View style={s.historyContainer}>
          <Text style={s.historyLabel}>Recent History</Text>
          {history.slice(0, 2).map((b: any) => {
            const info = getStatusInfo(b.status);
            return (
              <View key={b.id} style={s.historyRow}>
                <Ionicons name={info.icon} size={14} color={info.color} />
                <Text style={s.historyTitle} numberOfLines={1}>{b.serviceName}</Text>
                <Text style={s.historyDate}>{formatDate(b)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  upcomingCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  upcomingInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  upcomingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  upcomingInfo: {
    flex: 1,
  },
  upcomingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E8E8ED',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  upcomingDate: {
    fontSize: 11,
    color: '#6B6B78',
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  emptyCard: {
    padding: 28,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    backgroundColor: 'rgba(255,255,255,0.015)',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    color: '#5A5A68',
    fontWeight: '500',
  },
  bookBtn: {
    marginTop: 6,
    backgroundColor: ACCENT,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 14,
  },
  bookBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  historyContainer: {
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.015)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    gap: 10,
  },
  historyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B6B78',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#A0A0AB',
  },
  historyDate: {
    fontSize: 10,
    color: '#5A5A68',
    fontWeight: '500',
  },
});
