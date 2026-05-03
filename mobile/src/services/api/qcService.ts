import { apiClient, cachedGet, invalidateCache, TTL } from '@/services/api/client';
import type { ApiEnvelope } from '@/services/api/types';

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
  notes?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  customerNotes?: string;
  customerPhone?: string;
  customerEmail?: string;
  technicianNotes?: string;
  damageAnnotations?: unknown[];
  qcChecklist?: { item: string; passed: boolean; note?: string }[];
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

// ── Urgency helpers ───────────────────────────────────────────────────────────

export type UrgencyLevel = 'overdue' | 'urgent' | 'new';

export const getUrgencyLevel = (elapsedMinutes: number): UrgencyLevel => {
  if (elapsedMinutes >= 2880) return 'overdue'; // 48h+
  if (elapsedMinutes >= 1440) return 'urgent';  // 24–48h
  return 'new';
};

export const URGENCY_COLORS = {
  overdue: { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444', stripe: '#EF4444', label: 'OVERDUE' },
  urgent:  { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B', stripe: '#F59E0B', label: 'URGENT' },
  new:     { bg: 'rgba(34, 197, 94, 0.15)',  text: '#22C55E', stripe: '#22C55E', label: 'NEW' },
} as const;

// ── Return reasons (matches web QCReturnModal) ─────────────────────────────────

export const RETURN_REASONS = [
  'Missing before/after photos',
  'Service does not match job order',
  'Visible damage remaining on vehicle',
  'Unsatisfactory finish quality',
  'Customer concern not addressed',
  'AI damage detection requires correction',
  'Incorrect product/material used',
  'Other — see comment',
] as const;

// ── Service ───────────────────────────────────────────────────────────────────

export const qcService = {
  /** Fetch all QC jobs */
  async getJobs(): Promise<QCJob[]> {
    const data = await cachedGet<ApiEnvelope<QCJob[]>>('/qc/jobs', undefined, TTL.SHORT);
    return Array.isArray(data.data) ? data.data : [];
  },

  /** Fetch dashboard stats */
  async getStats(): Promise<QCStats> {
    const data = await cachedGet<ApiEnvelope<QCStats>>('/qc/dashboard/stats', undefined, TTL.SHORT);
    return data.data;
  },

  /** Quick approve a single job */
  async approveJob(id: string): Promise<boolean> {
    const res = await apiClient.patch<ApiEnvelope<any>>(`/qc/jobs/${id}/approve`);
    invalidateCache('/qc');
    return res.data?.success ?? false;
  },

  /** Return / flag a job with reason */
  async returnJob(id: string, reason: string): Promise<boolean> {
    const res = await apiClient.patch<ApiEnvelope<any>>(`/qc/jobs/${id}/return`, { reason });
    invalidateCache('/qc');
    return res.data?.success ?? false;
  },

  /** Batch approve multiple jobs */
  async batchApprove(ids: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await apiClient.patch<ApiEnvelope<any>>(`/qc/jobs/${id}/approve`);
        success++;
      } catch {
        failed++;
      }
    }
    invalidateCache('/qc');
    return { success, failed };
  },
};
