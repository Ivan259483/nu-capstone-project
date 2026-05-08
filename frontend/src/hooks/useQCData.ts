import { useState, useEffect, useCallback, useRef } from 'react';
import { getSharedSocket } from './useRealtimeSync';
import api from '@/lib/api';
import { toast } from 'sonner';
import { compressImageForTrackerUpload } from '@/lib/compress-image-for-upload';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QCJob {
  id: string;
  jobId: string;
  customer: string;
  vehicle: string;
  make: string;
  plate: string;
  service: string;
  serviceType: string;
  technician: string;
  technicianId?: string;
  submittedAt: string;
  elapsed: string;
  elapsedMinutes: number;
  status: 'pending-review' | 'in-review' | 'approved' | 'needs-fix' | 'resubmitted';
  aiFlag: boolean;
  priority: string;
  photos?: { before: string[]; after: string[] };
  trackerStageMedia?: {
    stage: string;
    photoUrl?: string;
    description?: string;
    uploadedAt?: string;
    uploadedBy?: string;
  }[];
  staffNotes?: { content: string; detailerName: string; createdAt: string }[];
  qcChecklist?: { item: string; passed: boolean; note?: string }[];
  damageAnnotations?: unknown[];
  notes?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  technicianNotes?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerNotes?: string;
}

export interface QCStats {
  awaiting: number;
  approvedToday: number;
  returned: number;
  /** Orders QC approved (qcCompletedAt set) — lifetime, for reports */
  qcApprovedLifetime?: number;
  /** Distinct orders with a QC outcome (approved and/or returned) */
  totalQCReviewed?: number;
  qcApprovalRatePct?: number;
  qcReturnRatePct?: number;
  aiPending: number;
  avgReviewTime: string;
  trendData: { date: string; approved: number; returned: number }[];
  serviceDistribution: { name: string; value: number }[];
}

export interface QCActivityItem {
  id: string;
  jobId: string;
  type: 'approved' | 'returned';
  customer: string;
  vehicle: string;
  service: string;
  actor: string;
  timestamp: string;
  note: string | null;
}

export interface QCTechnicianStat {
  name: string;
  approved: number;
  returned: number;
  rate: number;
}

const POLL_INTERVAL_MS = 5_000; // 5 s — backup poll (socket is primary; keeps autospf.shop feeling fresh)

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useQCData() {
  const [jobs, setJobs] = useState<QCJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [stats, setStats] = useState<QCStats>({
    awaiting: 0,
    approvedToday: 0,
    returned: 0,
    qcApprovedLifetime: 0,
    totalQCReviewed: 0,
    qcApprovalRatePct: 0,
    qcReturnRatePct: 0,
    aiPending: 0,
    avgReviewTime: '—',
    trendData: [],
    serviceDistribution: [],
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [activity, setActivity] = useState<QCActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [technicianData, setTechnicianData] = useState<QCTechnicianStat[]>([]);
  const [techLoading, setTechLoading] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** After first successful /qc/jobs response, never toggle jobsLoading again (silent refetches only). */
  const qcJobsHydratedRef = useRef(false);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchJobs = useCallback(async (silent = false) => {
    const blockingUi = !silent && !qcJobsHydratedRef.current;
    if (blockingUi) setJobsLoading(true);
    try {
      const res = await api.get('/qc/jobs');
      if (res.data?.success) {
        setJobs(res.data.data ?? []);
        qcJobsHydratedRef.current = true;
      }
    } catch (err: any) {
      if (!silent) console.error('[QC] Failed to fetch jobs:', err.message);
    } finally {
      if (blockingUi) setJobsLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setStatsLoading(true);
    try {
      const res = await api.get('/qc/dashboard/stats');
      if (res.data?.success) setStats(res.data.data);
    } catch (err: any) {
      if (!silent) console.error('[QC] Failed to fetch stats:', err.message);
    } finally {
      if (!silent) setStatsLoading(false);
    }
  }, []);

  const fetchActivity = useCallback(async (silent = false) => {
    if (!silent) setActivityLoading(true);
    try {
      const res = await api.get('/qc/activity?limit=15');
      if (res.data?.success) setActivity(res.data.data ?? []);
    } catch (err: any) {
      if (!silent) console.error('[QC] Failed to fetch activity:', err.message);
    } finally {
      if (!silent) setActivityLoading(false);
    }
  }, []);

  const fetchTechnicianData = useCallback(async (silent = false) => {
    if (!silent) setTechLoading(true);
    try {
      const res = await api.get('/qc/reports/technicians');
      if (res.data?.success) setTechnicianData(res.data.data ?? []);
    } catch (err: any) {
      if (!silent) console.error('[QC] Failed to fetch technician report:', err.message);
    } finally {
      if (!silent) setTechLoading(false);
    }
  }, []);

  const refetchAll = useCallback(async (silent = false) => {
    await Promise.all([
      fetchJobs(silent),
      fetchStats(silent),
      fetchActivity(silent),
      fetchTechnicianData(silent),
    ]);
  }, [fetchJobs, fetchStats, fetchActivity, fetchTechnicianData]);

  // ── Initial load + polling ───────────────────────────────────────────────────

  useEffect(() => {
    refetchAll(false);

    pollRef.current = setInterval(() => {
      refetchAll(true); // silent background poll
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refetchAll]);

  // ── Shared socket listener + visibility refresh (PRIORITY 1 & 3) ─────────────
  // Uses the app-wide singleton socket (getSharedSocket) — no new io() connection.
  // Fires a silent refetch whenever MongoDB reports an orders change.

  useEffect(() => {
    const socket = getSharedSocket();
    /** Coalesce db_change + orderUpdated bursts into one silent refetch (smoother for defense / slow Wi‑Fi). */
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSocketRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        refetchAll(true);
      }, 350);
    };

    // db_change fires from MongoDB Change Streams via the backend
    const handleDbChange = (payload: any) => {
      if (payload.collection === 'orders') {
        console.log('[useQCData] db_change orders → debounced silent refetch');
        scheduleSocketRefetch();
      }
    };
    socket.on('db_change', handleDbChange);
    // Legacy event name used by some controllers
    socket.on('orderUpdated', scheduleSocketRefetch);

    // Visibility & focus refresh — catch changes missed while tab was in background
    let visTimer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (visTimer) clearTimeout(visTimer);
        visTimer = setTimeout(() => {
          console.log('[useQCData] Tab visible — silent refetch');
          refetchAll(true);
        }, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      socket.off('db_change', handleDbChange);
      socket.off('orderUpdated', scheduleSocketRefetch);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      if (visTimer) clearTimeout(visTimer);
    };
  }, [refetchAll]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const approveJob = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.patch(`/qc/jobs/${id}/approve`);
      toast.success('Job approved', { description: 'The job has been marked as completed.' });
      await refetchAll(true);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to approve job';
      toast.error('Approval failed', { description: msg });
      return false;
    }
  }, [refetchAll]);

  const returnJob = useCallback(async (id: string, reason: string): Promise<boolean> => {
    if (!reason?.trim()) {
      toast.error('A return reason is required');
      return false;
    }
    try {
      await api.patch(`/qc/jobs/${id}/return`, { reason });
      toast.success('Job returned', { description: 'The job has been sent back to the technician.' });
      await refetchAll(true);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to return job';
      toast.error('Return failed', { description: msg });
      return false;
    }
  }, [refetchAll]);

  const updateChecklist = useCallback(async (
    id: string,
    items: { item: string; passed: boolean; note?: string }[]
  ): Promise<boolean> => {
    try {
      await api.patch(`/qc/jobs/${id}/checklist`, { items });
      toast.success('Checklist saved');
      return true;
    } catch (err: any) {
      toast.error('Failed to save checklist');
      return false;
    }
  }, []);

  const updateServiceStatus = useCallback(async (id: string, stage: string): Promise<boolean> => {
    try {
      await api.patch(`/qc/jobs/${id}/service-status`, { stage });
      toast.success('Stage updated', { description: `Service stage advanced to: ${stage.replace(/_/g, ' ')}` });
      // Live tracker only needs job rows — avoids 4 parallel GETs and browser “busy” feel.
      await fetchJobs(true);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to update service stage';
      toast.error('Stage update failed', { description: msg });
      return false;
    }
  }, [fetchJobs]);

  const uploadTrackerStagePhoto = useCallback(
    async (
      orderId: string,
      payload: { stage: string; description?: string; file?: File | null }
    ): Promise<boolean> => {
      let loadingId: string | number | undefined;
      try {
        if (payload.file) {
          loadingId = toast.loading('Preparing photo…', { duration: 120_000 });
          let file = payload.file;
          try {
            const compressed = await compressImageForTrackerUpload(file);
            const shrunk = compressed !== file && compressed.size < file.size;
            toast.loading(shrunk ? 'Uploading optimized photo…' : 'Uploading…', {
              id: loadingId,
              duration: 120_000,
            });
            file = compressed;
          } catch {
            toast.loading('Uploading…', { id: loadingId, duration: 120_000 });
          }

          const form = new FormData();
          form.append('stage', payload.stage);
          if (payload.description?.trim()) form.append('description', payload.description.trim());
          form.append('photo', file);

          await api.post(`/orders/${orderId}/stage-photo`, form, {
            timeout: 120_000,
            headers: { 'Content-Type': undefined },
            meta: { suppressErrorToast: true },
          } as any);
        } else if (payload.stage === 'confirmed' && payload.description?.trim()) {
          loadingId = toast.loading('Saving note…');
          await api.patch(
            `/orders/${orderId}/stage-photo`,
            {
              stage: 'confirmed',
              description: payload.description.trim(),
            },
            { meta: { suppressErrorToast: true } } as any
          );
        } else {
          toast.error(
            payload.stage === 'confirmed'
              ? 'Add a customer note or choose a photo'
              : 'Please choose an image file'
          );
          return false;
        }
        toast.success('Stage photo saved', {
          id: loadingId,
          description: 'Shown on the customer live tracker.',
        });
        // Photo-only change: refresh job list only (faster than full QC dashboard refetch).
        await fetchJobs(true);
        return true;
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || 'Upload failed';
        toast.error('Stage photo upload failed', { id: loadingId, description: msg });
        return false;
      }
    },
    [fetchJobs]
  );

  const addStaffNote = useCallback(async (orderId: string, content: string): Promise<boolean> => {
    const trimmed = content?.trim();
    if (!trimmed) {
      toast.error('Please enter an update message');
      return false;
    }
    try {
      await api.patch(`/orders/${orderId}/notes`, { content: trimmed });
      toast.success('Service update added', { description: 'Visible in the activity feed.' });
      await fetchJobs(true);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to add update';
      toast.error('Update failed', { description: msg });
      return false;
    }
  }, [fetchJobs]);

  const assignServiceStaff = useCallback(async (
    id: string,
    assignments: { slot: string; name: string; role: string }[]
  ): Promise<boolean> => {
    try {
      await api.patch(`/qc/jobs/${id}/assign-staff`, { assignments });
      toast.success('Staff assigned', { description: 'Service team updated successfully.' });
      await fetchJobs(true);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to assign staff';
      toast.error('Assignment failed', { description: msg });
      return false;
    }
  }, [fetchJobs]);

  return {
    jobs,
    jobsLoading,
    stats,
    statsLoading,
    activity,
    activityLoading,
    technicianData,
    techLoading,
    refetchJobs: () => fetchJobs(false),
    refetchStats: () => fetchStats(false),
    refetchAll: () => refetchAll(false),
    approveJob,
    returnJob,
    updateChecklist,
    updateServiceStatus,
    uploadTrackerStagePhoto,
    assignServiceStaff,
    addStaffNote,
  };
}
