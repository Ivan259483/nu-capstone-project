import { CUSTOMER_ROLES, POS_MANAGER_ROLES } from '../constants/roles.js';

/**
 * Scheduled appointments are customer-created unless Sales ties
 * the request to an existing Concierge handoff. The shared endpoint also
 * accepts explicit unscheduled POS walk-ins.
 */
export const authorizeOrderCreation = (req, res, next) => {
  if (CUSTOMER_ROLES.includes(req.user?.role)) return next();
  if (req.body?.isWalkIn === true && POS_MANAGER_ROLES.includes(req.user?.role))
    return next();
  if (
    req.user?.role === 'sales' &&
    typeof req.body?.sourceConversationId === 'string' &&
    req.body.sourceConversationId.trim()
  ) {
    return next();
  }

  return res.status(403).json({
    success: false,
    errorCode: 'APPOINTMENT_CUSTOMER_ONLY',
    message: 'Only customer accounts may create service appointments.',
  });
};

export default authorizeOrderCreation;
