import ActivityLog from '../models/activityLog.model.js';

/**
 * Centralized Activity Logger
 *
 * Usage (fire-and-forget — do NOT await):
 *   logActivity({ req, type, module, action, description, status, referenceId, metadata });
 *
 * @param {Object}  opts
 * @param {Object}  [opts.req]          Express request — auto-extracts userId/userName/userRole
 * @param {string}  [opts.userId]       Override user ID
 * @param {string}  [opts.userName]     Override user name
 * @param {string}  [opts.userRole]     Override user role
 * @param {string}   opts.type          Event type enum value
 * @param {string}   opts.module        Module name (Auth, Booking, User, POS, Inventory, etc.)
 * @param {string}   opts.action        Human-readable action label
 * @param {string}   opts.description   Detailed event description
 * @param {string}  [opts.status]       success | warning | error | info  (default: 'success')
 * @param {string}  [opts.referenceId]  Optional reference ID (order #, invoice #, etc.)
 * @param {Object}  [opts.metadata]     Additional structured data
 */
export function logActivity({
  req,
  userId,
  userName,
  userRole,
  type,
  module: mod,
  action,
  description,
  status = 'success',
  referenceId,
  metadata = {},
}) {
  // Fire-and-forget — callers should NOT await this
  const user = req?.user;

  ActivityLog.create({
    type,
    title: action,
    description,
    userId:   userId   || user?.id    || undefined,
    userName: userName || user?.name   || user?.email || 'System',
    userRole: userRole || user?.role   || 'system',
    module:   mod,
    action,
    status,
    metadata: {
      ...metadata,
      ...(referenceId ? { referenceId } : {}),
    },
  }).catch((err) => {
    console.error(`[logActivity] Failed to record ${type}:`, err.message);
  });
}
