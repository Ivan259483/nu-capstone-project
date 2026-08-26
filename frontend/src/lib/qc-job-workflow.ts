import type { QCJob } from '@/hooks/useQCData';
import { getTrackerPipelineProgressPct } from '@/lib/tracker-pipeline-progress';

/** Persisted when navigating from Jobs queue → Live Tracker with a pre-selected order. */
export const QC_LIVE_TRACKER_JOB_KEY = 'autospf_qc_live_tracker_job';

export interface QCLiveTrackerDeepLink {
  jobId: string;
  stage?: string;
  action?: string;
  slot?: string;
  evidenceId?: string;
  qcId?: string;
}

export type QCJobWorkflowAction = 'live-tracker' | 'sign-off';

/**
 * Jobs for Review is a triage queue — not a second QC console.
 * Active shop-floor work belongs in Live Tracker; sign-off is for final approve/return.
 */
export function getQCJobWorkflowAction(job: QCJob): QCJobWorkflowAction {
  const orderStatus = String((job as any).orderStatus || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const stage = String((job as any).serviceTrackingStage || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');

  if (job.status === 'approved') return 'sign-off';

  // Final disposition only — QC gates (including quality_check) stay in Live Tracker.
  const signOffOrderStatuses = new Set(['ready_for_payment', 'completed', 'released']);
  const signOffStages = new Set(['ready_pickup', 'completed', 'released']);

  if (job.status === 'needs-fix' || job.status === 'resubmitted') return 'sign-off';
  if (signOffOrderStatuses.has(orderStatus) || signOffStages.has(stage)) return 'sign-off';

  // Pickup gate complete (100%) but not yet paid/released → still sign-off queue
  const progressPct = getTrackerPipelineProgressPct({
    serviceTrackingStage: (job as any).serviceTrackingStage,
    status: (job as any).orderStatus,
  });
  if (progressPct >= 100 && (stage === 'ready_pickup' || signOffOrderStatuses.has(orderStatus))) {
    return 'sign-off';
  }

  return 'live-tracker';
}

export function getQCJobActionLabel(action: QCJobWorkflowAction): string {
  return action === 'live-tracker' ? 'Open in Live Tracker' : 'Sign off';
}

export function readLiveTrackerDeepLinkJobId(): string | null {
  return readLiveTrackerDeepLink()?.jobId || null;
}

export function readLiveTrackerDeepLink(): QCLiveTrackerDeepLink | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(QC_LIVE_TRACKER_JOB_KEY)?.trim();
    if (!raw) return null;
    if (!raw.startsWith('{')) return { jobId: raw };
    const parsed = JSON.parse(raw) as Partial<QCLiveTrackerDeepLink>;
    const jobId = String(parsed.jobId || '').trim();
    if (!jobId) return null;
    const optional = (value: unknown) => {
      const normalized = String(value || '').trim();
      return normalized || undefined;
    };
    return {
      jobId,
      stage: optional(parsed.stage),
      action: optional(parsed.action),
      slot: optional(parsed.slot),
      evidenceId: optional(parsed.evidenceId),
      qcId: optional(parsed.qcId),
    };
  } catch {
    return null;
  }
}

export function stashLiveTrackerDeepLinkJobId(target: string | QCLiveTrackerDeepLink) {
  if (typeof window === 'undefined') return;
  try {
    const payload = typeof target === 'string' ? { jobId: target } : target;
    sessionStorage.setItem(QC_LIVE_TRACKER_JOB_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearLiveTrackerDeepLinkJobId() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(QC_LIVE_TRACKER_JOB_KEY);
  } catch {
    /* ignore */
  }
}
