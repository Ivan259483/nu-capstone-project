import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import {
  isValidUserRole,
  isCustomerRole,
  migrateLegacyUserRole,
  requiresStaffTwoFactor,
  STAFF_2FA_AUTH_LEVEL,
} from '../constants/roles.js';
import User from '../models/user.model.js';
import { isLoginLockoutExemptEmail } from '../constants/loginLockout.exempt.js';
import { authVersionMatches } from '../utils/authVersion.utils.js';
import { timeOperation } from '../utils/performance.utils.js';

// Collapse only concurrent reads for the same account. Results are removed as
// soon as the query settles, so account deactivation/role changes are never
// served from a stale time-based authentication cache.
const liveUserLookups = new Map();

const loadLiveAuthUser = (userId, req, res) => {
  const key = String(userId);
  const existing = liveUserLookups.get(key);
  if (existing) {
    return timeOperation(
      { req, res, kind: 'db', name: 'auth.user.findById.coalesced' },
      () => existing
    );
  }

  const lookup = timeOperation(
    { req, res, kind: 'db', name: 'auth.user.findById' },
    () => User.findById(userId)
      .select('isActive isDeleted isVerified status lockUntil email role name authVersion')
      .lean()
  ).finally(() => {
    if (liveUserLookups.get(key) === lookup) liveUserLookups.delete(key);
  });
  liveUserLookups.set(key, lookup);
  return lookup;
};

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header and ensures user is still active in DB
 */
export const authenticate = async (req, res, next) => {
  try {
    // CORS preflight — no Authorization header (browser strips custom headers on OPTIONS)
    if (req.method === 'OPTIONS') {
      return next();
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('[AUTH_FAILURE] Missing or malformed Authorization header');
      return res.status(401).json({
        success: false,
        message: 'No valid token provided. Authorization format: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      // `role` in JWT is from login time and may be stale; live role is applied from MongoDB below.
      if (!decoded.id) {
        console.error('[AUTH_ERROR] Malformed token payload (missing id):', decoded);
        return res.status(401).json({
          success: false,
          message: 'Invalid token payload: missing user ID',
        });
      }

      // STRICT VERIFICATION: Ensure user actually still exists and has not been deleted/deactivated.
      // Always use live MongoDB role/name/email — JWT embeds role from login time and goes stale after admin edits.
      const userDoc = await loadLiveAuthUser(decoded.id, req, res);
      if (!userDoc) {
        return res.status(401).json({ success: false, message: 'User account no longer exists.' });
      }
      if (userDoc.isDeleted) {
        return res.status(401).json({ success: false, message: 'This account has been deleted by an administrator.', code: 'USER_DELETED' });
      }
      if (!userDoc.isActive) {
        return res.status(403).json({ success: false, message: 'Your account has been deactivated.', code: 'ACCOUNT_INACTIVE' });
      }
      if (
        userDoc.lockUntil &&
        userDoc.lockUntil > new Date() &&
        !isLoginLockoutExemptEmail(userDoc.email)
      ) {
        return res.status(423).json({ success: false, message: 'Your account is temporarily locked.' });
      }

      const liveRole = migrateLegacyUserRole(userDoc.role);
      if (!liveRole || !isValidUserRole(liveRole)) {
        return res.status(401).json({ success: false, message: 'Invalid account role.' });
      }
      if (requiresStaffTwoFactor(liveRole) && !userDoc.isVerified) {
        return res.status(403).json({
          success: false,
          message: 'Verify your staff account email before continuing.',
          code: 'ACCOUNT_PENDING_VERIFICATION',
        });
      }
      if (isCustomerRole(liveRole) && !userDoc.isVerified) {
        return res.status(403).json({
          success: false,
          message: 'Verify your account email before continuing.',
          code: 'ACCOUNT_PENDING_VERIFICATION',
        });
      }
      // Customer JWTs minted before the mandatory second-factor rollout (or
      // outside a verified identity flow) cannot authorize protected APIs.
      // Password sessions receive otpVerified only after atomic OTP consume.
      const customerIdentityVerified =
        decoded.otpVerified === true
        || decoded.federatedVerified === true
        || decoded.emailLinkVerified === true;
      if (isCustomerRole(liveRole) && !customerIdentityVerified) {
        return res.status(401).json({
          success: false,
          message: 'Email verification is required to complete sign-in.',
          code: 'CUSTOMER_OTP_REQUIRED',
        });
      }
      if (
        requiresStaffTwoFactor(liveRole)
        && decoded.authLevel !== STAFF_2FA_AUTH_LEVEL
      ) {
        return res.status(401).json({
          success: false,
          message: 'Staff two-factor authentication is required.',
          code: 'STAFF_2FA_REQUIRED',
        });
      }
      if (
        requiresStaffTwoFactor(liveRole)
        && !authVersionMatches(decoded.authVersion, userDoc.authVersion)
      ) {
        return res.status(401).json({
          success: false,
          message: 'This staff session is no longer valid. Sign in again.',
          code: 'STAFF_SESSION_REVOKED',
        });
      }

      req.user = {
        ...decoded,
        role: liveRole,
        email: userDoc.email || decoded.email,
        name: userDoc.name || decoded.name,
      };
      next();
    } catch (verifyError) {
      console.error('[AUTH_ERROR] Token verification failed:', verifyError.message);
      
      if (verifyError.name === 'TokenExpiredError') {
         return res.status(401).json({
             success: false,
             message: 'Token expired',
             code: 'TOKEN_EXPIRED'
         });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid token',
      });
    }
  } catch (error) {
    console.error('[AUTH_CRITICAL] Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication',
    });
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * If a valid JWT is present, attaches req.user. Otherwise continues.
 */
export const optionalAuthenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded?.id) {
      const userDoc = await loadLiveAuthUser(decoded.id, req, res);
      const liveRole = migrateLegacyUserRole(userDoc?.role);
      const liveAccountUsable = Boolean(
        userDoc
        && !userDoc.isDeleted
        && userDoc.isActive
        && (
          !userDoc.lockUntil
          || userDoc.lockUntil <= new Date()
          || isLoginLockoutExemptEmail(userDoc.email)
        )
        && liveRole
        && isValidUserRole(liveRole)
      );
      const liveStaffSessionValid = !requiresStaffTwoFactor(liveRole)
        || (
          userDoc.isVerified
          && decoded.authLevel === STAFF_2FA_AUTH_LEVEL
          && authVersionMatches(decoded.authVersion, userDoc.authVersion)
        );
      const liveCustomerSessionValid = !isCustomerRole(liveRole)
        || (
          userDoc.isVerified
          && (
            decoded.otpVerified === true
            || decoded.federatedVerified === true
            || decoded.emailLinkVerified === true
          )
        );

      if (liveAccountUsable && liveStaffSessionValid && liveCustomerSessionValid) {
        req.user = {
          ...decoded,
          role: liveRole,
          email: userDoc.email || decoded.email,
          name: userDoc.name || decoded.name,
        };
      }
    }
  } catch (error) {
    console.warn('[AUTH_WARNING] Optional auth failed:', error.message);
  }

  next();
};

export default { authenticate, authorize, optionalAuthenticate };
