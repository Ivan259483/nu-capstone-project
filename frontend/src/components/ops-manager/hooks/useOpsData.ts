/**
 * useOpsData — Fetches real bookings & staff from the backend
 * and maps them to the Ops Manager dashboard shapes.
 * 
 * Fetches bookings and users independently so one 403 doesn't block the other.
 * Auto-refreshes every 30 seconds for live updates.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { OrderService } from '@/lib/order-service';
import { mapBookingToJob, mapUserToTechnician } from '../ops-types';
import type { OpsJob, OpsTechnician } from '../ops-types';
import type { Booking, User } from '@/types';

interface OpsData {
  jobs: OpsJob[];
  technicians: OpsTechnician[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastRefreshed: Date | null;
}

export function useOpsData(): OpsData {
  const [jobs, setJobs] = useState<OpsJob[]>([]);
  const [technicians, setTechnicians] = useState<OpsTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch bookings and users independently — one failing shouldn't block both
      let bookings: Booking[] = [];
      let allUsers: User[] = [];
      const errors: string[] = [];

      // Fetch bookings
      try {
        const ordersRes = await OrderService.getAllOrders({ suppressErrorToast: true });
        if (ordersRes?.success && Array.isArray(ordersRes.data)) {
          bookings = ordersRes.data;
        } else if (Array.isArray(ordersRes?.data)) {
          bookings = ordersRes.data;
        }
      } catch (err: any) {
        console.warn('[OpsData] Failed to fetch bookings:', err?.message);
        errors.push(`Bookings: ${err?.response?.status === 403 ? 'Access denied — check role permissions' : (err?.message || 'failed')}`);
      }

      // Fetch users (suppress toast — we handle errors in the UI)
      try {
        // Use direct api call with suppressErrorToast to avoid duplicate error toast
        const { default: api } = await import('@/lib/api');
        const usersResponse = await api.get('/users', {
          meta: { suppressErrorToast: true },
        } as any);
        const usersRes = usersResponse.data;
        if (usersRes?.success && Array.isArray(usersRes.data)) {
          allUsers = usersRes.data.map((u: any) => ({ ...u, id: u._id || u.id }));
        } else if (Array.isArray(usersRes?.data)) {
          allUsers = usersRes.data.map((u: any) => ({ ...u, id: u._id || u.id }));
        }
      } catch (err: any) {
        console.warn('[OpsData] Failed to fetch users:', err?.message);
        errors.push(`Users: ${err?.response?.status === 403 ? 'Access denied — check role permissions' : (err?.message || 'failed')}`);
      }

      if (!isMounted.current) return;

      // Map bookings → jobs
      const mappedJobs = bookings.map((b, i) => mapBookingToJob(b, i));

      // Filter users to get only staff/technician roles
      const staffRoles = ['technician', 'service_staff', 'staff_quality_checker', 'staff_inventory'];
      const staffUsers = allUsers.filter(u => staffRoles.includes(u.role));
      const mappedTechs = staffUsers.map((u, i) => mapUserToTechnician(u, mappedJobs, i));

      setJobs(mappedJobs);
      setTechnicians(mappedTechs);
      setLastRefreshed(new Date());

      // Only show error if BOTH failed
      if (errors.length > 0 && bookings.length === 0 && allUsers.length === 0) {
        setError(errors.join(' | '));
      } else {
        setError(null);
      }
    } catch (err: any) {
      if (isMounted.current) {
        setError(err.message || 'Failed to load operations data');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    // Auto-refresh every 30s for live data
    const interval = setInterval(fetchData, 30000);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  return { jobs, technicians, loading, error, refresh: fetchData, lastRefreshed };
}
