import type { QCJob } from '@/hooks/useQCData';
import { getTrackerPipelineProgressPct } from '@/lib/tracker-pipeline-progress';

/** Persisted when navigating from Jobs queue → Live Tracker with a pre-selected order. */
export const QC_LIVE_TRACKER_JOB_KEY = 'autospf_qc_live_tracker_job';

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
  if (typeof window === 'undefined') return null;
  try {
    const id = sessionStorage.getItem(QC_LIVE_TRACKER_JOB_KEY);
    return id?.trim() || null;
  } catch {
    return null;
  }
}

export function stashLiveTrackerDeepLinkJobId(jobId: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(QC_LIVE_TRACKER_JOB_KEY, jobId);
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
