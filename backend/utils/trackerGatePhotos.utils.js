/**
 * Live tracker gate photos — five standard angles per gate; Vehicle Arrive (received)
 * may require a 6th checklist slot for Quality Checker role only (see qc.controller);
 * Quality Check stage uses a single qc_form slot (see qc.controller).
 * Used by tracker.controller (uploads) and qc.controller (advance validation).
 */

export const TRACKER_GATE_STAGES = ['received', 'in_progress', 'quality_check', 'ready_pickup'];

export const TRACKER_STANDARD_SLOTS = ['front', 'rear', 'left', 'right', 'close_up'];

/** @deprecated Use TRACKER_STANDARD_SLOTS — kept for imports that expect TRACKER_PHOTO_SLOTS */
export const TRACKER_PHOTO_SLOTS = TRACKER_STANDARD_SLOTS;

export const REQUIRED_GATE_PHOTOS = 5;

/** Vehicle Arrive gate when the advancing user is `staff_quality_checker`. */
export const QC_RECEIVED_REQUIRED_PHOTOS = 6;

/** Quality Check gate — one checklist / inspection photo (see tracker-gate-photo-slots on frontend). */
export const QC_QUALITY_CHECK_REQUIRED_PHOTOS = 1;

/**
 * @param {string | undefined | null} slot
 * @param {string | undefined | null} [stage] row stage — required to accept `preassessment_form` on `received` only
 */
export function normalizePhotoSlot(slot, stage) {
  const s = String(slot || '').trim().toLowerCase().replace(/-/g, '_');
  const st = String(stage || '').trim();
  if (
    (s === 'preassessment_form' || s === 'checklist_photo' || s === 'checklist') &&
    st === 'received'
  ) {
    return 'preassessment_form';
  }
  if (
    (s === 'qc_form' || s === 'qc_checklist' || s === 'final_inspection') &&
    st === 'quality_check'
  ) {
    return 'qc_form';
  }
  if (TRACKER_STANDARD_SLOTS.includes(s)) return s;
  return null;
}

/**
 * Minimum photos required on `validateStage` before PATCH may advance into the next gate.
 * @param {string} validateStage from `gatePhotoStageToValidateForAdvance`
 * @param {string} actorCanonicalRole from `normalizeToCanonical(req.user.role)`
 */
export function requiredGatePhotosForValidation(validateStage, actorCanonicalRole) {
  if (validateStage === 'quality_check') {
    return QC_QUALITY_CHECK_REQUIRED_PHOTOS;
  }
  if (validateStage === 'received' && actorCanonicalRole === 'staff_quality_checker') {
    return QC_RECEIVED_REQUIRED_PHOTOS;
  }
  return REQUIRED_GATE_PHOTOS;
}

/**
 * Count distinct filled photo slots for a gate stage.
 * Legacy row (photoUrl set, no slot) counts as one slot toward the total.
 * @param {{ trackerStageMedia?: Array<{ stage?: string; slot?: string; photoUrl?: string }> }} order
 * @param {string} stage
 */
export function countGatePhotos(order, stage) {
  const st = String(stage || '').trim();
  if (st === 'quality_check') {
    const list = order?.trackerStageMedia || [];
    const has = list.some(
      (e) => e.stage === 'quality_check' && String(e.photoUrl || '').trim()
    );
    return has ? 1 : 0;
  }
  const list = order?.trackerStageMedia || [];
  const keys = new Set();
  for (const e of list) {
    if (e.stage !== stage) continue;
    const url = String(e.photoUrl || '').trim();
    if (!url) continue;
    const slot = normalizePhotoSlot(e.slot, e.stage);
    if (slot) keys.add(slot);
    else keys.add('__legacy__');
  }
  return keys.size;
}

/**
 * @param {{ trackerStageMedia?: Array<{ stage?: string; slot?: string; photoUrl?: string }> }} order
 * @param {string} stage
 * @param {string} [actorCanonicalRole] optional — affects required count on `received` (QC = 6) and `quality_check` (always 1)
 * @returns {{ ok: boolean; uploaded: number; required: number }}
 */
export function gatePhotosProgress(order, stage, actorCanonicalRole) {
  const uploaded = countGatePhotos(order, stage);
  const required = requiredGatePhotosForValidation(stage, actorCanonicalRole ?? '');
  return {
    ok: uploaded >= required,
    uploaded,
    required,
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
