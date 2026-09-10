/**
 * Customer tracker evidence is released by the persisted workflow stage, not by upload.
 *
 * Staff may prepare any gate's evidence early. Customer-facing boundaries must call
 * this helper so those internal rows (including URLs, notes, IDs, and timestamps)
 * remain private until `serviceTrackingStage` officially reaches that gate.
 */

export const CUSTOMER_TRACKER_EVIDENCE_STAGES = Object.freeze([
  'received',
  'in_progress',
  'quality_check',
  'ready_pickup',
]);

const TERMINAL_TRACKER_STAGES = new Set(['completed', 'released']);

function normalizeStage(value) {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

export function getReleasedCustomerTrackerStageIndex(serviceTrackingStage) {
  const stage = normalizeStage(serviceTrackingStage);
  if (TERMINAL_TRACKER_STAGES.has(stage)) {
    return CUSTOMER_TRACKER_EVIDENCE_STAGES.length - 1;
  }
  return CUSTOMER_TRACKER_EVIDENCE_STAGES.indexOf(stage);
}

export function isTrackerEvidenceStageReleased(serviceTrackingStage, evidenceStage) {
  const releasedIndex = getReleasedCustomerTrackerStageIndex(serviceTrackingStage);
  const evidenceIndex = CUSTOMER_TRACKER_EVIDENCE_STAGES.indexOf(normalizeStage(evidenceStage));
  return releasedIndex >= 0 && evidenceIndex >= 0 && evidenceIndex <= releasedIndex;
}

export function getCustomerVisibleTrackerStageMedia(order) {
  const media = Array.isArray(order?.trackerStageMedia) ? order.trackerStageMedia : [];
  return media.filter((entry) => (
    entry
    && isTrackerEvidenceStageReleased(order?.serviceTrackingStage, entry.stage)
  ));
}
