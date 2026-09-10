/**
 * Home hero 8-step rail — aligned with web CustomerDashboard live tracker inputs:
 * `serviceTrackingStage`, `customerStatus`, and `status`, mapped onto the
 * 8 micro-steps used on mobile Home. Evidence existence never advances this rail.
 */

import type { BookingRecord } from '@/services/api/types';
import { normTrackerStr } from '@/utils/customer-live-tracker-pick';
import {
  canonicalStageFromValue,
  type CustomerTrackerStage,
} from '@/utils/customer-tracker-stage';

/** Canonical customer stage → index on this 8-step Home rail. */
const CANONICAL_STAGE_TO_RAIL_STEP: Record<CustomerTrackerStage, number> = {
  confirmed: 1,
  received: 3,
  in_progress: 4,
  quality_check: 5,
  ready_pickup: 6,
};

export const CUSTOMER_HOME_RAIL_LABELS = [
  'Booked',
  'Confirmed',
  'Assigned',
  'Checked in',
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
  { label: 'Checked in', color: '#22D3EE', fill: 'rgba(34,211,238,0.11)', icon: 'car-outline', step: 3 },
  { label: 'In Service', color: '#FF7C1E', fill: 'rgba(255,124,30,0.11)', icon: 'construct-outline', step: 4 },
  { label: 'QC', color: '#2DDBA6', fill: 'rgba(45,219,166,0.11)', icon: 'shield-checkmark-outline', step: 5 },
  { label: 'Payment', color: '#2DDBA6', fill: 'rgba(45,219,166,0.11)', icon: 'card-outline', step: 6 },
  { label: 'Released', color: '#2DDBA6', fill: 'rgba(45,219,166,0.11)', icon: 'car-sport-outline', step: 7 },
];

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
    return 4;
  }
  if (cs === 'ready') {
    return 6;
  }

  // The five canonical customer stages map onto this 8-step rail here and nowhere else, so
  // the rail can never disagree with the Track screen about the same booking.
  if (ts === 'completed' || ts === 'released') return 7;
  const canonical = canonicalStageFromValue(ts);
  if (canonical) {
    if (canonical === 'ready_pickup') {
      return payPaid && (st === 'released' || st === 'completed') ? 7 : 6;
    }
    return CANONICAL_STAGE_TO_RAIL_STEP[canonical];
  }

  if (['pending', 'pending_confirmation'].includes(st)) return 0;
  if (st === 'approved') return 1;
  if (st === 'confirmed') return 1;
  if (st === 'assigned') return 2;
  if (st === 'received') return 3;
  if (st === 'in_progress' || st === 'in-progress') return 4;
  if (st === 'completed') return 5;
  if (st === 'ready_for_payment') return 6;
  if (st === 'paid') return 6;
  if (st === 'released') return 7;
  if (st === 'queued') return 1;

  return 0;
}

export function getCustomerHomeHeroPill(booking: BookingRecord): CustomerHomeHeroPill {
  const step = resolveCustomerHomeRailStep(booking);
  return PILL[step] ?? PILL[0];
}
