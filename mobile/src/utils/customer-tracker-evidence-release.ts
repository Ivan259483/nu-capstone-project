export type CustomerTrackerEvidenceStage =
  | 'confirmed'
  | 'received'
  | 'in_progress'
  | 'quality_check'
  | 'ready_pickup';

const CUSTOMER_RELEASED_MEDIA_STAGE_ORDER: CustomerTrackerEvidenceStage[] = [
  'received',
  'in_progress',
  'quality_check',
  'ready_pickup',
];

function normalizeStage(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
}

/** Defense in depth: clients render evidence only after the backend workflow releases its gate. */
export function isCustomerTrackerMediaStageReleased(
  booking: { serviceTrackingStage?: string | null } | null | undefined,
  stage: CustomerTrackerEvidenceStage | null | undefined
): boolean {
  if (!booking || !stage || stage === 'confirmed') return false;
  const current = normalizeStage(booking.serviceTrackingStage);
  const currentIndex = current === 'completed' || current === 'released'
    ? CUSTOMER_RELEASED_MEDIA_STAGE_ORDER.length - 1
    : CUSTOMER_RELEASED_MEDIA_STAGE_ORDER.indexOf(current as CustomerTrackerEvidenceStage);
  const evidenceIndex = CUSTOMER_RELEASED_MEDIA_STAGE_ORDER.indexOf(stage);
  return currentIndex >= 0 && evidenceIndex >= 0 && evidenceIndex <= currentIndex;
}
