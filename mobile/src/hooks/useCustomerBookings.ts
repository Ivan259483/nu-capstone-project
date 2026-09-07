import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingRecord } from '@/services/api/types';
import { bookingService } from '@/services/api/bookingService';
import { invalidateCache } from '@/services/api/client';

export const CUSTOMER_BOOKINGS_QUERY_KEY = ['bookings', 'customer'] as const;
export const customerBookingDetailQueryKey = (bookingId: string) =>
  ['bookings', 'customer', 'detail', bookingId] as const;

export function findCachedCustomerBooking(
  bookings: BookingRecord[] | undefined,
  bookingId: string,
) {
  return bookings?.find((booking) => String(booking.id || booking._id) === bookingId);
}

export function useCustomerBookings(enabled: boolean) {
  const query = useQuery({
    queryKey: CUSTOMER_BOOKINGS_QUERY_KEY,
    queryFn: () => bookingService.getMyBookings({ limit: 50 }),
    enabled,
    refetchInterval: 60_000,
  });
  const { refetch } = query;
  const refreshBookings = useCallback(async () => {
    invalidateCache('/bookings');
    return refetch();
  }, [refetch]);

  useFocusEffect(useCallback(() => {
    if (!enabled) return undefined;
    void refreshBookings();
    return undefined;
  }, [enabled, refreshBookings]));

  return { ...query, refreshBookings };
}

export function useCustomerBookingDetail(bookingId: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: customerBookingDetailQueryKey(bookingId),
    enabled: Boolean(bookingId),
    initialData: () => findCachedCustomerBooking(
      queryClient.getQueryData<BookingRecord[]>(CUSTOMER_BOOKINGS_QUERY_KEY),
      bookingId,
    ),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(CUSTOMER_BOOKINGS_QUERY_KEY)?.dataUpdatedAt,
    staleTime: 15_000,
    queryFn: async () => {
      const detail = await bookingService.getBookingById(bookingId);
      queryClient.setQueryData<BookingRecord[]>(CUSTOMER_BOOKINGS_QUERY_KEY, (current) => {
        if (!current?.length) return current;
        const exists = current.some((booking) => String(booking.id || booking._id) === bookingId);
        return exists
          ? current.map((booking) => (
              String(booking.id || booking._id) === bookingId ? { ...booking, ...detail } : booking
            ))
          : [detail, ...current];
      });
      return detail;
    },
  });
}
