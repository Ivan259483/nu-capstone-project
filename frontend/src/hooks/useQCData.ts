import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';

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

const POLL_INTERVAL_MS = 30_000; // 30 seconds

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useQCData() {
  const [jobs, setJobs] = useState<QCJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [stats, setStats] = useState<QCStats>({
    awaiting: 0,
    approvedToday: 0,
    returned: 0,
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

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchJobs = useCallback(async (silent = false) => {
    if (!silent) setJobsLoading(true);
    try {
      const res = await api.get('/qc/jobs');
      if (res.data?.success) setJobs(res.data.data ?? []);
    } catch (err: any) {
      if (!silent) console.error('[QC] Failed to fetch jobs:', err.message);
    } finally {
      if (!silent) setJobsLoading(false);
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

  // ── Socket.io listener ───────────────────────────────────────────────────────

  useEffect(() => {
    let socket: any = null;

    const connectSocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        const { getBackendSocketUrl } = await import('@/lib/api');
        const token = localStorage.getItem('autospf_token');

        socket = io(getBackendSocketUrl(), {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 3,
        });

        socket.on('orderUpdated', () => {
          refetchAll(true);
        });
      } catch (err) {
        console.warn('[QC] Socket connection failed (non-fatal):', err);
      }
    };

    connectSocket();

    return () => {
      if (socket) socket.disconnect();
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
      await refetchAll(true);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to update service stage';
      toast.error('Stage update failed', { description: msg });
      return false;
    }
  }, [refetchAll]);

  const assignServiceStaff = useCallback(async (
    id: string,
    assignments: { slot: string; name: string; role: string }[]
  ): Promise<boolean> => {
    try {
      await api.patch(`/qc/jobs/${id}/assign-staff`, { assignments });
      toast.success('Staff assigned', { description: 'Service team updated successfully.' });
      await refetchAll(true);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to assign staff';
      toast.error('Assignment failed', { description: msg });
      return false;
    }
  }, [refetchAll]);

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
    assignServiceStaff,
  };
}
