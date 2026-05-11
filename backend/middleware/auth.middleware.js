import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { migrateLegacyUserRole } from '../constants/roles.js';
import User from '../models/user.model.js';
import { isLoginLockoutExemptEmail } from '../constants/loginLockout.exempt.js';

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
      console.warn(`[AUTH_FAILURE] Missing or malformed Auth Header: ${authHeader}`);
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
      const userDoc = await User.findById(decoded.id).select(
        'isActive isDeleted lockUntil email role name'
      );
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
      if (!liveRole) {
        return res.status(401).json({ success: false, message: 'Invalid account role.' });
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
        error: verifyError.message,
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
export const optionalAuthenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const normalizedRole = migrateLegacyUserRole(decoded?.role);
    if (decoded?.id && normalizedRole) {
      req.user = { ...decoded, role: normalizedRole };
    }
  } catch (error) {
    console.warn('[AUTH_WARNING] Optional auth failed:', error.message);
  }

  next();
};

export default { authenticate, authorize, optionalAuthenticate };
