import type { Booking } from '@/types';
import {
  resolveCustomerTrackerStage,
  type CustomerTrackerStage,
} from './customer-tracker-stage.ts';
import { normTrackerStr } from './customer-live-tracker-pick.ts';

const PRE_CHECK_IN_STATUSES = new Set(['pending', 'pending_confirmation', 'approved']);

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
 * The Live Tracker page shows one extra pre-arrival row ("Waiting for Your Vehicle to Arrive")
 * ahead of the five canonical customer stages, so its row index is the canonical customer step
 * — never the operational QC gate index.
 */
const STAGE_TO_LIVE_TRACKER_INDEX: Record<CustomerTrackerStage, number> = {
  confirmed: 1,
  received: 2,
  in_progress: 3,
  quality_check: 4,
  ready_pickup: 5,
};

/**
 * Current milestone index for the customer-facing live tracker (0–5).
 * Derived from the single canonical stage resolver so the row highlighted here can never
 * disagree with the stage label, step number or progress percentage shown elsewhere.
 */
export function getLiveTrackerStepIndex(booking: Booking | null | undefined): number {
  if (!booking) return 0;
  const { stage } = resolveCustomerTrackerStage(booking as any);
  // Row 0 is the pre-arrival row: a booking that is only approved / awaiting confirmation has
  // no shop-floor stage yet, so it never occupies the "Vehicle Check-In" row.
  if (stage === 'confirmed' && PRE_CHECK_IN_STATUSES.has(normTrackerStr(booking.status))) return 0;
  return STAGE_TO_LIVE_TRACKER_INDEX[stage];
}
