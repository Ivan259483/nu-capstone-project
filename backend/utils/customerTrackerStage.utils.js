/**
 * Canonical customer-facing tracker stage (server side).
 *
 * The customer pipeline has five steps; the QC gate pipeline has four, because
 * "Appointment Confirmed" happens before the vehicle reaches the shop. An operational
 * gate index is therefore never a customer step index — Quality Check is QC gate 3 of 4
 * and customer step 4 of 5.
 *
 * Every stage-bearing payload the customer clients receive carries these fields so the
 * apps never have to infer Quality Check from unrelated data.
 * Keep in sync with frontend/src/lib/customer-tracker-stage.ts and
 * mobile/src/utils/customer-tracker-stage.ts.
 */

import { buildCustomerTrackingLifecycle } from '../constants/orderLifecycle.js';

export const CUSTOMER_TRACKER_STAGE_ORDER = [
  'confirmed',
  'received',
  'in_progress',
  'quality_check',
  'ready_pickup',
];

export const CUSTOMER_TRACKER_TOTAL_STEPS = CUSTOMER_TRACKER_STAGE_ORDER.length;

const STAGE_PRESENTATION = {
  confirmed: { label: 'Appointment Confirmed', shortLabel: 'Confirmed', progress: 0 },
  received: { label: 'Vehicle Arrived', shortLabel: 'Arrived', progress: 25 },
  in_progress: { label: 'Service In Progress', shortLabel: 'In Service', progress: 50 },
  quality_check: { label: 'Quality Check', shortLabel: 'QC Review', progress: 75 },
  ready_pickup: { label: 'Ready for Pickup', shortLabel: 'Pickup', progress: 100 },
};

const STAGE_ALIASES = {
  confirmed: 'confirmed',
  approved: 'confirmed',
  assigned: 'confirmed',
  queued: 'confirmed',
  scheduled: 'confirmed',
  received: 'received',
  checked_in: 'received',
  check_in: 'received',
  arrived: 'received',
  vehicle_arrived: 'received',
  intake: 'received',
  in_progress: 'in_progress',
  in_service: 'in_progress',
  service_in_progress: 'in_progress',
  active: 'in_progress',
  processing: 'in_progress',
  washing: 'in_progress',
  detailing: 'in_progress',
  quality_check: 'quality_check',
  qualitycheck: 'quality_check',
  quality_check_review: 'quality_check',
  quality_review: 'quality_check',
  qc: 'quality_check',
  qc_review: 'quality_check',
  qc_check: 'quality_check',
  final_inspection: 'quality_check',
  finishing: 'quality_check',
  ready_pickup: 'ready_pickup',
  ready_for_pickup: 'ready_pickup',
  ready_for_payment: 'ready_pickup',
  ready: 'ready_pickup',
  completed: 'ready_pickup',
  released: 'ready_pickup',
  paid: 'ready_pickup',
  done: 'ready_pickup',
  delivered: 'ready_pickup',
};

export function normalizeStageKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
}

/** One field → canonical stage, or null when the value is not a stage alias. */
export function canonicalStageFromValue(value) {
  const key = normalizeStageKey(value);
  if (!key) return null;
  return STAGE_ALIASES[key] ?? null;
}

/**
 * Canonical customer stage for an order. `serviceTrackingStage` wins because it is the only
 * field that separates Quality Check from Ready for Pickup — the backend maps both to
 * `status: in_progress`.
 */
export function normalizeBookingStage(order) {
  if (!order) return 'confirmed';
  return (
    canonicalStageFromValue(order.serviceTrackingStage)
    ?? canonicalStageFromValue(order.status)
    ?? canonicalStageFromValue(order.customerStatus)
    ?? 'confirmed'
  );
}

/** Monotonic rank: confirmed 1 … ready_pickup 5. */
export function customerStageRank(stage) {
  return CUSTOMER_TRACKER_STAGE_ORDER.indexOf(canonicalStageFromValue(stage) ?? 'confirmed') + 1;
}

/** Label, step and progress produced together from one canonical stage. */
export function resolveCustomerTrackerStage(order) {
  const stage = normalizeBookingStage(order);
  const index = CUSTOMER_TRACKER_STAGE_ORDER.indexOf(stage);
  const presentation = STAGE_PRESENTATION[stage];
  return {
    stage,
    label: presentation.label,
    shortLabel: presentation.shortLabel,
    customerStep: index + 1,
    customerTotalSteps: CUSTOMER_TRACKER_TOTAL_STEPS,
    rank: index + 1,
    progress: presentation.progress,
  };
}

/**
 * Canonical block attached to every customer-facing stage payload (REST DTO + socket event),
 * so web and mobile clients patch the stage directly instead of guessing it.
 */
export function buildCustomerStagePayload(order) {
  const resolved = resolveCustomerTrackerStage(order);
  return {
    customerStage: resolved.stage,
    customerStageLabel: resolved.label,
    customerStageStep: resolved.customerStep,
    customerStageTotalSteps: resolved.customerTotalSteps,
    customerStageProgress: resolved.progress,
    customerStageRank: resolved.rank,
    customerAssignedTeam: resolveCustomerAssignedTeam(order),
    ...buildCustomerTrackingLifecycle(order),
  };
}

/**
 * Team that currently owns the order, as shown to the customer. At Ready for Pickup the job is
 * handed to Sales once it enters the balance/pickup queue or its payment has settled; before
 * that, pickup evidence is still being completed on the floor.
 */
export function resolveCustomerAssignedTeam(order) {
  if (!order) return 'Assignment pending';
  const stage = normalizeBookingStage(order);
  const assignments = (Array.isArray(order.serviceStaffAssignments) ? order.serviceStaffAssignments : [])
    .filter((person) => String(person?.name || '').trim());
  const namesFor = (rolePattern) => assignments
    .filter((person) => !rolePattern || rolePattern.test(String(person.role || '')))
    .map((person) => String(person.name).trim())
    .join(' & ');

  if (stage === 'ready_pickup') {
    const salesOwned = normalizeStageKey(order.status) === 'ready_for_payment'
      || order.posQueueStatus === 'balance_pickup_queue'
      || normalizeStageKey(order.paymentStatus) === 'paid';
    if (salesOwned) {
      const names = namesFor(/sales|cashier|pos/i);
      return names ? `Sales · ${names}` : 'Sales team';
    }
    return namesFor(/pickup/i) || 'Pickup team';
  }
  if (stage === 'quality_check') {
    const names = namesFor(/quality|qc/i);
    return names ? `Quality Check · ${names}` : 'Quality Check team';
  }
  if (stage === 'received' || stage === 'in_progress') {
    return namesFor(null) || 'Service team';
  }
  return 'Assignment pending';
}

/**
 * True when `nextStage` does not regress the customer-visible stage of `order`.
 * Stage progression is monotonic for an active service lifecycle; an authorized rollback
 * must pass `allowRollback`.
 */
export function isForwardCustomerStageTransition(order, nextStage) {
  const currentRank = customerStageRank(normalizeBookingStage(order));
  const nextRank = customerStageRank(canonicalStageFromValue(nextStage) ?? 'confirmed');
  return nextRank >= currentRank;
}
