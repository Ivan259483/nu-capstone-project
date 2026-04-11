import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { OrderService } from '@/lib/order-service';
import type { Booking, User } from '@/types';
import { isAdminDashboardRole, isServiceStaffRole } from '@/lib/roles';
import { getBackendSocketUrl } from '@/lib/api';

let socket: Socket | null = null;

const SYNC_INTERVAL_MS = 30_000;

export function useLiveJobs(user?: User | null) {
    const [jobs, setJobs] = useState<Booking[]>([]);
    const [isLoading, setIsLoading] = useState(false);

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
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
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
