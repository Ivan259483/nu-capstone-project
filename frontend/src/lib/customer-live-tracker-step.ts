import type { Booking } from '@/types';

/**
 * Same pipeline as `TRACKER_STEPS` in CustomerLiveTrackerPage — keep indices in sync.
 * 0 Awaiting vehicle → 5 Ready for pickup.
 */
export const LIVE_TRACKER_PROGRESS_LABELS = [
  'Awaiting',
  'Check-in',
  'Received',
  'In progress',
  'QC',
  'Pickup',
] as const;

/**
 * Current milestone index for the customer-facing live tracker (0–5).
 * Duplicates CustomerLiveTrackerPage `getCurrentStepIndex` logic — update both if pipeline changes.
 */
export function getLiveTrackerStepIndex(booking: Booking | null | undefined): number {
  if (!booking) return 0;

  const trackingStage = (booking as { serviceTrackingStage?: string }).serviceTrackingStage;
  if (trackingStage && typeof trackingStage === 'string') {
    const stageMap: Record<string, number> = {
      confirmed: 1,
      received: 2,
      in_progress: 3,
      quality_check: 4,
      ready_pickup: 5,
      completed: 5,
    };
    if (stageMap[trackingStage] !== undefined) return stageMap[trackingStage];
  }

  const status = String(booking.status || '').toLowerCase();
  const customerStatus = String(booking.customerStatus || '').toLowerCase();

  if (status === 'paid' || customerStatus === 'ready') return 5;
  if (status === 'completed' || customerStatus === 'finishing') return 4;
  if (
    status === 'in_progress'
    || status === 'in-progress'
    || customerStatus === 'washing'
    || customerStatus === 'detailing'
    || customerStatus === 'in-progress'
  ) {
    return 3;
  }
  if (status === 'received') return 2;
  if (status === 'confirmed' || status === 'assigned') return 1;
  return 0;
}
