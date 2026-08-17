import { CUSTOMER_ROLES, POS_MANAGER_ROLES } from '../constants/roles.js';

/**
 * Scheduled appointments are customer-created only. The shared order endpoint
 * also accepts unscheduled POS walk-ins, so those remain available to POS
 * roles without granting staff a way to book a customer appointment.
 */
export const authorizeOrderCreation = (req, res, next) => {
  if (CUSTOMER_ROLES.includes(req.user?.role)) return next();
  if (req.body?.isWalkIn === true && POS_MANAGER_ROLES.includes(req.user?.role)) return next();

  return res.status(403).json({
    success: false,
    errorCode: 'APPOINTMENT_CUSTOMER_ONLY',
    message: 'Only customer accounts may create service appointments.',
  });
};

export default authorizeOrderCreation;
