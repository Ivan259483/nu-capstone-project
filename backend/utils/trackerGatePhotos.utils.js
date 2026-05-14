/**
 * Live tracker gate photos — five fixed angles per service stage.
 * Used by tracker.controller (uploads) and qc.controller (advance validation).
 */

export const TRACKER_GATE_STAGES = ['received', 'in_progress', 'quality_check', 'ready_pickup'];

export const TRACKER_PHOTO_SLOTS = ['front', 'rear', 'left', 'right', 'close_up'];

export const REQUIRED_GATE_PHOTOS = 5;

/** @param {string | undefined | null} slot */
export function normalizePhotoSlot(slot) {
  const s = String(slot || '').trim().toLowerCase();
  if (TRACKER_PHOTO_SLOTS.includes(s)) return s;
  return null;
}

/**
 * Count distinct filled photo slots for a gate stage.
 * Legacy row (photoUrl set, no slot) counts as one slot toward the total.
 * @param {{ trackerStageMedia?: Array<{ stage?: string; slot?: string; photoUrl?: string }> }} order
 * @param {string} stage
 */
export function countGatePhotos(order, stage) {
  const list = order?.trackerStageMedia || [];
  const keys = new Set();
  for (const e of list) {
    if (e.stage !== stage) continue;
    const url = String(e.photoUrl || '').trim();
    if (!url) continue;
    const slot = normalizePhotoSlot(e.slot);
    if (slot) keys.add(slot);
    else keys.add('__legacy__');
  }
  return keys.size;
}

/**
 * @param {{ trackerStageMedia?: Array<{ stage?: string; slot?: string; photoUrl?: string }> }} order
 * @param {string} stage
 * @returns {{ ok: boolean; uploaded: number; required: number }}
 */
export function gatePhotosProgress(order, stage) {
  const uploaded = countGatePhotos(order, stage);
  return {
    ok: uploaded >= REQUIRED_GATE_PHOTOS,
    uploaded,
    required: REQUIRED_GATE_PHOTOS,
  };
}

/**
 * When PATCHing `serviceTrackingStage` forward into a gate stage, photos must be
 * complete for the gate being *left* (the previous gate in the pipeline), not the
 * destination gate — staff uploads the next gate's angles after the stage advances.
 * @param {string} targetStage next `serviceTrackingStage` value
 * @returns {string|null} stage key for `countGatePhotos`, or null if `targetStage` is not a gate
 */
export function gatePhotoStageToValidateForAdvance(targetStage) {
  const s = String(targetStage || '').trim();
  if (!TRACKER_GATE_STAGES.includes(s)) return null;
  const idx = TRACKER_GATE_STAGES.indexOf(s);
  if (idx <= 0) return 'received';
  return TRACKER_GATE_STAGES[idx - 1];
}
