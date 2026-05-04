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
      const normalizedRole = migrateLegacyUserRole(decoded.role);
      
      // Ensure essential user properties exist
      if (!decoded.id || !normalizedRole) {
         console.error('[AUTH_ERROR] Malformed token payload:', decoded);
         return res.status(401).json({
             success: false,
             message: 'Invalid token payload: missing user ID or role'
         });
      }

      if (normalizedRole !== decoded.role) {
        console.warn(`[AUTH_MIGRATION] Normalized legacy token role ${decoded.role} -> ${normalizedRole}`);
      }

      // STRICT VERIFICATION: Ensure user actually still exists and has not been deleted/deactivated
      const userDoc = await User.findById(decoded.id).select('isActive isDeleted lockUntil email');
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

      req.user = { ...decoded, role: normalizedRole };
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
