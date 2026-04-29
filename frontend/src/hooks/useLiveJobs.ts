import { useEffect, useRef, useState, useCallback } from 'react';
import { OrderService } from '@/lib/order-service';
import type { Booking, User } from '@/types';
import { isAdminDashboardRole, isServiceStaffRole } from '@/lib/roles';
import { getSharedSocket } from './useRealtimeSync';

// ── Backup polling interval — socket is primary, this is fallback ────
// 15 s is fast enough for demo reliability without hammering the server.
const SYNC_INTERVAL_MS = 15_000;

/** Shape of a booking:status socket event from the backend (QC stage advances) */
export interface BookingStatusEvent {
    bookingId: string;
    status?: string;
    serviceTrackingStage?: string | null;
    serviceStaffAssignments?: any[];
    updatedAt?: string;
}

export function useLiveJobs(
    user?: User | null,
    /** Called immediately when a booking:status event arrives — use for instant tracker UI update */
    onBookingStatus?: (event: BookingStatusEvent) => void,
    /** Called when a notification:customer event arrives — prepend to notifications list */
    onNotification?: (notif: any) => void,
) {
    const [jobs, setJobs] = useState<Booking[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Keep stable refs so socket listeners never capture stale closures
    const onBookingStatusRef = useRef(onBookingStatus);
    const onNotificationRef  = useRef(onNotification);
    useEffect(() => { onBookingStatusRef.current = onBookingStatus; }, [onBookingStatus]);
    useEffect(() => { onNotificationRef.current  = onNotification;  }, [onNotification]);

    // ── Shared fetch function — used by polling + socket events + visibility ──
    const fetchJobs = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            if (isServiceStaffRole(user?.role || '')) {
                const res = await OrderService.getStaffQueue();
                if (res.success && Array.isArray(res.data)) {
                    setJobs(res.data);
                    return;
                }
            } else {
                const res = await OrderService.getAllOrders();
                if (res.success && Array.isArray(res.data)) {
                    setJobs(res.data);
                    return;
                }
            }
            if (!silent) setJobs([]);
        } catch (error) {
            console.error('[useLiveJobs] Error fetching jobs:', error);
            if (!silent) setJobs([]);
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, [user?.role]);

    useEffect(() => {
        if (!user) return;

        // ── Initial fetch ────────────────────────────────────────────────
        fetchJobs(false);

        // ── Backup polling: 15 s — fires even if socket is silent ───────
        const syncInterval = setInterval(() => {
            console.log('[useLiveJobs] 15s backup poll');
            fetchJobs(true);
        }, SYNC_INTERVAL_MS);

        // ── Use the SHARED socket — no new io() connection ───────────────
        // getSharedSocket() is a singleton: one connection for the entire app.
        // reconnectionAttempts is set to Infinity in useRealtimeSync.ts.
        const socket = getSharedSocket();

        // Join correct rooms — also fires on reconnect via 'connect' listener
        const joinRoom = () => {
            if (isAdminDashboardRole(user.role)) socket.emit('join_room', 'admin:chat');
            if (isServiceStaffRole(user.role))  socket.emit('join_room', `staff:${user.id}`);
            // Customer + all other roles get their own user room
            socket.emit('join_room', `user:${user.id}`);
            if ((user as any)._id && (user as any)._id !== user.id) {
                socket.emit('join_room', `user:${(user as any)._id}`);
            }
        };

        if (socket.connected) joinRoom();
        socket.on('connect', joinRoom);

        // ── booking:status — QC stage advances & staff assignments ───────
        const handleBookingStatus = (event: BookingStatusEvent) => {
            console.log('[useLiveJobs] booking:status received:', event);
            onBookingStatusRef.current?.(event);
        };
        socket.on('booking:status', handleBookingStatus);

        // ── notification:customer — real-time bell notifications ─────────
        const handleCustomerNotification = (notif: any) => {
            console.log('[useLiveJobs] notification:customer received:', notif);
            onNotificationRef.current?.(notif);
        };
        socket.on('notification:customer', handleCustomerNotification);

        // ── db_change — MongoDB Change Stream events ─────────────────────
        // Fires when any 'orders' document is inserted/updated/deleted.
        // We do a silent refetch rather than optimistic patch to stay simple.
        const handleDbChange = (payload: any) => {
            if (payload.collection === 'orders') {
                console.log('[useLiveJobs] db_change orders → refetching');
                fetchJobs(true);
            }
        };
        socket.on('db_change', handleDbChange);

        // ── Optimistic state patch — legacy job events ───────────────────
        const handleJobUpdate = (updatedJob: Booking) => {
            if (!updatedJob || typeof updatedJob !== 'object') return;
            const jobId = updatedJob.id || (updatedJob as any)._id;
            if (!jobId) return;

            setJobs((prev) => {
                const validJobs = prev.filter(j => j && (j.id || (j as any)._id));
                const exists = validJobs.find((j) => {
                    const existingId = j.id || (j as any)._id;
                    return existingId === jobId;
                });

                if (exists) {
                    return validJobs.map((j) => {
                        const existingId = j.id || (j as any)._id;
                        return existingId === jobId ? { ...updatedJob, id: jobId } : j;
                    });
                }

                if (
                    isServiceStaffRole(user.role) &&
                    (updatedJob.paymentStatus !== 'paid' || updatedJob.status === 'pending')
                ) {
                    return validJobs;
                }

                return [{ ...updatedJob, id: jobId }, ...validJobs];
            });
        };

        const jobEvents = [
            'order_paid',
            'job_assigned',
            'job_accepted',
            'job_started',
            'job_progress_updated',
            'job_completed',
        ] as const;

        for (const event of jobEvents) {
            socket.on(event, handleJobUpdate);
        }

        // ── Visibility & Focus refresh (PRIORITY 3) ───────────────────────
        // When the user switches back to this tab, immediately fetch fresh data.
        let visibilityTimer: ReturnType<typeof setTimeout> | null = null;
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                // Small debounce so rapid tab switches don't hammer the server
                if (visibilityTimer) clearTimeout(visibilityTimer);
                visibilityTimer = setTimeout(() => {
                    console.log('[useLiveJobs] Tab visible — silent refresh');
                    fetchJobs(true);
                }, 500);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', handleVisibility);

        return () => {
            clearInterval(syncInterval);
            if (visibilityTimer) clearTimeout(visibilityTimer);

            // Remove only OUR listeners — do NOT disconnect the shared socket
            socket.off('connect', joinRoom);
            socket.off('booking:status', handleBookingStatus);
            socket.off('notification:customer', handleCustomerNotification);
            socket.off('db_change', handleDbChange);
            for (const event of jobEvents) {
                socket.off(event, handleJobUpdate);
            }
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', handleVisibility);
        };
    }, [user, fetchJobs]);

    return { jobs, setJobs, isLoading };
}
