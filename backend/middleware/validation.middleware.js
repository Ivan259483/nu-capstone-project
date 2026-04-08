import { body, validationResult } from 'express-validator';

/* ═══════════════════════════════════════════════════════
   VALIDATION MIDDLEWARE — express-validator chains
   Enforces server-side input validation for all auth
   endpoints so the backend can never accept invalid data.
   ═══════════════════════════════════════════════════════ */

/**
 * Generic handler: collect express-validator errors → 400 response
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((e) => ({
      field: e.path || e.param,
      message: e.msg,
    }));
    return res.status(400).json({
      success: false,
      message: formatted[0]?.message || 'Validation error',
      errors: formatted,
    });
  }
  next();
};

/* ──────────────────────────────────────────────────────
   REGISTRATION VALIDATION
   Mirrors the frontend password policy exactly:
   - 8+ characters
   - 1 uppercase, 1 lowercase, 1 digit, 1 special char
   - Valid email format
   - Name: 2-80 chars, trimmed, sanitized
   ────────────────────────────────────────────────────── */
export const validateRegistration = [
  body('name')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 80 }).withMessage('Name must be between 2 and 80 characters')
    .matches(/^[a-zA-ZÀ-ÿ\s.\-']+$/).withMessage('Name contains invalid characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/).withMessage('Password must contain at least one special character'),

  body('role')
    .optional()
    .isIn(['customer', 'detailer', 'admin', 'supplier']).withMessage('Invalid user role'),

  handleValidationErrors,
];

/* ──────────────────────────────────────────────────────
   LOGIN VALIDATION
   ────────────────────────────────────────────────────── */
export const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required'),

  handleValidationErrors,
];

/* ──────────────────────────────────────────────────────
   SEND OTP VALIDATION
   ────────────────────────────────────────────────────── */
export const validateSendOtp = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),

  handleValidationErrors,
];

/* ──────────────────────────────────────────────────────
   VERIFY OTP VALIDATION
   ────────────────────────────────────────────────────── */
export const validateVerifyOtp = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),

  body('otp')
    .trim()
    .notEmpty().withMessage('OTP code is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits')
    .isNumeric().withMessage('OTP must contain only numbers'),

  handleValidationErrors,
];

/* ──────────────────────────────────────────────────────
   FORGOT PASSWORD VALIDATION
   ────────────────────────────────────────────────────── */
export const validateForgotPassword = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),

  handleValidationErrors,
];

/* ──────────────────────────────────────────────────────
   RESET PASSWORD VALIDATION
   ────────────────────────────────────────────────────── */
export const validateResetPassword = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),

  body('otp')
    .trim()
    .notEmpty().withMessage('OTP code is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits')
    .isNumeric().withMessage('OTP must contain only numbers'),

  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/).withMessage('Password must contain at least one special character'),

  handleValidationErrors,
];

/* ──────────────────────────────────────────────────────
   SOCIAL LOGIN VALIDATION
   ────────────────────────────────────────────────────── */
export const validateSocialLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail(),

  body('name')
    .optional()
    .trim()
    .isLength({ max: 80 }).withMessage('Name must not exceed 80 characters'),

  body('provider')
    .optional()
    .trim()
    .isIn(['google', 'facebook', 'apple', 'email']).withMessage('Invalid authentication provider'),

  handleValidationErrors,
];

/* ──────────────────────────────────────────────────────
   LEGACY: schema-based validator (kept for backward compat)
   ────────────────────────────────────────────────────── */
export const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
  };
};

export default {
  validateRegistration,
  validateLogin,
  validateSendOtp,
  validateVerifyOtp,
  validateForgotPassword,
  validateResetPassword,
  validateSocialLogin,
  handleValidationErrors,
  validateRequest,
};
