import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { bookingService } from '@/services/api/bookingService';
import { invalidateCache } from '@/services/api/client';

export const CUSTOMER_BOOKINGS_QUERY_KEY = ['bookings', 'customer'] as const;

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
