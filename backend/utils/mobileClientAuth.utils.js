import { isCustomerRole } from '../constants/roles.js';

export const MOBILE_CLIENT_HEADER = 'x-client-type';
export const MOBILE_CLIENT_TYPE = 'mobile';
export const MOBILE_CUSTOMER_ONLY_CODE = 'MOBILE_CUSTOMER_ONLY';
export const MOBILE_SESSION_REQUIRED_CODE = 'MOBILE_SESSION_REQUIRED';
export const MOBILE_CUSTOMER_ONLY_MESSAGE =
  'This account is not authorized to access the Customer Mobile App. Please use the appropriate web portal for your account role.';

export const getRequestClientType = (req) => {
  const raw = req?.get?.(MOBILE_CLIENT_HEADER)
    ?? req?.headers?.[MOBILE_CLIENT_HEADER];
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
};

export const isMobileClientRequest = (req) =>
  getRequestClientType(req) === MOBILE_CLIENT_TYPE;

export const getSessionClientClaims = (req) =>
  isMobileClientRequest(req) ? { clientType: MOBILE_CLIENT_TYPE } : {};

/**
 * Mobile authorization is deliberately exact and fail-closed. Canonical role
 * normalization remains centralized in constants/roles.js; no missing or
 * malformed value is ever interpreted as Customer here.
 */
export const canAccessCustomerMobile = (user) =>
  Boolean(user && isCustomerRole(user.role));

export const enforceMobileCustomer = (req, res, user) => {
  if (!isMobileClientRequest(req) || canAccessCustomerMobile(user)) return true;

  res.status(403).json({
    success: false,
    code: MOBILE_CUSTOMER_ONLY_CODE,
    message: MOBILE_CUSTOMER_ONLY_MESSAGE,
  });
  return false;
};

