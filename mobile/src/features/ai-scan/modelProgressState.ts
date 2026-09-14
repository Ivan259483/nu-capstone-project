/**
 * Pure Meshy 3D-generation lifecycle mapping — no invented percentages.
 *
 * Meshy reports "processing" (our normalized tri-state) for BOTH a queued
 * task (PENDING, generation not started) and one actively generating
 * (IN_PROGRESS). `started_at` is what actually distinguishes them: it is
 * falsy/0 while the task waits in Meshy's queue, and a real timestamp once
 * generation begins. This module holds that mapping as a small, dependency
 * free function — the same pattern already used for the workflow stage
 * machine in `scanWorkflowState.ts` — so scanStore.ts can stay a thin state
 * container and the lifecycle logic itself is unit-testable on its own.
 *
 * 'still_processing' is a distinct, non-terminal state: it means the LOCAL
 * polling window ran out while Meshy was still PENDING/IN_PROGRESS. It is
 * never a failure — Meshy's own task status is the only terminal-failure
 * authority, so a local timeout must never be presented as one.
 */

// 'queued' = Meshy has accepted the task but generation hasn't started yet
// (PENDING, started_at not reached). It is distinct from 'processing' so the
// UI never presents a queued task as if generation were already under way.
// 'still_processing' = the local polling window elapsed while Meshy was
// still non-terminal — distinct from 'failed'/'unavailable', which are the
// only states that ever mean generation will not continue.
export type Screen3DStatus =
  | 'idle'
  | 'queued'
  | 'processing'
  | 'still_processing'
  | 'ready'
  | 'failed'
  | 'unavailable';

export interface Model3DProgressLike {
  status: 'processing' | 'ar_ready' | 'failed' | 'unavailable' | 'cancelled' | 'still_processing';
  meshyStartedAt?: number | null;
}

/**
 * Maps one Meshy poll response to the screen-facing lifecycle status.
 * Never called for `status: 'cancelled'` — callers must treat a cancelled
 * (superseded/stale) poll result as a no-op before reaching this function.
 */
export const deriveModel3DStatus = (progress: Model3DProgressLike): Exclude<Screen3DStatus, 'idle'> => {
  if (progress.status === 'ar_ready') return 'ready';
  if (progress.status === 'failed') return 'failed';
  if (progress.status === 'unavailable') return 'unavailable';
  if (progress.status === 'still_processing') return 'still_processing';

  const isQueued = progress.status === 'processing' && !progress.meshyStartedAt;
  return isQueued ? 'queued' : 'processing';
};
