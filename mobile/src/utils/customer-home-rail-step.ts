/**
 * Home hero 8-step rail — aligned with web CustomerDashboard live tracker inputs:
 * `serviceTrackingStage`, `customerStatus`, `status`, and the same gate-photo bumps
 * as the 5-step tracker (mapped onto the 8 micro-steps used on mobile Home).
 *
 * Keep gate thresholds in sync with `customer-tracker-stage-media.ts` / web customer tracker.
 */

import type { BookingRecord } from '@/services/api/types';
import {
  CUSTOMER_TRACKER_GATE_MIN_PHOTOS,
  customerGateMinSlotCount,
  getCustomerStageSlotPhotos,
} from '@/utils/customer-tracker-stage-media';
import { normTrackerStr } from '@/utils/customer-live-tracker-pick';

export const CUSTOMER_HOME_RAIL_LABELS = [
  'Booked',
  'Confirmed',
  'Assigned',
  'Checked-In',
  'In Service',
  'QC',
  'Payment',
  'Released',
] as const;

export type CustomerHomeHeroPill = {
  label: string;
  color: string;
  fill: string;
  icon: string;
  step: number;
};

/** Matches Home `D` token colors in `(customer)/index.tsx`. */
const PILL: CustomerHomeHeroPill[] = [
  { label: 'Booked', color: '#F5B820', fill: 'rgba(245,184,32,0.11)', icon: 'receipt-outline', step: 0 },
  { label: 'Confirmed', color: '#4F91FF', fill: 'rgba(79,145,255,0.11)', icon: 'checkmark-circle-outline', step: 1 },
  { label: 'Assigned', color: '#9874FF', fill: 'rgba(152,116,255,0.11)', icon: 'person-outline', step: 2 },
  { label: 'Checked-In', color: '#22D3EE', fill: 'rgba(34,211,238,0.11)', icon: 'car-outline', step: 3 },
  { label: 'In Service', color: '#FF7C1E', fill: 'rgba(255,124,30,0.11)', icon: 'construct-outline', step: 4 },
  { label: 'QC', color: '#2DDBA6', fill: 'rgba(45,219,166,0.11)', icon: 'shield-checkmark-outline', step: 5 },
  { label: 'Payment', color: '#2DDBA6', fill: 'rgba(45,219,166,0.11)', icon: 'card-outline', step: 6 },
  { label: 'Released', color: '#2DDBA6', fill: 'rgba(45,219,166,0.11)', icon: 'car-sport-outline', step: 7 },
];

function applyHome8EvidenceBumps(
  booking: Pick<BookingRecord, 'trackerStageMedia' | 'serviceTrackingStage' | 'status'>,
  base: number
): number {
  let s = Math.min(Math.max(base, 0), 7);
  const ts = normTrackerStr(booking.serviceTrackingStage);
  const status = normTrackerStr(booking.status);

  if (getCustomerStageSlotPhotos(booking, 'received').length >= CUSTOMER_TRACKER_GATE_MIN_PHOTOS) {
    if (ts === 'received' || (!ts && status === 'received')) {
      s = Math.max(s, 4);
    }
  }
  if (getCustomerStageSlotPhotos(booking, 'in_progress').length >= CUSTOMER_TRACKER_GATE_MIN_PHOTOS) {
    if (ts === 'in_progress' || (!ts && (status === 'in_progress' || status === 'in-progress'))) {
      s = Math.max(s, 5);
    }
  }
  if (ts === 'quality_check') {
    const n = getCustomerStageSlotPhotos(booking, 'quality_check').length;
    if (n >= customerGateMinSlotCount('quality_check')) {
      s = Math.max(s, 6);
    }
  }
  if (getCustomerStageSlotPhotos(booking, 'ready_pickup').length >= CUSTOMER_TRACKER_GATE_MIN_PHOTOS) {
    s = Math.max(s, 6);
  }
  return Math.min(s, 7);
}

/**
 * Active dot index 0..7 on the Home 8-step rail (Booked → Released).
 */
export function resolveCustomerHomeRailStep(booking: BookingRecord | null | undefined): number {
  if (!booking) return 0;
  const st = normTrackerStr(booking.status);
  if (['cancelled', 'failed', 'rejected'].includes(st)) return 0;

  const ts = normTrackerStr(booking.serviceTrackingStage);
  const payPaid = String(booking.paymentStatus || '').toLowerCase() === 'paid';
  const cs = String(booking.customerStatus || '').toLowerCase();

  if (['washing', 'detailing', 'finishing'].includes(cs) || cs === 'in-progress' || cs === 'in_progress') {
    return applyHome8EvidenceBumps(booking, 4);
  }
  if (cs === 'ready') {
    return applyHome8EvidenceBumps(booking, 6);
  }

  if (ts === 'confirmed') return applyHome8EvidenceBumps(booking, 1);
  if (ts === 'received') return applyHome8EvidenceBumps(booking, 3);
  if (ts === 'in_progress') return applyHome8EvidenceBumps(booking, 4);
  if (ts === 'quality_check') return applyHome8EvidenceBumps(booking, 5);
  if (ts === 'ready_pickup') {
    const s = payPaid && (st === 'released' || st === 'completed') ? 7 : 6;
    return applyHome8EvidenceBumps(booking, s);
  }
  if (ts === 'completed' || ts === 'released') {
    return applyHome8EvidenceBumps(booking, 7);
  }

  if (['pending', 'pending_confirmation'].includes(st)) return applyHome8EvidenceBumps(booking, 0);
  if (st === 'approved') return applyHome8EvidenceBumps(booking, 1);
  if (st === 'confirmed') return applyHome8EvidenceBumps(booking, 1);
  if (st === 'assigned') return applyHome8EvidenceBumps(booking, 2);
  if (st === 'received') return applyHome8EvidenceBumps(booking, 3);
  if (st === 'in_progress' || st === 'in-progress') return applyHome8EvidenceBumps(booking, 4);
  if (st === 'completed') return applyHome8EvidenceBumps(booking, 5);
  if (st === 'ready_for_payment') return applyHome8EvidenceBumps(booking, 6);
  if (st === 'paid') return applyHome8EvidenceBumps(booking, 6);
  if (st === 'released') return applyHome8EvidenceBumps(booking, 7);
  if (st === 'queued') return applyHome8EvidenceBumps(booking, 1);

  return applyHome8EvidenceBumps(booking, 0);
}

export function getCustomerHomeHeroPill(booking: BookingRecord): CustomerHomeHeroPill {
  const step = resolveCustomerHomeRailStep(booking);
  return PILL[step] ?? PILL[0];
}
