/**
 * Canonical customer-facing tracker stage.
 *
 * ONE resolver drives every customer surface (Dashboard live-tracker card, Live Tracker page,
 * mobile Home rail, mobile Track screen). Label, step number and progress percentage are
 * produced together from a single canonical stage so impossible combinations such as
 * "Quality Check + 50%" or "Service In Progress + step 4/5" cannot be rendered.
 *
 * Canonical keys are the persisted `serviceTrackingStage` values — this file adds no second
 * stage vocabulary. `confirmed → received → in_progress → quality_check → ready_pickup`.
 *
 * OPERATIONAL ↔ CUSTOMER TRANSLATION
 * The QC workspace runs a 4-gate pipeline (Vehicle Arrive, Service In Progress, Quality Check,
 * Ready for Pickup); the customer pipeline has 5 steps because "Appointment Confirmed" precedes
 * the vehicle reaching the shop. Operational gate indices are therefore NEVER used as customer
 * step indices — `customerStepForOperationalGate` is the only allowed translation
 * (QC gate 3 of 4 "Quality Check" → customer step 4 of 5).
 *
 * Keep in sync with frontend/src/lib/customer-tracker-stage.ts.
 */

/**
 * Local copy of `normTrackerStr` so this module stays dependency-free and can be loaded
 * directly by the Web/Mobile parity test in mobile/tests.
 */
function normTrackerStr(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
}

export type CustomerTrackerStage =
  | 'confirmed'
  | 'received'
  | 'in_progress'
  | 'quality_check'
  | 'ready_pickup';

export type CustomerTrackerStagePresentation = {
  /** Canonical stage key — same vocabulary as the persisted `serviceTrackingStage`. */
  stage: CustomerTrackerStage;
  /** Customer-facing stage name, e.g. "Quality Check". */
  label: string;
  /** Compact timeline label, e.g. "QC Review". */
  shortLabel: string;
  /** Customer-facing description of what is happening right now. */
  description: string;
  /** 1-based customer step. Quality Check is always 4. */
  customerStep: number;
  /** Always 5 — the customer pipeline never uses the operational gate count. */
  customerTotalSteps: number;
  /** 0-based index into `CUSTOMER_TRACKER_STAGE_ORDER`. */
  stageIndex: number;
  /** Monotonic rank, 1 (confirmed) … 5 (ready for pickup). */
  rank: number;
  /** 0 / 25 / 50 / 75 / 100 — derived from the same stage as the label. */
  progress: number;
};

export const CUSTOMER_TRACKER_STAGE_ORDER: readonly CustomerTrackerStage[] = [
  'confirmed',
  'received',
  'in_progress',
  'quality_check',
  'ready_pickup',
] as const;

export const CUSTOMER_TRACKER_TOTAL_STEPS = CUSTOMER_TRACKER_STAGE_ORDER.length;

const STAGE_PRESENTATION: Record<
  CustomerTrackerStage,
  Omit<CustomerTrackerStagePresentation, 'stage' | 'stageIndex' | 'rank' | 'customerStep' | 'customerTotalSteps'>
> = {
  confirmed: {
    label: 'Appointment Confirmed',
    shortLabel: 'Confirmed',
    description: 'Appointment locked and ready for shop intake.',
    progress: 0,
  },
  received: {
    label: 'Vehicle Arrived',
    shortLabel: 'Arrived',
    description: 'Vehicle is checked in and prepared for the service bay.',
    progress: 25,
  },
  in_progress: {
    label: 'Service In Progress',
    shortLabel: 'In Service',
    description: 'Certified technicians are working on your vehicle now.',
    progress: 50,
  },
  quality_check: {
    label: 'Quality Check',
    shortLabel: 'QC Review',
    description: 'Your vehicle is undergoing final inspection before pickup readiness.',
    progress: 75,
  },
  ready_pickup: {
    label: 'Ready for Pickup',
    shortLabel: 'Pickup',
    description: 'Final handover is ready for customer pickup.',
    progress: 100,
  },
};

/** Shared gate array for mobile Home and Tracker. */
const STAGE_DECORATION = {
  confirmed: { sub: 'Booking secured', icon: 'calendar-outline' },
  received: { sub: 'Shop intake complete', icon: 'car-outline' },
  in_progress: { sub: 'Technician working now', icon: 'construct-outline' },
  quality_check: { sub: 'Final inspection', icon: 'shield-checkmark-outline' },
  ready_pickup: { sub: 'Handover ready', icon: 'checkmark-done-outline' },
} as const;

export const CUSTOMER_TRACKER_STEPS = CUSTOMER_TRACKER_STAGE_ORDER.map((id) => ({
  id,
  label: STAGE_PRESENTATION[id].label,
  shortLabel: STAGE_PRESENTATION[id].shortLabel,
  detail: STAGE_PRESENTATION[id].description,
  ...STAGE_DECORATION[id],
}));

/**
 * Every legitimate backend alias resolved to exactly one canonical stage.
 * Aliases come from `serviceTrackingStage`, `status` and `customerStatus`.
 */
const STAGE_ALIASES: Record<string, CustomerTrackerStage> = {
  // 1 — Appointment confirmed
  confirmed: 'confirmed',
  approved: 'confirmed',
  assigned: 'confirmed',
  queued: 'confirmed',
  scheduled: 'confirmed',
  // 2 — Vehicle arrived
  received: 'received',
  checked_in: 'received',
  check_in: 'received',
  arrived: 'received',
  vehicle_arrived: 'received',
  intake: 'received',
  // 3 — Service in progress
  in_progress: 'in_progress',
  in_service: 'in_progress',
  service_in_progress: 'in_progress',
  active: 'in_progress',
  processing: 'in_progress',
  washing: 'in_progress',
  detailing: 'in_progress',
  // 4 — Quality check
  quality_check: 'quality_check',
  qualitycheck: 'quality_check',
  quality_check_review: 'quality_check',
  quality_review: 'quality_check',
  qc: 'quality_check',
  qc_review: 'quality_check',
  qc_check: 'quality_check',
  final_inspection: 'quality_check',
  finishing: 'quality_check',
  // 5 — Ready for pickup (and everything past it — the tracker tops out at 100%)
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

export type CustomerTrackerStageInput = {
  serviceTrackingStage?: unknown;
  status?: unknown;
  customerStatus?: unknown;
} | null | undefined;

/** Resolve one field to a canonical stage, or null when the value is not a stage alias. */
export function canonicalStageFromValue(value: unknown): CustomerTrackerStage | null {
  const key = normTrackerStr(value);
  if (!key) return null;
  return STAGE_ALIASES[key] ?? null;
}

/**
 * Canonical stage for a booking/order.
 *
 * `serviceTrackingStage` is the source of truth — it is the only field that distinguishes
 * Quality Check from Ready for Pickup, because the backend maps both to `status: in_progress`.
 * `status` then `customerStatus` are fallbacks for rows QC has not written a fine stage on yet.
 */
export function normalizeBookingStage(booking: CustomerTrackerStageInput): CustomerTrackerStage {
  if (!booking) return 'confirmed';
  return (
    canonicalStageFromValue(booking.serviceTrackingStage)
    ?? canonicalStageFromValue(booking.status)
    ?? canonicalStageFromValue(booking.customerStatus)
    ?? 'confirmed'
  );
}

/** Monotonic rank of a canonical stage: confirmed 1 … ready_pickup 5. */
export function customerStageRank(stage: CustomerTrackerStage): number {
  return CUSTOMER_TRACKER_STAGE_ORDER.indexOf(stage) + 1;
}

/** Monotonic rank of a booking's canonical customer stage. */
export function customerStageRankOf(booking: CustomerTrackerStageInput): number {
  return customerStageRank(normalizeBookingStage(booking));
}

/**
 * Label, step and percentage produced atomically from one canonical stage.
 * Never derive any of the three independently.
 */
export function resolveCustomerTrackerStage(
  booking: CustomerTrackerStageInput
): CustomerTrackerStagePresentation {
  const stage = normalizeBookingStage(booking);
  const stageIndex = CUSTOMER_TRACKER_STAGE_ORDER.indexOf(stage);
  return {
    stage,
    stageIndex,
    rank: stageIndex + 1,
    customerStep: stageIndex + 1,
    customerTotalSteps: CUSTOMER_TRACKER_TOTAL_STEPS,
    ...STAGE_PRESENTATION[stage],
  };
}

/** QC workspace gate pipeline — 4 gates, no "Appointment Confirmed". */
export const OPERATIONAL_GATE_ORDER = ['received', 'in_progress', 'quality_check', 'ready_pickup'] as const;

export type OperationalGateStage = (typeof OPERATIONAL_GATE_ORDER)[number];

/**
 * Operational QC gate → customer stage. The indices differ by one because the customer
 * pipeline starts at Appointment Confirmed: QC gate 3 of 4 (Quality Check) is customer
 * step 4 of 5. Never reuse an operational index as a customer index.
 */
export function customerStageForOperationalGate(gate: string): CustomerTrackerStage {
  return canonicalStageFromValue(gate) ?? 'confirmed';
}

/** 1-based customer step for a 1-based operational gate index (QC 3/4 → customer 4/5). */
export function customerStepForOperationalGate(gate: string): number {
  return resolveCustomerTrackerStage({ serviceTrackingStage: customerStageForOperationalGate(gate) })
    .customerStep;
}

/**
 * Monotonic guard. Stage transitions only move forward for an active service lifecycle, so a
 * late `in_progress` socket event or a slow GET can never pull a tracker back out of
 * Quality Check. `isForwardTrackerStageTransition` in customer-live-tracker-pick.ts stays the
 * single regression-protection implementation — this rank exists so callers can explain a
 * rejected patch in customer-stage terms.
 */
export function isForwardCustomerStageTransition(
  current: CustomerTrackerStageInput,
  incoming: { serviceTrackingStage?: unknown; status?: unknown }
): boolean {
  if (!current) return true;
  if (incoming.serviceTrackingStage === undefined && incoming.status === undefined) return true;
  return (
    customerStageRankOf({
      serviceTrackingStage:
        incoming.serviceTrackingStage !== undefined ? incoming.serviceTrackingStage : current.serviceTrackingStage,
      status: incoming.status !== undefined ? incoming.status : current.status,
    }) >= customerStageRankOf(current)
  );
}
