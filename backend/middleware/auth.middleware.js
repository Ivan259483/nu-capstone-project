import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { migrateLegacyUserRole } from '../constants/roles.js';

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header
 */
export const authenticate = (req, res, next) => {
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
