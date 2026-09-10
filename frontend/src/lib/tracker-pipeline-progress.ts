/**
 * Single source for the 4-gate service pipeline progress (25% increments).
 * Matches QC `getTrackerState` in `QCLiveTrackerView.tsx` — customer UI must use this
 * for completion % so uploads never advance customer-visible state before
 * `serviceTrackingStage` catches up.
 */

export const TRACKER_PIPELINE_GATE_STAGES = ['received', 'in_progress', 'quality_check', 'ready_pickup'] as const;

export function getCompletedGateIndexFromServiceStage(stage: string | null | undefined): number {
  if (stage == null || String(stage).trim() === '') return -1;
  const s = String(stage).trim().toLowerCase().replace(/-/g, '_');
  if (s === 'confirmed') return -1;
  if (s === 'completed' || s === 'released') return TRACKER_PIPELINE_GATE_STAGES.length - 1;
  const idx = TRACKER_PIPELINE_GATE_STAGES.indexOf(s as (typeof TRACKER_PIPELINE_GATE_STAGES)[number]);
  return idx >= 0 ? idx : -1;
}

/**
 * Index of the gate the shop is CURRENTLY working — the gate that owns the evidence being
 * collected right now.
 *
 * `serviceTrackingStage` names that open gate, not a finished one: the backend only lets a job
 * advance INTO stage X once gate X-1's photos are complete (see
 * `gatePhotoStageToValidateForAdvance`), so a job sitting at `in_progress` is being worked in
 * the Service In Progress gate, and one at `quality_check` is under inspection.
 *
 * A job that has not reached a gate yet (`confirmed`, or no stage) is waiting on the first gate,
 * Vehicle Arrive.
 */
export function getActiveGateIndexFromServiceStage(stage: string | null | undefined): number {
  const s = String(stage ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (!s || s === 'confirmed' || s === 'approved' || s === 'assigned') return 0;
  if (s === 'completed' || s === 'released') return TRACKER_PIPELINE_GATE_STAGES.length - 1;
  const idx = TRACKER_PIPELINE_GATE_STAGES.indexOf(s as (typeof TRACKER_PIPELINE_GATE_STAGES)[number]);
  return idx >= 0 ? idx : 0;
}

export type TrackerPipelineProgressInput = {
  serviceTrackingStage?: string | null;
  /** QC jobs: `orderStatus`. Customer bookings: `status`. */
  status?: string | null;
};

export function getTrackerPipelineProgressPct(input: TrackerPipelineProgressInput): number {
  const rawStageFull = input.serviceTrackingStage;
  const rawStage = String(rawStageFull ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const rawStatus = String(input.status ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const awaitingPosBalance = rawStatus === 'ready_for_payment';
  const normalizedStage =
    rawStage === 'released' || rawStage === 'completed' ? 'ready_pickup' : rawStage;
  const statusComplete = rawStatus === 'completed' || rawStatus === 'released';
  let completedIndex = Math.max(
    getCompletedGateIndexFromServiceStage(normalizedStage || undefined),
    statusComplete ? TRACKER_PIPELINE_GATE_STAGES.length - 1 : -1
  );

  if (!normalizedStage && completedIndex < 0) {
    if (rawStatus === 'received') completedIndex = 0;
    else if (rawStatus === 'in_progress' || rawStatus === 'in-progress') completedIndex = 1;
    else if (rawStatus === 'ready_for_payment') completedIndex = TRACKER_PIPELINE_GATE_STAGES.length - 1;
  }

  let progressPct = Math.max(0, Math.min(100, (completedIndex + 1) * 25));
  if (awaitingPosBalance && rawStage === 'ready_pickup') progressPct = 100;
  return progressPct;
}
