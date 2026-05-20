/**
 * useOpsData — Fetches real bookings & staff from the backend
 * and maps them to the Ops Manager dashboard shapes.
 *
 * Bookings and users load in parallel so slow Mongo queries don't serialize wait times.
 * Auto-refreshes every 30 seconds for live updates.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { OrderService } from '@/lib/order-service';
import { useAuth } from '@/contexts/AuthContext';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { invalidate } from '@/lib/queryCache';
import { getSafeUserRole } from '@/lib/roles';
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
  const { user } = useAuth();
  const currentRole = getSafeUserRole(user?.role);
  const canReadUserDirectory = currentRole === 'administrator' || currentRole === 'office_admin';
  const [jobs, setJobs] = useState<OpsJob[]>([]);
  const [technicians, setTechnicians] = useState<OpsTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const isMounted = useRef(true);

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
        try {
          invalidate('/bookings');
        } catch {
          /* ignore */
        }
      }

      let bookings: Booking[] = [];
      let allUsers: User[] = [];
      const errorParts: string[] = [];

      const loadOrders = async (): Promise<Booking[]> => {
        try {
          const ordersRes = await OrderService.getAllOrders({
            suppressErrorToast: true,
            limit: 100,
            status: 'approved,confirmed,assigned,received,in_progress,ready_for_payment,completed',
            sortBy: 'createdAt',
            sortOrder: 'desc',
          });
          if (ordersRes?.success && Array.isArray(ordersRes.data)) {
            return ordersRes.data;
          }
          if (Array.isArray(ordersRes?.data)) {
            return ordersRes.data;
          }
          return [];
        } catch (err: unknown) {
          const e = err as { response?: { status?: number }; message?: string };
          console.warn('[OpsData] Failed to fetch bookings:', e?.message);
          errorParts.push(
            `Bookings: ${e?.response?.status === 403 ? 'Access denied — check role permissions' : e?.message || 'failed'}`,
          );
          return [];
        }
      };

      const loadUsers = async (): Promise<User[]> => {
        if (!canReadUserDirectory) {
          return user
            ? [{
                ...user,
                id: user._id || user.id,
                role: currentRole,
              } as User]
            : [];
        }

        try {
          const usersResponse = await api.get('/users', {
            meta: { suppressErrorToast: true },
          } as any);
          const usersRes = usersResponse.data;
          if (usersRes?.success && Array.isArray(usersRes.data)) {
            return usersRes.data.map((u: any) => ({ ...u, id: u._id || u.id }));
          }
          if (Array.isArray(usersRes?.data)) {
            return usersRes.data.map((u: any) => ({ ...u, id: u._id || u.id }));
          }
          return [];
        } catch (err: unknown) {
          const e = err as { response?: { status?: number }; message?: string };
          console.warn('[OpsData] Failed to fetch users:', e?.message);
          errorParts.push(
            `Users: ${e?.response?.status === 403 ? 'Access denied — check role permissions' : e?.message || 'failed'}`,
          );
          return [];
        }
      };

      const [ordersResult, usersResult] = await Promise.all([loadOrders(), loadUsers()]);
      bookings = ordersResult;
      allUsers = usersResult;

      if (!isMounted.current) return;

      const mappedJobs = bookings.map((b, i) => mapBookingToJob(b, i));

      const staffRoles = ['staff_quality_checker', 'office_admin', 'sales'];
      const staffUsers = allUsers.filter((u) => staffRoles.includes(getSafeUserRole(u.role)));
      const mappedTechs = staffUsers.map((u, i) => mapUserToTechnician(u, mappedJobs, i));

      setJobs(mappedJobs);
      setTechnicians(mappedTechs);
      setLastRefreshed(new Date());

      if (errorParts.length > 0 && bookings.length === 0 && allUsers.length === 0) {
        setError(errorParts.join(' | '));
      } else if (errorParts.length > 0 && bookings.length === 0) {
        setError(`${errorParts.join(' | ')} — job list may be empty until this is fixed.`);
      } else {
        setError(null);
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (isMounted.current) {
        setError(e.message || 'Failed to load operations data');
      }
    } finally {
      if (!silent && isMounted.current) {
        setLoading(false);
      }
    }
  }, [canReadUserDirectory, currentRole, user]);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    const interval = setInterval(() => fetchData({ silent: true }), 60_000);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  useEffect(() => {
    const socket = getSharedSocket();
    let t: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        fetchData({ silent: true });
      }, 350);
    };

    const onDbChange = (payload: { collection?: string }) => {
      if (payload?.collection === 'orders') scheduleRefresh();
    };
    const onBookingStatus = () => scheduleRefresh();
    const onOrderUpdated = () => scheduleRefresh();

    socket.on('db_change', onDbChange);
    socket.on('booking:status', onBookingStatus);
    socket.on('orderUpdated', onOrderUpdated);

    return () => {
      if (t) clearTimeout(t);
      socket.off('db_change', onDbChange);
      socket.off('booking:status', onBookingStatus);
      socket.off('orderUpdated', onOrderUpdated);
    };
  }, [fetchData]);

  return { jobs, technicians, loading, error, refresh: fetchData, lastRefreshed };
}
