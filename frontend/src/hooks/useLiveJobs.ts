import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { OrderService } from '@/lib/order-service';
import type { Booking, User } from '@/types';
import { isAdminDashboardRole, isServiceStaffRole } from '@/lib/roles';
import { getBackendSocketUrl } from '@/lib/api';

let socket: Socket | null = null;

const SYNC_INTERVAL_MS = 30_000;

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

    // Keep stable refs to callbacks so listeners never capture stale closures
    const onBookingStatusRef = useRef(onBookingStatus);
    const onNotificationRef  = useRef(onNotification);
    useEffect(() => { onBookingStatusRef.current = onBookingStatus; }, [onBookingStatus]);
    useEffect(() => { onNotificationRef.current  = onNotification;  }, [onNotification]);

    useEffect(() => {
        if (!user) return;

        // Prevent duplicate listeners/sockets during hot reload or navigation.
        if (socket) {
            try { socket.removeAllListeners(); } catch { /* ignore */ }
            try { socket.disconnect(); } catch { /* ignore */ }
            socket = null;
        }

        const fetchJobs = async () => {
            setIsLoading(true);
            try {
                console.log('[FETCH] Fetching jobs for user:', { userId: user.id, userRole: user.role });

                if (isServiceStaffRole(user.role)) {
                    const res = await OrderService.getStaffQueue();
                    if (res.success && Array.isArray(res.data)) {
                        console.log('[FETCH] Service staff jobs fetched:', res.data.length);
                        setJobs(res.data);
                        return;
                    }
                } else {
                    const res = await OrderService.getAllOrders();
                    if (res.success && Array.isArray(res.data)) {
                        console.log('[FETCH] User jobs fetched:', {
                            total: res.data.length,
                            paid: res.data.filter(j => j.paymentStatus === 'paid').length,
                        });
                        setJobs(res.data);
                        return;
                    }
                }
                console.warn('[FETCH] No jobs returned or fetch failed');
                setJobs([]);
            } catch (error) {
                console.error('[FETCH] Error fetching jobs:', error);
                setJobs([]);
            } finally {
                setIsLoading(false);
            }
        };

        // Fetch once on mount
        fetchJobs();

        // Background sync every 30 seconds — never faster than this
        const syncInterval = setInterval(() => {
            console.log('[FETCH] Periodic 30s sync');
            fetchJobs();
        }, SYNC_INTERVAL_MS);

        socket = io(getBackendSocketUrl(), {
            transports: ['polling', 'websocket'], // polling first for handshake, then upgrades to ws
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            reconnectionAttempts: 5,
        });

        // Join the correct room on connect/reconnect — does NOT trigger a fetch
        const joinRoom = () => {
            console.log('[LIVE_JOBS] Socket connected, joining room');
            if (isAdminDashboardRole(user.role)) socket?.emit('join_room', 'admin:chat');
            if (isServiceStaffRole(user.role)) socket?.emit('join_room', `staff:${user.id}`);
            if (!isAdminDashboardRole(user.role) && !isServiceStaffRole(user.role)) socket?.emit('join_room', `user:${user.id}`);
        };

        socket.on('connect', joinRoom);

        socket.on('disconnect', (reason) => {
            console.warn('[LIVE_JOBS] Socket disconnected:', reason);
        });

        // ── booking:status — QC stage advances & staff assignments ──────────
        // Emitted to user:${id} room by qc.controller.js and order.controller.js.
        // Calls the consumer callback (CustomerDashboard) for an instant state patch.
        const handleBookingStatus = (event: BookingStatusEvent) => {
            console.log('[SOCKET] booking:status received:', event);
            onBookingStatusRef.current?.(event);
        };
        socket.on('booking:status', handleBookingStatus);

        // ── notification:customer — real-time bell notifications ────────
        const handleCustomerNotification = (notif: any) => {
            console.log('[SOCKET] notification:customer received:', notif);
            onNotificationRef.current?.(notif);
        };
        socket.on('notification:customer', handleCustomerNotification);

        // Optimistic state update only — no follow-up HTTP fetch per event
        const handleJobUpdate = (updatedJob: Booking) => {
            if (!updatedJob || typeof updatedJob !== 'object') {
                console.warn('[SOCKET] Invalid job update received:', updatedJob);
                return;
            }

            const jobId = updatedJob.id || (updatedJob as any)._id;
            if (!jobId) {
                console.warn('[SOCKET] Job update missing ID:', updatedJob);
                return;
            }

            console.log('[SOCKET] Job update received:', {
                jobId,
                status: updatedJob.status,
                paymentStatus: updatedJob.paymentStatus,
                userRole: user.role,
                timestamp: new Date().toISOString(),
            });

            setJobs((prev) => {
                const validJobs = prev.filter(j => j && (j.id || (j as any)._id));

                const exists = validJobs.find((j) => {
                    const existingId = j.id || (j as any)._id;
                    return existingId === jobId;
                });

                if (exists) {
                    console.log('[SOCKET] Updating existing job:', jobId);
                    return validJobs.map((j) => {
                        const existingId = j.id || (j as any)._id;
                        return existingId === jobId ? { ...updatedJob, id: jobId } : j;
                    });
                }

                if (
                    isServiceStaffRole(user.role) &&
                    (updatedJob.paymentStatus !== 'paid' || updatedJob.status === 'pending')
                ) {
                    console.log('[SOCKET] Skipping job for service staff (not paid or pending):', jobId);
                    return validJobs;
                }

                console.log('[SOCKET] Adding new job to list:', jobId);
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

        console.log('[SOCKET] Registering job event listeners:', jobEvents);

        for (const event of jobEvents) {
            socket.off(event, handleJobUpdate);
            socket.on(event, handleJobUpdate);
        }

        // Join immediately if socket is already connected
        if (socket.connected) joinRoom();

        console.log('[SOCKET] Socket setup complete for user:', user.id, 'role:', user.role);

        return () => {
            clearInterval(syncInterval);
            socket?.off('booking:status', handleBookingStatus);
            socket?.off('notification:customer', handleCustomerNotification);
            for (const event of jobEvents) {
                socket?.off(event, handleJobUpdate);
            }
            socket?.off('connect', joinRoom);
            socket?.off('disconnect');
            socket?.removeAllListeners();
            socket?.disconnect();
            socket = null;
        };
    }, [user]);

    return { jobs, setJobs, isLoading };
}
