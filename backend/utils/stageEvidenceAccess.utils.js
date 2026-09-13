/**
 * Write guard for live-tracker gate evidence.
 *
 * Quality Checkers may only change evidence on orders explicitly assigned to them through
 * `order.assignedDetailer` (set by booking approval via `findAssignableQualityChecker`).
 * Administrators and office admins keep full access. Read access is unchanged and still goes
 * through `canViewOrderWithRoleConstraints` + `getCustomerVisibleTrackerStageMedia`.
 */
import { normalizeToCanonical } from '../constants/roles.js';

const EVIDENCE_ADMIN_ROLES = new Set(['administrator', 'office_admin']);

/** Order statuses where the shop floor is actively working the vehicle (matches QC floor reads). */
export const EVIDENCE_WRITABLE_ORDER_STATUSES = Object.freeze([
  'approved',
  'confirmed',
  'assigned',
  'received',
  'in_progress',
  'ready_for_payment',
  'completed',
  'released',
]);

/** Lean projection containing every field the guard reads. */
export const EVIDENCE_ACCESS_PROJECTION = 'assignedDetailer status archived serviceTrackingStage';

function idString(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || value);
  return String(value);
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, code: string, message: string }}
 */
export function checkOrderEvidenceWriteAccess(user, order) {
  if (!order) return { ok: false, status: 404, code: 'ORDER_NOT_FOUND', message: 'Order not found' };
  const role = normalizeToCanonical(user?.role);

  if (!EVIDENCE_ADMIN_ROLES.has(role)) {
    if (role !== 'staff_quality_checker') {
      return { ok: false, status: 403, code: 'EVIDENCE_ROLE_FORBIDDEN', message: 'Access denied' };
    }
    const assignee = idString(order.assignedDetailer);
    if (!assignee || assignee !== idString(user?.id)) {
      return {
        ok: false,
        status: 403,
        code: 'EVIDENCE_NOT_ASSIGNED',
        message: 'Only the Quality Checker assigned to this order can upload or remove its evidence.',
      };
    }
  }

  if (order.archived === true) {
    return { ok: false, status: 409, code: 'ORDER_ARCHIVED', message: 'This order is archived.' };
  }
  if (!EVIDENCE_WRITABLE_ORDER_STATUSES.includes(String(order.status || ''))) {
    return {
      ok: false,
      status: 409,
      code: 'ORDER_NOT_ACTIVE',
      message: 'Evidence can only be changed while the order is on the shop floor.',
    };
  }
  return { ok: true };
}
