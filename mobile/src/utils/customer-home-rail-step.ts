/** Home uses the same persisted stage and gate array as Tracker. */
import type { BookingRecord } from '@/services/api/types';
import { CUSTOMER_TRACKER_STEPS, resolveCustomerTrackerStage } from './customer-tracker-stage';

export const CUSTOMER_HOME_RAIL_LABELS = CUSTOMER_TRACKER_STEPS.map((step) => step.shortLabel);

export function resolveCustomerHomeRailStep(booking: BookingRecord | null | undefined): number {
  return resolveCustomerTrackerStage(booking).stageIndex;
}
