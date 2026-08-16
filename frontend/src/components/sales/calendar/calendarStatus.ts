/**
 * Shared appointment status vocabulary for the Admin/Sales calendar.
 *
 * Keep this list aligned with `orderSchema.status` in
 * `backend/models/order.model.js`. Syntactic aliases are normalised on read,
 * but every status emitted by this module is supported by the backend model.
 */

export const APPOINTMENT_STATUSES = [
  'pending_confirmation',
  'approved',
  'rejected',
  'pending',
  'confirmed',
  'assigned',
  'queued',
  'received',
  'in_progress',
  'ready_for_payment',
  'completed',
  'paid',
  'released',
  'cancelled',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type AppointmentStatusGroupKey =
  | 'pending'
  | 'confirmed'
  | 'in_service'
  | 'completed'
  | 'cancelled';

interface AppointmentStatusGroupVisual {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
  badgeClassName: string;
  dotClassName: string;
}

export interface AppointmentStatusMeta extends AppointmentStatusGroupVisual {
  key: AppointmentStatus;
  group: AppointmentStatusGroupKey;
  groupLabel: string;
  isActive: boolean;
  isTerminal: boolean;
  consumesCapacity: boolean;
  isExcludedFromCapacity: boolean;
}

export interface AppointmentStatusLegendItem extends AppointmentStatusGroupVisual {
  key: AppointmentStatusGroupKey;
  statuses: readonly AppointmentStatus[];
}

const GROUP_VISUALS: Readonly<Record<AppointmentStatusGroupKey, AppointmentStatusGroupVisual>> = {
  pending: {
    label: 'Pending',
    bg: '#fffbeb',
    text: '#92400e',
    border: '#fde68a',
    dot: '#f59e0b',
    badgeClassName: 'border-amber-200 bg-amber-50 text-amber-800',
    dotClassName: 'bg-amber-500',
  },
  confirmed: {
    label: 'Confirmed',
    bg: '#eff6ff',
    text: '#1e40af',
    border: '#bfdbfe',
    dot: '#3b82f6',
    badgeClassName: 'border-blue-200 bg-blue-50 text-blue-800',
    dotClassName: 'bg-blue-500',
  },
  in_service: {
    label: 'In Service',
    bg: '#f5f3ff',
    text: '#5b21b6',
    border: '#ddd6fe',
    dot: '#8b5cf6',
    badgeClassName: 'border-violet-200 bg-violet-50 text-violet-800',
    dotClassName: 'bg-violet-500',
  },
  completed: {
    label: 'Completed',
    bg: '#ecfdf5',
    text: '#065f46',
    border: '#a7f3d0',
    dot: '#10b981',
    badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dotClassName: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    bg: '#fff1f2',
    text: '#9f1239',
    border: '#fecdd3',
    dot: '#f43f5e',
    badgeClassName: 'border-rose-200 bg-rose-50 text-rose-800',
    dotClassName: 'bg-rose-500',
  },
};

/** The five lifecycle buckets used by Admin appointment KPI cards. */
export const APPOINTMENT_STATUS_KPI_GROUPS: Readonly<
  Record<AppointmentStatusGroupKey, readonly AppointmentStatus[]>
> = {
  pending: ['pending_confirmation', 'pending'],
  confirmed: ['approved', 'confirmed', 'assigned', 'queued'],
  in_service: ['received', 'in_progress', 'ready_for_payment'],
  completed: ['completed', 'paid', 'released'],
  cancelled: ['rejected', 'cancelled'],
};

export const APPOINTMENT_STATUS_KPI_GROUP_ORDER: readonly AppointmentStatusGroupKey[] = [
  'pending',
  'confirmed',
  'in_service',
  'completed',
  'cancelled',
];

/**
 * Backend-supported statuses that still represent an open appointment/job.
 * Terminal statuses remain visible in Admin; they are not silently filtered.
 */
export const ACTIVE_APPOINTMENT_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'pending_confirmation',
  'pending',
  'approved',
  'confirmed',
  'assigned',
  'queued',
  'received',
  'in_progress',
  'ready_for_payment',
]);

export const TERMINAL_APPOINTMENT_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'completed',
  'paid',
  'released',
  'rejected',
  'cancelled',
]);

/** Mirrors the schema-backed entries in backend/services/slot.service.js. */
export const APPOINTMENT_SLOT_CONSUMING_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'pending_confirmation',
  'pending',
  'confirmed',
  'approved',
  'assigned',
  'received',
  'in_progress',
  'queued',
]);

/**
 * These statuses do not consume capacity. This is a capacity rule only; it must
 * never be used to hide cancelled, rejected, or completed rows from Admin.
 */
export const APPOINTMENT_CAPACITY_EXCLUDED_STATUSES: ReadonlySet<AppointmentStatus> = new Set(
  APPOINTMENT_STATUSES.filter((status) => !APPOINTMENT_SLOT_CONSUMING_STATUSES.has(status)),
);

const STATUS_LABELS: Readonly<Record<AppointmentStatus, string>> = {
  pending_confirmation: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  pending: 'Pending',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  queued: 'Queued',
  received: 'Received',
  in_progress: 'In Service',
  ready_for_payment: 'Ready for Payment',
  completed: 'Completed',
  paid: 'Paid',
  released: 'Released',
  cancelled: 'Cancelled',
};

const STATUS_TO_GROUP: Readonly<Record<AppointmentStatus, AppointmentStatusGroupKey>> = {
  pending_confirmation: 'pending',
  pending: 'pending',
  approved: 'confirmed',
  confirmed: 'confirmed',
  assigned: 'confirmed',
  queued: 'confirmed',
  received: 'in_service',
  in_progress: 'in_service',
  ready_for_payment: 'in_service',
  completed: 'completed',
  paid: 'completed',
  released: 'completed',
  rejected: 'cancelled',
  cancelled: 'cancelled',
};

const SUPPORTED_STATUS_SET: ReadonlySet<string> = new Set(APPOINTMENT_STATUSES);

function buildStatusMeta(status: AppointmentStatus): AppointmentStatusMeta {
  const group = STATUS_TO_GROUP[status];
  const visual = GROUP_VISUALS[group];
  const consumesCapacity = APPOINTMENT_SLOT_CONSUMING_STATUSES.has(status);

  return Object.freeze({
    key: status,
    label: STATUS_LABELS[status],
    group,
    groupLabel: visual.label,
    bg: visual.bg,
    text: visual.text,
    border: visual.border,
    dot: visual.dot,
    badgeClassName: visual.badgeClassName,
    dotClassName: visual.dotClassName,
    isActive: ACTIVE_APPOINTMENT_STATUSES.has(status),
    isTerminal: TERMINAL_APPOINTMENT_STATUSES.has(status),
    consumesCapacity,
    isExcludedFromCapacity: !consumesCapacity,
  });
}

export const APPOINTMENT_STATUS_CONFIG: Readonly<Record<AppointmentStatus, AppointmentStatusMeta>> =
  Object.freeze(
    Object.fromEntries(
      APPOINTMENT_STATUSES.map((status) => [status, buildStatusMeta(status)]),
    ) as Record<AppointmentStatus, AppointmentStatusMeta>,
  );

export const APPOINTMENT_STATUS_LEGEND: readonly AppointmentStatusLegendItem[] =
  APPOINTMENT_STATUS_KPI_GROUP_ORDER.map((key) =>
    Object.freeze({
      key,
      ...GROUP_VISUALS[key],
      statuses: APPOINTMENT_STATUS_KPI_GROUPS[key],
    }),
  );

/**
 * Normalise casing, whitespace, and hyphens without admitting unsupported
 * lifecycle values. For example, `IN-PROGRESS` becomes `in_progress`.
 */
export function normalizeAppointmentStatus(raw: unknown): AppointmentStatus | null {
  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  return SUPPORTED_STATUS_SET.has(normalized) ? (normalized as AppointmentStatus) : null;
}

/** British spelling retained for nearby calendar code that already uses it. */
export const normaliseAppointmentStatus = normalizeAppointmentStatus;

export function isSupportedAppointmentStatus(raw: unknown): boolean {
  return normalizeAppointmentStatus(raw) !== null;
}

export function getAppointmentStatusMeta(raw: unknown): AppointmentStatusMeta | null {
  const status = normalizeAppointmentStatus(raw);
  return status ? APPOINTMENT_STATUS_CONFIG[status] : null;
}

export function getAppointmentStatusGroup(raw: unknown): AppointmentStatusGroupKey | null {
  return getAppointmentStatusMeta(raw)?.group ?? null;
}

export function isAppointmentStatusInGroup(
  raw: unknown,
  group: AppointmentStatusGroupKey,
): boolean {
  return getAppointmentStatusGroup(raw) === group;
}

export function isAppointmentStatusActive(raw: unknown): boolean {
  const status = normalizeAppointmentStatus(raw);
  return status ? ACTIVE_APPOINTMENT_STATUSES.has(status) : false;
}

export function isAppointmentStatusTerminal(raw: unknown): boolean {
  const status = normalizeAppointmentStatus(raw);
  return status ? TERMINAL_APPOINTMENT_STATUSES.has(status) : false;
}

export function appointmentConsumesCapacity(raw: unknown): boolean {
  const status = normalizeAppointmentStatus(raw);
  return status ? APPOINTMENT_SLOT_CONSUMING_STATUSES.has(status) : false;
}

export function isAppointmentStatusExcludedFromCapacity(raw: unknown): boolean {
  const status = normalizeAppointmentStatus(raw);
  return status ? APPOINTMENT_CAPACITY_EXCLUDED_STATUSES.has(status) : false;
}
